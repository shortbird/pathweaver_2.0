"""
Unit tests for UFA learning-day selections (sis_learning_day_service) and the
parent-service wiring (guardian authorization + first-day / submission locks).

The learning day is a recorded CHOICE (Quest Learning Day or Elementary At-Home
Academic Learning Day), not an enrollable class — it counts toward the 3
instructional days UFA private school requires but not the 5 in-person blocks.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_learning_day_service as learning_day
from services import sis_parent_service as parent


def _chain(*datasets):
    m = MagicMock()
    for meth in ('select', 'insert', 'update', 'upsert', 'delete',
                 'eq', 'in_', 'is_', 'limit', 'order'):
        getattr(m, meth).return_value = m
    m.execute.side_effect = [MagicMock(data=d) for d in datasets]
    return m


def _client(tables):
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    return client


@pytest.mark.unit
class TestSelectionService:
    def test_get_selection_returns_the_row(self):
        row = {'choice': 'quest_learning_day', 'answers': {}, 'updated_at': '2026-07-21'}
        tables = {'sis_learning_day_selections': _chain([row])}
        with patch('services.sis_learning_day_service._admin', return_value=_client(tables)):
            assert learning_day.get_selection('org1', 's1') == row

    def test_get_selection_none_when_unset(self):
        tables = {'sis_learning_day_selections': _chain([])}
        with patch('services.sis_learning_day_service._admin', return_value=_client(tables)):
            assert learning_day.get_selection('org1', 's1') is None

    def test_set_selection_upserts_one_row_per_student(self):
        saved = {'id': 'ld1', 'choice': 'elementary_at_home'}
        chain = _chain([saved])
        tables = {'sis_learning_day_selections': chain}
        with patch('services.sis_learning_day_service._admin', return_value=_client(tables)):
            out = learning_day.set_selection('org1', 's1', 'elementary_at_home', 'g1')
        assert out == {'selection': saved}
        payload = chain.upsert.call_args.args[0]
        assert payload['choice'] == 'elementary_at_home'
        assert payload['selected_by'] == 'g1'
        assert chain.upsert.call_args.kwargs['on_conflict'] == 'organization_id,student_user_id'

    def test_set_selection_rejects_unknown_choice(self):
        out = learning_day.set_selection('org1', 's1', 'four_day_week', 'g1')
        assert 'error' in out

    def test_clearing_the_selection_deletes_the_row(self):
        chain = _chain([])
        tables = {'sis_learning_day_selections': chain}
        with patch('services.sis_learning_day_service._admin', return_value=_client(tables)):
            out = learning_day.set_selection('org1', 's1', None, 'g1')
        assert out == {'choice': None}
        chain.delete.assert_called_once()


_MINE = [{'student_id': 'stu1', 'org_id': 'org1', 'household_id': 'h1', 'name': 'Stu One'}]


@pytest.mark.unit
class TestParentWiring:
    def test_requires_a_guardian_relationship(self):
        with patch('services.sis_parent_service.registerable_students', return_value=[]):
            out = parent.set_learning_day('g1', 'org1', 'stu1', 'quest_learning_day')
        assert 'Not authorized' in out['error']

    def test_locked_after_first_day_of_school(self):
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=True):
            out = parent.set_learning_day('g1', 'org1', 'stu1', 'quest_learning_day')
        assert 'handled by the school' in out['error']

    def test_locked_while_submitted_for_approval(self):
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_schedule_submission_service.current',
                   return_value={'status': 'submitted'}):
            out = parent.set_learning_day('g1', 'org1', 'stu1', 'quest_learning_day')
        assert out.get('submission_locked') is True

    def test_saves_the_choice_for_an_authorized_guardian(self):
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_schedule_submission_service.current', return_value=None), \
             patch('services.sis_learning_day_service.set_selection',
                   return_value={'selection': {'choice': 'quest_learning_day'}}) as setter:
            out = parent.set_learning_day('g1', 'org1', 'stu1', 'quest_learning_day')
        assert out['selection']['choice'] == 'quest_learning_day'
        setter.assert_called_once_with('org1', 'stu1', 'quest_learning_day', 'g1')
