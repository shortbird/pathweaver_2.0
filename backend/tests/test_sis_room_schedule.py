"""
What is booked into each room, and where two classes share one.

iCreate, 2026-09-04, two reports one after the other:
  * f9d50612 — "on the drop down menu for the rooms, maybe it can show which
    ones are already occupied that hour."
  * 43625a45 — "can we have a way to add more than one room to a class? And a
    room conflict notice would be good."

Both are the same question about the same data, asked at two moments — while
choosing a room, and after saving one — so one read answers both.

The overlap rules themselves are covered in test_sis_eligibility.py and the
teacher-keyed orchestration in test_sis_teacher_conflicts.py; this covers the
room-keyed half: which classes hold a room, which slots go in the occupancy
map, and the display shape the Classes page consumes. DB access is mocked.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_registration_service as regs


# Two classes put in the Art Room at the same Thursday hour; the Gym is busy but
# uncontested; one archived class and one with no room at all.
CLASSES = [
    {'id': 'art', 'name': 'Digital Art Studio', 'status': 'active', 'location': 'Art Room'},
    {'id': 'story', 'name': 'Story Detectives', 'status': 'active', 'location': 'Art Room'},
    {'id': 'pe', 'name': 'Movement', 'status': 'active', 'location': 'Gym'},
    {'id': 'old', 'name': 'Retired Class', 'status': 'archived', 'location': 'Art Room'},
    {'id': 'tbd', 'name': 'Room TBD', 'status': 'active', 'location': None},
]

MEETINGS = [
    {'class_id': 'art', 'day_of_week': 4, 'start_time': '14:00:00', 'end_time': '15:00:00'},
    {'class_id': 'story', 'day_of_week': 4, 'start_time': '14:00:00', 'end_time': '15:00:00'},
    {'class_id': 'pe', 'day_of_week': 1, 'start_time': '09:00:00', 'end_time': '10:00:00'},
]


def _run(classes=CLASSES, meetings=MEETINGS):
    repo = Mock()
    repo.meetings_for_classes.return_value = meetings
    with patch('services.sis_registration_service.fetch_all_rows',
               return_value=classes), \
         patch('services.sis_registration_service._classes_repo',
               return_value=repo):
        return regs.room_schedule('org-1'), repo


@pytest.mark.unit
class TestRoomConflicts:
    def test_reports_two_classes_put_in_one_room_at_one_hour(self):
        out, _ = _run()
        assert out['conflicts'] == [{
            'room': 'Art Room',
            'class_a_id': 'art', 'class_a': 'Digital Art Studio',
            'class_b_id': 'story', 'class_b': 'Story Detectives',
            'day_of_week': 4, 'start_time': '14:00', 'end_time': '15:00',
        }]

    def test_a_room_with_one_class_is_not_a_conflict(self):
        out, _ = _run()
        assert not any(c['room'] == 'Gym' for c in out['conflicts'])

    def test_an_archived_class_does_not_hold_a_room(self):
        """It no longer runs, so it cannot be in anybody's way."""
        out, _ = _run(classes=[
            {'id': 'art', 'name': 'Digital Art Studio', 'status': 'active', 'location': 'Art Room'},
            {'id': 'old', 'name': 'Retired Class', 'status': 'archived', 'location': 'Art Room'},
        ])
        assert out['conflicts'] == []

    def test_classes_in_the_same_room_at_different_hours_do_not_clash(self):
        out, _ = _run(meetings=[
            {'class_id': 'art', 'day_of_week': 4, 'start_time': '14:00:00', 'end_time': '15:00:00'},
            {'class_id': 'story', 'day_of_week': 4, 'start_time': '15:00:00', 'end_time': '16:00:00'},
        ])
        assert out['conflicts'] == []

    def test_a_room_name_with_stray_whitespace_is_the_same_room(self):
        out, _ = _run(classes=[
            {'id': 'art', 'name': 'A', 'status': 'active', 'location': 'Art Room'},
            {'id': 'story', 'name': 'B', 'status': 'active', 'location': ' Art Room '},
        ])
        assert [c['room'] for c in out['conflicts']] == ['Art Room']


@pytest.mark.unit
class TestOccupancy:
    def test_every_booked_slot_is_listed_under_its_room(self):
        out, _ = _run()
        assert sorted(out['occupancy']) == ['Art Room', 'Gym']
        assert out['occupancy']['Gym'] == [{
            'class_id': 'pe', 'class_name': 'Movement',
            'day_of_week': 1, 'start_time': '09:00:00', 'end_time': '10:00:00',
        }]

    def test_slots_come_back_in_the_order_a_week_is_read(self):
        out, _ = _run(meetings=[
            {'class_id': 'art', 'day_of_week': 4, 'start_time': '14:00:00', 'end_time': '15:00:00'},
            {'class_id': 'story', 'day_of_week': 1, 'start_time': '09:00:00', 'end_time': '10:00:00'},
            {'class_id': 'story', 'day_of_week': 1, 'start_time': '08:00:00', 'end_time': '09:00:00'},
        ])
        art = out['occupancy']['Art Room']
        assert [(s['day_of_week'], s['start_time']) for s in art] == [
            (1, '08:00:00'), (1, '09:00:00'), (4, '14:00:00')]

    def test_a_class_that_never_meets_does_not_make_its_room_look_busy(self):
        """Otherwise a room with one meeting-less class in it reads as taken all
        week, and the picker sends the office looking for a class that is not
        on the timetable."""
        out, _ = _run(classes=[
            {'id': 'ghost', 'name': 'Independent Study', 'status': 'active', 'location': 'Art Room'},
        ], meetings=[])
        assert out['occupancy'] == {}

    def test_a_one_off_dated_meeting_is_not_a_weekly_booking(self):
        """A specific_date meeting has no day_of_week. It is a single event, not
        a standing claim on the room, and the picker asks a weekly question."""
        out, _ = _run(classes=[
            {'id': 'art', 'name': 'Digital Art Studio', 'status': 'active', 'location': 'Art Room'},
        ], meetings=[
            {'class_id': 'art', 'day_of_week': None, 'specific_date': '2026-09-10',
             'start_time': '14:00:00', 'end_time': '15:00:00'},
        ])
        assert out['occupancy'] == {}

    def test_a_school_with_no_rooms_assigned_reads_cleanly(self):
        out, repo = _run(classes=[
            {'id': 'tbd', 'name': 'Room TBD', 'status': 'active', 'location': None},
        ])
        assert out == {'occupancy': {}, 'conflicts': []}
        # Nothing holds a room, so there is nothing to ask the meetings table.
        repo.meetings_for_classes.assert_not_called()
