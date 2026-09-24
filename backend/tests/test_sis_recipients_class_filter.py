"""
"Pick a class" on the family recipient list (ticket a19d5660).

An iCreate admin asked to send a form to one class's parents without ticking
them one at a time. Choosing a class narrows the family list to the guardians
of the students enrolled in that class right now.

What these tests hold:

- the guardians come from BOTH link tables -- parent_student_links and
  household_members. The SIS registration funnel writes households, so a
  filter that asks only parent_student_links silently drops most families;
- a withdrawn enrollment is not the class any more, so its family is not on it;
- a class from another org is refused, never answered with its roster;
- with no class, the list is exactly what it was before.

The client double applies the filters the code asks for (eq / in_) against
in-memory rows, so a dropped `.eq('status', 'active')` or a missing link table
fails here rather than passing on a canned response.
"""

import inspect
from unittest.mock import patch

import pytest

ORG = 'org-1'
OTHER_ORG = 'org-2'
CLASS = 'class-1'
FOREIGN_CLASS = 'class-9'

KID_LINKED = 'kid-linked'        # guardian via parent_student_links
KID_HOUSE = 'kid-house'          # guardians via household_members
KID_WITHDRAWN = 'kid-withdrawn'  # withdrawn from the class
KID_ELSEWHERE = 'kid-elsewhere'  # enrolled in another class only

P_LINKED = 'parent-linked'
P_HOUSE = 'parent-house'
P_HOUSE_2 = 'parent-house-2'
P_WITHDRAWN = 'parent-withdrawn'
P_ELSEWHERE = 'parent-elsewhere'
P_PENDING = 'parent-pending-link'  # link not approved -> not a guardian


def _user(uid, first, role='org_managed', org_role='parent', org=ORG, email=None):
    return {'id': uid, 'first_name': first, 'last_name': 'X', 'display_name': None,
            'email': email or f'{uid}@example.com', 'org_role': org_role,
            'org_roles': [org_role], 'role': role, 'organization_id': org,
            'managed_by_parent_id': None}


TABLES = {
    'users': [
        _user(P_LINKED, 'Linda'), _user(P_HOUSE, 'Hank'), _user(P_HOUSE_2, 'Hope'),
        _user(P_WITHDRAWN, 'Wendy'), _user(P_ELSEWHERE, 'Ellis'),
        _user(P_PENDING, 'Pete'),
        _user('teacher-1', 'Tess', org_role='advisor'),
        _user(KID_LINKED, 'Kid', org_role='student'),
        _user(KID_HOUSE, 'Kid', org_role='student'),
        _user(KID_WITHDRAWN, 'Kid', org_role='student'),
        _user(KID_ELSEWHERE, 'Kid', org_role='student'),
    ],
    'org_classes': [
        {'id': CLASS, 'organization_id': ORG, 'name': 'Robotics'},
        {'id': 'class-2', 'organization_id': ORG, 'name': 'Art'},
        {'id': FOREIGN_CLASS, 'organization_id': OTHER_ORG, 'name': 'Theirs'},
    ],
    'class_enrollments': [
        {'class_id': CLASS, 'student_id': KID_LINKED, 'status': 'active'},
        {'class_id': CLASS, 'student_id': KID_HOUSE, 'status': 'active'},
        {'class_id': CLASS, 'student_id': KID_WITHDRAWN, 'status': 'withdrawn'},
        {'class_id': 'class-2', 'student_id': KID_ELSEWHERE, 'status': 'active'},
        {'class_id': FOREIGN_CLASS, 'student_id': KID_ELSEWHERE, 'status': 'active'},
    ],
    'parent_student_links': [
        {'parent_user_id': P_LINKED, 'student_user_id': KID_LINKED, 'status': 'approved'},
        {'parent_user_id': P_PENDING, 'student_user_id': KID_LINKED, 'status': 'pending'},
        {'parent_user_id': P_WITHDRAWN, 'student_user_id': KID_WITHDRAWN, 'status': 'approved'},
        {'parent_user_id': P_ELSEWHERE, 'student_user_id': KID_ELSEWHERE, 'status': 'approved'},
    ],
    'household_members': [
        {'household_id': 'h1', 'user_id': KID_HOUSE, 'relationship': 'student'},
        {'household_id': 'h1', 'user_id': P_HOUSE, 'relationship': 'other'},
        {'household_id': 'h1', 'user_id': P_HOUSE_2, 'relationship': 'guardian'},
    ],
}


class _Query:
    def __init__(self, rows):
        self._rows = list(rows)

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._rows = [r for r in self._rows if r.get(col) == val]
        return self

    def neq(self, col, val):
        self._rows = [r for r in self._rows if r.get(col) != val]
        return self

    def in_(self, col, vals):
        vals = set(vals)
        self._rows = [r for r in self._rows if r.get(col) in vals]
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, start, end):
        # fetch_all_rows pages the org-wide users read.
        self._rows = self._rows[start:end + 1]
        return self

    def execute(self):
        return type('R', (), {'data': [dict(r) for r in self._rows]})()


class _Client:
    def table(self, name):
        return _Query(TABLES.get(name, []))


@pytest.fixture
def fake_db():
    client = _Client()
    with patch('services.sis_onboarding_service._admin', return_value=client), \
         patch('utils.class_membership._admin', return_value=client):
        yield client


def _ids(people):
    return {p['id'] for p in people}


@pytest.mark.unit
class TestClassFilter:
    def test_returns_exactly_the_guardians_of_enrolled_students(self, fake_db):
        from services import sis_onboarding_service as onboarding
        people = onboarding.list_recipients(ORG, 'family', class_id=CLASS)
        # Both link tables: the approved parent_student_link AND both adults of
        # the household. Nobody else.
        assert _ids(people) == {P_LINKED, P_HOUSE, P_HOUSE_2}

    def test_withdrawn_enrollments_do_not_bring_their_family(self, fake_db):
        from services import sis_onboarding_service as onboarding
        assert P_WITHDRAWN not in _ids(
            onboarding.list_recipients(ORG, 'family', class_id=CLASS))

    def test_an_unapproved_link_is_not_a_guardian(self, fake_db):
        from services import sis_onboarding_service as onboarding
        assert P_PENDING not in _ids(
            onboarding.list_recipients(ORG, 'family', class_id=CLASS))

    def test_another_orgs_class_is_refused(self, fake_db):
        from services import sis_onboarding_service as onboarding
        with pytest.raises(onboarding.ClassNotInOrg):
            onboarding.list_recipients(ORG, 'family', class_id=FOREIGN_CLASS)

    def test_a_class_that_does_not_exist_is_refused(self, fake_db):
        from services import sis_onboarding_service as onboarding
        with pytest.raises(onboarding.ClassNotInOrg):
            onboarding.list_recipients(ORG, 'family', class_id='no-such-class')

    def test_without_a_class_the_family_list_is_unchanged(self, fake_db):
        from services import sis_onboarding_service as onboarding
        people = onboarding.list_recipients(ORG, 'family')
        assert _ids(people) == {P_LINKED, P_HOUSE, P_HOUSE_2, P_WITHDRAWN,
                                P_ELSEWHERE, P_PENDING}
        # Sorted by name, as before.
        assert [p['name'] for p in people] == sorted(
            (p['name'] for p in people), key=str.lower)

    def test_without_a_class_the_staff_list_is_unchanged(self, fake_db):
        from services import sis_onboarding_service as onboarding
        assert _ids(onboarding.list_recipients(ORG, 'staff')) == {'teacher-1'}


@pytest.fixture
def app():
    from app import app as flask_app
    return flask_app


def _call_route(app, query):
    from routes.sis import staff_admin
    view = inspect.unwrap(staff_admin.onboarding_recipients)
    with app.test_request_context(f'/api/sis/staff-admin/onboarding/recipients?{query}'), \
         patch.object(staff_admin.sis_service, 'org_or_error', return_value=(ORG, None)):
        resp = view('admin-1')
    body, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return body.get_json(), status


@pytest.mark.unit
class TestRecipientsRoute:
    def test_class_filter_reaches_the_service(self, app, fake_db):
        body, status = _call_route(app, f'audience=family&class_id={CLASS}')
        assert status == 200
        assert _ids(body['recipients']) == {P_LINKED, P_HOUSE, P_HOUSE_2}

    def test_another_orgs_class_is_a_404(self, app, fake_db):
        body, status = _call_route(app, f'audience=family&class_id={FOREIGN_CLASS}')
        assert status == 404 and body['success'] is False
        assert 'recipients' not in body

    def test_a_class_filter_on_staff_is_refused(self, app, fake_db):
        _body, status = _call_route(app, f'audience=staff&class_id={CLASS}')
        assert status == 400

    def test_no_class_returns_the_whole_family_list(self, app, fake_db):
        body, status = _call_route(app, 'audience=family')
        assert status == 200
        assert len(body['recipients']) == 6

    def test_the_route_uses_the_admin_tier(self):
        """ADMIN_ROLES from utils.sis_roles, not a hand-written tuple."""
        from routes.sis import staff_admin
        src = inspect.getsource(staff_admin)
        block = src[src.index("'/onboarding/recipients'") - 60:
                    src.index('def onboarding_recipients')]
        assert '@require_role(*ADMIN_ROLES)' in block
