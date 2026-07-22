"""
Regression tests for double-checkout payment verification (Keely Pogue,
2026-07-22).

A parent clicked Pay twice ~46s apart: paid the FIRST Checkout Session, but
the second create_checkout overwrote stripe_session_id — so /confirm-payment
retrieved the unpaid second session forever and a completed $125 payment
looked missing.

confirm_payment must find a paid session among:
  1. the current stripe_session_id,
  2. the stripe_session_ids history,
  3. a metadata.registration_id sweep of the school's recent Stripe sessions
     (rescues registrations from before the history column existed).
"""

import sys
import types
from unittest.mock import patch

import pytest
from flask import Flask

REG_ID = 'reg-1'
SECRET = 'rk_live_test'

BASE_REG = {
    'id': REG_ID,
    'organization_id': 'org-1',
    'parent_user_id': 'parent-1',
    'access_token': 'funnel-token',
    'status': 'fee',
    'fee_cents': 12500,
    'created_at': '2026-07-21T22:43:22+00:00',
}


def _session(sid, paid, reg_id=REG_ID, amount=12500):
    return {'id': sid, 'metadata': {'registration_id': reg_id},
            'payment_status': 'paid' if paid else 'unpaid',
            'amount_total': amount, 'payment_intent': f'pi_{sid}'}


class FakeStripe:
    """Minimal stripe module: sessions dict + a listing for the fallback."""

    def __init__(self, sessions, listing=None):
        mod = types.ModuleType('stripe')
        checkout = types.SimpleNamespace()

        class Session:
            @staticmethod
            def retrieve(sid, api_key=None):
                assert api_key == SECRET
                if sid not in sessions:
                    raise Exception(f'No such session: {sid}')
                return sessions[sid]

            @staticmethod
            def list(**params):
                assert params.get('api_key') == SECRET
                return {'data': listing or [], 'has_more': False}

        checkout.Session = Session
        mod.checkout = checkout
        self.mod = mod


@pytest.fixture
def client():
    from routes import icreate_registration
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(icreate_registration.bp)
    return app.test_client()


def _confirm(client, reg, stripe_fake, finish_result=None):
    finish_result = finish_result or {'success': True, 'status': 'completed'}
    with patch.dict(sys.modules, {'stripe': stripe_fake.mod}), \
         patch('routes.icreate_registration._load_registration', return_value=reg), \
         patch('routes.icreate_registration._admin'), \
         patch('routes.icreate_registration._org_config',
               return_value={'stripe_secret_key': SECRET}), \
         patch('routes.icreate_registration._finish_fee_step',
               return_value=finish_result) as finish:
        res = client.post(f'/api/icreate/registrations/{REG_ID}/confirm-payment',
                          json={'access_token': 'funnel-token'})
    return res, finish


def test_paid_session_in_history_wins_over_unpaid_current(client):
    """THE regression: current session unpaid, an earlier one in the history
    was paid — verification must succeed and record the paid session."""
    reg = {**BASE_REG,
           'stripe_session_id': 'cs_new_unpaid',
           'stripe_session_ids': ['cs_old_paid', 'cs_new_unpaid']}
    stripe_fake = FakeStripe({
        'cs_new_unpaid': _session('cs_new_unpaid', paid=False),
        'cs_old_paid': _session('cs_old_paid', paid=True),
    })
    res, finish = _confirm(client, reg, stripe_fake)
    assert res.status_code == 200
    assert res.get_json()['paid'] is True
    extra = finish.call_args.kwargs.get('extra_fields') or finish.call_args.args[3]
    assert extra['stripe_payment_ref'] == 'pi_cs_old_paid'


def test_stripe_listing_fallback_rescues_pre_history_registrations(client):
    """Keely's exact state: only the unpaid session is stored (history empty),
    but Stripe has a paid session with this registration's metadata."""
    reg = {**BASE_REG, 'stripe_session_id': 'cs_new_unpaid', 'stripe_session_ids': []}
    stripe_fake = FakeStripe(
        {'cs_new_unpaid': _session('cs_new_unpaid', paid=False)},
        listing=[_session('cs_other_reg', paid=True, reg_id='someone-else'),
                 _session('cs_paid_lost', paid=True)],
    )
    res, _ = _confirm(client, reg, stripe_fake)
    assert res.status_code == 200
    assert res.get_json()['paid'] is True


def test_nothing_paid_anywhere_still_402(client):
    reg = {**BASE_REG, 'stripe_session_id': 'cs_unpaid', 'stripe_session_ids': ['cs_unpaid']}
    stripe_fake = FakeStripe({'cs_unpaid': _session('cs_unpaid', paid=False)},
                             listing=[])
    res, finish = _confirm(client, reg, stripe_fake)
    assert res.status_code == 402
    assert res.get_json()['paid'] is False
    finish.assert_not_called()


def test_amount_mismatch_still_blocks(client):
    reg = {**BASE_REG, 'stripe_session_id': 'cs_paid_wrong_amount', 'stripe_session_ids': []}
    stripe_fake = FakeStripe(
        {'cs_paid_wrong_amount': _session('cs_paid_wrong_amount', paid=True, amount=50)})
    res, finish = _confirm(client, reg, stripe_fake)
    assert res.status_code == 400
    finish.assert_not_called()


def test_wrong_registration_metadata_never_verifies(client):
    """A paid session for a DIFFERENT registration must not complete this one."""
    reg = {**BASE_REG, 'stripe_session_id': 'cs_foreign', 'stripe_session_ids': []}
    stripe_fake = FakeStripe(
        {'cs_foreign': _session('cs_foreign', paid=True, reg_id='someone-else')},
        listing=[])
    res, finish = _confirm(client, reg, stripe_fake)
    assert res.status_code == 402
    finish.assert_not_called()
