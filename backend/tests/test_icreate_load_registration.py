"""Regression tests for _load_registration (Sentry OPTIO-BACKEND-4).

A POST to /confirm-payment with an all-zeros registration id 500'd:
_load_registration used .single(), which raises PGRST116 on 0 rows. Malformed
(non-UUID) ids would likewise raise from PostgREST. Lookups must return None
for anything that isn't a real registration so the route answers 403/404, not
500 — this endpoint is unauthenticated and gets probed.
"""

from unittest.mock import Mock, patch

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
    from routes import icreate_registration

    with patch('routes.icreate_registration._admin') as admin:
        assert icreate_registration._load_registration('not-a-uuid') is None
        assert icreate_registration._load_registration('') is None
        assert icreate_registration._load_registration(None) is None
    admin.assert_not_called()


def test_unknown_valid_id_returns_none():
    from routes import icreate_registration

    with patch('routes.icreate_registration._admin',
               return_value=_admin_with_rows([])):
        assert icreate_registration._load_registration(VALID_UNKNOWN_ID) is None


def test_existing_id_returns_row():
    from routes import icreate_registration

    row = {'id': VALID_UNKNOWN_ID, 'status': 'fee'}
    with patch('routes.icreate_registration._admin',
               return_value=_admin_with_rows([row])):
        assert icreate_registration._load_registration(VALID_UNKNOWN_ID) == row


@pytest.fixture
def client():
    from routes import icreate_registration

    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(icreate_registration.bp)
    return app.test_client()


def test_confirm_payment_with_zero_uuid_is_403_not_500(client):
    """The exact probe from Sentry: POST /registrations/<zero-uuid>/confirm-payment."""
    res = client.post(f'/api/icreate/registrations/{ZERO_ID}/confirm-payment',
                      json={'access_token': 'anything'})
    assert res.status_code == 403


def test_confirm_payment_with_unknown_registration_is_403(client):
    with patch('routes.icreate_registration._admin',
               return_value=_admin_with_rows([])):
        res = client.post(f'/api/icreate/registrations/{VALID_UNKNOWN_ID}/confirm-payment',
                          json={'access_token': 'anything'})
    assert res.status_code == 403
