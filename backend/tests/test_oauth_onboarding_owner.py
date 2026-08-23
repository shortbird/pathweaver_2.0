"""
Onboarding a new Google/Apple signup has exactly one owner.

Eligible signups enter Brevo's New Account Welcome automation and that sequence
welcomes them; sending the transactional "Welcome to Optio!" as well would greet
them twice inside an hour. Everyone the automation doesn't take — promo-code
roles, under-13, or any signup where the Brevo sync failed — still gets the
transactional email. Nobody gets two, nobody gets none.

Also pins the account-linking payload: `users` has no `auth_provider` column, and
writing one (twice, since the fallback repeated it) made first-time Google/Apple
sign-in on an existing email 500.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

ACCEPT_TOS_URL = '/api/auth/google/accept-tos'
USER_ID = '11111111-1111-1111-1111-111111111111'


class _FakeTable:
    """Records every update payload; answers selects with the seeded row."""

    def __init__(self, store):
        self.store = store
        self._payload = None
        self._single = False

    def select(self, *args, **kwargs):
        return self

    def update(self, payload):
        self._payload = payload
        self.store['updates'].append(payload)
        return self

    def eq(self, *args, **kwargs):
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        if self._payload is not None:
            # The welcome claim reports the rows it actually modified.
            if 'welcome_email_sent' in self._payload:
                return SimpleNamespace(data=self.store['claim_rows'])
            return SimpleNamespace(data=[self.store['row']])
        row = self.store['row']
        return SimpleNamespace(data=row if self._single else [row])


def _admin_client(store):
    client = MagicMock()
    client.table.side_effect = lambda name: _FakeTable(store)
    return client


def _accept_tos(client, row=None, claim_won=True, crm_funnel=None, send_succeeds=True):
    """POST the TOS acceptance and return (email_service, update payloads)."""
    store = {
        'row': row or {'id': USER_ID, 'email': 'new@example.com',
                       'first_name': 'Ada', 'role': 'student'},
        'claim_rows': [{'id': USER_ID}] if claim_won else [],
        'updates': [],
    }
    email_service = MagicMock()
    email_service.send_welcome_email.return_value = send_succeeds

    with patch('routes.auth.google_oauth.verify_tos_acceptance_token', return_value=USER_ID), \
         patch('routes.auth.google_oauth.get_supabase_admin_client', return_value=_admin_client(store)), \
         patch('routes.auth.google_oauth.attach_relationship_flags'), \
         patch('routes.auth.google_oauth._sync_oauth_signup_to_crm', return_value=crm_funnel), \
         patch('services.email_service.EmailService', return_value=email_service), \
         patch('routes.auth.google_oauth.session_manager.generate_access_token', return_value='at'), \
         patch('routes.auth.google_oauth.session_manager.generate_refresh_token', return_value='rt'), \
         patch('routes.auth.google_oauth.session_manager.set_auth_cookies'):
        response = client.post(ACCEPT_TOS_URL, json={
            'tos_acceptance_token': 'token',
            'accepted_tos': True,
            'accepted_privacy': True,
        })

    assert response.status_code == 200, response.get_data(as_text=True)
    return email_service, store['updates']


@pytest.mark.integration
class TestSingleOnboardingOwner:
    def test_funnelled_signup_gets_no_transactional_welcome(self, client):
        email_service, _ = _accept_tos(client, crm_funnel='New Account Welcome')
        email_service.send_welcome_email.assert_not_called()

    def test_signup_the_automation_skipped_still_gets_welcomed(self, client):
        """Promo-code roles, under-13, or a Brevo outage — the sync returns None
        and the transactional email is the fallback."""
        email_service, _ = _accept_tos(client, crm_funnel=None)
        email_service.send_welcome_email.assert_called_once()
        assert email_service.send_welcome_email.call_args.kwargs['user_email'] == 'new@example.com'

    def test_claim_loser_does_neither(self, client):
        """A concurrent duplicate request must not re-onboard the account."""
        with patch('routes.auth.google_oauth._sync_oauth_signup_to_crm') as sync:
            email_service, _ = _accept_tos(client, claim_won=False)
        sync.assert_not_called()
        email_service.send_welcome_email.assert_not_called()

    def test_already_onboarded_account_is_left_alone(self, client):
        row = {'id': USER_ID, 'email': 'new@example.com', 'role': 'student',
               'welcome_email_sent': True}
        with patch('routes.auth.google_oauth._sync_oauth_signup_to_crm') as sync:
            email_service, _ = _accept_tos(client, row=row)
        sync.assert_not_called()
        email_service.send_welcome_email.assert_not_called()

    def test_failed_transactional_send_releases_the_claim(self, client):
        """So a retry can onboard them instead of leaving them silently unwelcomed."""
        _, updates = _accept_tos(client, crm_funnel=None, send_succeeds=False)
        assert {'welcome_email_sent': False} in updates

    def test_funnelled_signup_keeps_the_claim(self, client):
        """The automation owns them, so nothing should reopen onboarding."""
        _, updates = _accept_tos(client, crm_funnel='New Account Welcome')
        assert {'welcome_email_sent': False} not in updates


@pytest.mark.unit
class TestNoAuthProviderColumn:
    """`users` has no auth_provider column. Writing it raised, and because the
    fallback wrote it again the error escaped — every first-time Google/Apple
    sign-in on an existing email 500'd."""

    def _source(self, path):
        with open(path, encoding='utf-8') as handle:
            return [line for line in handle if 'auth_provider' in line and not line.lstrip().startswith('#')]

    def test_oauth_routes_never_write_auth_provider(self):
        assert self._source('routes/auth/google_oauth.py') == []
        assert self._source('routes/auth/apple_oauth.py') == []
