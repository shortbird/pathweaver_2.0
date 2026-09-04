"""Regression tests for _load_registration (Sentry OPTIO-BACKEND-4).

A POST to /confirm-payment with an all-zeros registration id 500'd:
_load_registration used .single(), which raises PGRST116 on 0 rows. Malformed
(non-UUID) ids would likewise raise from PostgREST. Lookups must return None
for anything that isn't a real registration so the route answers 403/404, not
500 — this endpoint is unauthenticated and gets probed.
"""

from unittest.mock import Mock, patch

# _load_registration moved to services/registration_funnel_support.py on
# 2026-09-03 (QB-04) and is re-exported from routes.registration_funnel under
# the same name. The call below still goes through the route module, but the
# function resolves _admin from the module it now LIVES in -- patching
# routes.registration_funnel._admin here would bind a name nothing reads, and
# the test would build a real Supabase client and fail on 'Invalid URL'.

import pytest
from flask import Flask

VALID_UNKNOWN_ID = '2a9d4a3a-3a03-459f-b3f4-49213625071c'
ZERO_ID = '00000000-0000-0000-0000-000000000000'


def _admin_with_rows(rows):
    admin = Mock()
    (admin.table.return_value.select.return_value.eq.return_value
     .limit.return_value.execute.return_value) = Mock(data=rows)
    return admin


def test_malformed_id_returns_none_without_db_call():
    from routes import registration_funnel

    with patch('services.registration_funnel_support._admin') as admin:
        assert registration_funnel._load_registration('not-a-uuid') is None
        assert registration_funnel._load_registration('') is None
        assert registration_funnel._load_registration(None) is None
    admin.assert_not_called()


def test_unknown_valid_id_returns_none():
    from routes import registration_funnel

    with patch('services.registration_funnel_support._admin',
               return_value=_admin_with_rows([])):
        assert registration_funnel._load_registration(VALID_UNKNOWN_ID) is None


def test_existing_id_returns_row():
    from routes import registration_funnel

    row = {'id': VALID_UNKNOWN_ID, 'status': 'fee'}
    with patch('services.registration_funnel_support._admin',
               return_value=_admin_with_rows([row])):
        assert registration_funnel._load_registration(VALID_UNKNOWN_ID) == row


@pytest.fixture
def client():
    from routes import registration_funnel

    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(registration_funnel.bp)
    return app.test_client()


def test_confirm_payment_with_zero_uuid_is_403_not_500(client):
    """The exact probe from Sentry: POST /registrations/<zero-uuid>/confirm-payment."""
    res = client.post(f'/api/registration/registrations/{ZERO_ID}/confirm-payment',
                      json={'access_token': 'anything'})
    assert res.status_code == 403


def test_confirm_payment_with_unknown_registration_is_403(client):
    with patch('services.registration_funnel_support._admin',
               return_value=_admin_with_rows([])):
        res = client.post(f'/api/registration/registrations/{VALID_UNKNOWN_ID}/confirm-payment',
                          json={'access_token': 'anything'})
    assert res.status_code == 403


# ── the sibling loader, missed when _load_registration was fixed ──────────────

class TestLoadRegistrationInvite:
    """_load_registration_invite had the same PGRST116 bug for a year longer.

    `.single()` raises when the code matches no row, so an unknown or mistyped
    invitation code produced a 500 rather than the 404 the function goes on to
    return three lines later. It is the FIRST step of the funnel and the route
    is unauthenticated, so the people reaching it are a parent who mistyped
    their link, a parent whose link was revoked, and anyone probing.

    Found 2026-09-04 by curling /api/registration/config/nonexistent-code
    against a local server.
    """

    def _app(self):
        app = Flask(__name__)
        from routes import registration_funnel
        app.register_blueprint(registration_funnel.bp)
        return app

    def test_unknown_code_is_a_404_not_a_500(self):
        from services import registration_funnel_support

        admin = Mock()
        (admin.table.return_value.select.return_value.eq.return_value
         .limit.return_value.execute.return_value) = Mock(data=[])

        with self._app().test_request_context():
            with patch('services.registration_funnel_support._admin', return_value=admin):
                data, err = registration_funnel_support._load_registration_invite('nope')

        assert data is None
        assert err is not None
        _body, status = err
        assert status == 404

    def test_a_real_code_still_resolves(self):
        """The fix must not turn a hit into a miss."""
        from services import registration_funnel_support

        inv = {
            'id': 'inv-1', 'organization_id': 'org-1', 'role': 'parent',
            'status': 'pending', 'email': f'x{registration_funnel_support.LINK_PLACEHOLDER_SUFFIX}',
            'organizations': {'id': 'org-1', 'name': 'Test Org', 'slug': 'test',
                              'feature_flags': {'registration': {'enabled': True}}},
        }
        admin = Mock()
        (admin.table.return_value.select.return_value.eq.return_value
         .limit.return_value.execute.return_value) = Mock(data=[inv])

        with self._app().test_request_context():
            with patch('services.registration_funnel_support._admin', return_value=admin):
                data, err = registration_funnel_support._load_registration_invite('good-code')

        assert err is None
        assert data['invitation']['id'] == 'inv-1'

    def test_it_does_not_use_single(self):
        """The regression is one word, so name it. `.single()` is what raises.

        Parsed rather than grepped: the function's own docstring explains why
        it avoids single(), so a plain substring search over the source matches
        its own warning and fails on a correct file.
        """
        import ast
        from pathlib import Path
        src = (Path(__file__).resolve().parents[2] / 'backend' / 'services'
               / 'registration_funnel_support.py').read_text(encoding='utf-8')
        fn = next(n for n in ast.parse(src).body
                  if isinstance(n, ast.FunctionDef)
                  and n.name == '_load_registration_invite')
        calls = {n.func.attr for n in ast.walk(fn)
                 if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)}
        assert 'single' not in calls, (
            '_load_registration_invite is back on .single(), which raises '
            'PGRST116 on zero rows -- an unknown invitation code will 500 again '
            'instead of returning the 404 the function defines.')
        assert 'limit' in calls, (
            'The query no longer bounds itself with .limit(1). Without it a '
            'duplicate invitation code would load every match to use one.')
