"""Unit tests for authentication functionality."""

import pytest
from unittest.mock import Mock, patch

from utils.auth.decorators import require_auth, require_admin, require_role
from utils.logger import get_logger

logger = get_logger(__name__)


def _mock_admin_client_returning(user_dict):
    """Return a MagicMock that, when used as `supabase.table('users').select('role').eq('id', ?).execute()`,
    yields a response with `.data == user_dict`."""
    client = Mock()
    response = Mock()
    response.data = user_dict
    # Single-user lookup chain used by require_admin / require_role
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = response
    # Some decorators go through .single().execute() — support both.
    client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = response
    return client


def test_require_auth_with_valid_token(client, mock_verify_token):
    @require_auth
    def protected_route(user_id):
        return {'user_id': user_id}, 200

    with client.application.test_request_context(
        headers={'Authorization': 'Bearer valid-token'}
    ):
        result = protected_route()
        assert result[0]['user_id'] == 'test-user-123'
        assert result[1] == 200


def test_require_auth_without_token(client):
    @require_auth
    def protected_route(user_id):
        return {'user_id': user_id}, 200

    with client.application.test_request_context():
        with pytest.raises(Exception):  # AuthenticationError
            protected_route()


def test_require_admin_with_admin_user(client, mock_verify_token, admin_user):
    # require_admin specifically checks for 'superadmin'; the shared
    # admin_user fixture says 'admin'. Override for this case.
    superadmin = {**admin_user, 'role': 'superadmin'}
    admin_client = _mock_admin_client_returning([superadmin])
    with patch('database.get_supabase_admin_client', return_value=admin_client):
        @require_admin
        def admin_route(user_id):
            return {'admin': True}, 200

        with client.application.test_request_context(
            headers={'Authorization': 'Bearer admin-token'}
        ):
            result = admin_route()
    assert result[0]['admin'] is True
    assert result[1] == 200


def test_require_admin_with_student_user(client, mock_verify_token, sample_user):
    admin_client = _mock_admin_client_returning([sample_user])
    with patch('database.get_supabase_admin_client', return_value=admin_client):
        @require_admin
        def admin_route(user_id):
            return {'admin': True}, 200

        with client.application.test_request_context(
            headers={'Authorization': 'Bearer student-token'}
        ):
            with pytest.raises(Exception):  # AuthorizationError
                admin_route()


def test_require_role_with_correct_role(client, mock_verify_token, sample_user):
    admin_client = _mock_admin_client_returning([sample_user])
    with patch('database.get_supabase_admin_client', return_value=admin_client):
        @require_role('student', 'advisor')
        def role_route(user_id):
            return {'access': True}, 200

        with client.application.test_request_context(
            headers={'Authorization': 'Bearer student-token'}
        ):
            result = role_route()
    assert result[0]['access'] is True
    assert result[1] == 200


def test_require_role_with_incorrect_role(client, mock_verify_token, sample_user):
    admin_client = _mock_admin_client_returning([sample_user])
    with patch('database.get_supabase_admin_client', return_value=admin_client):
        @require_role('org_admin', 'superadmin')
        def role_route(user_id):
            return {'access': True}, 200

        with client.application.test_request_context(
            headers={'Authorization': 'Bearer student-token'}
        ):
            with pytest.raises(Exception):  # AuthorizationError
                role_route()


def test_token_verification_with_invalid_token(client):
    """Invalid token (non-JWT, Supabase lookup fails) -> None."""
    from utils.auth.token_utils import verify_token

    # verify_token imports `get_supabase_client` at module load, so patch
    # the local binding inside token_utils rather than the `database` module.
    with patch('utils.auth.token_utils.get_supabase_client') as mock_supabase:
        mock_supabase.return_value.auth.get_user.side_effect = Exception("Invalid token")
        assert verify_token('invalid-token') is None


def test_token_verification_with_valid_token(client):
    """Valid Supabase-style token -> user_id returned."""
    from utils.auth.token_utils import verify_token

    fake_user = Mock()
    fake_user.user.id = 'test-user-123'

    with patch('utils.auth.token_utils.get_supabase_client') as mock_supabase:
        mock_supabase.return_value.auth.get_user.return_value = fake_user
        assert verify_token('valid-token') == 'test-user-123'
