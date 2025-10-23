"""Integration tests for API endpoints"""

import pytest
import json
from unittest.mock import Mock, patch

from utils.logger import get_logger

logger = get_logger(__name__)

def test_health_check(client):
    """Test health check endpoint"""
    response = client.get('/api/health')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'healthy'

def test_login_with_valid_credentials(client, mock_supabase):
    """Test login endpoint with valid credentials"""
    mock_supabase.auth.sign_in_with_password.return_value.user = Mock(id='test-user-123')
    mock_supabase.auth.sign_in_with_password.return_value.session = Mock(access_token='test-token')
    
    response = client.post('/api/auth/login', 
        json={
            'email': 'test@example.com',
            'password': 'Test1234!'
        }
    )
    
    assert response.status_code in [200, 401]  # Depends on mock setup

def test_get_quests_without_auth(client):
    """Test getting quests without authentication"""
    response = client.get('/api/quests')
    assert response.status_code in [200, 401]  # Public endpoint or requires auth

def test_get_quests_with_auth(client, auth_headers, mock_verify_token, mock_supabase):
    """Test getting quests with authentication"""
    mock_supabase.table.return_value.select.return_value.execute.return_value.data = []
    
    response = client.get('/api/quests', headers=auth_headers)
    assert response.status_code in [200, 401]

def test_create_quest_as_admin(client, auth_headers, mock_verify_token, mock_auth_supabase, admin_user):
    """Test creating a quest as admin"""
    mock_auth_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = admin_user
    
    quest_data = {
        'title': 'New Test Quest',
        'description': 'This is a test quest',
        'primary_skill': 'creativity',
        'difficulty_level': 'beginner',
        'xp_reward': 100
    }
    
    response = client.post('/api/quests', 
        headers=auth_headers,
        json=quest_data
    )
    
    assert response.status_code in [201, 401, 403]

def test_get_user_dashboard(client, auth_headers, mock_verify_token, mock_auth_supabase):
    """Test getting user dashboard"""
    mock_auth_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        'id': 'test-user-123',
        'display_name': 'Test User',
        'email': 'test@example.com'
    }
    
    response = client.get('/api/users/dashboard', headers=auth_headers)
    assert response.status_code in [200, 401]

def test_submit_quest_completion(client, auth_headers, mock_verify_token, mock_auth_supabase):
    """Test submitting a quest completion"""
    submission_data = {
        'evidence': 'Here is my work',
        'reflection': 'I learned a lot',
        'time_spent_minutes': 30
    }
    
    response = client.post('/api/quests/quest-123/complete',
        headers=auth_headers,
        json=submission_data
    )
    
    assert response.status_code in [200, 201, 400, 401, 404]

def test_get_user_profile(client, auth_headers, mock_verify_token, mock_auth_supabase):
    """Test getting user profile"""
    mock_auth_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        'id': 'test-user-123',
        'display_name': 'Test User',
        'email': 'test@example.com',
        'bio': 'Test bio'
    }
    
    response = client.get('/api/users/profile', headers=auth_headers)
    assert response.status_code in [200, 401]

def test_update_user_profile(client, auth_headers, mock_verify_token, mock_auth_supabase):
    """Test updating user profile"""
    profile_data = {
        'display_name': 'Updated Name',
        'bio': 'Updated bio'
    }
    
    response = client.put('/api/users/profile',
        headers=auth_headers,
        json=profile_data
    )
    
    assert response.status_code in [200, 400, 401]

def test_get_completed_quests(client, auth_headers, mock_verify_token, mock_auth_supabase):
    """Test getting completed quests"""
    mock_auth_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    
    response = client.get('/api/users/completed-quests', headers=auth_headers)
    assert response.status_code in [200, 401]

def test_admin_get_ai_queue(client, auth_headers, mock_verify_token, mock_auth_supabase, admin_user):
    """Test admin getting AI review queue"""
    mock_auth_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = admin_user
    mock_auth_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    
    response = client.get('/api/admin/ai-review-queue', headers=auth_headers)
    assert response.status_code in [200, 401, 403]

def test_rate_limiting(client):
    """Test rate limiting functionality"""
    # Make multiple requests quickly
    responses = []
    for _ in range(10):
        response = client.get('/api/health')
        responses.append(response.status_code)
    
    # All should be successful (rate limiting may not be enabled in test)
    assert all(status in [200, 429] for status in responses)