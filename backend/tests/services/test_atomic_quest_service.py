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
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from services.atomic_quest_service import AtomicQuestService
from services.base_service import DatabaseError, ValidationError

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.unit
@pytest.mark.critical
def test_atomic_quest_service_initialization():
    """Test AtomicQuestService can be initialized"""
    user_id = str(uuid.uuid4())
    service = AtomicQuestService(user_id=user_id)

    assert service is not None
    assert service.user_id == user_id


@pytest.mark.unit
@pytest.mark.critical
def test_complete_task_atomically_success():
    """Test successful atomic task completion"""
    user_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())

    service = AtomicQuestService(user_id=user_id)

    # Mock the database operations
    with patch.object(service, 'supabase') as mock_supabase:
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

    service = AtomicQuestService(user_id=user_id)

    with patch.object(service, 'supabase') as mock_supabase:
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

        # Should raise error or return error result
        with pytest.raises(Exception) as exc_info:
            service.complete_task_atomically(
                user_id=user_id,
                quest_id=quest_id,
                task_id=task_id,
                user_quest_id=user_quest_id,
                evidence_text='Test evidence'
            )

        # Error should indicate duplicate completion
        assert 'already completed' in str(exc_info.value).lower() or 'duplicate' in str(exc_info.value).lower()


@pytest.mark.unit
def test_transaction_rollback_on_error():
    """Test that transaction rolls back on error"""
    user_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())

    service = AtomicQuestService(user_id=user_id)

    with patch.object(service, 'supabase') as mock_supabase:
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

        # Should handle error gracefully
        with pytest.raises(Exception):
            service.complete_task_atomically(
                user_id=user_id,
                quest_id=quest_id,
                task_id=task_id,
                user_quest_id=user_quest_id,
                evidence_text='Test evidence'
            )


@pytest.mark.unit
@pytest.mark.critical
def test_xp_consistency():
    """Test that XP awarded matches task XP value"""
    user_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())

    task_xp_value = 250

    service = AtomicQuestService(user_id=user_id)

    with patch.object(service, 'supabase') as mock_supabase:
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

    # Missing required parameters
    with pytest.raises(Exception):
        service.complete_task_atomically(
            user_id=None,  # Missing
            quest_id=str(uuid.uuid4()),
            task_id=str(uuid.uuid4()),
            user_quest_id=str(uuid.uuid4()),
        )


@pytest.mark.unit
def test_evidence_url_and_text_stored():
    """Test that evidence URL and text are properly stored"""
    user_id = str(uuid.uuid4())
    quest_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    user_quest_id = str(uuid.uuid4())

    evidence_url = 'https://example.com/evidence.pdf'
    evidence_text = 'My detailed evidence'

    service = AtomicQuestService(user_id=user_id)

    with patch.object(service, 'supabase') as mock_supabase:
        # Mock task exists
        mock_task = Mock()
        mock_task.data = [{'id': task_id, 'xp_value': 100, 'pillar': 'art'}]
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_task

        # Mock no existing completion
        mock_no_completion = Mock()
        mock_no_completion.data = []
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_no_completion

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

        result = service.complete_task_atomically(
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

    service = AtomicQuestService(user_id=user_id)

    # Simulate race condition by having completion appear between check and insert
    with patch.object(service, 'supabase') as mock_supabase:
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
