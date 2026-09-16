"""An expired PostgREST JWT on the quest catalog is a 401, not a 500.

Sentry OPTIO-BACKEND-98 / OPTIO-WEB-27, 2026-09-16: GET /api/quests answered
500 with "JWT expired (PGRST303)". The token was not the caller's -- the
shared anonymous client had been signed in by a login an hour earlier (see
test_sign_in_uses_throwaway_client) -- but whatever the cause, the web client
refreshes and retries on a 401 and only shows an error on a 500.
"""

from unittest.mock import MagicMock, patch

import pytest
from postgrest.exceptions import APIError


def _expired_client():
    client = MagicMock()
    client.table.side_effect = APIError({
        'message': 'JWT expired', 'code': 'PGRST303', 'hint': None, 'details': None,
    })
    return client


@pytest.mark.unit
def test_pgrst303_is_a_401_token_expired(client):
    with patch('routes.quest.listing.get_supabase_client', return_value=_expired_client()):
        resp = client.get('/api/quests?limit=20')
    assert resp.status_code == 401
    body = resp.get_json()
    assert body['error']['code'] == 'TOKEN_EXPIRED'


@pytest.mark.unit
def test_any_other_failure_is_still_a_500(client):
    broken = MagicMock()
    broken.table.side_effect = RuntimeError('boom')
    with patch('routes.quest.listing.get_supabase_client', return_value=broken):
        resp = client.get('/api/quests?limit=20')
    assert resp.status_code == 500
