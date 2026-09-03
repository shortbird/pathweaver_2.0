"""
Autopay from the emailed invoice link.

Setting up a payment plan used to require a signed-in guardian, which put a
login wall in front of the one action an invoice email asks for. The signed
token now stands in for the login, exactly as it already did for paying the
invoice once.

Open-ended monthly tuition — a set amount charged until it is turned off — is a
different feature and lives in test_sis_recurring_tuition.py.

Stripe and the DB are mocked; what is under test is the token signing, the
guardian resolution a tokenless flow has to do for itself, and route wiring.
"""

from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_pay_links as links


INVOICE_ID = '8ee22671-6e38-473c-a326-90ff86460310'


def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@contextmanager
def staff(role='org_admin', org='org-1'):
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role(role)), \
         patch('services.sis_service.resolve_org_id', return_value=org):
        yield


# ── Autopay link tokens ──────────────────────────────────────────────────────

@pytest.mark.unit
class TestAutopayTokens:
    def test_roundtrip_carries_invoice_and_count(self):
        token = links.make_autopay_token(INVOICE_ID, 10)
        assert links.autopay_from_token(token) == (INVOICE_ID, 10)

    def test_retermed_count_is_rejected(self):
        # The count is signed, so ?months=24 in the URL bar cannot re-term a plan.
        token = links.make_autopay_token(INVOICE_ID, 10)
        assert links.autopay_from_token(token.replace('.10.', '.24.')) == (None, None)

    def test_pay_token_is_not_an_autopay_token(self):
        # Separate namespaces: forwarding "pay this bill" must not also hand over
        # the power to enrol the invoice in a payment plan.
        assert links.autopay_from_token(links.make_token(INVOICE_ID)) == (None, None)

    def test_autopay_token_is_not_a_pay_token(self):
        assert links.invoice_id_from_token(links.make_autopay_token(INVOICE_ID, 10)) is None

    @pytest.mark.parametrize('bad', ['', 'nonsense', 'a.b', f'{INVOICE_ID}.10', 'not-a-uuid.10.abc'])
    def test_malformed_tokens_are_rejected(self, bad):
        assert links.autopay_from_token(bad) == (None, None)


# ── Guardian resolution for a tokenless flow ─────────────────────────────────

@pytest.mark.unit
class TestPayLinkGuardian:
    def _patched(self, candidates, users):
        from services import sis_billing_service as billing
        return (
            patch.object(billing, '_household_primary_contact', return_value='g1'),
            patch.object(billing, '_guardian_emails_for_household', return_value=candidates),
            patch.object(billing, '_users_map', return_value=users),
        )

    def test_prefers_the_primary_contact(self):
        from services import sis_billing_service as billing
        cands = [{'user_id': 'g2', 'email': 'b@x.com', 'name': 'B'},
                 {'user_id': 'g1', 'email': 'a@x.com', 'name': 'A'}]
        users = {'g1': {'id': 'g1'}, 'g2': {'id': 'g2'}}
        a, b, c = self._patched(cands, users)
        with a, b, c:
            assert billing._pay_link_guardian({'household_id': 'hh1'})['user_id'] == 'g1'

    def test_skips_a_dependent_and_falls_through(self):
        # A minor must never become a Stripe Customer. The session flow refuses
        # it explicitly; the token flow has no signed-in user to check, so it
        # filters here instead.
        from services import sis_billing_service as billing
        cands = [{'user_id': 'g1', 'email': 'kid@x.com', 'name': 'Kid'},
                 {'user_id': 'g2', 'email': 'mom@x.com', 'name': 'Mom'}]
        users = {'g1': {'id': 'g1', 'is_dependent': True}, 'g2': {'id': 'g2'}}
        a, b, c = self._patched(cands, users)
        with a, b, c:
            assert billing._pay_link_guardian({'household_id': 'hh1'})['user_id'] == 'g2'

    def test_none_when_every_candidate_is_a_dependent(self):
        from services import sis_billing_service as billing
        cands = [{'user_id': 'g1', 'email': 'kid@x.com', 'name': 'Kid'}]
        users = {'g1': {'id': 'g1', 'is_dependent': True}}
        a, b, c = self._patched(cands, users)
        with a, b, c:
            assert billing._pay_link_guardian({'household_id': 'hh1'}) is None

    def test_none_without_a_household(self):
        from services import sis_billing_service as billing
        assert billing._pay_link_guardian({'household_id': None}) is None


# ── Autopay routes on the emailed link ───────────────────────────────────────

@pytest.mark.unit
class TestAutopayLinkRoutes:
    def _token(self, count=10):
        return links.make_autopay_token(INVOICE_ID, count)

    def test_invalid_token_redirects_without_saying_why(self, client):
        resp = client.get('/api/sis/pay/autopay/garbage')
        assert resp.status_code == 302
        assert 'autopay=invalid_link' in resp.headers['Location']

    def test_starts_checkout_with_the_signed_count(self, client):
        with patch('services.sis_billing_service.autopay_setup_for_pay_link',
                   return_value={'checkout_url': 'https://stripe.test/s'}) as setup:
            resp = client.get(f'/api/sis/pay/autopay/{self._token(9)}')
        assert resp.status_code == 302
        assert resp.headers['Location'] == 'https://stripe.test/s'
        assert setup.call_args.args[1] == 9

    def test_already_enrolled_is_not_an_error_page(self, client):
        with patch('services.sis_billing_service.autopay_setup_for_pay_link',
                   return_value={'error': 'Automatic payments are already set up',
                                 'reason': 'already'}):
            resp = client.get(f'/api/sis/pay/autopay/{self._token()}')
        assert 'autopay=already' in resp.headers['Location']

    def test_settled_invoice_says_already_paid(self, client):
        with patch('services.sis_billing_service.autopay_setup_for_pay_link',
                   return_value={'error': 'no balance', 'reason': 'settled'}):
            resp = client.get(f'/api/sis/pay/autopay/{self._token()}')
        assert 'autopay=already_paid' in resp.headers['Location']

    def test_return_marks_the_plan_active(self, client):
        with patch('services.sis_billing_service.confirm_autopay_for_pay_link',
                   return_value={'ready': True, 'plan': {'id': 'p1'}}):
            resp = client.get(f'/api/sis/pay/autopay/{self._token()}/return')
        assert 'autopay=active' in resp.headers['Location']

    def test_return_honours_a_cancelled_checkout(self, client):
        with patch('services.sis_billing_service.confirm_autopay_for_pay_link') as confirm:
            resp = client.get(f'/api/sis/pay/autopay/{self._token()}/return?autopay=canceled')
        assert 'autopay=canceled' in resp.headers['Location']
        confirm.assert_not_called()

    def test_return_is_pending_when_the_card_has_not_landed(self, client):
        with patch('services.sis_billing_service.confirm_autopay_for_pay_link',
                   return_value={'ready': False}):
            resp = client.get(f'/api/sis/pay/autopay/{self._token()}/return')
        assert 'autopay=pending' in resp.headers['Location']

    def test_return_never_shows_a_parent_a_stack_trace(self, client):
        with patch('services.sis_billing_service.confirm_autopay_for_pay_link',
                   side_effect=RuntimeError('stripe exploded')):
            resp = client.get(f'/api/sis/pay/autopay/{self._token()}/return')
        assert resp.status_code == 302
        assert 'autopay=pending' in resp.headers['Location']
