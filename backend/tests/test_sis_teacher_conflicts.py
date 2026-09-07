"""
Tests for the teacher double-booking cross-check (list_teacher_conflicts).

The overlap rules themselves are covered exhaustively in
test_sis_eligibility.py; this covers the orchestration around them — keying
classes by primary instructor, skipping archived and teacherless classes,
and the display-row shape the Classes page consumes. DB access is mocked.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_registration_service as regs

HOLLIE = 'teacher-hollie'

# The reported scenario: the same teacher on two Thursday 2-3pm classes.
CLASSES = [
    {'id': 'art', 'name': 'Digital Art Studio', 'status': 'active',
     'primary_instructor_id': HOLLIE},
    {'id': 'story', 'name': 'Story Detectives', 'status': 'active',
     'primary_instructor_id': HOLLIE},
    {'id': 'pottery', 'name': 'Pottery', 'status': 'active',
     'primary_instructor_id': 'teacher-2'},
    {'id': 'old', 'name': 'Retired Class', 'status': 'archived',
     'primary_instructor_id': HOLLIE},
    {'id': 'tbd', 'name': 'No Teacher Yet', 'status': 'active',
     'primary_instructor_id': None},
]

MEETINGS = [
    {'class_id': 'art', 'day_of_week': 4, 'start_time': '14:00:00', 'end_time': '15:00:00'},
    {'class_id': 'story', 'day_of_week': 4, 'start_time': '14:00:00', 'end_time': '15:00:00'},
]

USERS = [{'id': HOLLIE, 'first_name': 'Hollie', 'last_name': 'Smith', 'display_name': None}]


def _users_admin(rows):
    """Admin client stub whose users read returns the given rows."""
    admin = Mock()
    chain = Mock()
    admin.table.return_value = chain
    for m in ('select', 'in_', 'eq'):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = Mock(data=rows)
    return admin


@pytest.mark.unit
class TestListTeacherConflicts:

    def _run(self, classes=CLASSES, meetings=MEETINGS, users=USERS):
        repo = Mock()
        repo.meetings_for_classes.return_value = meetings
        with patch('services.sis_registration_service.fetch_all_rows',
                   return_value=classes), \
             patch('services.sis_registration_service._classes_repo',
                   return_value=repo), \
             patch('services.sis_registration_service._admin',
                   return_value=_users_admin(users)):
            out = regs.list_teacher_conflicts('org-1')
        return out, repo

    def test_reports_the_double_booked_teacher(self):
        out, _ = self._run()
        # `key` is the name an acknowledgement is filed under (8479edee) and is
        # asserted below; this stays about the conflict itself.
        assert [{k: v for k, v in c.items() if k != 'key'} for c in out] == [{
            'teacher_id': HOLLIE,
            'teacher_name': 'Hollie Smith',
            'class_a_id': 'art', 'class_a': 'Digital Art Studio',
            'class_b_id': 'story', 'class_b': 'Story Detectives',
            'day_of_week': 4, 'start_time': '14:00', 'end_time': '15:00',
        }]

    def test_the_conflict_carries_a_name_the_office_can_wave_off(self):
        """iCreate, 2026-09-05 (8479edee): "a button ... that allows me to
        acknowledge I've seen it, but I think it's ok, so clear it from the
        warnings." The name includes the hour, so rescheduling either class
        raises the question again instead of staying quietly dismissed."""
        out, _ = self._run()
        assert out[0]['key'] == f'teacher:{HOLLIE.lower()}:art:story:4-14:00-15:00'

    def test_only_multi_class_teachers_are_checked(self):
        # Pottery's teacher has one class; archived/teacherless rows never
        # count toward a teacher's load — only Hollie's two live classes are
        # worth a meetings read.
        _, repo = self._run()
        repo.meetings_for_classes.assert_called_once_with(['art', 'story'])

    def test_no_conflict_on_different_days(self):
        meetings = [
            {'class_id': 'art', 'day_of_week': 4, 'start_time': '14:00:00', 'end_time': '15:00:00'},
            {'class_id': 'story', 'day_of_week': 2, 'start_time': '14:00:00', 'end_time': '15:00:00'},
        ]
        out, _ = self._run(meetings=meetings)
        assert out == []

    def test_archived_second_class_is_ignored(self):
        classes = [c for c in CLASSES if c['id'] in ('art', 'old')]
        out, _ = self._run(classes=classes)
        assert out == []

    def test_unknown_teacher_named_unknown(self):
        out, _ = self._run(users=[])
        assert out[0]['teacher_name'] == 'Unknown'
