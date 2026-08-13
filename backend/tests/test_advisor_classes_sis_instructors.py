"""
A SIS-assigned teacher's classes must reach /api/advisor/classes.

iCreate assigns teachers by writing org_classes.primary_instructor_id (and
assistant_instructor_ids); it never creates class_advisors rows. The repo read
only the link table, so a teacher like Lisa Hale — primary instructor on five
active classes — saw "No classes yet" on /dashboard and was locked out of
/org-classes/:id, because can_user_access_class routes through
is_class_advisor.

Both now go through class_membership_service, the module that already owns the
"a teacher lives in three places" rule.
"""

from unittest.mock import PropertyMock, patch

import pytest

from repositories.class_repository import ClassRepository


class _Query:
    """Chainable stand-in for the PostgREST builder."""

    def __init__(self, rows):
        self._rows = rows
        self._status = None

    def select(self, *_a, **_k):
        return self

    def in_(self, _col, ids):
        self._rows = [r for r in self._rows if r['id'] in ids]
        return self

    def eq(self, col, val):
        if col == 'status':
            self._rows = [r for r in self._rows if r.get('status') == val]
        return self

    def limit(self, _n):
        return self

    def execute(self):
        return type('R', (), {'data': list(self._rows)})()


@pytest.fixture
def repo():
    r = ClassRepository.__new__(ClassRepository)

    classes = [
        {'id': 'c1', 'name': 'TLP: Summit', 'status': 'active'},
        {'id': 'c2', 'name': 'Freedom Seminar', 'status': 'archived'},
    ]

    class _Admin:
        def table(self, name):
            if name == 'org_classes':
                return _Query(classes)
            # No class_advisors rows exist for a SIS-assigned teacher.
            return _Query([])

    # admin_client is a lazy property on the repo — patch it, don't assign.
    with patch.object(ClassRepository, 'admin_client',
                      new_callable=PropertyMock, return_value=_Admin()):
        yield r


@pytest.mark.unit
class TestSisInstructorSeesTheirClasses:
    def test_primary_instructor_classes_are_returned(self, repo):
        with patch('services.class_membership_service.teacher_class_ids',
                   return_value={'c1', 'c2'}):
            names = [c['name'] for c in repo.get_advisor_classes('lisa', status='active')]
        assert names == ['TLP: Summit']

    def test_status_none_returns_every_class(self, repo):
        with patch('services.class_membership_service.teacher_class_ids',
                   return_value={'c1', 'c2'}):
            got = repo.get_advisor_classes('lisa', status=None)
        assert {c['id'] for c in got} == {'c1', 'c2'}

    def test_a_teacher_with_no_classes_short_circuits(self, repo):
        with patch('services.class_membership_service.teacher_class_ids',
                   return_value=set()) as spy:
            assert repo.get_advisor_classes('nobody') == []
        assert spy.called

    def test_sis_assigned_class_carries_no_legacy_assignment_block(self, repo):
        """The `assignment` key only exists when a class_advisors row does."""
        with patch('services.class_membership_service.teacher_class_ids',
                   return_value={'c1'}):
            got = repo.get_advisor_classes('lisa', status='active')
        assert 'assignment' not in got[0]


@pytest.mark.unit
class TestClassAccessFollowsTheSameRule:
    def test_primary_instructor_is_a_class_advisor(self, repo):
        with patch('services.class_membership_service.class_teacher_ids',
                   return_value={'lisa'}):
            assert repo.is_class_advisor('c1', 'lisa') is True

    def test_an_unrelated_user_is_not(self, repo):
        with patch('services.class_membership_service.class_teacher_ids',
                   return_value={'lisa'}):
            assert repo.is_class_advisor('c1', 'someone-else') is False
