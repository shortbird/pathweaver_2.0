"""The parental-consent endpoints must not hand a child's guardian to strangers.

GET /api/parental-consent/status/<user_id> carried no auth decorator at all
and returned `parental_consent_email` for any UUID -- a named guardian's
address, served to anyone, with a child's account attached. That is the raw
material for "Hi, I'm from Optio, about your child's account".

POST /parental-consent/send took both a user_id and a destination address from
an unauthenticated body, so anyone holding a child's UUID could have Optio
send a branded consent request to an address of their choosing.
"""

from unittest.mock import Mock, patch

import pytest

CHILD_ID = '55555555-5555-4555-8555-555555555555'
STRANGER_ID = '66666666-6666-4666-8666-666666666666'
PARENT_ID = '77777777-7777-4777-8777-777777777777'


def _admin(user_row):
    """Admin client stub whose every read yields the child's row."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'in_', 'limit', 'order', 'is_', 'gt',
                    'single', 'maybe_single', 'update', 'insert', 'delete'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[user_row] if user_row else [])
    return client


@pytest.mark.unit
class TestConsentStatusRequiresAuth:
    def test_anonymous_caller_gets_404_not_the_guardian_email(self, client):
        admin = _admin({
            'requires_parental_consent': True,
            'parental_consent_verified': False,
            'parental_consent_email': 'guardian@example.com',
            'parental_consent_verified_at': None,
        })
        with patch('routes.parental_consent.requests.get_supabase_admin_client',
                   return_value=admin), \
             patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value=None):
            response = client.get(f'/api/parental-consent/status/{CHILD_ID}')

        assert response.status_code == 404
        assert 'guardian@example.com' not in response.get_data(as_text=True)

    def test_unrelated_signed_in_caller_gets_404(self, client):
        """A logged-in stranger is still a stranger. The 404 is deliberately
        the same answer an unknown UUID gets, so the endpoint cannot confirm
        that a given id belongs to a real child."""
        admin = _admin({'requires_parental_consent': True,
                        'parental_consent_verified': False,
                        'parental_consent_verified_at': None})
        with patch('routes.parental_consent.requests.get_supabase_admin_client',
                   return_value=admin), \
             patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value=STRANGER_ID), \
             patch('routes.parental_consent.requests._may_read_consent_status',
                   return_value=False):
            response = client.get(f'/api/parental-consent/status/{CHILD_ID}')

        assert response.status_code == 404
        assert response.get_json()['error'] == 'Consent status not found'

    def test_malformed_id_is_a_clean_404(self, client):
        with patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value=None):
            response = client.get('/api/parental-consent/status/not-a-uuid')
        assert response.status_code == 404

    def test_entitled_caller_gets_status_but_never_the_email(self, client):
        admin = _admin({
            'requires_parental_consent': True,
            'parental_consent_verified': True,
            'parental_consent_verified_at': '2026-08-01T00:00:00+00:00',
        })
        with patch('routes.parental_consent.requests.get_supabase_admin_client',
                   return_value=admin), \
             patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value=CHILD_ID):
            response = client.get(f'/api/parental-consent/status/{CHILD_ID}')

        assert response.status_code == 200
        body = response.get_json()
        assert body['consent_verified'] is True
        assert 'parent_email' not in body, 'the guardian address must not be returned'

    def test_self_is_entitled_and_a_stranger_is_not(self):
        from routes.parental_consent.requests import _may_read_consent_status

        assert _may_read_consent_status(CHILD_ID, CHILD_ID) is True
        assert _may_read_consent_status(None, CHILD_ID) is False

    def test_authorization_failure_fails_closed(self):
        """If the relationship lookup raises, the answer is no."""
        from routes.parental_consent.requests import _may_read_consent_status

        with patch('utils.portfolio_access._fetch_user', side_effect=RuntimeError('db down')):
            assert _may_read_consent_status(STRANGER_ID, CHILD_ID) is False


@pytest.mark.unit
class TestConsentSendBindsToTheRecord:
    def _send(self, client, admin, body):
        with patch('routes.parental_consent.requests.get_supabase_admin_client',
                   return_value=admin), \
             patch('services.email_service.email_service.send_parental_consent_email',
                   return_value=True) as send:
            response = client.post('/api/parental-consent/send', json=body)
        return response, send

    def test_attacker_supplied_address_is_ignored_when_one_is_on_file(self, client):
        admin = _admin({
            'id': CHILD_ID,
            'first_name': 'Ada',
            'last_name': 'Byron',
            'email': 'ada@example.com',
            'requires_parental_consent': True,
            'parental_consent_email': 'realparent@example.com',
        })
        response, send = self._send(client, admin, {
            'user_id': CHILD_ID,
            'parent_email': 'attacker@evil.example',
            'child_email': 'ada@example.com',
        })

        assert response.status_code == 200
        assert send.call_count == 1
        assert send.call_args.kwargs['parent_email'] == 'realparent@example.com'
        assert 'attacker@evil.example' not in response.get_data(as_text=True)

    def test_response_masks_the_guardian_address(self, client):
        admin = _admin({
            'id': CHILD_ID, 'first_name': 'Ada', 'email': 'ada@example.com',
            'requires_parental_consent': True,
            'parental_consent_email': 'realparent@example.com',
        })
        response, _ = self._send(client, admin, {
            'user_id': CHILD_ID,
            'parent_email': 'anything@example.com',
            'child_email': 'ada@example.com',
        })

        body = response.get_json()
        assert 'realparent@example.com' not in response.get_data(as_text=True)
        assert body['parent_email_masked'].endswith('@example.com')
        assert body['parent_email_masked'].startswith('r')

    def test_first_send_requires_the_childs_own_email(self, client):
        """With no address on file the body may establish one -- but only for
        a caller who can name the child's account email, not one holding a
        bare UUID."""
        admin = _admin({
            'id': CHILD_ID, 'first_name': 'Ada', 'email': 'ada@example.com',
            'requires_parental_consent': True,
            'parental_consent_email': None,
        })
        response, send = self._send(client, admin, {
            'user_id': CHILD_ID,
            'parent_email': 'attacker@evil.example',
            'child_email': 'guessed@example.com',
        })

        assert response.status_code == 404
        assert send.call_count == 0, 'a consent email was sent to an attacker address'

    def test_first_send_works_for_a_caller_who_knows_the_child(self, client):
        admin = _admin({
            'id': CHILD_ID, 'first_name': 'Ada', 'email': 'ada@example.com',
            'requires_parental_consent': True,
            'parental_consent_email': None,
        })
        response, send = self._send(client, admin, {
            'user_id': CHILD_ID,
            'parent_email': 'newparent@example.com',
            'child_email': 'ada@example.com',
        })

        assert response.status_code == 200
        assert send.call_args.kwargs['parent_email'] == 'newparent@example.com'


@pytest.mark.unit
class TestConsentResend:
    def test_bare_uuid_is_not_enough_to_trigger_a_resend(self, client):
        admin = _admin({
            'id': CHILD_ID, 'first_name': 'Ada', 'email': 'ada@example.com',
            'parental_consent_email': 'realparent@example.com',
            'requires_parental_consent': True,
            'parental_consent_verified': False,
        })
        with patch('routes.parental_consent.requests.get_supabase_admin_client',
                   return_value=admin), \
             patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value=None), \
             patch('routes.parental_consent.requests._may_read_consent_status',
                   return_value=False), \
             patch('services.email_service.email_service.send_parental_consent_email',
                   return_value=True) as send:
            response = client.post('/api/parental-consent/resend',
                                   json={'user_id': CHILD_ID})

        assert response.status_code == 404
        assert send.call_count == 0

    def test_signed_in_child_may_resend_to_the_address_on_file(self, client):
        admin = _admin({
            'id': CHILD_ID, 'first_name': 'Ada', 'email': 'ada@example.com',
            'parental_consent_email': 'realparent@example.com',
            'requires_parental_consent': True,
            'parental_consent_verified': False,
        })
        with patch('routes.parental_consent.requests.get_supabase_admin_client',
                   return_value=admin), \
             patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value=CHILD_ID), \
             patch('services.email_service.email_service.send_parental_consent_email',
                   return_value=True) as send:
            response = client.post('/api/parental-consent/resend',
                                   json={'user_id': CHILD_ID})

        assert response.status_code == 200
        assert send.call_args.kwargs['parent_email'] == 'realparent@example.com'
        assert 'realparent@example.com' not in response.get_data(as_text=True)


@pytest.mark.unit
def test_mask_email_keeps_the_shape_but_not_the_name():
    from routes.parental_consent.requests import _mask_email

    assert _mask_email('parent@example.com') == 'p****t@example.com'
    assert _mask_email('ab@example.com') == 'a*@example.com'
    assert _mask_email(None) is None
    assert _mask_email('not-an-email') is None
