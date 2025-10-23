"""Pytest configuration and fixtures"""

import pytest
import os
import sys
from unittest.mock import Mock, patch

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Set testing environment
os.environ['FLASK_ENV'] = 'testing'

from app import app as flask_app
from app_config import TestingConfig

@pytest.fixture
def app():
    """Create and configure a test app instance"""
    flask_app.config.from_object(TestingConfig)
    flask_app.config['TESTING'] = True
    
    # Create application context
    with flask_app.app_context():
        yield flask_app

@pytest.fixture
def client(app):
    """Create a test client"""
    return app.test_client()

@pytest.fixture
def auth_headers():
    """Create mock authentication headers"""
    return {
        'Authorization': 'Bearer test-token-123',
        'Content-Type': 'application/json'
    }

@pytest.fixture
def mock_supabase():
    """Mock Supabase client"""
    with patch('database.get_supabase_client') as mock:
        supabase_mock = Mock()
        mock.return_value = supabase_mock
        yield supabase_mock

@pytest.fixture
def mock_auth_supabase():
    """Mock authenticated Supabase client"""
    with patch('database.get_authenticated_supabase_client') as mock:
        supabase_mock = Mock()
        mock.return_value = supabase_mock
        yield supabase_mock

@pytest.fixture
def sample_user():
    """Sample user data"""
    return {
        'id': 'test-user-123',
        'email': 'test@example.com',
        'display_name': 'Test User',
        'role': 'student',
        'created_at': '2024-01-01T00:00:00Z'
    }

@pytest.fixture
def sample_quest():
    """Sample quest data"""
    return {
        'id': 'quest-123',
        'title': 'Sample Quest',
        'description': 'This is a sample quest for testing',
        'primary_skill': 'creativity',
        'difficulty_level': 'beginner',
        'estimated_time_minutes': 30,
        'xp_reward': 100,
        'is_published': True,
        'created_at': '2024-01-01T00:00:00Z'
    }

@pytest.fixture
def sample_quest_submission():
    """Sample quest submission data"""
    return {
        'quest_id': 'quest-123',
        'evidence': 'Here is my completed work',
        'reflection': 'I learned a lot from this quest',
        'time_spent_minutes': 45
    }

@pytest.fixture
def mock_verify_token():
    """Mock token verification"""
    with patch('utils.auth.token_utils.verify_token') as mock:
        mock.return_value = 'test-user-123'
        yield mock

@pytest.fixture
def admin_user():
    """Sample admin user data"""
    return {
        'id': 'admin-user-123',
        'email': 'admin@example.com',
        'display_name': 'Admin User',
        'role': 'admin',
        'created_at': '2024-01-01T00:00:00Z'
    }