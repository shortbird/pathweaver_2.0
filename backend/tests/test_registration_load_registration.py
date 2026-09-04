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
