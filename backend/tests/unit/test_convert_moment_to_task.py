"""Convert-moment-to-task contract tests.

The "Promote to task" XP flow lives at
``InterestTracksService.convert_moment_to_task``. Source-of-truth for which
quest the task lands on is the ``learning_event_topics`` junction; the
caller can also pass an explicit ``quest_id`` when a moment is attached
to multiple quests.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


USER_ID = '11111111-1111-1111-1111-111111111111'
MOMENT_ID = '22222222-2222-2222-2222-222222222222'
QUEST_A = '33333333-3333-3333-3333-333333333333'
QUEST_B = '44444444-4444-4444-4444-444444444444'
ENROLLMENT_ID = '55555555-5555-5555-5555-555555555555'
NEW_TASK_ID = '66666666-6666-6666-6666-666666666666'


def _chain(execute_result):
    chain = MagicMock()
    for method in ('select', 'insert', 'update', 'delete', 'upsert',
                   'eq', 'in_', 'is_', 'order', 'limit', 'offset', 'range', 'single'):
        getattr(chain, method).return_value = chain
    chain.execute.return_value = execute_result
    return chain


def _build_supabase(*, junction_quest_ids, enrollment_found=True, evidence_blocks=None,
                    moment_description='Some description'):
    """Wire the supabase mock for the happy + adjacent paths."""
    moment_row = {
        'id': MOMENT_ID,
        'user_id': USER_ID,
        'title': 'I built a thing',
        'description': moment_description,
        'learning_event_evidence_blocks': evidence_blocks or [],
    }

    junction_data = [
        {'topic_id': qid, 'topic_type': 'quest'}
        for qid in junction_quest_ids
    ]

    learning_events_chain = _chain(SimpleNamespace(data=moment_row))
    junction_chain = _chain(SimpleNamespace(data=junction_data))
    enrollment_chain = _chain(SimpleNamespace(
        data=[{'id': ENROLLMENT_ID}] if enrollment_found else []
    ))
    task_chain = _chain(SimpleNamespace(data=[{
        'id': NEW_TASK_ID,
        'title': 'I built a thing',
        'pillar': 'stem',
        'xp_value': 50,
    }]))
    evidence_doc_chain = _chain(SimpleNamespace(data=[{'id': 'doc-id'}]))
    evidence_blocks_chain = _chain(SimpleNamespace(data=[]))

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        'learning_events': learning_events_chain,
        'learning_event_topics': junction_chain,
        'user_quests': enrollment_chain,
        'user_quest_tasks': task_chain,
        'user_task_evidence_documents': evidence_doc_chain,
        'evidence_document_blocks': evidence_blocks_chain,
    }.get(name, _chain(SimpleNamespace(data=[])))
    return supabase, task_chain, evidence_doc_chain, evidence_blocks_chain


def test_default_xp_is_50():
    from services.interest_tracks_service import InterestTracksService

    supabase, task_chain, _, _ = _build_supabase(junction_quest_ids=[QUEST_A])

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=supabase):
        result = InterestTracksService.convert_moment_to_task(
            user_id=USER_ID,
            moment_id=MOMENT_ID,
        )

    assert result['success'] is True
    inserted = task_chain.insert.call_args.args[0]
    assert inserted['xp_value'] == 50
    assert inserted['source_moment_id'] == MOMENT_ID
    assert inserted['approval_status'] == 'pending'
    assert inserted['quest_id'] == QUEST_A


def test_task_description_is_empty_moment_text_becomes_evidence():
    """The moment's text shouldn't be stuffed into task.description; it
    should land as the first text block of the new evidence document."""
    from services.interest_tracks_service import InterestTracksService

    supabase, task_chain, evidence_doc_chain, evidence_blocks_chain = _build_supabase(
        junction_quest_ids=[QUEST_A],
        moment_description='I figured out how octopi camouflage themselves',
    )

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=supabase):
        result = InterestTracksService.convert_moment_to_task(
            user_id=USER_ID,
            moment_id=MOMENT_ID,
        )

    assert result['success'] is True
    task_payload = task_chain.insert.call_args.args[0]
    assert task_payload['description'] == ''

    evidence_doc_chain.insert.assert_called_once()
    blocks_payload = evidence_blocks_chain.insert.call_args.args[0]
    assert isinstance(blocks_payload, list)
    assert blocks_payload[0]['block_type'] == 'text'
    assert blocks_payload[0]['content']['text'] == 'I figured out how octopi camouflage themselves'
    assert blocks_payload[0]['order_index'] == 0


def test_existing_evidence_blocks_carry_over_after_text_block():
    """A moment with attached media should produce a text block first,
    then each attached block in original order."""
    from services.interest_tracks_service import InterestTracksService

    image_block = {
        'block_type': 'image',
        'content': {'caption': 'A photo'},
        'file_url': 'https://example.com/foo.jpg',
        'file_name': 'foo.jpg',
        'file_size': 12345,
    }
    link_block = {
        'block_type': 'link',
        'content': {'url': 'https://example.com', 'title': 'Example'},
    }
    supabase, _, evidence_doc_chain, evidence_blocks_chain = _build_supabase(
        junction_quest_ids=[QUEST_A],
        moment_description='Reflection text',
        evidence_blocks=[image_block, link_block],
    )

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=supabase):
        result = InterestTracksService.convert_moment_to_task(
            user_id=USER_ID,
            moment_id=MOMENT_ID,
        )

    assert result['success'] is True
    evidence_doc_chain.insert.assert_called_once()
    blocks_payload = evidence_blocks_chain.insert.call_args.args[0]
    assert [b['block_type'] for b in blocks_payload] == ['text', 'image', 'link']
    assert [b['order_index'] for b in blocks_payload] == [0, 1, 2]
    # Image block keeps its file_url and merges it into the content payload.
    assert blocks_payload[1]['content']['url'] == 'https://example.com/foo.jpg'
    assert blocks_payload[1]['content']['filename'] == 'foo.jpg'


def test_no_description_no_blocks_skips_evidence_document():
    """A moment with no text and no media shouldn't create an empty
    evidence document — the task is simply created with no evidence."""
    from services.interest_tracks_service import InterestTracksService

    supabase, _, evidence_doc_chain, _ = _build_supabase(
        junction_quest_ids=[QUEST_A],
        moment_description='',
        evidence_blocks=[],
    )

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=supabase):
        result = InterestTracksService.convert_moment_to_task(
            user_id=USER_ID,
            moment_id=MOMENT_ID,
        )

    assert result['success'] is True
    evidence_doc_chain.insert.assert_not_called()


def test_default_xp_constant_is_50():
    from services.interest_tracks_service import InterestTracksService
    assert InterestTracksService.DEFAULT_PROMOTED_TASK_XP == 50


def test_succeeds_with_single_implicit_quest():
    from services.interest_tracks_service import InterestTracksService

    supabase, task_chain, _, _ = _build_supabase(junction_quest_ids=[QUEST_A])

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=supabase):
        result = InterestTracksService.convert_moment_to_task(
            user_id=USER_ID,
            moment_id=MOMENT_ID,
            xp_value=75,
        )

    assert result['success'] is True
    assert task_chain.insert.call_args.args[0]['quest_id'] == QUEST_A


def test_fails_with_zero_quests():
    from services.interest_tracks_service import InterestTracksService

    supabase, task_chain, _, _ = _build_supabase(junction_quest_ids=[])

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=supabase):
        result = InterestTracksService.convert_moment_to_task(
            user_id=USER_ID,
            moment_id=MOMENT_ID,
        )

    assert result['success'] is False
    assert 'not assigned to a quest' in result['error']
    task_chain.insert.assert_not_called()


def test_fails_when_multiple_quests_no_explicit_quest_id():
    from services.interest_tracks_service import InterestTracksService

    supabase, task_chain, _, _ = _build_supabase(junction_quest_ids=[QUEST_A, QUEST_B])

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=supabase):
        result = InterestTracksService.convert_moment_to_task(
            user_id=USER_ID,
            moment_id=MOMENT_ID,
        )

    assert result['success'] is False
    assert 'specify quest_id' in result['error']
    task_chain.insert.assert_not_called()


def test_succeeds_when_multiple_quests_with_explicit_quest_id():
    from services.interest_tracks_service import InterestTracksService

    supabase, task_chain, _, _ = _build_supabase(junction_quest_ids=[QUEST_A, QUEST_B])

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=supabase):
        result = InterestTracksService.convert_moment_to_task(
            user_id=USER_ID,
            moment_id=MOMENT_ID,
            quest_id=QUEST_B,
        )

    assert result['success'] is True
    assert task_chain.insert.call_args.args[0]['quest_id'] == QUEST_B


def test_explicit_quest_id_must_match_assignment():
    """If the caller insists on a quest the moment isn't actually
    attached to, we must refuse — preventing an XP path that bypasses
    the topic-assignment rule."""
    from services.interest_tracks_service import InterestTracksService

    bogus_quest = '99999999-9999-9999-9999-999999999999'
    supabase, task_chain, _, _ = _build_supabase(junction_quest_ids=[QUEST_A])

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=supabase):
        result = InterestTracksService.convert_moment_to_task(
            user_id=USER_ID,
            moment_id=MOMENT_ID,
            quest_id=bogus_quest,
        )

    assert result['success'] is False
    assert 'not assigned to that quest' in result['error']
    task_chain.insert.assert_not_called()


def test_fails_when_not_enrolled():
    from services.interest_tracks_service import InterestTracksService

    supabase, task_chain, _, _ = _build_supabase(
        junction_quest_ids=[QUEST_A],
        enrollment_found=False,
    )

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=supabase):
        result = InterestTracksService.convert_moment_to_task(
            user_id=USER_ID,
            moment_id=MOMENT_ID,
        )

    assert result['success'] is False
    assert 'Not enrolled' in result['error']
    task_chain.insert.assert_not_called()
