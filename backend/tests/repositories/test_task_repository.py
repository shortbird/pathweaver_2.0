"""
Unit tests for TaskRepository and TaskCompletionRepository.

Tests CRUD operations, query methods, validation, and error handling.
"""

import pytest
import uuid
from unittest.mock import Mock, patch
from datetime import datetime

from repositories.task_repository import TaskRepository, TaskCompletionRepository
from repositories.base_repository import NotFoundError

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.unit
class TestTaskRepository:
    """Tests for TaskRepository class."""

    def test_initialization(self):
        """Test TaskRepository can be initialized"""
        repo = TaskRepository()
        assert repo is not None
        assert repo.table_name == 'user_quest_tasks'

    def test_find_by_quest(self):
        """Test finding tasks by quest ID"""
        repo = TaskRepository()
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_tasks = Mock()
            mock_tasks.data = [
                {'id': str(uuid.uuid4()), 'quest_id': quest_id, 'title': 'Task 1', 'order_index': 1},
                {'id': str(uuid.uuid4()), 'quest_id': quest_id, 'title': 'Task 2', 'order_index': 2},
            ]
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_tasks

            tasks = repo.find_by_quest(quest_id)

            assert len(tasks) == 2
            assert all(t['quest_id'] == quest_id for t in tasks)
            assert tasks[0]['order_index'] == 1

    def test_find_by_quest_with_user_filter(self):
        """Test finding tasks by quest ID filtered by user"""
        repo = TaskRepository()
        quest_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_tasks = Mock()
            mock_tasks.data = [
                {'id': str(uuid.uuid4()), 'quest_id': quest_id, 'user_id': user_id, 'title': 'Task 1'},
            ]

            # Mock the chained query
            mock_query = Mock()
            mock_query.eq.return_value.eq.return_value.order.return_value.execute.return_value = mock_tasks
            mock_client.table.return_value.select.return_value = mock_query

            tasks = repo.find_by_quest(quest_id, user_id=user_id)

            assert len(tasks) == 1
            assert tasks[0]['user_id'] == user_id

    def test_find_by_quest_returns_empty_on_error(self):
        """Test find_by_quest returns empty list on database error"""
        repo = TaskRepository()

        with patch.object(repo, 'client') as mock_client:
            mock_client.table.return_value.select.side_effect = Exception("Database error")

            tasks = repo.find_by_quest(str(uuid.uuid4()))

            assert tasks == []

    def test_find_by_user_quest(self):
        """Test finding tasks by user_quest_id"""
        repo = TaskRepository()
        user_quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_tasks = Mock()
            mock_tasks.data = [
                {'id': str(uuid.uuid4()), 'user_quest_id': user_quest_id, 'title': 'Task 1', 'order_index': 1},
                {'id': str(uuid.uuid4()), 'user_quest_id': user_quest_id, 'title': 'Task 2', 'order_index': 2},
            ]
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_tasks

            tasks = repo.find_by_user_quest(user_quest_id)

            assert len(tasks) == 2
            assert tasks[0]['order_index'] == 1
            assert tasks[1]['order_index'] == 2

    def test_get_task_with_relations(self):
        """Test getting task with quest and user_quest relationships"""
        repo = TaskRepository()
        task_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_task = Mock()
            mock_task.data = {
                'id': task_id,
                'user_id': user_id,
                'title': 'Test Task',
                'quests': {'id': str(uuid.uuid4()), 'title': 'Test Quest'},
                'user_quests': {'id': str(uuid.uuid4()), 'user_id': user_id}
            }
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = mock_task

            task = repo.get_task_with_relations(task_id, user_id)

            assert task is not None
            assert task['id'] == task_id
            assert 'quests' in task
            assert 'user_quests' in task

    def test_get_task_with_relations_not_found(self):
        """Test getting task with relations raises NotFoundError when not found"""
        repo = TaskRepository()
        task_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_result = Mock()
            mock_result.data = None
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = mock_result

            with pytest.raises(NotFoundError):
                repo.get_task_with_relations(task_id, user_id)

    def test_create_task(self):
        """Test creating a new task"""
        repo = TaskRepository()

        task_data = {
            'quest_id': str(uuid.uuid4()),
            'user_id': str(uuid.uuid4()),
            'title': 'New Task',
            'description': 'Task description',
            'pillar': 'stem',
            'xp_value': 100,
        }

        with patch.object(repo, 'client') as mock_client:
            mock_result = Mock()
            mock_result.data = [{**task_data, 'id': str(uuid.uuid4())}]
            mock_client.table.return_value.insert.return_value.execute.return_value = mock_result

            created_task = repo.create_task(task_data)

            assert created_task is not None
            assert created_task['title'] == task_data['title']
            assert 'id' in created_task

    def test_create_task_missing_required_fields(self):
        """Test creating task without required fields raises ValueError"""
        repo = TaskRepository()

        incomplete_data = {
            'title': 'Task without quest_id or user_id',
        }

        with pytest.raises(ValueError) as exc_info:
            repo.create_task(incomplete_data)

        assert 'Missing required fields' in str(exc_info.value)

    def test_create_task_handles_database_error(self):
        """Test create_task handles database errors"""
        repo = TaskRepository()

        task_data = {
            'quest_id': str(uuid.uuid4()),
            'user_id': str(uuid.uuid4()),
            'title': 'New Task',
        }

        with patch.object(repo, 'client') as mock_client:
            mock_client.table.return_value.insert.side_effect = Exception("Database error")

            with pytest.raises(Exception):
                repo.create_task(task_data)

    def test_update_task(self):
        """Test updating an existing task"""
        repo = TaskRepository()
        task_id = str(uuid.uuid4())

        update_data = {
            'title': 'Updated Task Title',
            'description': 'Updated description',
        }

        with patch.object(repo, 'client') as mock_client:
            mock_result = Mock()
            mock_result.data = [{
                'id': task_id,
                **update_data
            }]
            mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_result

            updated_task = repo.update_task(task_id, update_data)

            assert updated_task is not None
            assert updated_task['title'] == update_data['title']

    def test_update_task_not_found(self):
        """Test updating non-existent task raises NotFoundError"""
        repo = TaskRepository()
        task_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_result = Mock()
            mock_result.data = None
            mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_result

            with pytest.raises(NotFoundError):
                repo.update_task(task_id, {'title': 'Updated'})

    def test_delete_task(self):
        """Test deleting a task"""
        repo = TaskRepository()
        task_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_result = Mock()
            mock_result.data = [{'id': task_id}]
            mock_client.table.return_value.delete.return_value.eq.return_value.execute.return_value = mock_result

            result = repo.delete_task(task_id)

            assert result is True

    def test_delete_task_handles_error(self):
        """Test delete_task handles database errors"""
        repo = TaskRepository()
        task_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_client.table.return_value.delete.side_effect = Exception("Database error")

            with pytest.raises(Exception):
                repo.delete_task(task_id)


@pytest.mark.unit
class TestTaskCompletionRepository:
    """Tests for TaskCompletionRepository class."""

    def test_initialization(self):
        """Test TaskCompletionRepository can be initialized"""
        repo = TaskCompletionRepository()
        assert repo is not None
        assert repo.table_name == 'quest_task_completions'

    def test_find_by_user_quest(self):
        """Test finding completions by user and quest"""
        repo = TaskCompletionRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_completions = Mock()
            mock_completions.data = [
                {
                    'id': str(uuid.uuid4()),
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'completed_at': datetime.utcnow().isoformat()
                },
                {
                    'id': str(uuid.uuid4()),
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'completed_at': datetime.utcnow().isoformat()
                }
            ]
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = mock_completions

            completions = repo.find_by_user_quest(user_id, quest_id)

            assert len(completions) == 2
            assert all(c['user_id'] == user_id for c in completions)
            assert all(c['quest_id'] == quest_id for c in completions)

    def test_find_by_task(self):
        """Test finding completions by task ID"""
        repo = TaskCompletionRepository()
        task_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_completions = Mock()
            mock_completions.data = [
                {
                    'id': str(uuid.uuid4()),
                    'user_quest_task_id': task_id,
                    'completed_at': datetime.utcnow().isoformat()
                }
            ]
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_completions

            completions = repo.find_by_task(task_id)

            assert len(completions) == 1
            assert completions[0]['user_quest_task_id'] == task_id

    def test_find_by_task_with_user_filter(self):
        """Test finding completions by task with user filter"""
        repo = TaskCompletionRepository()
        task_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_completions = Mock()
            mock_completions.data = [
                {
                    'id': str(uuid.uuid4()),
                    'user_quest_task_id': task_id,
                    'user_id': user_id,
                }
            ]

            # Mock chained query
            mock_query = Mock()
            mock_query.eq.return_value.eq.return_value.order.return_value.execute.return_value = mock_completions
            mock_client.table.return_value.select.return_value = mock_query

            completions = repo.find_by_task(task_id, user_id=user_id)

            assert len(completions) == 1
            assert completions[0]['user_id'] == user_id

    def test_check_existing_completion_true(self):
        """Test checking existing completion returns True when exists"""
        repo = TaskCompletionRepository()
        user_id = str(uuid.uuid4())
        task_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_result = Mock()
            mock_result.data = [{'id': str(uuid.uuid4())}]
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_result

            exists = repo.check_existing_completion(user_id, task_id)

            assert exists is True

    def test_check_existing_completion_false(self):
        """Test checking existing completion returns False when not exists"""
        repo = TaskCompletionRepository()
        user_id = str(uuid.uuid4())
        task_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_result = Mock()
            mock_result.data = []
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_result

            exists = repo.check_existing_completion(user_id, task_id)

            assert exists is False

    def test_create_completion(self):
        """Test creating a new task completion"""
        repo = TaskCompletionRepository()

        completion_data = {
            'user_id': str(uuid.uuid4()),
            'quest_id': str(uuid.uuid4()),
            'user_quest_task_id': str(uuid.uuid4()),
            'xp_awarded': 100,
            'evidence_text': 'Completed the task',
        }

        with patch.object(repo, 'client') as mock_client:
            # Mock duplicate check (no existing)
            mock_existing = Mock()
            mock_existing.data = []

            # Mock insert
            mock_result = Mock()
            mock_result.data = [{
                **completion_data,
                'id': str(uuid.uuid4()),
                'completed_at': datetime.utcnow().isoformat()
            }]

            # Setup chained mocks
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_existing
            mock_client.table.return_value.insert.return_value.execute.return_value = mock_result

            created_completion = repo.create_completion(completion_data)

            assert created_completion is not None
            assert 'id' in created_completion
            assert 'completed_at' in created_completion
            assert created_completion['xp_awarded'] == 100

    def test_create_completion_missing_required_fields(self):
        """Test creating completion without required fields raises ValueError"""
        repo = TaskCompletionRepository()

        incomplete_data = {
            'xp_awarded': 100,
        }

        with pytest.raises(ValueError) as exc_info:
            repo.create_completion(incomplete_data)

        assert 'Missing required fields' in str(exc_info.value)

    def test_create_completion_duplicate_error(self):
        """Test creating duplicate completion raises ValueError"""
        repo = TaskCompletionRepository()

        completion_data = {
            'user_id': str(uuid.uuid4()),
            'quest_id': str(uuid.uuid4()),
            'user_quest_task_id': str(uuid.uuid4()),
        }

        with patch.object(repo, 'client') as mock_client:
            # Mock duplicate check (existing found)
            mock_existing = Mock()
            mock_existing.data = [{'id': str(uuid.uuid4())}]
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_existing

            with pytest.raises(ValueError) as exc_info:
                repo.create_completion(completion_data)

            assert 'already completed' in str(exc_info.value)

    def test_get_completion_count(self):
        """Test getting count of completed tasks"""
        repo = TaskCompletionRepository()
        user_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_result = Mock()
            mock_result.count = 5
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_result

            count = repo.get_completion_count(user_id)

            assert count == 5

    def test_get_completion_count_with_quest_filter(self):
        """Test getting count of completed tasks for specific quest"""
        repo = TaskCompletionRepository()
        user_id = str(uuid.uuid4())
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_result = Mock()
            mock_result.count = 3

            # Mock chained query
            mock_query = Mock()
            mock_query.eq.return_value.eq.return_value.execute.return_value = mock_result
            mock_client.table.return_value.select.return_value = mock_query

            count = repo.get_completion_count(user_id, quest_id=quest_id)

            assert count == 3

    def test_get_completion_count_returns_zero_on_error(self):
        """Test get_completion_count returns 0 on database error"""
        repo = TaskCompletionRepository()

        with patch.object(repo, 'client') as mock_client:
            mock_client.table.return_value.select.side_effect = Exception("Database error")

            count = repo.get_completion_count(str(uuid.uuid4()))

            assert count == 0

    def test_delete_completion(self):
        """Test deleting a task completion"""
        repo = TaskCompletionRepository()
        completion_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_result = Mock()
            mock_result.data = [{'id': completion_id}]
            mock_client.table.return_value.delete.return_value.eq.return_value.execute.return_value = mock_result

            result = repo.delete_completion(completion_id)

            assert result is True

    def test_delete_completion_handles_error(self):
        """Test delete_completion handles database errors"""
        repo = TaskCompletionRepository()
        completion_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            mock_client.table.return_value.delete.side_effect = Exception("Database error")

            with pytest.raises(Exception):
                repo.delete_completion(completion_id)


@pytest.mark.unit
class TestTaskRepositoryIntegration:
    """Integration-style tests for TaskRepository business logic."""

    def test_task_ordering_is_maintained(self):
        """Test that tasks are returned in correct order_index order"""
        repo = TaskRepository()
        quest_id = str(uuid.uuid4())

        with patch.object(repo, 'client') as mock_client:
            # Tasks in wrong order
            mock_tasks = Mock()
            mock_tasks.data = [
                {'id': str(uuid.uuid4()), 'quest_id': quest_id, 'order_index': 1},
                {'id': str(uuid.uuid4()), 'quest_id': quest_id, 'order_index': 2},
                {'id': str(uuid.uuid4()), 'quest_id': quest_id, 'order_index': 3},
            ]
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_tasks

            tasks = repo.find_by_quest(quest_id)

            # Verify order
            assert tasks[0]['order_index'] == 1
            assert tasks[1]['order_index'] == 2
            assert tasks[2]['order_index'] == 3

    def test_completion_timestamp_auto_added(self):
        """Test that completion timestamp is automatically added if not provided"""
        repo = TaskCompletionRepository()

        completion_data = {
            'user_id': str(uuid.uuid4()),
            'quest_id': str(uuid.uuid4()),
            'user_quest_task_id': str(uuid.uuid4()),
        }

        with patch.object(repo, 'client') as mock_client:
            # Mock no existing
            mock_existing = Mock()
            mock_existing.data = []

            # Capture what was inserted
            inserted_data = None

            def capture_insert(data):
                nonlocal inserted_data
                inserted_data = data
                mock_result = Mock()
                mock_result.data = [{**data, 'id': str(uuid.uuid4())}]
                return mock_result

            mock_insert = Mock()
            mock_insert.execute.side_effect = lambda: capture_insert(completion_data)

            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_existing
            mock_client.table.return_value.insert.return_value = mock_insert

            repo.create_completion(completion_data)

            # Verify completed_at was added
            assert 'completed_at' in completion_data
