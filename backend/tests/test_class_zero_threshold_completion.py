"""
A class with no XP threshold must never auto-complete its students.

`calculate_student_class_progress` computed `is_complete = earned_xp >=
xp_threshold`, which is vacuously true at threshold 0 — so the completion check
that runs right after enrollment marked every student 'completed' about a
second after they were added. The roster lists status='active', so the class
showed 0 students while holding a full enrollment list.

Found 2026-08-28 when Arete Academy bulk-added 31 students to a class created
with xp_threshold=0 and the class kept reading "0 students".
"""

from unittest.mock import MagicMock, patch


import app  # noqa: F401 — import graph ordering
from repositories.class_repository import ClassRepository
from services.class_service import ClassService


def _service_with(cls_row, earned_xp):
    with patch.object(ClassService, '__init__', lambda self: None):
        service = ClassService()
    service.class_repo = MagicMock()
    service.class_repo.find_by_id.return_value = cls_row
    service.class_repo.get_student_class_xp.return_value = earned_xp
    return service


def test_zero_threshold_never_completes():
    service = _service_with({'id': 'c1', 'xp_threshold': 0}, earned_xp=0)
    progress = service.calculate_student_class_progress('c1', 's1')
    assert progress['is_complete'] is False
    assert progress['percentage'] == 0


def test_zero_threshold_never_completes_even_with_xp():
    service = _service_with({'id': 'c1', 'xp_threshold': 0}, earned_xp=500)
    progress = service.calculate_student_class_progress('c1', 's1')
    assert progress['is_complete'] is False


def test_null_threshold_never_completes():
    """A NULL column value reaches the service as None; before the fix this
    raised on the >= comparison (or defaulted to 100 only when the key was
    absent entirely)."""
    service = _service_with({'id': 'c1', 'xp_threshold': None}, earned_xp=50)
    progress = service.calculate_student_class_progress('c1', 's1')
    assert progress['is_complete'] is False


def test_real_threshold_still_completes():
    service = _service_with({'id': 'c1', 'xp_threshold': 100}, earned_xp=150)
    progress = service.calculate_student_class_progress('c1', 's1')
    assert progress['is_complete'] is True
    assert progress['percentage'] == 100


def test_real_threshold_incomplete_below():
    service = _service_with({'id': 'c1', 'xp_threshold': 100}, earned_xp=40)
    progress = service.calculate_student_class_progress('c1', 's1')
    assert progress['is_complete'] is False
    assert progress['percentage'] == 40


def test_enrollment_does_not_mark_complete_at_zero_threshold():
    """The write path: enroll_student runs the completion check inline; at
    threshold 0 it must not flip the enrollment to 'completed'."""
    service = _service_with({'id': 'c1', 'xp_threshold': 0}, earned_xp=0)
    service.class_repo.enroll_student.return_value = {'id': 'e1'}
    service.enroll_student('c1', 's1', enrolled_by='admin1')
    service.class_repo.update_enrollment_status.assert_not_called()


# --- The bulk path -----------------------------------------------------------
#
# calculate_student_class_progress (above) is the single-student read. The
# Students tab renders from get_class_progress_bulk, a second copy of the same
# arithmetic that the 2026-08-28 fix did not touch — so Arete's roster went on
# showing all 31 students under a green "Completed (31)" header long after the
# bug was called fixed. These pin the two together.


def _repo_with(cls_row, quest_ids=(), roster=(('s1', 0),)):
    with patch.object(ClassRepository, '__init__', lambda self: None):
        repo = ClassRepository()
    repo._admin_client = MagicMock()
    repo.find_by_id = MagicMock(return_value=cls_row)
    repo.get_class_quest_ids = MagicMock(return_value=list(quest_ids))
    repo.get_class_students = MagicMock(return_value=[
        {'status': 'active', 'users': {'id': sid}} for sid, _ in roster
    ])
    xp_by_student = dict(roster)
    repo._admin_client.table.return_value.select.return_value.eq.return_value\
        .in_.return_value.execute.side_effect = lambda: MagicMock(
            data=[{'user_quest_tasks': {'xp_value': xp_by_student['s1']}}]
        )
    return repo


def test_bulk_zero_threshold_never_completes():
    repo = _repo_with({'id': 'c1', 'xp_threshold': 0})
    progress = repo.get_class_progress_bulk('c1')[0]['progress']
    assert progress['is_complete'] is False
    assert progress['percentage'] == 0


def test_bulk_null_threshold_does_not_raise():
    """None fails `>= ` and `> 0` alike; the column is nullable, so a class
    created without a threshold crashed this endpoint outright."""
    repo = _repo_with({'id': 'c1', 'xp_threshold': None})
    progress = repo.get_class_progress_bulk('c1')[0]['progress']
    assert progress['is_complete'] is False


def test_bulk_real_threshold_still_completes():
    repo = _repo_with({'id': 'c1', 'xp_threshold': 100},
                      quest_ids=('q1',), roster=(('s1', 150),))
    progress = repo.get_class_progress_bulk('c1')[0]['progress']
    assert progress['is_complete'] is True
    assert progress['percentage'] == 100
