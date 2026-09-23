"""The SIS class Student Progress tab: XP, the cell states, and engagement.

Four iCreate tickets from 2026-09-23, all about the teacher's grid at
/my-classes/<id> -> Student Progress (routes/sis/class_quest_students.py):

  d4e562c9 -- "I would like to see the top number be how many XP they have
      completed/how many XP they need to complete... Colby Barker ... says 2/8
      but in reality he has completed 50XP, and he needs 50XP. So it would be
      50XP/50XP." Decision (Tanner): reaching the XP target counts as Done on
      THIS TAB ONLY; utils/quest_completion.is_quest_done is unchanged.
  8b928af0 -- "When a parent completes a Quest and ends it, it would be nice to
      know/see that on this page. Like a check mark." completed_at, plus a
      distinct Set aside state.
  7cf5d330 -- "We'd want to see 'opened' 'assigned' 'done' & engagement
      metric". Opened comes from user_quests.first_opened_at, which a migration
      adds later; the grid must load without it.

Plus the enrollment pick: a student with two user_quests rows for one quest
used to get whichever the database returned last.
"""

import uuid as _uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import pytest
from flask import Flask

import app  # noqa: F401 — import graph ordering
from routes.sis import class_quest_students as cq
from utils.quest_completion import is_quest_done

CLASS_ID = str(_uuid.uuid4())
CLASS_ROW = {'id': CLASS_ID, 'name': 'Earth Science', 'organization_id': 'org-1'}
COLBY = 'colby'
QUEST = 'q-volcano'

NOW = datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat()


class _Query:
    """Enough of a PostgREST builder: filters rows on eq/in_, ignores the rest."""

    def __init__(self, db, name):
        self.db, self.name = db, name
        self.cols = ''
        self.filters = []

    def select(self, cols='*', **_k):
        self.cols = cols
        return self

    def eq(self, col, val):
        self.filters.append((col, {val}))
        return self

    def in_(self, col, vals):
        self.filters.append((col, set(vals)))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def execute(self):
        if self.name == 'user_quests' and self.db.get('_no_opened_columns') \
                and 'first_opened_at' in self.cols:
            raise Exception('column user_quests.first_opened_at does not exist')
        rows = [r for r in self.db.get(self.name, [])
                if all(r.get(col) in vals for col, vals in self.filters)]
        if self.name == 'user_quests' and 'first_opened_at' not in self.cols:
            rows = [{k: v for k, v in r.items() if 'opened' not in k} for r in rows]
        return Mock(data=rows)


def _admin(db):
    admin = Mock()
    admin.table.side_effect = lambda name: _Query(db, name)
    return admin


def _db(*, threshold=50, uq=None, tasks=None, completions=None, extra_uqs=(), no_opened=False,
        student_ids=None):
    uq_row = uq if uq is not None else {
        'id': 'uq-1', 'user_id': COLBY, 'quest_id': QUEST, 'is_active': True,
        'status': 'picked_up', 'completed_at': None, 'started_at': _iso(NOW - timedelta(days=20)),
        'created_at': _iso(NOW - timedelta(days=20)),
        'first_opened_at': None, 'last_opened_at': None,
    }
    return {
        '_no_opened_columns': no_opened,
        'class_quests': [{
            'class_id': CLASS_ID, 'quest_id': QUEST, 'sequence_order': 0, 'due_date': None,
            'publish_at': None, 'student_ids': student_ids,
            'quests': {'id': QUEST, 'title': 'Volcanoes', 'xp_threshold': threshold},
        }],
        'class_enrollments': [{'class_id': CLASS_ID, 'student_id': COLBY, 'status': 'active',
                               'id': 'enr-1'}],
        'users': [{'id': COLBY, 'first_name': 'Colby', 'last_name': 'Barker', 'display_name': None}],
        'user_quests': ([uq_row] if uq_row else []) + list(extra_uqs),
        'user_quest_tasks': tasks if tasks is not None else [],
        'quest_task_completions': completions if completions is not None else [],
    }


def _eight_tasks(xp=25):
    return [{'id': f't{i}', 'user_quest_id': 'uq-1', 'user_id': COLBY, 'quest_id': QUEST,
             'title': f'Task {i}', 'description': None, 'xp_value': xp, 'order_index': i}
            for i in range(8)]


def _done(*task_ids, when=None):
    when = when or NOW - timedelta(days=1)
    return [{'id': f'c-{t}', 'task_id': t, 'completed_at': _iso(when)} for t in task_ids]


def _grid(db):
    view = cq.class_student_progress
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    with Flask(__name__).test_request_context('/progress'), \
            patch.object(cq, '_authorize', return_value=(CLASS_ROW, _admin(db), None)):
        resp = view('teacher-1', CLASS_ID)
    body = resp[0] if isinstance(resp, tuple) else resp
    return body.get_json()


def _cell(db):
    student = _grid(db)['students'][0]
    return student, student['cells'][0]


# ── d4e562c9: XP on the grid, and the XP target counts as Done here ─────────

@pytest.mark.unit
def test_colby_reads_50_of_50_xp_and_done_although_only_2_of_8_tasks_are_in():
    """d4e562c9: 'it says 2/8 but in reality he has completed 50XP, and he needs
    50XP. So it would be 50XP/50XP.'"""
    student, cell = _cell(_db(threshold=50, tasks=_eight_tasks(25), completions=_done('t0', 't1')))
    assert (cell['xp_earned'], cell['xp_required']) == (50, 50)
    assert (cell['done'], cell['total']) == (2, 8)          # still sent, as the secondary line
    assert cell['completed'] is True
    assert cell['state'] == 'done'
    assert (student['xp_earned'], student['xp_required']) == (50, 50)
    assert student['quests_completed'] == 1


@pytest.mark.unit
def test_the_xp_rule_is_this_tabs_alone_the_shared_rule_is_unchanged():
    """Decision (Tanner, d4e562c9): the digest and class list keep today's rule."""
    uq = {'completed_at': None}
    assert is_quest_done(uq, 2, 8) is False
    assert cq._done_on_this_tab(uq, 2, 8, 50, 50) is True
    assert cq._done_on_this_tab(uq, 2, 8, 25, 50) is False


@pytest.mark.unit
def test_below_the_target_is_in_progress_with_the_xp_shown():
    _, cell = _cell(_db(threshold=100, tasks=_eight_tasks(25), completions=_done('t0')))
    assert (cell['xp_earned'], cell['xp_required']) == (25, 100)
    assert cell['completed'] is False
    assert cell['state'] == 'in_progress'


@pytest.mark.unit
def test_no_threshold_falls_back_to_the_total_task_xp():
    _, cell = _cell(_db(threshold=None, tasks=_eight_tasks(10), completions=_done('t0')))
    assert (cell['xp_earned'], cell['xp_required']) == (10, 80)
    assert cell['completed'] is False


@pytest.mark.unit
def test_no_threshold_and_no_tasks_requires_nothing_and_is_not_done():
    _, cell = _cell(_db(threshold=None, tasks=[]))
    assert (cell['xp_earned'], cell['xp_required']) == (0, 0)
    assert cell['completed'] is False
    assert cell['state'] == 'assigned'


@pytest.mark.unit
def test_a_quest_with_no_enrollment_yet_carries_the_threshold_as_the_target():
    student, cell = _cell(_db(threshold=40, uq=False))
    assert cell['state'] == 'assigned' and cell['started'] is False
    assert (cell['xp_earned'], cell['xp_required']) == (0, 40)
    assert student['xp_required'] == 40


@pytest.mark.unit
def test_a_quest_kept_to_other_students_is_not_assigned_and_counts_no_xp():
    student, cell = _cell(_db(student_ids=['someone-else']))
    assert cell['state'] == 'not_assigned'
    assert (cell['xp_earned'], cell['xp_required']) == (0, 0)
    assert student['xp_required'] == 0


# ── 8b928af0: ended (check + date) and set aside ────────────────────────────

@pytest.mark.unit
def test_an_ended_quest_carries_its_completed_at_for_the_check_and_date():
    """8b928af0: 'When a parent completes a Quest and ends it, it would be nice
    to know/see that on this page. Like a check mark.'"""
    ended = _iso(NOW - timedelta(days=3))
    uq = {'id': 'uq-1', 'user_id': COLBY, 'quest_id': QUEST, 'is_active': False,
          'status': 'picked_up', 'completed_at': ended, 'started_at': None, 'created_at': None}
    _, cell = _cell(_db(uq=uq, tasks=_eight_tasks(), completions=_done('t0')))
    assert cell['completed_at'] == ended
    assert cell['state'] == 'done'
    assert cell['set_aside'] is False


@pytest.mark.unit
def test_a_quest_ended_below_its_target_reads_set_aside_not_done():
    uq = {'id': 'uq-1', 'user_id': COLBY, 'quest_id': QUEST, 'is_active': False,
          'status': 'set_down', 'completed_at': None, 'started_at': None, 'created_at': None}
    _, cell = _cell(_db(threshold=100, uq=uq, tasks=_eight_tasks(), completions=_done('t0')))
    assert cell['state'] == 'set_aside'
    assert cell['set_aside'] is True
    assert cell['completed'] is False
    assert cell['completed_at'] is None


@pytest.mark.unit
def test_a_quest_not_ended_has_no_completed_at():
    _, cell = _cell(_db(tasks=_eight_tasks(), completions=[]))
    assert cell['completed_at'] is None


# ── 7cf5d330: Assigned -> Opened, and engagement ────────────────────────────

@pytest.mark.unit
def test_an_enrollment_nobody_opened_reads_assigned():
    """7cf5d330: "We'd want to see 'opened' 'assigned' 'done' & engagement
    metric". Assigning creates the enrollment, so an enrollment is not "opened"."""
    _, cell = _cell(_db(tasks=_eight_tasks()))
    assert cell['state'] == 'assigned'
    assert cell['first_opened_at'] is None


@pytest.mark.unit
def test_an_opened_enrollment_with_nothing_turned_in_reads_opened():
    db = _db(tasks=_eight_tasks())
    db['user_quests'][0]['first_opened_at'] = _iso(NOW - timedelta(hours=2))
    _, cell = _cell(db)
    assert cell['state'] == 'opened'
    assert cell['first_opened_at'] == db['user_quests'][0]['first_opened_at']


@pytest.mark.unit
def test_the_grid_still_loads_before_the_opened_migration_is_applied():
    """The columns come from 20260923120000_user_quests_opened_at, applied later.
    A missing column costs the Opened state and nothing else."""
    _, cell = _cell(_db(tasks=_eight_tasks(25), completions=_done('t0'), no_opened=True))
    assert cell['state'] == 'in_progress'
    assert cell['first_opened_at'] is None
    assert cell['xp_earned'] == 25


@pytest.mark.unit
def test_engagement_is_last_activity_and_xp_in_the_last_7_days():
    recent = NOW - timedelta(days=2)
    old = NOW - timedelta(days=12)
    completions = _done('t0', when=old) + _done('t1', 't2', when=recent)
    student, _ = _cell(_db(threshold=200, tasks=_eight_tasks(25), completions=completions))
    assert student['xp_last_7_days'] == 50
    assert datetime.fromisoformat(student['last_activity_at']) == recent


@pytest.mark.unit
def test_a_student_with_no_completions_has_no_last_activity():
    student, _ = _cell(_db(tasks=_eight_tasks()))
    assert student['last_activity_at'] is None
    assert student['xp_last_7_days'] == 0


# ── Several enrollments for one quest ───────────────────────────────────────

@pytest.mark.unit
def test_the_active_enrollment_speaks_for_the_student_not_an_older_one():
    old_ended = {'id': 'uq-old', 'user_id': COLBY, 'quest_id': QUEST, 'is_active': False,
                 'status': 'picked_up', 'completed_at': _iso(NOW - timedelta(days=90)),
                 'started_at': _iso(NOW - timedelta(days=100)), 'created_at': None}
    # The old row is returned LAST, which is the order that used to win.
    _, cell = _cell(_db(tasks=_eight_tasks(), extra_uqs=[old_ended]))
    assert cell['completed_at'] is None
    assert cell['state'] == 'assigned'


@pytest.mark.unit
def test_among_inactive_enrollments_the_most_recent_wins():
    rows = [
        {'id': 'a', 'is_active': False, 'started_at': '2026-01-01T00:00:00+00:00'},
        {'id': 'b', 'is_active': False, 'started_at': '2026-06-01T00:00:00+00:00'},
    ]
    assert cq._pick_enrollment(rows)['id'] == 'b'
    assert cq._pick_enrollment([]) is None


# ── The student panel (_student_work) ───────────────────────────────────────

@pytest.mark.unit
def test_the_panel_carries_the_same_xp_state_and_ended_date_as_the_cell():
    ended = _iso(NOW - timedelta(days=1))
    db = _db(threshold=50, tasks=_eight_tasks(25), completions=_done('t0', 't1'))
    db['user_quests'][0].update({'completed_at': ended, 'is_active': False})
    [quest] = cq._student_work(_admin(db), CLASS_ROW, COLBY)
    assert (quest['xp_earned'], quest['xp_required']) == (50, 50)
    assert quest['completed'] is True
    assert quest['state'] == 'done'
    assert quest['completed_at'] == ended
    assert quest['set_aside'] is False


@pytest.mark.unit
def test_the_panel_says_set_aside_and_tolerates_the_missing_opened_columns():
    uq = {'id': 'uq-1', 'user_id': COLBY, 'quest_id': QUEST, 'is_active': False,
          'status': 'set_down', 'completed_at': None, 'started_at': None, 'created_at': None}
    db = _db(threshold=100, uq=uq, tasks=_eight_tasks(25), completions=_done('t0'), no_opened=True)
    [quest] = cq._student_work(_admin(db), CLASS_ROW, COLBY)
    assert quest['state'] == 'set_aside'
    assert quest['set_aside'] is True
    assert quest['first_opened_at'] is None


@pytest.mark.unit
def test_the_panel_for_a_quest_not_started_has_no_xp_and_no_ended_date():
    [quest] = cq._student_work(_admin(_db(threshold=None, uq=False)), CLASS_ROW, COLBY)
    assert (quest['xp_earned'], quest['xp_required']) == (0, 0)
    assert quest['state'] == 'assigned'
    assert quest['completed_at'] is None
    assert quest['set_aside'] is False
