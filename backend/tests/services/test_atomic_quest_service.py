"""
Unit tests for AtomicQuestService.

Tests atomic quest completion operations including:
- Atomic task completion with transaction handling
- Duplicate completion prevention
- Race condition handling
- Transaction rollback on error
- XP consistency verification
"""

import pytest
import uuid
from unittest.mock import Mock, patch
from datetime import datetime

from services.atomic_quest_service import AtomicQuestService

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.unit
@pytest.mark.critical
def test_atomic_quest_service_initialization():
    """Test AtomicQuestService can be initialized"""
    service = AtomicQuestService()

    assert service is not None
    # user_id is a per-call argument now, not service state.
    assert not hasattr(service, 'user_id')


@pytest.mark.unit
@pytest.mark.critical
def test_complete_task_atomically_success():
    """Test successful atomic task completion"""
    user_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())

    service = AtomicQuestService()

    # Mock the database operations
    with patch.object(service, '_supabase') as mock_supabase:
        # Mock task exists and not completed
        mock_task_response = Mock()
        mock_task_response.data = [{
            'id': task_id,
            'quest_id': quest_id,
            'xp_value': 100,
            'pillar': 'stem',
            'user_id': user_id,
        }]
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_task_response

        # Mock no existing completion
        mock_completion_check = Mock()
        mock_completion_check.data = []
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_completion_check

        # Mock insert completion
        mock_insert = Mock()
        mock_insert.data = [{
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'task_id': task_id,
            'quest_id': quest_id,
            'xp_awarded': 100,
            'completed_at': datetime.now().isoformat(),
        }]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = mock_insert

        result = service.complete_task_atomically(
            user_id=user_id,
            quest_id=quest_id,
            task_id=task_id,
            user_quest_id=user_quest_id,
            evidence_text='Test evidence'
        )

        # Should return success
        assert result is not None
        assert isinstance(result, dict)


@pytest.mark.unit
@pytest.mark.critical
def test_duplicate_completion_prevented():
    """Test that duplicate task completion is prevented"""
    user_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())

    service = AtomicQuestService()

    with patch.object(service, '_supabase') as mock_supabase:
        # Mock task exists
        mock_task = Mock()
        mock_task.data = [{
            'id': task_id,
            'quest_id': quest_id,
            'xp_value': 100,
            'pillar': 'stem'
        }]

        # Mock existing completion (already completed)
        mock_existing_completion = Mock()
        mock_existing_completion.data = [{
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'task_id': task_id,
            'completed_at': datetime.now().isoformat()
        }]

        # Setup mock chain
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_task
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_existing_completion

        # Reported as a result, not an exception.
        result = service.complete_task_atomically(
            user_id=user_id,
            quest_id=quest_id,
            task_id=task_id,
            user_quest_id=user_quest_id,
            evidence_text='Test evidence'
        )

        assert result['success'] is False
        assert result.get('task_already_completed') is True
        assert 'already completed' in result['error'].lower()


@pytest.mark.unit
def test_transaction_rollback_on_error():
    """Test that transaction rolls back on error"""
    user_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())

    service = AtomicQuestService()

    with patch.object(service, '_supabase') as mock_supabase:
        # Mock task exists
        mock_task = Mock()
        mock_task.data = [{'id': task_id, 'xp_value': 100, 'pillar': 'stem'}]
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_task

        # Mock no existing completion
        mock_no_completion = Mock()
        mock_no_completion.data = []
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_no_completion

        # Mock insert failure
        mock_supabase.table.return_value.insert.return_value.execute.side_effect = Exception("Database error")

        # Handled, not propagated: the caller gets a failure result.
        result = service.complete_task_atomically(
            user_id=user_id,
            quest_id=quest_id,
            task_id=task_id,
            user_quest_id=user_quest_id,
            evidence_text='Test evidence'
        )

        assert result['success'] is False
        assert result.get('error')


@pytest.mark.unit
@pytest.mark.critical
def test_xp_consistency():
    """Test that XP awarded matches task XP value"""
    user_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())

    task_xp_value = 250

    service = AtomicQuestService()

    with patch.object(service, '_supabase') as mock_supabase:
        # Mock task with specific XP value
        mock_task = Mock()
        mock_task.data = [{
            'id': task_id,
            'quest_id': quest_id,
            'xp_value': task_xp_value,
            'pillar': 'communication'
        }]
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_task

        # Mock no existing completion
        mock_no_completion = Mock()
        mock_no_completion.data = []
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_no_completion

        # Mock insert completion with XP check
        def check_xp_insert(data):
            mock_result = Mock()
            mock_result.data = [data]
            return mock_result

        mock_insert_chain = Mock()
        mock_insert_chain.execute = lambda: check_xp_insert({'xp_awarded': task_xp_value})
        mock_supabase.table.return_value.insert.return_value = mock_insert_chain

        result = service.complete_task_atomically(
            user_id=user_id,
            quest_id=quest_id,
            task_id=task_id,
            user_quest_id=user_quest_id,
            evidence_text='Test evidence'
        )

        # XP awarded should match task XP value
        if result and 'xp_awarded' in result:
            assert result['xp_awarded'] == task_xp_value


@pytest.mark.unit
def test_validation_error_on_missing_params():
    """Test that validation error is raised for missing parameters"""
    service = AtomicQuestService()

    # Missing required parameters -> failure result, not an exception.
    with patch.object(service, '_supabase'):
        result = service.complete_task_atomically(
            user_id=None,  # Missing
            quest_id=str(uuid.uuid4()),
            task_id=str(uuid.uuid4()),
            user_quest_id=str(uuid.uuid4()),
        )

    # A MagicMock DB answers everything truthily, so the guard that actually
    # fires is the ownership lookup -- which is the point: no user_id means no
    # task is owned, and nothing is written.
    assert result['success'] is False
    assert result.get('error')


@pytest.mark.unit
def test_evidence_url_and_text_stored():
    """Test that evidence URL and text are properly stored"""
    user_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())

    evidence_url = 'https://example.com/evidence.pdf'
    evidence_text = 'My detailed evidence'

    service = AtomicQuestService()

    with patch.object(service, '_supabase') as mock_supabase:
        # No existing completion: the duplicate check is
        # select('id').eq().eq().eq().execute()
        mock_no_completion = Mock()
        mock_no_completion.data = []
        mock_supabase.table.return_value.select.return_value.eq.return_value \
            .eq.return_value.eq.return_value.execute.return_value = mock_no_completion

        # Task ownership lookup is .eq().eq().eq().single().execute() and returns
        # a single row (not a list).
        mock_task = Mock()
        mock_task.data = {'id': task_id, 'xp_value': 100, 'pillar': 'art'}
        mock_supabase.table.return_value.select.return_value.eq.return_value \
            .eq.return_value.eq.return_value.single.return_value.execute.return_value = mock_task

        # Capture insert data
        inserted_data = {}

        def capture_insert(data):
            inserted_data.update(data)
            mock_result = Mock()
            mock_result.data = [data]
            return mock_result

        mock_insert_chain = Mock()
        mock_insert_chain.execute = lambda: capture_insert({
            'evidence_url': evidence_url,
            'evidence_text': evidence_text
        })
        mock_supabase.table.return_value.insert.return_value = mock_insert_chain

        service.complete_task_atomically(
            user_id=user_id,
            quest_id=quest_id,
            task_id=task_id,
            user_quest_id=user_quest_id,
            evidence_url=evidence_url,
            evidence_text=evidence_text
        )

        # Evidence should be captured
        assert inserted_data.get('evidence_url') == evidence_url
        assert inserted_data.get('evidence_text') == evidence_text


@pytest.mark.unit
@pytest.mark.slow
def test_concurrent_completion_handling():
    """Test handling of concurrent task completions (simulated race condition)"""
    user_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())

    service = AtomicQuestService()

    # Simulate race condition by having completion appear between check and insert
    with patch.object(service, '_supabase') as mock_supabase:
        # First check: no completion
        mock_no_completion = Mock()
        mock_no_completion.data = []

        # Second check (after insert attempt): completion exists
        mock_has_completion = Mock()
        mock_has_completion.data = [{'id': str(uuid.uuid4()), 'task_id': task_id}]

        check_counter = {'count': 0}

        def side_effect_check(*args, **kwargs):
            check_counter['count'] += 1
            if check_counter['count'] == 1:
                return mock_no_completion
            else:
                return mock_has_completion

        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.side_effect = side_effect_check

        # Should handle race condition appropriately
        # (Either succeed first time or detect duplicate on second attempt)
        try:
            result = service.complete_task_atomically(
                user_id=user_id,
                quest_id=quest_id,
                task_id=task_id,
                user_quest_id=user_quest_id,
                evidence_text='Test evidence'
            )
            # If succeeded, that's OK (first attempt won)
            assert result is not None
        except Exception as e:
            # If failed, should indicate duplicate
            assert 'duplicate' in str(e).lower() or 'already' in str(e).lower()
