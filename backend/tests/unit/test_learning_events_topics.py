"""Topic-junction correctness tests for LearningEventsService.

Covers:
- ``_enrich_events_with_topics`` isolates per-event errors so one bad row
  does not blank topics for the whole batch.
- ``create_learning_event`` writes the junction rows and never touches
  the legacy single-value columns.
- ``update_learning_event`` replaces junction rows when ``topics`` is
  supplied and leaves them alone when it isn't.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
EVENT_ID_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
EVENT_ID_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
TRACK_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
QUEST_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'


def _chain(execute_result):
    """Mock that returns itself for every builder method so any Supabase
    chain terminates at the given execute() result."""
    chain = MagicMock()
    for method in ('select', 'insert', 'update', 'delete', 'upsert',
                   'eq', 'in_', 'is_', 'order', 'limit', 'offset', 'range', 'single'):
        getattr(chain, method).return_value = chain
    chain.execute.return_value = execute_result
    return chain


def test_enrich_with_topics_isolates_per_event_failures():
    """A junction row with a missing track lookup should leave that one
    event's topics partial without blanking topics on every other event."""
    from services.learning_events_service import LearningEventsService

    events = [
        {'id': EVENT_ID_A},
        {'id': EVENT_ID_B},
    ]

    junction_rows = SimpleNamespace(data=[
        {'learning_event_id': EVENT_ID_A, 'topic_type': 'topic', 'topic_id': TRACK_ID},
        {'learning_event_id': EVENT_ID_B, 'topic_type': 'quest', 'topic_id': QUEST_ID},
    ])
    track_rows = SimpleNamespace(data=[
        {'id': TRACK_ID, 'name': 'Coding', 'color': '#abc'}
    ])
    quest_rows = SimpleNamespace(data=[
        {'id': QUEST_ID, 'title': 'Build a robot'}
    ])

    supabase = MagicMock()
    table_responses = {
        'learning_event_topics': junction_rows,
        'interest_tracks': track_rows,
        'quests': quest_rows,
    }
    supabase.table.side_effect = lambda name: _chain(table_responses[name])

    enriched = LearningEventsService._enrich_events_with_topics(supabase, events)

    by_id = {e['id']: e for e in enriched}
    assert by_id[EVENT_ID_A]['topics'] == [
        {'type': 'topic', 'id': TRACK_ID, 'name': 'Coding', 'color': '#abc'}
    ]
    assert by_id[EVENT_ID_B]['topics'] == [
        {'type': 'quest', 'id': QUEST_ID, 'name': 'Build a robot'}
    ]


def test_enrich_with_topics_swallows_junction_fetch_error():
    """If the junction table query itself raises, every event should still
    come back with a stable ``topics: []`` rather than a missing key."""
    from services.learning_events_service import LearningEventsService

    events = [{'id': EVENT_ID_A}, {'id': EVENT_ID_B}]

    supabase = MagicMock()
    bad_chain = MagicMock()
    for method in ('select', 'in_'):
        getattr(bad_chain, method).return_value = bad_chain
    bad_chain.execute.side_effect = RuntimeError('connection reset')
    supabase.table.return_value = bad_chain

    enriched = LearningEventsService._enrich_events_with_topics(supabase, events)
    assert enriched[0]['topics'] == []
    assert enriched[1]['topics'] == []


def test_create_learning_event_inserts_junction_only():
    """Create should insert into the junction with no fall-through write
    to legacy ``track_id`` / ``quest_id`` columns on ``learning_events``."""
    from services.learning_events_service import LearningEventsService

    learning_event_chain = _chain(SimpleNamespace(data=[{
        'id': EVENT_ID_A,
        'user_id': USER_ID,
        'description': 'I learned',
    }]))
    junction_chain = _chain(SimpleNamespace(data=[]))

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        'learning_events': learning_event_chain,
        'learning_event_topics': junction_chain,
    }[name]
    supabase.rpc.return_value = _chain(SimpleNamespace(data=None))

    with patch('services.learning_events_service.get_supabase_admin_client', return_value=supabase):
        result = LearningEventsService.create_learning_event(
            user_id=USER_ID,
            description='I learned',
            topics=[
                {'type': 'topic', 'id': TRACK_ID},
                {'type': 'quest', 'id': QUEST_ID},
            ],
        )

    assert result['success'] is True

    # The insert payload on learning_events must NOT include legacy columns.
    insert_call = learning_event_chain.insert.call_args
    inserted = insert_call.args[0]
    assert 'track_id' not in inserted
    assert 'quest_id' not in inserted

    # The junction received both rows.
    junction_inserted = junction_chain.insert.call_args.args[0]
    assert {'learning_event_id': EVENT_ID_A, 'topic_type': 'topic', 'topic_id': TRACK_ID} in junction_inserted
    assert {'learning_event_id': EVENT_ID_A, 'topic_type': 'quest', 'topic_id': QUEST_ID} in junction_inserted


def test_update_learning_event_omits_topics_leaves_junction_alone():
    """Caller passes only ``description``; junction must NOT be deleted."""
    from services.learning_events_service import LearningEventsService

    learning_events_chain = _chain(SimpleNamespace(data=[{
        'id': EVENT_ID_A,
        'user_id': USER_ID,
        'description': 'updated',
    }]))
    junction_chain = _chain(SimpleNamespace(data=[]))

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        'learning_events': learning_events_chain,
        'learning_event_topics': junction_chain,
    }[name]
    supabase.rpc.return_value = _chain(SimpleNamespace(data=None))

    with patch('services.learning_events_service.get_supabase_admin_client', return_value=supabase):
        result = LearningEventsService.update_learning_event(
            user_id=USER_ID,
            event_id=EVENT_ID_A,
            description='updated',
        )

    assert result['success'] is True
    junction_chain.delete.assert_not_called()
    junction_chain.insert.assert_not_called()


def test_update_learning_event_with_topics_replaces_junction():
    """Caller passes ``topics=[...]``; junction is fully replaced."""
    from services.learning_events_service import LearningEventsService

    learning_events_chain = _chain(SimpleNamespace(data=[{
        'id': EVENT_ID_A,
        'user_id': USER_ID,
    }]))
    junction_chain = _chain(SimpleNamespace(data=[
        {'topic_type': 'topic', 'topic_id': TRACK_ID}
    ]))

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        'learning_events': learning_events_chain,
        'learning_event_topics': junction_chain,
    }[name]
    supabase.rpc.return_value = _chain(SimpleNamespace(data=None))

    new_quest = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    with patch('services.learning_events_service.get_supabase_admin_client', return_value=supabase):
        result = LearningEventsService.update_learning_event(
            user_id=USER_ID,
            event_id=EVENT_ID_A,
            topics=[{'type': 'quest', 'id': new_quest}],
        )

    assert result['success'] is True
    junction_chain.delete.assert_called()
    junction_chain.insert.assert_called_once()
    inserted = junction_chain.insert.call_args.args[0]
    assert inserted == [{
        'learning_event_id': EVENT_ID_A,
        'topic_type': 'quest',
        'topic_id': new_quest,
    }]


def test_enrich_with_promoted_task_attaches_when_present():
    """Moments that have a user_quest_tasks row with source_moment_id
    pointing at them should come back with promoted_task populated."""
    from services.learning_events_service import LearningEventsService

    events = [{'id': EVENT_ID_A}, {'id': EVENT_ID_B}]
    tasks_resp = SimpleNamespace(data=[
        {
            'id': 'task-1',
            'title': 'Promoted task',
            'quest_id': QUEST_ID,
            'source_moment_id': EVENT_ID_A,
        }
    ])
    quests_resp = SimpleNamespace(data=[{'id': QUEST_ID, 'title': 'My Quest'}])

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: _chain({
        'user_quest_tasks': tasks_resp,
        'quests': quests_resp,
    }[name])

    enriched = LearningEventsService._enrich_events_with_promoted_task(supabase, events)
    by_id = {e['id']: e for e in enriched}
    assert by_id[EVENT_ID_A]['promoted_task'] == {
        'id': 'task-1',
        'title': 'Promoted task',
        'quest_id': QUEST_ID,
        'quest_title': 'My Quest',
    }
    assert by_id[EVENT_ID_B]['promoted_task'] is None


def test_enrich_with_promoted_task_swallows_lookup_error():
    """Failing to fetch promoted tasks should leave events with
    promoted_task=None rather than raising."""
    from services.learning_events_service import LearningEventsService

    events = [{'id': EVENT_ID_A}]
    bad_chain = MagicMock()
    for method in ('select', 'in_'):
        getattr(bad_chain, method).return_value = bad_chain
    bad_chain.execute.side_effect = RuntimeError('boom')

    supabase = MagicMock()
    supabase.table.return_value = bad_chain

    enriched = LearningEventsService._enrich_events_with_promoted_task(supabase, events)
    assert enriched[0]['promoted_task'] is None


def test_normalize_topics_drops_unknown_type():
    from services.learning_events_service import LearningEventsService

    cleaned = LearningEventsService._normalize_topics([
        {'type': 'topic', 'id': TRACK_ID},
        {'type': 'bogus', 'id': 'xyz'},
        {'type': 'quest', 'id': QUEST_ID},
        {'type': 'quest', 'id': None},
    ])
    assert cleaned == [
        {'type': 'topic', 'id': TRACK_ID},
        {'type': 'quest', 'id': QUEST_ID},
    ]
