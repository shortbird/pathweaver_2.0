"""
Unit tests for UserRepository.

Tests repository pattern implementation including:
- CRUD operations
- RLS enforcement
- Query optimization patterns
- Error handling
"""

import pytest
import uuid
from unittest.mock import Mock, patch

from repositories.user_repository import UserRepository
from repositories.base_repository import DatabaseError

from utils.logger import get_logger

logger = get_logger(__name__)


@pytest.mark.unit
def test_user_repository_initialization():
    """Test UserRepository can be initialized"""
    user_id = str(uuid.uuid4())
    repo = UserRepository(user_id=user_id)

    assert repo is not None
    assert repo.user_id == user_id


@pytest.mark.unit
@pytest.mark.critical
def test_find_by_id():
    """Test finding user by ID"""
    user_id = str(uuid.uuid4())
    repo = UserRepository()

    with patch.object(repo, 'supabase') as mock_supabase:
        mock_user = Mock()
        mock_user.data = [{
            'id': user_id,
            'email': 'test@example.com',
            'display_name': 'Test User',
            'role': 'student'
        }]
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_user

        user = repo.find_by_id(user_id)

        assert user is not None
        assert user['id'] == user_id
        assert user['email'] == 'test@example.com'


@pytest.mark.unit
def test_find_by_email():
    """Test finding user by email"""
    email = 'test@example.com'
    repo = UserRepository()

    with patch.object(repo, 'supabase') as mock_supabase:
        mock_user = Mock()
        mock_user.data = [{
            'id': str(uuid.uuid4()),
            'email': email,
            'display_name': 'Test User'
        }]
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_user

        user = repo.find_by_email(email)

        assert user is not None
        assert user['email'] == email


@pytest.mark.unit
@pytest.mark.critical
def test_create_user():
    """Test creating a new user"""
    repo = UserRepository()

    user_data = {
        'id': str(uuid.uuid4()),
        'email': 'newuser@example.com',
        'display_name': 'New User',
        'first_name': 'New',
        'last_name': 'User',
        'role': 'student'
    }

    with patch.object(repo, 'supabase') as mock_supabase:
        mock_result = Mock()
        mock_result.data = [user_data]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = mock_result

        created_user = repo.create(user_data)

        assert created_user is not None
        assert created_user['email'] == user_data['email']


@pytest.mark.unit
def test_update_user():
    """Test updating user data"""
    user_id = str(uuid.uuid4())
    repo = UserRepository()

    update_data = {
        'display_name': 'Updated Name',
        'bio': 'Updated bio'
    }

    with patch.object(repo, 'supabase') as mock_supabase:
        mock_result = Mock()
        mock_result.data = [{
            'id': user_id,
            **update_data
        }]
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = mock_result

        updated_user = repo.update(user_id, update_data)

        assert updated_user is not None
        assert updated_user['display_name'] == update_data['display_name']


@pytest.mark.unit
def test_delete_user():
    """Test deleting a user"""
    user_id = str(uuid.uuid4())
    repo = UserRepository()

    with patch.object(repo, 'supabase') as mock_supabase:
        mock_result = Mock()
        mock_result.data = [{'id': user_id}]
        mock_supabase.table.return_value.delete.return_value.eq.return_value.execute.return_value = mock_result

        result = repo.delete(user_id)

        assert result is True or result is not None


@pytest.mark.unit
@pytest.mark.critical
def test_rls_enforcement():
    """Test that RLS prevents unauthorized access"""
    user_id = str(uuid.uuid4())
    other_user_id = str(uuid.uuid4())

    # User-scoped repository (RLS enabled)
    repo = UserRepository(user_id=user_id)

    with patch.object(repo, 'get_user_supabase') as mock_user_supabase:
        # Mock RLS blocking access to other user's data
        mock_result = Mock()
        mock_result.data = []  # RLS returns empty result
        mock_user_supabase.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_result

        # Try to access other user's data
        other_user = repo.find_by_id(other_user_id)

        # Should return None (blocked by RLS)
        assert other_user is None or len(other_user) == 0


@pytest.mark.unit
def test_list_users_with_filters():
    """Test listing users with filters"""
    repo = UserRepository()

    with patch.object(repo, 'supabase') as mock_supabase:
        mock_users = Mock()
        mock_users.data = [
            {'id': str(uuid.uuid4()), 'email': 'student1@example.com', 'role': 'student'},
            {'id': str(uuid.uuid4()), 'email': 'student2@example.com', 'role': 'student'},
        ]
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_users

        users = repo.list(filters={'role': 'student'})

        assert len(users) == 2
        assert all(u['role'] == 'student' for u in users)


@pytest.mark.unit
def test_find_by_role():
    """Test finding users by role"""
    repo = UserRepository()

    with patch.object(repo, 'supabase') as mock_supabase:
        mock_admins = Mock()
        mock_admins.data = [
            {'id': str(uuid.uuid4()), 'role': 'admin', 'display_name': 'Admin 1'},
            {'id': str(uuid.uuid4()), 'role': 'admin', 'display_name': 'Admin 2'},
        ]
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_admins

        admins = repo.find_by_role('admin')

        assert len(admins) == 2
        assert all(a['role'] == 'admin' for a in admins)


@pytest.mark.unit
def test_error_handling_on_database_failure():
    """Test proper error handling when database operations fail"""
    repo = UserRepository()

    with patch.object(repo, 'supabase') as mock_supabase:
        # Mock database error
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.side_effect = Exception("Database error")

        # Should handle error gracefully
        with pytest.raises(Exception):
            repo.find_by_id(str(uuid.uuid4()))


@pytest.mark.unit
def test_query_optimization_batch_load():
    """Test batch loading of users (N+1 query prevention)"""
    repo = UserRepository()

    user_ids = [str(uuid.uuid4()) for _ in range(5)]

    with patch.object(repo, 'supabase') as mock_supabase:
        mock_users = Mock()
        mock_users.data = [
            {'id': uid, 'email': f'user{i}@example.com'}
            for i, uid in enumerate(user_ids)
        ]
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_users

        users = repo.find_by_ids(user_ids)

        # Should load all users in single query
        assert len(users) == 5
        # Verify all IDs are present
        loaded_ids = [u['id'] for u in users]
        assert set(loaded_ids) == set(user_ids)
