"""Regression guard for quest detail moment injection.

Bug: ``InterestTracksService.get_quest_moments()`` returns a combined list
containing BOTH raw learning moments (item_type='moment') and completed
task rows (item_type='completed_task'). The ``GET /api/quests/<id>``
handler was iterating all items and injecting each as a virtual
"moment-<id>" task on the response — but the completed tasks were
already in ``quest_tasks`` via the user_quest_tasks + quest_task_completions
join. Result: every completed task appeared twice in the "Completed"
section of the quest detail page.

Fix: skip items whose ``item_type != 'moment'`` in the injection loop.
See backend/routes/quest/detail.py around line 260.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


QUEST_ID = '11111111-1111-1111-1111-111111111111'
USER_ID = '22222222-2222-2222-2222-222222222222'
ENROLLMENT_ID = '33333333-3333-3333-3333-333333333333'
TASK_ID = '44444444-4444-4444-4444-444444444444'
COMPLETION_ID = '55555555-5555-5555-5555-555555555555'
MOMENT_ID = '66666666-6666-6666-6666-666666666666'


def _chain(execute_result):
    """Build a Supabase-style chain mock whose every builder method returns
    itself, so any ``.select(...).eq(...).single().execute()`` chain works
    and terminates in the given ``execute()`` return value."""
    chain = MagicMock()
    for method in ('select', 'eq', 'in_', 'order', 'limit', 'range',
                   'gte', 'lte', 'single'):
        getattr(chain, method).return_value = chain
    chain.execute.return_value = execute_result
    return chain


def _supabase_mock(table_responses):
    """Return a supabase-client mock whose ``.table(name).execute()`` chain
    returns the execute-result shape registered in ``table_responses``."""
    client = MagicMock()
    client.table.side_effect = lambda name: _chain(table_responses[name])
    return client


@pytest.fixture
def enrolled_quest_supabase():
    """Single enrolled quest + 1 completed real task — the minimal shape
    the detail endpoint needs to reach the moment-injection block."""
    return _supabase_mock({
        'quests': SimpleNamespace(
            data={
                'id': QUEST_ID,
                'title': 'Test Quest',
                'description': 'A quest',
                'big_idea': None,
                'header_image_url': None,
                'image_url': None,
                'quest_type': 'optio',
                'approach_examples': [],
                'is_active': True,
                'organization_id': None,
                'lms_course_id': None,
                'created_at': '2026-01-01T00:00:00+00:00',
                'course_quests': [],
            },
            count=None,
        ),
        'user_quests': SimpleNamespace(
            data=[{
                'id': ENROLLMENT_ID,
                'user_id': USER_ID,
                'quest_id': QUEST_ID,
                'is_active': True,
                'completed_at': None,
                'personalization_completed': True,
                'created_at': '2026-01-01T00:00:00+00:00',
            }],
            count=None,
        ),
        'user_quest_tasks': SimpleNamespace(
            data=[{
                'id': TASK_ID,
                'title': 'Real completed task',
                'description': 'desc',
                'pillar': 'stem',
                'xp_value': 100,
                'diploma_subjects': [],
                'order_index': 0,
                'approval_status': 'approved',
                'user_quest_id': ENROLLMENT_ID,
                'is_required': True,
                'source_task_id': None,
            }],
            count=None,
        ),
        'quest_task_completions': SimpleNamespace(
            data=[{
                'user_quest_task_id': TASK_ID,
                'evidence_text': None,
                'evidence_url': None,
                'completed_at': '2026-04-15T00:00:00+00:00',
            }],
            count=None,
        ),
        'course_enrollments': SimpleNamespace(data=[], count=None),
    })


def _call_endpoint(client):
    """Call the endpoint with auth mocked."""
    with patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=USER_ID):
        return client.get(f'/api/quests/{QUEST_ID}')


@pytest.mark.parametrize('moments_payload,expected_task_count,label', [
    # Baseline: no moments at all — just the real completed task.
    ([], 1, 'no_moments'),
    # Regression case: get_quest_moments returns the completion row back
    # (item_type='completed_task'). Pre-fix this showed as a second task.
    (
        [{'id': COMPLETION_ID, 'item_type': 'completed_task',
          'title': 'Already a real task', 'pillars': ['stem'],
          'created_at': '2026-04-15T00:00:00+00:00',
          'evidence_blocks': []}],
        1,
        'completed_task_item_ignored',
    ),
    # Real moment injected as virtual task.
    (
        [{'id': MOMENT_ID, 'item_type': 'moment',
          'title': 'Journal moment', 'description': 'd', 'pillars': ['art'],
          'event_date': '2026-04-16T00:00:00+00:00',
          'created_at': '2026-04-16T00:00:00+00:00',
          'evidence_blocks': []}],
        2,
        'moment_injected',
    ),
    # Combined: the bug's worst case. One real moment + one completion
    # item. Must yield 2, not 3.
    (
        [
            {'id': MOMENT_ID, 'item_type': 'moment',
             'title': 'Journal moment', 'description': 'd', 'pillars': ['art'],
             'event_date': '2026-04-16T00:00:00+00:00',
             'created_at': '2026-04-16T00:00:00+00:00',
             'evidence_blocks': []},
            {'id': COMPLETION_ID, 'item_type': 'completed_task',
             'title': 'Already a real task', 'pillars': ['stem'],
             'created_at': '2026-04-15T00:00:00+00:00',
             'evidence_blocks': []},
        ],
        2,
        'mixed_only_moments_injected',
    ),
])
def test_quest_detail_does_not_duplicate_completed_tasks_via_moments(
    client, enrolled_quest_supabase, moments_payload,
    expected_task_count, label,
):
    """No matter what ``get_quest_moments`` mixes into its response, the
    endpoint must never duplicate a task that is already represented in
    ``quest_tasks`` by the user_quest_tasks + quest_task_completions join."""
    with patch('routes.quest.detail.get_supabase_admin_client',
               return_value=enrolled_quest_supabase), \
         patch('routes.quest_types.get_template_tasks', return_value=[]), \
         patch('services.interest_tracks_service.InterestTracksService.get_quest_moments',
               return_value={'success': True, 'moments': moments_payload}):
        response = _call_endpoint(client)

    assert response.status_code == 200, f'[{label}] {response.get_json()}'
    payload = response.get_json()
    quest_tasks = payload['quest']['quest_tasks']
    assert len(quest_tasks) == expected_task_count, (
        f'[{label}] expected {expected_task_count} tasks, got {len(quest_tasks)}: '
        f'{[t.get("id") for t in quest_tasks]}'
    )

    # No synthetic virtual task should carry a completion-row id: those
    # belong on the real user_quest_tasks record, not on a moment-prefixed
    # entry. The bug produced ``id == "moment-<completion_id>"``.
    for t in quest_tasks:
        assert t['id'] != f'moment-{COMPLETION_ID}', (
            f'[{label}] completion row re-injected as synthetic moment task'
        )
