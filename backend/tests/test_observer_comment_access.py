"""
An organisation's staff must be able to leave feedback on their students' work.

Gryffin Learning Center, 2026-08-27: "When we try to submit feedback we get an
access denied error." The permission check read the RAW `users.role` column and
compared it to 'advisor'. Org staff are role='org_managed' with the real role in
org_role, so that comparison matched nothing: the advisor branch never ran, and
org_admin had no branch at all. The READ side of the same feature
(routes/observer/feed.py) already resolved the effective role, so staff could
see a student's work in the feed and were refused the moment they commented on
it.

Second cause, same symptom: the advisor branch required a row in
`advisor_student_assignments`, which is only ever written from the
Organization -> People -> Relationships screen. A school that onboarded through
class rosters has none, so even a correctly-resolved advisor was refused for
every student they teach.

These tests pin the role resolution and the two relationships that grant access,
rather than the route, because the defect was one predicate.
"""

import pytest

import app  # noqa: F401 — import graph ordering
from routes.observer.comments import can_comment_on_student

ORG_ADVISOR = {'role': 'org_managed', 'org_role': 'advisor',
               'org_roles': ['advisor'], 'organization_id': 'org-1'}
ORG_ADMIN = {'role': 'org_managed', 'org_role': 'org_admin',
             'org_roles': ['org_admin'], 'organization_id': 'org-1'}
COORDINATOR = {'role': 'org_managed', 'org_role': 'campus_coordinator',
               'org_roles': ['campus_coordinator'], 'organization_id': 'org-1'}
PLATFORM_ADVISOR = {'role': 'advisor', 'org_role': None, 'org_roles': None,
                    'organization_id': None}
SUPERADMIN = {'role': 'superadmin', 'org_role': None, 'org_roles': None,
              'organization_id': None}
ORG_STUDENT = {'role': 'org_managed', 'org_role': 'student',
               'org_roles': ['student'], 'organization_id': 'org-1'}
OTHER_ORG_ADMIN = {'role': 'org_managed', 'org_role': 'org_admin',
                   'org_roles': ['org_admin'], 'organization_id': 'org-2'}

STUDENT_ID = 'student-1'


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Minimal PostgREST chain stub: every filter returns self."""

    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return _Result(self._rows)

    def single(self):
        return _Single(self._rows[0] if self._rows else None)


class _Single:
    def __init__(self, row):
        self._row = row

    def execute(self):
        return _Result(self._row)


class _Supabase:
    """Stubs only the tables the predicate reads."""

    def __init__(self, observer_links=(), assignments=(), student_org='org-1'):
        self.observer_links = list(observer_links)
        self.assignments = list(assignments)
        self.student_org = student_org

    def table(self, name):
        if name == 'observer_student_links':
            return _Query(self.observer_links)
        if name == 'advisor_student_assignments':
            return _Query(self.assignments)
        if name == 'users':
            return _Query([{'organization_id': self.student_org}])
        raise AssertionError(f'unexpected table {name}')


@pytest.fixture(autouse=True)
def _no_masquerade(monkeypatch):
    """caller_is_superadmin hits the database; the role field is what we pin."""
    monkeypatch.setattr('utils.auth.decorators.caller_is_superadmin',
                        lambda *a, **k: False)


@pytest.fixture
def _teaches(monkeypatch):
    """Control whether the author teaches the student."""
    def _set(value):
        monkeypatch.setattr('utils.class_membership.shares_class',
                            lambda *a, **k: value)
    return _set


def test_org_advisor_assigned_to_the_student_may_comment():
    db = _Supabase(assignments=[{'id': 'a1'}])
    assert can_comment_on_student(db, 'advisor-1', ORG_ADVISOR, STUDENT_ID) is True


def test_org_advisor_who_teaches_the_student_may_comment(_teaches):
    """The class-roster relationship, for schools with no assignment rows."""
    _teaches(True)
    db = _Supabase(assignments=[])
    assert can_comment_on_student(db, 'advisor-1', ORG_ADVISOR, STUDENT_ID) is True


def test_org_advisor_unrelated_to_the_student_may_not_comment(_teaches):
    _teaches(False)
    db = _Supabase(assignments=[])
    assert can_comment_on_student(db, 'advisor-1', ORG_ADVISOR, STUDENT_ID) is False


def test_platform_advisor_resolves_the_same_way():
    db = _Supabase(assignments=[{'id': 'a1'}])
    assert can_comment_on_student(db, 'advisor-1', PLATFORM_ADVISOR, STUDENT_ID) is True


@pytest.mark.parametrize('user,label', [
    (ORG_ADMIN, 'org admin'),
    (COORDINATOR, 'campus coordinator'),
])
def test_org_staff_may_comment_on_their_own_schools_students(user, label):
    db = _Supabase(student_org='org-1')
    assert can_comment_on_student(db, 'admin-1', user, STUDENT_ID) is True, label


def test_org_admin_may_not_comment_on_another_schools_student():
    db = _Supabase(student_org='org-1')
    assert can_comment_on_student(db, 'admin-2', OTHER_ORG_ADMIN, STUDENT_ID) is False


def test_superadmin_may_always_comment():
    db = _Supabase()
    assert can_comment_on_student(db, 'root', SUPERADMIN, STUDENT_ID) is True


def test_an_observer_link_still_grants_access():
    db = _Supabase(observer_links=[{'can_comment': True}])
    assert can_comment_on_student(db, 'obs-1', {'role': 'observer'}, STUDENT_ID) is True


def test_an_observer_link_with_comments_disabled_does_not(_teaches):
    _teaches(False)
    db = _Supabase(observer_links=[{'can_comment': False}])
    assert can_comment_on_student(db, 'obs-1', {'role': 'observer'}, STUDENT_ID) is False


def test_a_student_may_not_comment_on_another_student(_teaches):
    _teaches(False)
    db = _Supabase()
    assert can_comment_on_student(db, 'student-2', ORG_STUDENT, STUDENT_ID) is False


def test_a_missing_author_is_refused():
    assert can_comment_on_student(_Supabase(), 'nobody', None, STUDENT_ID) is False
