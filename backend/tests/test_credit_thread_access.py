"""
A teacher who is also a parent must still reach their own students' threads.

Gryffin Learning Center, 2026-09-01: Katie Bird reported "access denied" when
commenting on a student's evidence. She teaches three classes there as the
primary instructor, but her account carries org_role='parent' with 'advisor'
only in the org_roles array — she is a parent at the school as well as a
teacher.

_load_context selected the singular org_role and resolved her to 'parent', so
_can_access never entered the reviewer branch and returned False. It failed on
the GET (thread wouldn't load) and again on the POST (comment rejected), which
is why the same user produced two Sentry issues: OPTIO-WEB-7 and OPTIO-WEB-8.

The check now takes the caller's FULL effective role list, so an account is
judged on its most capable role rather than on whichever happens to sit first
in the array.
"""

import app  # noqa: F401 — import graph ordering
import pytest

from routes.credit_messages import _can_access


COMPLETION = {
    'id': 'c-1',
    'user_id': 'student-1',
    'credit_reviewer_id': None,
    'org_reviewer_id': None,
}

ORG = 'org-gryffin'


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Chainable stub: every filter returns self; execute returns the payload."""

    def __init__(self, data):
        self._data = data

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def single(self):
        return self

    def execute(self):
        return _Result(self._data)


class _Admin:
    """Minimal supabase stand-in: the student's org, and advisor assignments."""

    def __init__(self, student_org=ORG, assignments=None):
        self._student_org = student_org
        self._assignments = assignments or []

    def table(self, name):
        if name == 'users':
            return _Query({'organization_id': self._student_org})
        if name == 'advisor_student_assignments':
            return _Query(self._assignments)
        raise AssertionError(f'unexpected table {name}')


@pytest.fixture
def teaches(monkeypatch):
    """Control shares_class, which _can_access imports at call time."""

    def _set(value):
        monkeypatch.setattr(
            'utils.class_membership.shares_class', lambda *_a, **_k: value
        )

    return _set


class TestMultiRoleTeacher:
    def test_parent_who_also_teaches_the_student_gets_in(self, teaches):
        """The regression: org_role='parent', 'advisor' only in org_roles."""
        teaches(True)
        user = {'id': 'katie', 'organization_id': ORG}
        assert _can_access(COMPLETION, user, ['parent', 'advisor'], _Admin()) is True

    def test_role_order_does_not_decide_access(self, teaches):
        """['advisor','parent'] and ['parent','advisor'] must agree — the bug was
        that only the first element was ever consulted."""
        teaches(True)
        user = {'id': 'katie', 'organization_id': ORG}
        assert _can_access(COMPLETION, user, ['advisor', 'parent'], _Admin()) is True
        assert _can_access(COMPLETION, user, ['parent', 'advisor'], _Admin()) is True

    def test_parent_alone_is_still_denied(self, teaches):
        """Holding 'advisor' is what grants this, not being a parent at the
        school. A plain parent has no claim on another student's thread."""
        teaches(True)  # even if the helper would say yes, the branch isn't reached
        user = {'id': 'someone', 'organization_id': ORG}
        assert _can_access(COMPLETION, user, ['parent'], _Admin()) is False


class TestReviewerScope:
    def test_advisor_without_any_relationship_is_denied(self, teaches):
        """Same org alone is not enough for a teacher — it would open every
        student's private thread to every teacher in the school."""
        teaches(False)
        user = {'id': 'other-teacher', 'organization_id': ORG}
        assert _can_access(COMPLETION, user, ['advisor'], _Admin()) is False

    def test_advisor_with_an_active_assignment_gets_in(self, teaches):
        teaches(False)
        user = {'id': 'assigned', 'organization_id': ORG}
        admin = _Admin(assignments=[{'id': 'a-1'}])
        assert _can_access(COMPLETION, user, ['advisor'], admin) is True

    def test_advisor_from_another_org_is_denied(self, teaches):
        teaches(True)
        user = {'id': 'outsider', 'organization_id': 'org-other'}
        assert _can_access(COMPLETION, user, ['advisor'], _Admin()) is False

    def test_campus_coordinator_reaches_the_whole_org(self, teaches):
        """Coordinators run the campus; the restriction on them is financial,
        not scope-based (sis_roles.py)."""
        teaches(False)
        user = {'id': 'coord', 'organization_id': ORG}
        assert _can_access(COMPLETION, user, ['campus_coordinator'], _Admin()) is True

    def test_org_admin_reaches_the_whole_org(self, teaches):
        teaches(False)
        user = {'id': 'admin', 'organization_id': ORG}
        assert _can_access(COMPLETION, user, ['org_admin'], _Admin()) is True


class TestAlwaysAllowed:
    def test_the_student_who_owns_the_work(self, teaches):
        teaches(False)
        user = {'id': 'student-1', 'organization_id': None}
        assert _can_access(COMPLETION, user, ['student'], _Admin()) is True

    def test_superadmin(self, teaches):
        teaches(False)
        user = {'id': 'root', 'organization_id': None}
        assert _can_access(COMPLETION, user, ['superadmin'], _Admin()) is True

    def test_the_designated_reviewer_on_this_completion(self, teaches):
        """Assigned to THIS submission, so no org/class relationship needed."""
        teaches(False)
        completion = dict(COMPLETION, credit_reviewer_id='reviewer-1')
        user = {'id': 'reviewer-1', 'organization_id': None}
        assert _can_access(completion, user, ['advisor'], _Admin()) is True


class TestDenied:
    def test_no_roles_at_all(self, teaches):
        teaches(True)
        user = {'id': 'nobody', 'organization_id': ORG}
        assert _can_access(COMPLETION, user, [], _Admin()) is False

    def test_missing_user_or_completion(self, teaches):
        teaches(True)
        assert _can_access(None, {'id': 'x'}, ['superadmin'], _Admin()) is False
        assert _can_access(COMPLETION, None, ['superadmin'], _Admin()) is False

    def test_student_with_no_org_does_not_match_a_null_org_teacher(self, teaches):
        """Both sides null must not read as 'same org'."""
        teaches(False)
        user = {'id': 'teacher', 'organization_id': None}
        assert _can_access(COMPLETION, user, ['advisor'], _Admin(student_org=None)) is False
