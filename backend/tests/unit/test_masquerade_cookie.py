"""Unit tests for the masquerade httpOnly cookie path (C2 architectural fix).

The masquerade JWT must live in an httpOnly cookie so masquerade survives a
page reload under the in-memory-only token model. The cookie must take
precedence over the admin's own access_token cookie when resolving the
effective user.
"""
from unittest.mock import patch

from utils.session_manager import session_manager


def test_set_masquerade_cookie_attaches_httponly_cookie(app):
    """set_masquerade_cookie writes an HttpOnly cookie with the masquerade JWT."""
    with app.test_request_context('/'):
        from flask import make_response, jsonify
        response = make_response(jsonify({'ok': True}))
        session_manager.set_masquerade_cookie(response, 'mq-jwt-token')

        set_cookie_headers = response.headers.getlist('Set-Cookie')
        cookie = next((h for h in set_cookie_headers if h.startswith('masquerade_token=')), None)
        assert cookie is not None, f"masquerade_token cookie missing: {set_cookie_headers}"
        assert 'mq-jwt-token' in cookie
        assert 'HttpOnly' in cookie


def test_clear_masquerade_cookie_emits_expired_cookie(app):
    """clear_masquerade_cookie sets an empty masquerade_token cookie with expires=0."""
    with app.test_request_context('/'):
        from flask import make_response, jsonify
        response = make_response(jsonify({'ok': True}))
        session_manager.clear_masquerade_cookie(response)

        set_cookie_headers = response.headers.getlist('Set-Cookie')
        cookie = next((h for h in set_cookie_headers if h.startswith('masquerade_token=')), None)
        assert cookie is not None
        # Cleared cookie has empty value and an Expires/Max-Age=0 header
        assert 'masquerade_token=;' in cookie or 'masquerade_token="";' in cookie or cookie.startswith('masquerade_token=;')


def test_masquerade_cookie_takes_precedence_over_admin_access_cookie(app):
    """When both cookies exist, masquerade resolution uses the masquerade cookie.

    This is the architectural fix: after C2 wipes in-memory tokens on reload,
    the admin's access_token cookie is still present; without this precedence,
    the user would silently revert to admin instead of staying masqueraded.
    """
    fake_mq_payload = {'user_id': 'admin-1', 'masquerade_as': 'target-1'}

    with app.test_request_context(
        '/',
        headers={},
        environ_base={'HTTP_COOKIE': 'access_token=admin-jwt; masquerade_token=mq-jwt'},
    ):
        with patch.object(session_manager, 'verify_masquerade_token', return_value=fake_mq_payload):
            info = session_manager.get_masquerade_info()
            assert info is not None
            assert info['admin_id'] == 'admin-1'
            assert info['target_user_id'] == 'target-1'
            assert info['is_masquerading'] is True

            assert session_manager.is_masquerading() is True
            assert session_manager.get_effective_user_id() == 'target-1'


def test_no_masquerade_cookie_means_not_masquerading(app):
    """Without the masquerade cookie, is_masquerading is False even if admin is logged in."""
    with app.test_request_context(
        '/',
        environ_base={'HTTP_COOKIE': 'access_token=admin-jwt'},
    ):
        # No need to mock — verify_masquerade_token would just return None
        assert session_manager.is_masquerading() is False
        assert session_manager.get_masquerade_info() is None


def test_exit_masquerade_clears_role_view_cookie(app):
    """Exiting a masquerade drops the role view too.

    The SIS switcher flow is: narrow to a role (role_view_token cookie), then
    open a specific person (masquerade). "Back to my account" must return the
    admin's real role — leaving the role_view cookie behind kept them narrowed
    to the role they picked before masquerading.
    """
    from unittest.mock import Mock

    db = Mock()
    table = Mock()
    db.table.return_value = table
    for chained in ('select', 'eq', 'is_', 'order', 'limit', 'update'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'id': 'admin-1', 'display_name': 'Admin', 'email': 'a@example.com',
        'role': 'org_admin', 'avatar_url': None,
    }])

    mq_info = {'admin_id': 'admin-1', 'target_user_id': 'target-1', 'is_masquerading': True}
    with patch.object(session_manager, 'get_masquerade_info', return_value=mq_info), \
         patch('routes.admin.masquerade.get_supabase_admin_client', return_value=db):
        resp = app.test_client().post('/api/admin/masquerade/exit', json={})

    assert resp.status_code == 200
    cookies = resp.headers.getlist('Set-Cookie')
    role_view = [h for h in cookies if h.startswith('role_view_token=')]
    assert role_view, f"role_view_token not cleared on exit: {cookies}"
    assert all(h.startswith('role_view_token=;') or h.startswith('role_view_token="";')
               for h in role_view)
    assert any(h.startswith('masquerade_token=;') or h.startswith('masquerade_token="";')
               for h in cookies)
