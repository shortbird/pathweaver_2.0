"""A reviewer's XP change on /approve has to reach the task.

The superadmin approve route loaded the task as ``title, diploma_subjects,
subject_xp_distribution, xp_value`` -- no ``id`` -- and then handed that row to
``adjust_task_xp``, whose first line is "no id, no adjustment". Every XP change
a reviewer made at the Optio stage came back 400 "Cannot adjust XP without a
task" (2026-09-11, found the first time somebody typed a number into the
grader). The org-approve path had selected ``id, quest_id, pillar`` since it
gained the same feature; this one had not.

The fake client here projects the row onto the columns the route actually
selects, because a fake that returns every column regardless is exactly the
fake that let this ship.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
STUDENT_ID = '11111111-1111-1111-1111-111111111111'
TASK_ID = '22222222-2222-2222-2222-222222222222'
QUEST_ID = '33333333-3333-3333-3333-333333333333'
SUPERADMIN_ID = '99999999-9999-9999-9999-999999999999'


class Chain:
    """Chainable fake that honours ``.select(columns)`` on single reads."""

    def __init__(self, single_data=None, list_data=None, record=None):
        self._single = single_data
        self._list = list_data if list_data is not None else []
        self._columns = None
        self._is_single = False
        self._record = record

    def _project(self, row):
        if row is None or self._columns is None or self._columns.strip() == '*':
            return row
        wanted = [c.strip() for c in self._columns.split(',')]
        return {k: v for k, v in row.items() if k in wanted}

    def __getattr__(self, name):
        if name == 'select':
            def _select(columns='*', **_kw):
                self._columns = columns
                return self
            return _select
        if name == 'single':
            def _single():
                self._is_single = True
                return self
            return _single
        if name == 'execute':
            def _exec():
                if self._is_single:
                    return SimpleNamespace(data=self._project(self._single), count=None)
                return SimpleNamespace(data=[self._project(r) for r in self._list],
                                       count=len(self._list))
            return _exec
        if name in ('update', 'insert'):
            def _write(row, *_a, **_kw):
                if self._record is not None:
                    self._record.setdefault(name, []).append(row)
                return self
            return _write
        return lambda *a, **kw: self


def _build_supabase():
    captures = {'user_quest_tasks': {}, 'quest_task_completions': {},
                'sis_xp_adjustments': {}}
    reviewer = {'id': SUPERADMIN_ID, 'role': 'superadmin', 'org_role': None,
                'org_roles': None, 'organization_id': None}
    completion = {'id': COMPLETION_ID, 'user_id': STUDENT_ID, 'quest_id': QUEST_ID,
                  'diploma_status': 'pending_review', 'revision_number': 1,
                  'user_quest_task_id': TASK_ID,
                  'credit_requested_at': '2026-09-01T00:00:00+00:00'}
    task = {'id': TASK_ID, 'quest_id': QUEST_ID, 'pillar': 'stem', 'title': 'Load test',
            'diploma_subjects': ['science'], 'subject_xp_distribution': {'science': 100},
            'xp_value': 100}

    def _table(name):
        if name == 'users':
            return Chain(single_data=reviewer, list_data=[reviewer])
        if name == 'quest_task_completions':
            return Chain(single_data=completion, list_data=[completion],
                         record=captures['quest_task_completions'])
        if name == 'user_quest_tasks':
            return Chain(single_data=task, list_data=[task],
                         record=captures['user_quest_tasks'])
        if name == 'diploma_review_rounds':
            return Chain(single_data={'id': 'round-1'}, list_data=[{'id': 'round-1'}])
        if name == 'sis_xp_adjustments':
            return Chain(record=captures['sis_xp_adjustments'])
        return Chain()

    client = MagicMock()
    client.table.side_effect = _table
    return client, captures


@pytest.fixture(autouse=True)
def _quiet_side_effects():
    with patch('services.notification_service.NotificationService') as ns, \
         patch('routes.tasks.xp_helpers.finalize_subject_xp', return_value=50), \
         patch('routes.tasks.xp_helpers.remove_pending_subject_xp', return_value=None), \
         patch('routes.tasks.xp_helpers.pending_subjects_for_completion',
               return_value={'science': 100}), \
         patch('services.xp_adjustment_service._apply_pillar_delta',
               return_value=('stem', -50)):
        ns.return_value.create_notification = MagicMock()
        yield


@pytest.mark.unit
def test_approve_with_a_new_xp_value_adjusts_the_task(client):
    supabase, captures = _build_supabase()
    with patch('routes.credit_dashboard.superadmin_actions.get_supabase_admin_singleton',
               return_value=supabase), \
         patch('database.get_supabase_admin_client', return_value=supabase), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=SUPERADMIN_ID):
        resp = client.post(
            f'/api/credit-dashboard/items/{COMPLETION_ID}/approve',
            json={'xp_value': 50, 'xp_reason': 'Half the planned scope',
                  'subjects': {'science': 50}},
        )

    assert resp.status_code == 200, resp.get_json()
    task_updates = captures['user_quest_tasks'].get('update') or []
    assert any(u.get('xp_value') == 50 for u in task_updates), (
        f'the task should have been set to 50 XP; writes were {task_updates!r}')
    audit = captures['sis_xp_adjustments'].get('insert') or []
    assert audit and audit[0]['xp_before'] == 100 and audit[0]['xp_after'] == 50
    assert audit[0]['task_id'] == TASK_ID
    assert audit[0]['quest_id'] == QUEST_ID
