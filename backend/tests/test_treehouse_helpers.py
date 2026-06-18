"""
Focused unit tests for The Treehouse cohort-scoping helper (A1).

`facilitators_for_student` decides which facilitators get notified about a
student's activity: all org_admins, plus advisors assigned to the student's
active cohort(s), with a fallback to ALL advisors when the student has no
cohort/advisor yet. Tested with a tiny fake Supabase client (no DB).
"""
from utils.treehouse import facilitators_for_student


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    # All filter methods are no-ops that return self (we canned the rows per table).
    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def in_(self, *a, **k): return self
    def limit(self, *a, **k): return self

    def execute(self):
        return type('R', (), {'data': self._rows})()


class _FakeClient:
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return _FakeQuery(self._tables.get(name, []))


ORG = 'org-1'


def test_notifies_admins_and_cohort_advisors_only():
    client = _FakeClient({
        'users': [
            {'id': 'admin1', 'org_role': 'org_admin', 'org_roles': []},
            {'id': 'adv1', 'org_role': 'advisor', 'org_roles': []},
            {'id': 'adv2', 'org_role': 'advisor', 'org_roles': []},
        ],
        'class_enrollments': [{'class_id': 'c1'}],
        'class_advisors': [{'advisor_id': 'adv1'}],   # only adv1 teaches the student's cohort
    })
    result = set(facilitators_for_student(client, ORG, 'student-1'))
    assert result == {'admin1', 'adv1'}      # adv2 (different cohort) is excluded


def test_fallback_to_all_advisors_when_no_cohort():
    client = _FakeClient({
        'users': [
            {'id': 'admin1', 'org_role': 'org_admin', 'org_roles': []},
            {'id': 'adv1', 'org_role': 'advisor', 'org_roles': []},
            {'id': 'adv2', 'org_role': 'advisor', 'org_roles': []},
        ],
        'class_enrollments': [],        # student not in any cohort
        'class_advisors': [],
    })
    result = set(facilitators_for_student(client, ORG, 'student-1'))
    assert result == {'admin1', 'adv1', 'adv2'}   # everyone, so nothing is missed


def test_fallback_when_cohort_has_no_advisor():
    client = _FakeClient({
        'users': [
            {'id': 'admin1', 'org_role': 'org_admin', 'org_roles': []},
            {'id': 'adv1', 'org_role': 'advisor', 'org_roles': []},
        ],
        'class_enrollments': [{'class_id': 'c1'}],
        'class_advisors': [],          # cohort exists but no advisor assigned yet
    })
    result = set(facilitators_for_student(client, ORG, 'student-1'))
    assert result == {'admin1', 'adv1'}   # falls back to all advisors + admins


def test_handles_org_roles_array():
    client = _FakeClient({
        'users': [
            {'id': 'u1', 'org_role': None, 'org_roles': ['advisor']},
        ],
        'class_enrollments': [],
        'class_advisors': [],
    })
    result = set(facilitators_for_student(client, ORG, 'student-1'))
    assert result == {'u1'}
