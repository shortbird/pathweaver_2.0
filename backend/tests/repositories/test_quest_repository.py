"""
Unit tests for QuestRepository.

Tests quest database operations, filtering, user enrollment, and organization policies.
"""

import pytest
import uuid
from unittest.mock import Mock, patch
from datetime import datetime

from repositories.quest_repository import QuestRepository
from repositories.base_repository import NotFoundError, DatabaseError

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.unit
class TestQuestRepository:
    """Tests for QuestRepository class."""

    def test_initialization(self):
        """Test QuestRepository can be initialized"""
        repo = QuestRepository()
        assert repo is not None
        assert repo.table_name == 'quests'

    def test_get_active_quests(self):
        """Test getting all active quests"""
        repo = QuestRepository()

        with patch.object(repo, 'find_all') as mock_find_all:
            mock_find_all.return_value = [
                {'id': str(uuid.uuid4()), 'title': 'Quest 1', 'is_active': True},
                {'id': str(uuid.uuid4()), 'title': 'Quest 2', 'is_active': True},
            ]

            quests = repo.get_active_quests()

            assert len(quests) == 2
            mock_find_all.assert_called_once()

    def test_get_active_quests_with_source_filter(self):
        """Test getting active quests filtered by source"""
        repo = QuestRepository()

        with patch.object(repo, 'find_all') as mock_find_all:
            mock_find_all.return_value = [
                {'id': str(uuid.uuid4()), 'title': 'Optio Quest', 'source': 'optio'},
            ]

            quests = repo.get_active_quests(source='optio')

            assert len(quests) == 1
            assert quests[0]['source'] == 'optio'

    def test_get_quest_with_tasks(self):
        """Test getting quest with associated tasks"""
        repo = QuestRepository()
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = [{
                'id': quest_id,
                'title': 'Test Quest',
                'quest_tasks': [
                    {'id': str(uuid.uuid4()), 'title': 'Task 2', 'order_index': 2},
                    {'id': str(uuid.uuid4()), 'title': 'Task 1', 'order_index': 1},
                    {'id': str(uuid.uuid4()), 'title': 'Task 3', 'order_index': 3},
                ]
            }]
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

            quest = repo.get_quest_with_tasks(quest_id)

            assert quest is not None
            assert quest['id'] == quest_id
            # Verify tasks are sorted by order_index
            assert quest['quest_tasks'][0]['order_index'] == 1
            assert quest['quest_tasks'][1]['order_index'] == 2
            assert quest['quest_tasks'][2]['order_index'] == 3

    def test_get_quest_with_tasks_not_found(self):
        """Test getting non-existent quest raises NotFoundError"""
        repo = QuestRepository()
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = []
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

            with pytest.raises(NotFoundError):
                repo.get_quest_with_tasks(quest_id)

    def test_get_user_quest_progress(self):
        """Test getting user's progress on a quest"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())
        task1_id = str(uuid.uuid4())
        task2_id = str(uuid.uuid4())
        task3_id = str(uuid.uuid4())

        with patch.object(repo, 'get_quest_with_tasks') as mock_get_quest:
            mock_get_quest.return_value = {
                'id': quest_id,
                'title': 'Test Quest',
                'quest_tasks': [
                    {'id': task1_id, 'title': 'Task 1'},
                    {'id': task2_id, 'title': 'Task 2'},
                    {'id': task3_id, 'title': 'Task 3'},
                ]
            }

            with patch.object(repo, 'client') as mock_client:
                # Mock completions (only task1 and task2 completed)
                mock_completions = Mock()
                mock_completions.data = [
                    {'task_id': task1_id, 'user_id': user_id, 'quest_id': quest_id},
                    {'task_id': task2_id, 'user_id': user_id, 'quest_id': quest_id},
                ]
                mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_completions

                quest = repo.get_user_quest_progress(user_id, quest_id)

                assert quest is not None
                assert 'progress' in quest
                assert quest['progress']['total_tasks'] == 3
                assert quest['progress']['completed_tasks'] == 2
                assert quest['progress']['percentage'] == pytest.approx(66.67, abs=0.1)
                assert quest['progress']['is_complete'] is False

                # Check individual task completion status
                assert quest['quest_tasks'][0]['completed'] is True  # task1
                assert quest['quest_tasks'][1]['completed'] is True  # task2
                assert quest['quest_tasks'][2]['completed'] is False  # task3

    def test_get_user_quest_progress_complete(self):
        """Test progress calculation when all tasks are completed"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())
        task1_id = str(uuid.uuid4())
        task2_id = str(uuid.uuid4())

        with patch.object(repo, 'get_quest_with_tasks') as mock_get_quest:
            mock_get_quest.return_value = {
                'id': quest_id,
                'quest_tasks': [
                    {'id': task1_id, 'title': 'Task 1'},
                    {'id': task2_id, 'title': 'Task 2'},
                ]
            }

            with patch.object(repo, 'client') as mock_client:
                mock_completions = Mock()
                mock_completions.data = [
                    {'task_id': task1_id},
                    {'task_id': task2_id},
                ]
                mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_completions

                quest = repo.get_user_quest_progress(user_id, quest_id)

                assert quest['progress']['percentage'] == 100.0
                assert quest['progress']['is_complete'] is True

    def test_get_user_active_quests(self):
        """Test getting all active quests for a user"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = [
                {
                    'quest_id': str(uuid.uuid4()),
                    'quests': {'id': str(uuid.uuid4()), 'title': 'Quest 1'}
                },
                {
                    'quest_id': str(uuid.uuid4()),
                    'quests': {'id': str(uuid.uuid4()), 'title': 'Quest 2'}
                },
            ]
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = mock_response

            quests = repo.get_user_active_quests(user_id)

            assert len(quests) == 2
            assert quests[0]['title'] == 'Quest 1'
            assert quests[1]['title'] == 'Quest 2'

    def test_enroll_user_new_enrollment(self):
        """Test enrolling a user in a quest (new enrollment)"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch('backend.database.get_supabase_admin_client') as mock_get_admin:
            mock_admin = Mock()

            # Mock no existing enrollment
            mock_existing = Mock()
            mock_existing.data = []
            mock_admin.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_existing

            # Mock successful insert
            mock_insert = Mock()
            mock_insert.data = [{
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'quest_id': quest_id,
                'is_active': True,
                'last_picked_up_at': datetime.utcnow().isoformat()
            }]
            mock_admin.table.return_value.insert.return_value.execute.return_value = mock_insert

            mock_get_admin.return_value = mock_admin

            enrollment = repo.enroll_user(user_id, quest_id)

            assert enrollment is not None
            assert enrollment['user_id'] == user_id
            assert enrollment['quest_id'] == quest_id
            assert enrollment['is_active'] is True

    def test_enroll_user_reactivate_existing(self):
        """Test re-enrolling a user in an abandoned quest"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch('backend.database.get_supabase_admin_client') as mock_get_admin:
            mock_admin = Mock()

            # Mock existing but inactive enrollment
            mock_existing = Mock()
            mock_existing.data = [{
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'quest_id': quest_id,
                'is_active': False,
            }]

            # Mock successful reactivation
            mock_update = Mock()
            mock_update.data = [{
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'quest_id': quest_id,
                'is_active': True,
                'last_picked_up_at': datetime.utcnow().isoformat()
            }]

            mock_admin.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_existing
            mock_admin.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = mock_update

            mock_get_admin.return_value = mock_admin

            enrollment = repo.enroll_user(user_id, quest_id)

            assert enrollment is not None
            assert enrollment['is_active'] is True

    def test_enroll_user_already_active(self):
        """Test enrolling user in quest they're already enrolled in"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch('backend.database.get_supabase_admin_client') as mock_get_admin:
            mock_admin = Mock()

            # Mock existing active enrollment
            existing_enrollment = {
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'quest_id': quest_id,
                'is_active': True,
            }
            mock_existing = Mock()
            mock_existing.data = [existing_enrollment]

            mock_admin.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_existing

            mock_get_admin.return_value = mock_admin

            enrollment = repo.enroll_user(user_id, quest_id)

            # Should return existing enrollment without changes
            assert enrollment == existing_enrollment

    def test_abandon_quest(self):
        """Test abandoning an active quest"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = [{
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'quest_id': quest_id,
                'is_active': False
            }]
            mock_client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = mock_response

            result = repo.abandon_quest(user_id, quest_id)

            assert result is True

    def test_abandon_quest_not_found(self):
        """Test abandoning non-existent enrollment raises NotFoundError"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = []
            mock_client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = mock_response

            with pytest.raises(NotFoundError):
                repo.abandon_quest(user_id, quest_id)

    def test_search_quests(self):
        """Test searching quests by title/description"""
        repo = QuestRepository()
        search_term = 'science'

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = [
                {'id': str(uuid.uuid4()), 'title': 'Science Quest 1', 'is_active': True},
                {'id': str(uuid.uuid4()), 'title': 'Learn Science', 'is_active': True},
            ]
            mock_client.table.return_value.select.return_value.eq.return_value.or_.return_value.limit.return_value.execute.return_value = mock_response

            results = repo.search_quests(search_term)

            assert len(results) == 2

    def test_get_user_enrollments(self):
        """Test getting all enrollments for a user"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = [
                {'id': str(uuid.uuid4()), 'user_id': user_id, 'quest_id': str(uuid.uuid4()), 'is_active': True},
                {'id': str(uuid.uuid4()), 'user_id': user_id, 'quest_id': str(uuid.uuid4()), 'is_active': False},
            ]
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

            enrollments = repo.get_user_enrollments(user_id)

            assert len(enrollments) == 2
            assert all(e['user_id'] == user_id for e in enrollments)

    def test_get_user_enrollments_active_only(self):
        """Test getting only active enrollments for a user"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = [
                {'id': str(uuid.uuid4()), 'user_id': user_id, 'is_active': True},
            ]

            # Mock chained query
            mock_query = Mock()
            mock_query.eq.return_value.eq.return_value.execute.return_value = mock_response
            mock_client.table.return_value.select.return_value = mock_query

            enrollments = repo.get_user_enrollments(user_id, is_active=True)

            assert len(enrollments) == 1
            assert enrollments[0]['is_active'] is True

    def test_get_user_enrollment(self):
        """Test getting a specific user enrollment"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = [{
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'quest_id': quest_id,
                'is_active': True
            }]
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_response

            enrollment = repo.get_user_enrollment(user_id, quest_id)

            assert enrollment is not None
            assert enrollment['user_id'] == user_id
            assert enrollment['quest_id'] == quest_id

    def test_get_user_enrollment_not_found(self):
        """Test getting non-existent enrollment returns None"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = []
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_response

            enrollment = repo.get_user_enrollment(user_id, quest_id)

            assert enrollment is None

    def test_complete_quest(self):
        """Test marking a quest as completed"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = [{
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'quest_id': quest_id,
                'completed_at': datetime.utcnow().isoformat()
            }]
            mock_client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = mock_response

            result = repo.complete_quest(user_id, quest_id)

            assert result is not None
            assert 'completed_at' in result

    def test_complete_quest_not_found(self):
        """Test completing non-existent enrollment raises NotFoundError"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = []
            mock_client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = mock_response

            with pytest.raises(NotFoundError):
                repo.complete_quest(user_id, quest_id)

    def test_get_completed_quests(self):
        """Test getting all completed quests for a user"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = [
                {
                    'quest_id': str(uuid.uuid4()),
                    'completed_at': datetime.utcnow().isoformat(),
                    'quests': {'id': str(uuid.uuid4()), 'title': 'Completed Quest 1'}
                },
                {
                    'quest_id': str(uuid.uuid4()),
                    'completed_at': datetime.utcnow().isoformat(),
                    'quests': {'id': str(uuid.uuid4()), 'title': 'Completed Quest 2'}
                }
            ]
            mock_client.table.return_value.select.return_value.eq.return_value.not_.is_.return_value.order.return_value.limit.return_value.execute.return_value = mock_response

            quests = repo.get_completed_quests(user_id)

            assert len(quests) == 2
            assert all('completed_at' in q for q in quests)
            assert quests[0]['title'] == 'Completed Quest 1'

    def test_get_quests_for_user_no_organization(self):
        """Test getting quests for user without organization (all_optio policy)"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())

        with patch('backend.database.get_supabase_admin_client') as mock_get_admin:
            mock_admin = Mock()

            # Mock user with no organization
            mock_user_rpc = Mock()
            mock_user_rpc.data = [{'organization_id': None}]
            mock_admin.rpc.return_value.execute.return_value = mock_user_rpc

            # Mock quests query
            mock_quests = Mock()
            mock_quests.data = [
                {'id': str(uuid.uuid4()), 'title': 'Global Quest 1', 'organization_id': None}
            ]
            mock_quests.count = 1

            # Setup complex mock chain for query
            mock_query = Mock()
            mock_query.is_.return_value.range.return_value.execute.return_value = mock_quests
            mock_admin.table.return_value.select.return_value.eq.return_value.eq.return_value = mock_query

            mock_get_admin.return_value = mock_admin

            result = repo.get_quests_for_user(user_id)

            assert result is not None
            assert result['total'] == 1
            assert len(result['quests']) == 1

    def test_get_quests_for_user_with_filters(self):
        """Test getting quests with pillar and quest_type filters"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())

        with patch('backend.database.get_supabase_admin_client') as mock_get_admin:
            mock_admin = Mock()

            # Mock user
            mock_user_rpc = Mock()
            mock_user_rpc.data = [{'organization_id': None}]
            mock_admin.rpc.return_value.execute.return_value = mock_user_rpc

            # Mock filtered quests
            mock_quests = Mock()
            mock_quests.data = [
                {'id': str(uuid.uuid4()), 'pillar_primary': 'stem', 'quest_type': 'optio'}
            ]
            mock_quests.count = 1

            # Complex mock chain
            mock_query = Mock()
            mock_query.is_.return_value.eq.return_value.eq.return_value.range.return_value.execute.return_value = mock_quests
            mock_admin.table.return_value.select.return_value.eq.return_value.eq.return_value = mock_query

            mock_get_admin.return_value = mock_admin

            result = repo.get_quests_for_user(
                user_id,
                filters={'pillar': 'stem', 'quest_type': 'optio'}
            )

            assert result is not None
            assert len(result['quests']) == 1
            assert result['quests'][0]['pillar_primary'] == 'stem'


@pytest.mark.unit
class TestQuestRepositoryEdgeCases:
    """Edge case tests for QuestRepository."""

    def test_get_user_quest_progress_no_tasks(self):
        """Test progress calculation for quest with no tasks"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'get_quest_with_tasks') as mock_get_quest:
            mock_get_quest.return_value = {
                'id': quest_id,
                'quest_tasks': []
            }

            with patch.object(repo, 'client') as mock_client:
                mock_completions = Mock()
                mock_completions.data = []
                mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_completions

                quest = repo.get_user_quest_progress(user_id, quest_id)

                assert quest['progress']['total_tasks'] == 0
                assert quest['progress']['completed_tasks'] == 0
                assert quest['progress']['percentage'] == 0
                assert quest['progress']['is_complete'] is False

    def test_enroll_user_database_error(self):
        """Test enrollment handles database errors gracefully"""
        repo = QuestRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch('backend.database.get_supabase_admin_client') as mock_get_admin:
            mock_admin = Mock()

            # Mock database error during check
            from postgrest.exceptions import APIError
            mock_admin.table.return_value.select.side_effect = APIError("Database connection error")

            mock_get_admin.return_value = mock_admin

            with pytest.raises(DatabaseError):
                repo.enroll_user(user_id, quest_id)

    def test_search_quests_empty_results(self):
        """Test searching quests returns empty list when no matches"""
        repo = QuestRepository()

        with patch.object(repo, 'client') as mock_client:
            mock_response = Mock()
            mock_response.data = []
            mock_client.table.return_value.select.return_value.eq.return_value.or_.return_value.limit.return_value.execute.return_value = mock_response

            results = repo.search_quests('nonexistent')

            assert results == []
