"""The acting-as session rides an httpOnly cookie (FU-05).

Until 2026-09-07 a parent's acting-as JWT was returned in readable JSON to
every client and replayed as a Bearer, because session_manager had no cookie to
read it from. SEC-03 had already closed the same hole on masquerade; this flow
could not follow until it had a cookie of its own, and giving it one moves
identity resolution -- the code path SEC-08 was written about.

So the failure mode this file exists for is not "the token leaks". It is:

    a parent presses Stop, and is still their child.

get_effective_user_id() reads the acting-as cookie AHEAD of the parent's own
access_token cookie -- it has to, or acting-as would not work at all -- so a
cookie that outlives the session that set it leaves the parent inside the
child's account with the exit button already pressed. Nothing else in this
suite would notice: every existing acting-as test drives the Bearer path.

The mirror case matters just as much and is tested below: the cookie must also
be gone after a plain logout, or the next sign-in on that browser starts inside
the child.
"""

from unittest.mock import MagicMock, patch

import pytest

from utils.session_manager import session_manager


# Real v4 shapes: validate_uuid_param checks the version and variant
# nibbles, so a repdigit UUID is rejected before the view runs.
PARENT_ID = 'a1b2c3d4-1111-4111-8111-111111111111'
CHILD_ID = 'a1b2c3d4-2222-4222-8222-222222222222'

CHROME = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')
IPHONE = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
          'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')


def _v1_origin():
    from app_config import Config
    for origin in (Config.ALLOWED_ORIGINS or []):
        if origin.startswith('http'):
            return origin
    return 'http://localhost:3000'


def _cookie_named(response, name):
    """The Set-Cookie header for `name`, or None."""
    for header in response.headers.getlist('Set-Cookie'):
        if header.startswith(f'{name}='):
            return header
    return None


def _act_as(client, headers):
    """POST /api/dependents/<child>/act-as with the ownership checks stubbed."""
    dependent = {'id': CHILD_ID, 'display_name': 'Robin'}
    repo = MagicMock()
    repo.get_dependent.return_value = dependent
    with patch('routes.dependents_acting_as.get_supabase_admin_client', return_value=MagicMock()), \
         patch('routes.dependents_acting_as.DependentRepository', return_value=repo), \
         patch('routes.dependents.verify_parent_role', return_value=None), \
         patch.object(session_manager, 'get_effective_user_id', return_value=PARENT_ID), \
         patch.object(session_manager, 'get_current_user_id', return_value=PARENT_ID), \
         patch('utils.portfolio_access.is_parent_of', return_value=True):
        return client.post(f'/api/dependents/{CHILD_ID}/act-as', json={}, headers=headers)


def _stop(client, headers):
    admin = MagicMock()
    admin.table.return_value.select.return_value.eq.return_value.single \
        .return_value.execute.return_value = MagicMock(
            data={'id': PARENT_ID, 'display_name': 'Pat'})
    with patch('routes.dependents_acting_as.get_supabase_admin_client', return_value=admin), \
         patch.object(session_manager, 'get_deescalation_user_id', return_value=PARENT_ID):
        return client.post('/api/dependents/stop-acting-as', json={}, headers=headers)


@pytest.mark.unit
class TestTheCookieIsSetAndCleared:
    def test_act_as_sets_an_httponly_cookie(self, client):
        resp = _act_as(client, {'User-Agent': CHROME, 'Origin': _v1_origin()})
        assert resp.status_code == 200, resp.get_data(as_text=True)
        cookie = _cookie_named(resp, 'acting_as_token')
        assert cookie, 'acting-as set no cookie, so the body is still the only credential'
        assert 'HttpOnly' in cookie, 'a credential a script can read is the thing this fixes'

    def test_a_cookie_capable_browser_gets_no_token_in_the_body(self, client):
        resp = _act_as(client, {'User-Agent': CHROME, 'Origin': _v1_origin()})
        body = resp.get_json()
        assert 'acting_as_token' not in body
        assert 'acting_as_refresh_token' not in body, (
            'the refresh token is the durable half -- it must never be readable '
            'by script on a browser that can hold the cookie')

    def test_a_header_auth_client_still_gets_its_tokens(self, client):
        """The mobile app and cookie-blocked browsers replay a Bearer. Gating
        them out would delete the feature rather than harden it."""
        resp = _act_as(client, {'User-Agent': IPHONE})
        body = resp.get_json()
        assert body.get('acting_as_token'), 'header-auth client cannot act as anybody'
        assert body.get('acting_as_refresh_token')

    def test_stop_acting_as_clears_the_cookie(self, client):
        """THE ONE THAT MATTERS. A cookie left behind here means the parent
        pressed Stop and is still their child."""
        resp = _stop(client, {'User-Agent': CHROME, 'Origin': _v1_origin()})
        assert resp.status_code == 200
        cookie = _cookie_named(resp, 'acting_as_token')
        assert cookie, 'stop-acting-as did not clear the acting-as cookie at all'
        assert ('Expires=Thu, 01 Jan 1970' in cookie or 'Max-Age=0' in cookie), (
            f'acting-as cookie was set, not cleared: {cookie}')

    def test_stop_acting_as_still_returns_the_parents_own_session(self, client):
        """Clearing must not have cost the parent their way back."""
        resp = _stop(client, {'User-Agent': CHROME, 'Origin': _v1_origin()})
        assert _cookie_named(resp, 'access_token')

    def test_logging_out_clears_it_too(self, app):
        """The other way to leave. Without this, the next sign-in on the same
        browser resolves as the child, because the acting-as cookie is read
        ahead of access_token."""
        from flask import make_response
        with app.test_request_context('/'):
            resp = session_manager.clear_auth_cookies(make_response(''))
        cookie = _cookie_named(resp, 'acting_as_token')
        assert cookie, 'logout leaves the acting-as cookie in place'
        assert ('Expires=Thu, 01 Jan 1970' in cookie or 'Max-Age=0' in cookie)


@pytest.mark.unit
class TestWhoTheCookieSaysYouAre:
    """The resolvers, driven by the cookie alone -- no Authorization header.

    This is the half that could not exist before: session_manager read the
    acting-as JWT only from a Bearer, so a browser holding just the cookie
    resolved as the PARENT and acting-as silently did nothing.
    """

    def _ctx(self, app, cookies):
        return app.test_request_context('/', headers={
            'Cookie': '; '.join(f'{k}={v}' for k, v in cookies.items())})

    def test_the_effective_user_is_the_child(self, app):
        with patch.object(session_manager, 'verify_acting_as_token',
                          return_value={'user_id': PARENT_ID, 'acting_as': CHILD_ID}):
            with self._ctx(app, {'acting_as_token': 'aa', 'access_token': 'parent'}):
                assert session_manager.get_effective_user_id() == CHILD_ID

    def test_the_actual_user_is_still_the_parent(self, app):
        """Audit trails and the way back both depend on this staying the parent."""
        with patch.object(session_manager, 'verify_acting_as_token',
                          return_value={'user_id': PARENT_ID, 'acting_as': CHILD_ID}):
            with self._ctx(app, {'acting_as_token': 'aa', 'access_token': 'parent'}):
                assert session_manager.get_current_user_id() == PARENT_ID
                assert session_manager.get_actual_admin_id() == PARENT_ID

    def test_the_acting_as_cookie_beats_the_parents_own_access_cookie(self, app):
        """Both cookies are present for the whole session -- the parent never
        stopped being signed in. Order is what makes acting-as work."""
        with patch.object(session_manager, 'verify_acting_as_token',
                          return_value={'user_id': PARENT_ID, 'acting_as': CHILD_ID}), \
             patch.object(session_manager, 'verify_access_token',
                          return_value={'user_id': PARENT_ID}):
            with self._ctx(app, {'access_token': 'parent', 'acting_as_token': 'aa'}):
                assert session_manager.get_effective_user_id() == CHILD_ID

    def test_an_expired_acting_as_cookie_does_not_grant_anything(self, app):
        """A cookie that no longer verifies falls through to the parent's own
        session rather than to the child. Fail closed means fail DOWN here:
        the parent gets themselves back, not their child."""
        with patch.object(session_manager, 'verify_acting_as_token', return_value=None), \
             patch.object(session_manager, 'verify_access_token',
                          return_value={'user_id': PARENT_ID}):
            with self._ctx(app, {'acting_as_token': 'dead', 'access_token': 'parent'}):
                assert session_manager.get_effective_user_id() == PARENT_ID

    def test_de_escalation_can_still_name_the_parent_from_the_cookie(self, app):
        """/stop-acting-as resolves through get_deescalation_user_id. If that
        cannot read the acting-as cookie, a browser whose Bearer has expired
        has no way out at all."""
        with patch.object(session_manager, 'verify_access_token', return_value=None), \
             patch.object(session_manager, 'verify_masquerade_token', return_value=None), \
             patch.object(session_manager, 'verify_acting_as_token',
                          return_value={'user_id': PARENT_ID, 'acting_as': CHILD_ID}):
            with self._ctx(app, {'acting_as_token': 'aa'}):
                assert session_manager.get_deescalation_user_id() == PARENT_ID
