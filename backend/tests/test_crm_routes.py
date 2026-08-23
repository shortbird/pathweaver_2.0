"""
CRM route-level behavior against the real app: the SendGrid webhook demands a
valid ECDSA P-256 signature — the scheme SendGrid's Signed Event Webhook
actually uses (base64 DER public key, DER signature over timestamp+payload) —
and refuses everything when unconfigured; the unsubscribe flow works end to
end via token; the internal sweep endpoints enforce the cron-secret/superadmin
dual gate; and the admin API is closed to the unauthenticated.
"""
import base64
import json
from unittest.mock import patch

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (Encoding, PublicFormat)

from app_config import Config
from tests.crm_fakes import make_world


@pytest.fixture
def keypair():
    private = ec.generate_private_key(ec.SECP256R1())
    public_b64 = base64.b64encode(private.public_key().public_bytes(
        Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).decode()
    return private, public_b64


def _signed_headers(private, payload: bytes, timestamp='1724300000'):
    signature = base64.b64encode(private.sign(
        timestamp.encode() + payload, ec.ECDSA(hashes.SHA256()))).decode()
    return {'X-Twilio-Email-Event-Webhook-Signature': signature,
            'X-Twilio-Email-Event-Webhook-Timestamp': timestamp,
            'Content-Type': 'application/json'}


@pytest.mark.unit
class TestSendgridWebhook:
    URL = '/api/crm/internal/sendgrid-events'

    def test_unconfigured_refuses_everything(self, client):
        with patch.object(Config, 'SENDGRID_WEBHOOK_PUBLIC_KEY', None):
            assert client.post(self.URL, json=[]).status_code == 403

    def test_unsigned_request_rejected(self, client, keypair):
        _, public_b64 = keypair
        with patch.object(Config, 'SENDGRID_WEBHOOK_PUBLIC_KEY', public_b64):
            response = client.post(self.URL, json=[])
        assert response.status_code == 401

    def test_bad_signature_rejected(self, client, keypair):
        private, public_b64 = keypair
        other = ec.generate_private_key(ec.SECP256R1())
        payload = json.dumps([]).encode()
        with patch.object(Config, 'SENDGRID_WEBHOOK_PUBLIC_KEY', public_b64):
            response = client.post(self.URL, data=payload,
                                   headers=_signed_headers(other, payload))
        assert response.status_code == 401

    def test_valid_events_stored_and_bounce_suppresses(self, client, keypair):
        private, public_b64 = keypair
        world = make_world()
        world.data['crm_leads'].append({
            'id': 'lead-1', 'email': 'lead@example.com', 'status': 'active',
            'unsubscribe_token': 't1'})
        world.data['crm_funnel_memberships'].append({
            'id': 'm-1', 'lead_id': 'lead-1', 'funnel_id': 'funnel-1',
            'status': 'active', 'last_step_sent': 1})
        events = [
            {'sg_event_id': 'ev-1', 'event': 'open', 'email': 'lead@example.com',
             'send_id': 'send-1', 'lead_id': 'lead-1', 'timestamp': 1724300000},
            {'sg_event_id': 'ev-1', 'event': 'open', 'email': 'lead@example.com'},
            {'sg_event_id': 'ev-2', 'event': 'bounce', 'email': 'lead@example.com',
             'timestamp': 1724300001},
        ]
        payload = json.dumps(events).encode()
        with patch.object(Config, 'SENDGRID_WEBHOOK_PUBLIC_KEY', public_b64), \
             patch('routes.crm._admin_db', return_value=world):
            response = client.post(self.URL, data=payload,
                                   headers=_signed_headers(private, payload))
        assert response.status_code == 200
        body = response.get_json()
        assert body['stored'] == 2  # ev-1 duplicate deduped
        assert body['suppressed'] == 1
        assert any(s['email'] == 'lead@example.com' and s['reason'] == 'hard_bounce'
                   for s in world.data['crm_suppressions'])
        lead = world.data['crm_leads'][0]
        assert lead['status'] == 'suppressed'
        assert world.data['crm_funnel_memberships'][0]['status'] == 'exited'


@pytest.mark.unit
class TestUnsubscribeRoutes:
    def test_get_without_token_404s(self, client):
        assert client.get('/api/crm/unsubscribe').status_code == 404

    def test_get_with_token_shows_confirm_form(self, client):
        response = client.get('/api/crm/unsubscribe?token=abc')
        assert response.status_code == 200
        assert b'Unsubscribe' in response.data
        assert b'form method="POST"' in response.data

    def test_post_valid_token_unsubscribes(self, client):
        world = make_world()
        world.data['crm_leads'].append({
            'id': 'lead-1', 'email': 'lead@example.com', 'status': 'active',
            'unsubscribe_token': 'tok-1'})
        with patch('services.crm_funnel_engine._db', return_value=world):
            response = client.post('/api/crm/unsubscribe?token=tok-1')
        assert response.status_code == 200
        assert b'You are unsubscribed' in response.data
        assert any(s['email'] == 'lead@example.com'
                   for s in world.data['crm_suppressions'])

    def test_post_unknown_token_404s(self, client):
        world = make_world()
        with patch('services.crm_funnel_engine._db', return_value=world):
            assert client.post('/api/crm/unsubscribe?token=nope').status_code == 404


@pytest.mark.unit
class TestInternalGates:
    def test_sweep_rejects_anonymous(self, client):
        assert client.post('/api/crm/internal/funnel-sweep',
                           json={}).status_code == 401

    def test_sweep_accepts_cron_secret(self, client):
        with patch.object(Config, 'CRON_SECRET', 'shhh'), \
             patch('services.crm_funnel_engine.run_sweep',
                   return_value={'sent': 0, 'skipped': 'no_active_funnels'}):
            response = client.post('/api/crm/internal/funnel-sweep', json={},
                                   headers={'X-Cron-Secret': 'shhh'})
        assert response.status_code == 200
        assert response.get_json()['success'] is True

    def test_sweep_rejects_wrong_secret(self, client):
        with patch.object(Config, 'CRON_SECRET', 'shhh'):
            response = client.post('/api/crm/internal/funnel-sweep', json={},
                                   headers={'X-Cron-Secret': 'wrong'})
        assert response.status_code == 401

    def test_calendar_poll_rejects_anonymous(self, client):
        assert client.post('/api/crm/internal/calendar-poll',
                           json={}).status_code == 401


@pytest.mark.unit
class TestAdminGate:
    def test_admin_crm_closed_to_anonymous(self, client):
        for path in ('/api/admin/crm/overview', '/api/admin/crm/funnels',
                     '/api/admin/crm/leads', '/api/admin/crm/suppressions'):
            assert client.get(path).status_code == 401, path

    def test_admin_mutations_closed_to_anonymous(self, client):
        assert client.post('/api/admin/crm/funnels', json={}).status_code == 401
        assert client.post('/api/admin/crm/sweep/run', json={}).status_code == 401
