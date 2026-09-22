"""A partner adding a course to an Optio account that already exists.

OnFire Learning sells one-off Optio courses to homeschool families. Until
2026-09-22 the registration form refused outright when the purchase email
already had an Optio login anywhere outside the partner's own org:

    "An account already exists for <email> outside this program, so it can't
     be registered here."

Megan Inama hit it on a real order: elviaroche01@gmail.com was a *guardian*
in Optio Academy, and the student the course was for — Publio Labrador — was a
separate account in the same household, with no email of his own and no
parent_student_links row. There was nowhere for the course to go.

What these pin:

  - the account is never adopted. organization_id, role and org_role on an
    outside account are untouchable; only course enrolments are added.
  - a guardian resolves to their children through BOTH link tables, because an
    org-managed family is assembled out of households and a platform family out
    of parent_student_links.
  - staff resolve to nobody. A course on an advisor's login puts a child's work
    on an adult's account.
  - the partner is asked who the course is for before anything is written. The
    address is often a parent's, and the undo deletes the student's work.
  - what the partner sells is stamped with the partner, so it shows in their
    enrolment list and they can withdraw it — and so they can withdraw ONLY
    that. unenroll_user() deletes user_quests and user_quest_tasks.
"""

from unittest.mock import Mock, patch

import pytest

import routes.admin.organization_courses as oc
from repositories.partner_enrollment_repository import PartnerEnrollmentRepository

ORG = '1c675e5e-b455-452e-94cb-5927a3a9f407'          # OnFire Learning
OTHER_ORG = '8ee22671-6e38-473c-a326-90ff86460310'    # Optio Academy
ADMIN = '44444444-4444-4444-4444-444444444444'
PARENT = 'd5374c89-d7f5-40f6-8a90-0cfe609dfdb0'
CHILD = '9e5bdde0-b98a-46f6-9c27-6452586512ea'
LONER = '17e131a8-a647-4051-84f7-ea893afc9234'        # platform student, own login
ADVISOR = '55555555-5555-4555-8555-555555555555'
HOUSEHOLD = 'f2ba269e-f3b9-4f15-8cc7-1f61da97a5d0'
COURSE = '33333333-3333-4333-8333-333333333331'
PARENT_EMAIL = 'elviaroche01@gmail.com'


class _Table:
    """A table that honours eq/in_ so a route's real filters are exercised."""

    def __init__(self, name, rows, log):
        self.name, self.rows, self.log = name, list(rows), log
        self.filters = []
        self.op = 'select'
        self.payload = None
        self.one = False

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def in_(self, col, vals):
        self.filters.append((col, list(vals)))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def single(self):
        self.one = True
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def upsert(self, payload, **_k):
        self.op, self.payload = 'upsert', payload
        return self

    def delete(self):
        self.op = 'delete'
        return self

    def _matches(self, row):
        for col, val in self.filters:
            actual = row.get(col)
            if isinstance(val, list):
                if actual not in val:
                    return False
            elif actual != val:
                return False
        return True

    def execute(self):
        if self.op != 'select':
            self.log.append((self.op, self.name, self.payload))
            data = [self.payload] if isinstance(self.payload, dict) else (self.payload or [])
            return Mock(data=data)
        rows = [r for r in self.rows if self._matches(r)]
        if self.one:
            return Mock(data=(rows[0] if rows else None))
        return Mock(data=rows)


def _client(tables, log):
    c = Mock()
    c.table.side_effect = lambda name: _Table(name, tables.get(name, []), log)
    return c


def _repo(tables):
    return PartnerEnrollmentRepository(client=_client(tables, []))


def _tables(**overrides):
    tables = {
        'organizations': [{'id': ORG, 'slug': 'onfire-learning', 'name': 'OnFire Learning'}],
        'courses': [{'id': COURSE, 'title': 'Design an Escape Room', 'status': 'published'}],
        'users': [
            {'id': PARENT, 'email': PARENT_EMAIL, 'first_name': 'Elvia', 'last_name': 'Labrador',
             'display_name': 'Elvia Labrador', 'organization_id': OTHER_ORG,
             'role': 'org_managed', 'org_role': 'parent'},
            {'id': CHILD, 'email': None, 'first_name': 'Publio', 'last_name': 'Labrador',
             'display_name': 'Publio Labrador', 'organization_id': OTHER_ORG,
             'role': 'org_managed', 'org_role': 'student'},
            {'id': LONER, 'email': 'publio@example.com', 'first_name': 'Publio', 'last_name': '',
             'display_name': None, 'organization_id': None, 'role': 'student', 'org_role': None},
            {'id': ADVISOR, 'email': 'advisor@example.com', 'first_name': 'Dana', 'last_name': 'Reed',
             'display_name': 'Dana Reed', 'organization_id': OTHER_ORG,
             'role': 'org_managed', 'org_role': 'advisor'},
        ],
        'parent_student_links': [],
        'household_members': [
            {'household_id': HOUSEHOLD, 'user_id': PARENT, 'relationship': 'guardian'},
            {'household_id': HOUSEHOLD, 'user_id': CHILD, 'relationship': 'student'},
        ],
        'course_enrollments': [],
    }
    tables.update(overrides)
    return tables


class _FakeEnrollmentService:
    """Records what the route asked for, without touching quests."""

    calls: list = []

    def __init__(self, _client):
        pass

    def enroll_user(self, user_id, course_id, enrolled_by_organization_id=None):
        _FakeEnrollmentService.calls.append((user_id, course_id, enrolled_by_organization_id))
        return {'success': True, 'status': 'enrolled', 'quests_enrolled': 3}

    def unenroll_user(self, user_id, course_id):
        _FakeEnrollmentService.calls.append(('unenroll', user_id, course_id))
        return {'success': True}


def _call(route, body=None, tables=None, query=None, org_id=ORG):
    """Invoke a route past its auth decorator, with a fake database."""
    log = []
    client = _client(tables if tables is not None else _tables(), log)
    _FakeEnrollmentService.calls = []
    from services import email_service as email_module
    with patch.object(oc, 'get_supabase_admin_client', return_value=client), \
         patch.object(oc, 'request', Mock(get_json=lambda: body or {}, args=query or {})), \
         patch('services.course_enrollment_service.CourseEnrollmentService', _FakeEnrollmentService), \
         patch.object(email_module.email_service, 'send_org_courses_added_email', return_value=True), \
         patch.object(email_module.email_service, 'send_org_course_welcome_email', return_value=True):
        from flask import Flask
        app = Flask(__name__)
        with app.app_context():
            fn = route
            while hasattr(fn, '__wrapped__'):
                fn = fn.__wrapped__
            resp = fn(ADMIN, ORG, False, org_id)
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status, log


def _register_body(**extra):
    body = {
        'first_name': 'Publio',
        'last_name': 'Labrador',
        'student_email': PARENT_EMAIL,
        'course_ids': [COURSE],
    }
    body.update(extra)
    return body


# ---------------------------------------------------------------- the helper


@pytest.mark.unit
def test_a_student_account_resolves_to_itself():
    tables = _tables()
    account = next(u for u in tables['users'] if u['id'] == LONER)
    assert oc._students_behind_email(_repo(tables), account) == [
        {'id': LONER, 'name': 'Publio', 'relationship': 'self'}
    ]


@pytest.mark.unit
def test_a_guardian_resolves_to_a_household_child_with_no_link_row():
    """Megan's case exactly: a household, a guardian, and no parent_student_link."""
    tables = _tables()
    account = next(u for u in tables['users'] if u['id'] == PARENT)
    assert oc._students_behind_email(_repo(tables), account) == [
        {'id': CHILD, 'name': 'Publio Labrador', 'relationship': 'child'}
    ]


@pytest.mark.unit
def test_a_guardian_resolves_to_a_linked_child_with_no_household():
    tables = _tables(
        household_members=[],
        parent_student_links=[{'parent_user_id': PARENT, 'student_user_id': LONER, 'status': 'approved'}],
    )
    account = next(u for u in tables['users'] if u['id'] == PARENT)
    assert oc._students_behind_email(_repo(tables), account) == [
        {'id': LONER, 'name': 'Publio', 'relationship': 'child'}
    ]


@pytest.mark.unit
def test_an_unapproved_link_is_not_a_child():
    tables = _tables(
        household_members=[],
        parent_student_links=[{'parent_user_id': PARENT, 'student_user_id': LONER, 'status': 'pending'}],
    )
    assert oc._students_behind_email(
        _repo(tables), next(u for u in tables['users'] if u['id'] == PARENT)) == []


@pytest.mark.unit
def test_staff_resolve_to_nobody():
    tables = _tables()
    account = next(u for u in tables['users'] if u['id'] == ADVISOR)
    assert oc._students_behind_email(_repo(tables), account) == []


# ------------------------------------------------------------- registration


@pytest.mark.unit
def test_an_existing_account_is_offered_rather_than_refused():
    body, status, log = _call(oc.register_student_for_course, _register_body())

    assert status == 409
    assert body['code'] == 'existing_account'
    assert body['students'] == [{'id': CHILD, 'name': 'Publio Labrador', 'relationship': 'child'}]
    assert PARENT_EMAIL in body['message']
    # Asked, not done: nothing was written and nobody was enrolled.
    assert log == []
    assert _FakeEnrollmentService.calls == []


@pytest.mark.unit
def test_confirming_the_student_enrols_them_without_touching_their_account():
    body, status, log = _call(
        oc.register_student_for_course, _register_body(student_id=CHILD)
    )

    assert status == 201
    assert body['is_new_account'] is False
    assert body['enrolled_student'] == {'id': CHILD, 'name': 'Publio Labrador', 'relationship': 'child'}
    assert body['courses'][0]['status'] == 'enrolled'
    assert 'Publio Labrador' in body['message']
    # The course went to the child, stamped with the partner that sold it.
    assert _FakeEnrollmentService.calls == [(CHILD, COURSE, ORG)]
    # The account keeps its school and its role. No write reached `users`.
    assert [entry for entry in log if entry[1] == 'users'] == []


@pytest.mark.unit
def test_a_student_id_not_on_that_account_is_refused():
    body, status, log = _call(
        oc.register_student_for_course, _register_body(student_id=ADVISOR)
    )

    assert status == 409
    assert body['code'] == 'student_not_on_account'
    assert _FakeEnrollmentService.calls == []


@pytest.mark.unit
def test_an_account_with_no_student_on_it_is_refused():
    body, status, _log = _call(
        oc.register_student_for_course,
        _register_body(student_email='advisor@example.com'),
    )

    assert status == 409
    assert body['code'] == 'existing_account_no_student'
    assert _FakeEnrollmentService.calls == []


@pytest.mark.unit
def test_a_returning_student_of_this_partner_still_enrols_in_one_step():
    """Unchanged behaviour: an account already in the org needs no confirmation."""
    tables = _tables()
    tables['users'] = tables['users'] + [{
        'id': LONER, 'email': 'returning@example.com', 'first_name': 'Sam', 'last_name': 'Reyes',
        'display_name': 'Sam Reyes', 'organization_id': ORG, 'role': 'org_managed', 'org_role': 'student',
    }]
    body, status, _log = _call(
        oc.register_student_for_course,
        _register_body(student_email='returning@example.com'),
        tables=tables,
    )

    assert status == 201
    assert body['is_new_account'] is False
    assert 'enrolled_student' not in body
    assert _FakeEnrollmentService.calls == [(LONER, COURSE, ORG)]


# ------------------------------------------------------- list and withdrawal


@pytest.mark.unit
def test_the_partner_sees_what_it_sold_to_an_outside_account():
    tables = _tables(course_enrollments=[{
        'id': 'e1', 'user_id': CHILD, 'course_id': COURSE, 'status': 'active',
        'enrolled_at': '2026-09-22T20:30:00Z', 'enrolled_by_organization_id': ORG,
    }])
    body, status, _log = _call(oc.list_org_course_enrollments, tables=tables)

    assert status == 200
    assert len(body['enrollments']) == 1
    row = body['enrollments'][0]
    assert row['student_name'] == 'Publio Labrador'
    assert row['course_title'] == 'Design an Escape Room'
    assert row['external_account'] is True


@pytest.mark.unit
def test_another_orgs_enrolment_stays_out_of_the_partners_list():
    tables = _tables(course_enrollments=[{
        'id': 'e1', 'user_id': CHILD, 'course_id': COURSE, 'status': 'active',
        'enrolled_at': '2026-09-22T20:30:00Z', 'enrolled_by_organization_id': OTHER_ORG,
    }])
    body, status, _log = _call(oc.list_org_course_enrollments, tables=tables)

    assert status == 200
    assert body['enrollments'] == []


@pytest.mark.unit
def test_the_partner_can_withdraw_what_it_sold():
    tables = _tables(course_enrollments=[{
        'id': 'e1', 'user_id': CHILD, 'course_id': COURSE, 'status': 'active',
        'enrolled_at': '2026-09-22T20:30:00Z', 'enrolled_by_organization_id': ORG,
    }])
    body, status, _log = _call(
        oc.remove_org_course_enrollment,
        {'student_id': CHILD, 'course_id': COURSE},
        tables=tables,
    )

    assert status == 200
    assert ('unenroll', CHILD, COURSE) in _FakeEnrollmentService.calls


@pytest.mark.unit
def test_the_partner_cannot_withdraw_an_enrolment_it_did_not_make():
    """The guard on somebody else's student work. unenroll_user() deletes it."""
    tables = _tables(course_enrollments=[{
        'id': 'e1', 'user_id': CHILD, 'course_id': COURSE, 'status': 'active',
        'enrolled_at': '2026-09-01T00:00:00Z', 'enrolled_by_organization_id': None,
    }])
    body, status, _log = _call(
        oc.remove_org_course_enrollment,
        {'student_id': CHILD, 'course_id': COURSE},
        tables=tables,
    )

    assert status == 404
    assert _FakeEnrollmentService.calls == []
