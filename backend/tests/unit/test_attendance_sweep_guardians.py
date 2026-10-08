"""The attendance sweep's "Missed class" notice reaches every kind of parent.

Until 2026-10-07 services/sis_attendance_sweep_service.guardians_for_student
was its own copy of the parent lookup, and its parent_student_links query
matched status='active'. Every link row is 'approved', so a parent linked to a
student with their own login was never told their child missed a class. It now
delegates to utils.class_membership.guardians_by_student; these tests run the
real lookup against a fake table set holding one parent of each kind.
"""
from unittest.mock import patch

import pytest

from services import sis_attendance_sweep_service as sweep
from utils import class_membership

STUDENT = 'stu-1'

TABLES = {
    'users': [{'id': STUDENT, 'managed_by_parent_id': 'managing-parent'}],
    'parent_student_links': [
        {'parent_user_id': 'linked-parent', 'student_user_id': STUDENT, 'status': 'approved'},
        {'parent_user_id': 'pending-parent', 'student_user_id': STUDENT, 'status': 'pending'},
    ],
    'household_members': [
        {'household_id': 'h1', 'user_id': STUDENT, 'relationship': 'student'},
        {'household_id': 'h1', 'user_id': 'household-parent', 'relationship': 'guardian'},
    ],
}


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, col, val):
        return _Query([r for r in self.rows if r.get(col) == val])

    def in_(self, col, vals):
        return _Query([r for r in self.rows if r.get(col) in set(vals)])

    def execute(self):
        return type('R', (), {'data': list(self.rows)})()


class _Client:
    def table(self, name):
        return _Query(TABLES[name])


@pytest.mark.unit
def test_every_kind_of_parent_is_told():
    with patch.object(class_membership, '_admin', return_value=_Client()):
        guardians = sweep.guardians_for_student(STUDENT)
    assert guardians == {'managing-parent', 'linked-parent', 'household-parent'}


@pytest.mark.unit
def test_a_student_with_no_family_has_no_guardians():
    with patch.object(class_membership, '_admin', return_value=_Client()):
        assert sweep.guardians_for_student('stu-unknown') == set()
