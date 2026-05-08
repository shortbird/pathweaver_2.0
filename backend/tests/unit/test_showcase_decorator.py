"""Tests for @require_showcase_access decorator.

Allows access if the user is superadmin OR has users.can_view_showcase = true.
Mirrors the require_admin pattern: looks up the actual admin identity
(not masquerade target) so masquerading doesn't grant showcase access.
"""

import pytest
from unittest.mock import Mock, patch


def _admin_client_returning(user_row):
    """Build a mock admin client whose users-by-id query yields user_row."""
    client = Mock()
    response = Mock()
    response.data = [user_row] if user_row else []
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = response
    client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
        Mock(data=user_row) if user_row else Mock(data=None)
    )
    return client


def test_superadmin_is_allowed(client, mock_verify_token):
    from utils.auth.decorators import require_showcase_access

    user_row = {'id': 'test-user-123', 'role': 'superadmin', 'can_view_showcase': False}
    admin_client = _admin_client_returning(user_row)
    with patch('database.get_supabase_admin_client', return_value=admin_client):

        @require_showcase_access
        def protected(user_id):
            return {'user_id': user_id}, 200

        with client.application.test_request_context(headers={'Authorization': 'Bearer t'}):
            body, status = protected()

    assert status == 200
    assert body['user_id'] == 'test-user-123'


def test_user_with_flag_is_allowed(client, mock_verify_token):
    from utils.auth.decorators import require_showcase_access

    user_row = {'id': 'test-user-123', 'role': 'student', 'can_view_showcase': True}
    admin_client = _admin_client_returning(user_row)
    with patch('database.get_supabase_admin_client', return_value=admin_client):

        @require_showcase_access
        def protected(user_id):
            return {'user_id': user_id}, 200

        with client.application.test_request_context(headers={'Authorization': 'Bearer t'}):
            body, status = protected()

    assert status == 200


def test_user_without_flag_is_denied(client, mock_verify_token):
    from utils.auth.decorators import require_showcase_access
    from middleware.error_handler import AuthorizationError

    user_row = {'id': 'test-user-123', 'role': 'student', 'can_view_showcase': False}
    admin_client = _admin_client_returning(user_row)
    with patch('database.get_supabase_admin_client', return_value=admin_client):

        @require_showcase_access
        def protected(user_id):
            return {'user_id': user_id}, 200

        with client.application.test_request_context(headers={'Authorization': 'Bearer t'}):
            with pytest.raises(AuthorizationError):
                protected()


def test_unauthenticated_is_denied(client):
    from utils.auth.decorators import require_showcase_access
    from middleware.error_handler import AuthenticationError

    @require_showcase_access
    def protected(user_id):
        return {'user_id': user_id}, 200

    with client.application.test_request_context():
        with pytest.raises(AuthenticationError):
            protected()


def test_missing_user_row_is_denied(client, mock_verify_token):
    from utils.auth.decorators import require_showcase_access
    from middleware.error_handler import AuthorizationError

    admin_client = _admin_client_returning(None)
    with patch('database.get_supabase_admin_client', return_value=admin_client):

        @require_showcase_access
        def protected(user_id):
            return {'user_id': user_id}, 200

        with client.application.test_request_context(headers={'Authorization': 'Bearer t'}):
            with pytest.raises(AuthorizationError):
                protected()
