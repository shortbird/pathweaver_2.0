"""
Roster-wide "what did my students do this week", for Friday check-ins.

Arete Academy's admin could see a student's completed projects only by opening
that student's account, one of 31 at a time. The class page itself read 0 XP for
everyone, because the only per-student number it had was scoped to the class's
*assigned* quests — and Chesapeake, like most classes used as a roster rather
than a syllabus, has none assigned. Meanwhile those same students had 6800 XP
of work sitting in their accounts.

So the window read is deliberately not class-quest-scoped. These tests pin that
decision, the Saturday-to-Friday week the check-ins run on, and the fact that a
student who did nothing still comes back as a row.
"""

from datetime import date
from unittest.mock import MagicMock, patch

import pytest

import app  # noqa: F401 — import graph ordering
from repositories.class_repository import ClassRepository
from routes.classes.students import _week_containing
from services.base_service import ValidationError
from services.class_service import ClassService


def _repo(roster_ids, completions, quest_titles=None):
    with patch.object(ClassRepository, '__init__', lambda self: None):
        repo = ClassRepository()
    repo._admin_client = MagicMock()
    repo.get_class_students = MagicMock(return_value=[
        {'status': 'active', 'users': {'id': sid, 'first_name': sid}}
        for sid in roster_ids
    ])
    repo._quest_titles = MagicMock(return_value=quest_titles or {})
    return repo, completions


def _run(repo, completions, start='2026-08-29', end='2026-09-04'):
    with patch('repositories.class_repository.fetch_all_rows',
               return_value=completions):
        return repo.get_class_activity('c1', start, end)


def _completion(user, quest, title, xp, when):
    return {
        'id': f'{user}-{title}', 'user_id': user, 'quest_id': quest,
        'completed_at': when,
        'user_quest_tasks': {'title': title, 'xp_value': xp, 'pillar': 'STEM'},
    }


# --- The week ---------------------------------------------------------------

@pytest.mark.parametrize('today, expected_start', [
    ('2026-09-04', '2026-08-29'),  # a Friday -> the Saturday six days back
    ('2026-08-29', '2026-08-29'),  # a Saturday -> itself
    ('2026-09-01', '2026-08-29'),  # midweek
    ('2026-09-05', '2026-09-05'),  # the next Saturday starts a new week
])
def test_week_runs_saturday_to_friday(today, expected_start):
    start, end = _week_containing(date.fromisoformat(today))
    assert start.isoformat() == expected_start
    assert (end - start).days == 6
    assert start.weekday() == 5 and end.weekday() == 4


# --- The aggregation --------------------------------------------------------

def test_counts_work_from_quests_the_class_never_assigned():
    """The whole point: Chesapeake has zero class_quests, and its students have
    thousands of XP. Scoping to assigned quests is what reported 0 for all 31."""
    repo, completions = _repo(
        ['s1'],
        [_completion('s1', 'q-unassigned', 'Dissect a squid', 100,
                     '2026-09-01T10:00:00Z')],
        quest_titles={'q-unassigned': 'Marine Biology'},
    )
    result = _run(repo, completions)

    assert result[0]['xp'] == 100
    assert result[0]['quests'][0]['title'] == 'Marine Biology'
    repo.get_class_students.assert_called_once_with('c1')


def test_groups_tasks_under_their_quest_and_sums_xp():
    repo, completions = _repo(
        ['s1'],
        [
            _completion('s1', 'q1', 'Task A', 100, '2026-09-01T10:00:00Z'),
            _completion('s1', 'q1', 'Task B', 50, '2026-08-31T10:00:00Z'),
            _completion('s1', 'q2', 'Task C', 25, '2026-09-02T10:00:00Z'),
        ],
        quest_titles={'q1': 'Chess', 'q2': 'Zoo'},
    )
    student = _run(repo, completions)[0]

    assert student['xp'] == 175
    assert student['tasks_completed'] == 3
    assert [q['title'] for q in student['quests']] == ['Chess', 'Zoo']
    assert student['quests'][0]['xp'] == 150
    # Tasks read in the order they were done, not the order they came back.
    assert [t['title'] for t in student['quests'][0]['tasks']] == ['Task B', 'Task A']
    assert student['last_activity'] == '2026-09-02T10:00:00Z'


def test_idle_student_is_a_row_not_an_omission():
    """"Who did nothing this week" is the question a check-in list answers."""
    repo, completions = _repo(
        ['busy', 'idle'],
        [_completion('busy', 'q1', 'Task A', 100, '2026-09-01T10:00:00Z')],
    )
    result = _run(repo, completions)

    assert {s['student_id'] for s in result} == {'busy', 'idle'}
    idle = next(s for s in result if s['student_id'] == 'idle')
    assert idle['xp'] == 0 and idle['quests'] == [] and idle['last_activity'] is None
    # Busiest first, so a check-in list opens on who has something to show.
    assert result[0]['student_id'] == 'busy'


def test_completion_with_no_task_row_still_counts():
    """user_quest_task_id is nullable; a null embed must not zero the row out."""
    repo, completions = _repo(['s1'], [{
        'id': 'c', 'user_id': 's1', 'quest_id': 'q1',
        'completed_at': '2026-09-01T10:00:00Z', 'user_quest_tasks': None,
    }])
    student = _run(repo, completions)[0]

    assert student['tasks_completed'] == 1
    assert student['xp'] == 0
    assert student['quests'][0]['tasks'][0]['title'] == 'Untitled task'


def test_empty_roster_short_circuits():
    repo, _ = _repo([], [])
    with patch('repositories.class_repository.fetch_all_rows') as fetch:
        assert repo.get_class_activity('c1', '2026-08-29', '2026-09-04') == []
    fetch.assert_not_called()


def test_window_is_paged_not_a_bare_execute():
    """A week of completions across a roster grows with class size; a silent
    1000-row truncation would under-report a student's week (CLAUDE.md rule 10)."""
    repo, completions = _repo(['s1'], [])
    with patch('repositories.class_repository.fetch_all_rows',
               return_value=[]) as fetch:
        repo.get_class_activity('c1', '2026-08-29', '2026-09-04')
    fetch.assert_called_once()


# --- The service wrapper ----------------------------------------------------

def _service(students):
    with patch.object(ClassService, '__init__', lambda self: None):
        service = ClassService()
    service.class_repo = MagicMock()
    service.class_repo.get_class_activity.return_value = students
    return service


def test_summary_counts_only_students_who_did_something():
    service = _service([
        {'student_id': 'a', 'xp': 300, 'tasks_completed': 3, 'quests': [{}, {}]},
        {'student_id': 'b', 'xp': 0, 'tasks_completed': 0, 'quests': []},
    ])
    summary = service.get_class_activity('c1', '2026-08-29', '2026-09-04')['summary']

    assert summary == {
        'total_students': 2, 'active_students': 1,
        'total_xp': 300, 'total_tasks': 3, 'total_quests': 2,
    }


def test_backwards_window_rejected():
    with pytest.raises(ValidationError):
        _service([]).get_class_activity('c1', '2026-09-04', '2026-08-29')
