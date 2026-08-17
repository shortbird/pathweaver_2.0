"""
Quests a school sets for its students, and how they land on the account.

iCreate, 2026-08-17, of the orientation quest: not everybody's account —
"12+ students and all parents". Students were a group the training catalog could
not name, and an age gate was something it could not express at all.

Students are also the one audience with no page of their own in the SIS. A
teacher gets caught up when they load the training page and a parent when they
load the family portal; a student just finds the quest on their account in the
learning app, so the catch-up for them runs from their guardian's portal instead
(see services/sis_training_service.py, and the layering note in its docstring).
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_training_service as svc


ORG = 'org-1'


class _Tables:
    """Answers each table's query with canned rows, ignoring the filters."""

    def __init__(self, rows):
        self.rows = rows
        self.queried = []

    def __call__(self, name):
        self.queried.append(name)
        t = Mock()
        for chained in ('select', 'eq', 'in_', 'contains', 'order', 'limit'):
            getattr(t, chained).return_value = t
        t.execute.return_value = Mock(data=self.rows.get(name, []))
        return t


def _row(quest_id='q1', active=True, **extra):
    return {'quest_id': quest_id, 'auto_assign': True,
            'student_min_age': None, 'student_max_age': None,
            'quests': {'is_active': active}, **extra}


def _catch_up(rows, student_ids=('s1',)):
    """Run catch_up_students with a stubbed DB. Returns (created, enrolled_ids)."""
    client = Mock()
    client.table.side_effect = _Tables(rows)
    enrolled = []

    def _assign(_admin, quest_id, user_ids):
        enrolled.append((quest_id, list(user_ids)))
        return {'enrolled': len(user_ids), 'already': 0, 'failed': 0}

    with patch.object(svc, 'get_supabase_admin_client', return_value=client), \
         patch('utils.quest_assignment.assign_quest_to_users', side_effect=_assign):
        created = svc.catch_up_students(ORG, list(student_ids))
    return created, enrolled


@pytest.mark.unit
class TestTheAgeWindow:
    def test_no_window_reaches_everyone(self):
        assert svc.student_in_age_window({}, {'age': 6}) is True

    def test_twelve_and_up(self):
        item = {'student_min_age': 12}
        assert svc.student_in_age_window(item, {'age': 12}) is True
        assert svc.student_in_age_window(item, {'age': 11}) is False

    def test_closed_at_both_ends(self):
        item = {'student_min_age': 8, 'student_max_age': 11}
        assert svc.student_in_age_window(item, {'age': 11}) is True
        assert svc.student_in_age_window(item, {'age': 12}) is False

    def test_an_unknown_birthday_is_left_out_of_a_windowed_row(self):
        assert svc.student_in_age_window({'student_min_age': 12}, {'age': None}) is False

    def test_but_is_fine_when_the_row_has_no_window(self):
        assert svc.student_in_age_window({}, {'age': None}) is True


@pytest.mark.unit
class TestTheCatchUp:
    def test_it_enrols_a_student_the_row_reaches(self):
        created, enrolled = _catch_up({
            'sis_staff_training': [_row()],
            'users': [{'id': 's1', 'date_of_birth': '2012-01-01'}],
        })
        assert created == 1 and enrolled == [('q1', ['s1'])]

    def test_the_age_window_is_applied_to_the_children_it_finds(self):
        """The reason it re-reads ages rather than trusting the caller: a row
        aimed at 12-and-up has to pick up the student who turned 12 last week,
        and leave the six-year-old alone, with nobody re-assigning anything."""
        created, enrolled = _catch_up({
            'sis_staff_training': [_row(student_min_age=12)],
            'users': [{'id': 'teen', 'date_of_birth': '2010-01-01'},
                      {'id': 'little', 'date_of_birth': '2020-01-01'}],
        }, student_ids=('teen', 'little'))
        assert created == 1 and enrolled == [('q1', ['teen'])]

    def test_a_draft_is_on_nobody_s_account(self):
        created, enrolled = _catch_up({
            'sis_staff_training': [_row(active=False)],
            'users': [{'id': 's1', 'date_of_birth': '2012-01-01'}],
        })
        assert created == 0 and enrolled == []

    def test_a_school_with_no_student_quests_does_no_work(self):
        client = Mock()
        tables = _Tables({'sis_staff_training': []})
        client.table.side_effect = tables
        with patch.object(svc, 'get_supabase_admin_client', return_value=client):
            assert svc.catch_up_students(ORG, ['s1']) == 0
        assert 'users' not in tables.queried, 'no catalog, so nothing to look up'

    def test_a_guardian_with_no_children_does_no_work(self):
        client = Mock()
        client.table.side_effect = _Tables({'sis_staff_training': [_row()]})
        with patch.object(svc, 'get_supabase_admin_client', return_value=client):
            assert svc.catch_up_students(ORG, []) == 0
            assert svc.catch_up_students(ORG, None) == 0

    def test_one_failing_quest_does_not_cost_the_others(self):
        """This runs while a parent is loading their portal. A quest that cannot
        be assigned is a log line, not a blank page."""
        client = Mock()
        client.table.side_effect = _Tables({
            'sis_staff_training': [_row('q1'), _row('q2')],
            'users': [{'id': 's1', 'date_of_birth': '2012-01-01'}],
        })
        calls = []

        def _assign(_admin, quest_id, user_ids):
            calls.append(quest_id)
            if quest_id == 'q1':
                raise RuntimeError('nope')
            return {'enrolled': 1, 'already': 0, 'failed': 0}

        with patch.object(svc, 'get_supabase_admin_client', return_value=client), \
             patch('utils.quest_assignment.assign_quest_to_users', side_effect=_assign):
            assert svc.catch_up_students(ORG, ['s1']) == 1
        assert calls == ['q1', 'q2']
