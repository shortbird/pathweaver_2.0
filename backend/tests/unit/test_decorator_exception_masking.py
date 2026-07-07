"""Tests that role decorators don't swallow route exceptions.

Regression tests for the 2026-07-06 prod incident (OPTIO-BACKEND-13): the
verification try/retry blocks in require_admin/require_role wrapped the route
call itself, so an exception raised inside the route body was retried (route
side effects executed twice) and then surfaced as a misleading
AuthorizationError 403 instead of the real error.
"""

import pytest
from unittest.mock import Mock, patch


def _admin_client_returning(user_row):
    """Build a mock admin client whose users-by-id query yields user_row."""
    client = Mock()
    response = Mock()
    response.data = [user_row] if user_row else []
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = response
    return client


def _superadmin_client():
    return _admin_client_returning({'id': 'test-user-123', 'role': 'superadmin'})


def test_require_admin_allows_superadmin(client, mock_verify_token):
    from utils.auth.decorators import require_admin

    with patch('database.get_supabase_admin_client', return_value=_superadmin_client()):

        @require_admin
        def protected(user_id):
            return {'user_id': user_id}, 200

        with client.application.test_request_context(headers={'Authorization': 'Bearer t'}):
            body, status = protected()

    assert status == 200
    assert body['user_id'] == 'test-user-123'


def test_require_admin_denies_non_superadmin(client, mock_verify_token):
    from utils.auth.decorators import require_admin
    from middleware.error_handler import AuthorizationError

    admin_client = _admin_client_returning({'id': 'test-user-123', 'role': 'student'})
    with patch('database.get_supabase_admin_client', return_value=admin_client):

        @require_admin
        def protected(user_id):
            return {'user_id': user_id}, 200

        with client.application.test_request_context(headers={'Authorization': 'Bearer t'}):
            with pytest.raises(AuthorizationError):
                protected()


def test_require_admin_propagates_route_exception_without_retry(client, mock_verify_token):
    """A route-body exception must propagate as-is and the body must run once."""
    from utils.auth.decorators import require_admin

    calls = []
    with patch('database.get_supabase_admin_client', return_value=_superadmin_client()):

        @require_admin
        def protected(user_id):
            calls.append(user_id)
            raise ValueError('route blew up')

        with client.application.test_request_context(headers={'Authorization': 'Bearer t'}):
            with pytest.raises(ValueError, match='route blew up'):
                protected()

    assert len(calls) == 1


def test_require_admin_retries_transient_verification_error(client, mock_verify_token):
    """A flaky verification query retries, then the route runs exactly once."""
    from utils.auth.decorators import require_admin

    flaky = Mock(side_effect=[ConnectionError('transient'), _superadmin_client()])
    calls = []
    with patch('database.get_supabase_admin_client', flaky):

        @require_admin
        def protected(user_id):
            calls.append(user_id)
            return {'ok': True}, 200

        with client.application.test_request_context(headers={'Authorization': 'Bearer t'}):
            body, status = protected()

    assert status == 200
    assert len(calls) == 1


def test_require_role_propagates_route_exception_without_retry(client, mock_verify_token):
    from utils.auth.decorators import require_role

    calls = []
    admin_client = _admin_client_returning(
        {'id': 'test-user-123', 'role': 'student', 'org_role': None, 'org_roles': None}
    )
    with patch('database.get_supabase_admin_client', return_value=admin_client):

        @require_role('student')
        def protected(user_id):
            calls.append(user_id)
            raise ValueError('route blew up')

        with client.application.test_request_context(headers={'Authorization': 'Bearer t'}):
            with pytest.raises(ValueError, match='route blew up'):
                protected()

    assert len(calls) == 1


def test_require_role_denies_wrong_role(client, mock_verify_token):
    from utils.auth.decorators import require_role
    from middleware.error_handler import AuthorizationError

    admin_client = _admin_client_returning(
        {'id': 'test-user-123', 'role': 'student', 'org_role': None, 'org_roles': None}
    )
    with patch('database.get_supabase_admin_client', return_value=admin_client):

        @require_role('advisor')
        def protected(user_id):
            return {'ok': True}, 200

        with client.application.test_request_context(headers={'Authorization': 'Bearer t'}):
            with pytest.raises(AuthorizationError):
                protected()
