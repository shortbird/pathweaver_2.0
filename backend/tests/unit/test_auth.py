"""Unit tests for authentication functionality"""

import pytest
from unittest.mock import Mock, patch
from utils.auth.decorators import require_auth, require_admin, require_role
from utils.api_response import unauthorized_response, forbidden_response

from utils.logger import get_logger

logger = get_logger(__name__)

def test_require_auth_with_valid_token(client, mock_verify_token):
    """Test require_auth decorator with valid token"""
    
    @require_auth
    def protected_route(user_id):
        return {'user_id': user_id}, 200
    
    with client.application.test_request_context(
        headers={'Authorization': 'Bearer valid-token'}
    ):
        from flask import request
        result = protected_route()
        assert result[0]['user_id'] == 'test-user-123'
        assert result[1] == 200

def test_require_auth_without_token(client):
    """Test require_auth decorator without token"""
    
    @require_auth
    def protected_route(user_id):
        return {'user_id': user_id}, 200
    
    with client.application.test_request_context():
        with pytest.raises(Exception):  # AuthenticationError
            protected_route()

def test_require_admin_with_admin_user(client, mock_verify_token, mock_auth_supabase, admin_user):
    """Test require_admin decorator with admin user"""
    
    mock_auth_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = admin_user
    
    @require_admin
    def admin_route(user_id):
        return {'admin': True}, 200
    
    with client.application.test_request_context(
        headers={'Authorization': 'Bearer admin-token'}
    ):
        result = admin_route()
        assert result[0]['admin'] == True
        assert result[1] == 200

def test_require_admin_with_student_user(client, mock_verify_token, mock_auth_supabase, sample_user):
    """Test require_admin decorator with non-admin user"""
    
    mock_auth_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = sample_user
    
    @require_admin
    def admin_route(user_id):
        return {'admin': True}, 200
    
    with client.application.test_request_context(
        headers={'Authorization': 'Bearer student-token'}
    ):
        with pytest.raises(Exception):  # AuthorizationError
            admin_route()

def test_require_role_with_correct_role(client, mock_verify_token, mock_auth_supabase, sample_user):
    """Test require_role decorator with correct role"""
    
    mock_auth_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = sample_user
    
    @require_role('student', 'advisor')
    def role_route(user_id):
        return {'access': True}, 200

    with client.application.test_request_context(
        headers={'Authorization': 'Bearer student-token'}
    ):
        result = role_route()
        assert result[0]['access'] == True
        assert result[1] == 200

def test_require_role_with_incorrect_role(client, mock_verify_token, mock_auth_supabase, sample_user):
    """Test require_role decorator with incorrect role"""

    mock_auth_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = sample_user

    @require_role('org_admin', 'superadmin')
    def role_route(user_id):
        return {'access': True}, 200
    
    with client.application.test_request_context(
        headers={'Authorization': 'Bearer student-token'}
    ):
        with pytest.raises(Exception):  # AuthorizationError
            role_route()

def test_token_verification_with_invalid_token(client):
    """Test token verification with invalid token"""
    from utils.auth.token_utils import verify_token
    
    with patch('database.get_supabase_client') as mock_supabase:
        mock_supabase.return_value.auth.get_user.side_effect = Exception("Invalid token")
        
        result = verify_token('invalid-token')
        assert result is None

def test_token_verification_with_valid_token(client):
    """Test token verification with valid token"""
    from utils.auth.token_utils import verify_token
    
    with patch('database.get_supabase_client') as mock_supabase:
        mock_user = Mock()
        mock_user.user.id = 'test-user-123'
        mock_supabase.return_value.auth.get_user.return_value = mock_user
        
        result = verify_token('valid-token')
        assert result == 'test-user-123'