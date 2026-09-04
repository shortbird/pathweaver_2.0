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

# QB-04 (2026-09-03): the payment steps moved to routes/registration_payments.py.
# They stay on the `registration` blueprint, so the URLs and endpoint names are
# unchanged, but the handlers now resolve their helpers from THAT module -- so
# that is where the patches have to land. _family_directive is the exception: it
# is read inside services/registration_funnel_support._apply_prepaid_directive,
# which is why it is patched there instead.

import sys
import types
from unittest.mock import patch

import pytest
from flask import Flask

REG_ID = 'reg-1'
SECRET = 'rk_live_test'
PARENT_EMAIL = 'makenzie@example.com'

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


def _session_no_meta(sid, paid=True, amount=12500, email=None):
    """A pre-2026-07-22 session: no registration_id in metadata. Optionally
    carries the customer's email (Stripe sets customer_details.email)."""
    s = {'id': sid, 'metadata': {},
         'payment_status': 'paid' if paid else 'unpaid',
         'amount_total': amount, 'payment_intent': f'pi_{sid}'}
    if email is not None:
        s['customer_details'] = {'email': email}
    return s


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
    from routes import registration_funnel
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(registration_funnel.bp)
    return app.test_client()


def _confirm(client, reg, stripe_fake, finish_result=None):
    finish_result = finish_result or {'success': True, 'status': 'completed'}
    with patch.dict(sys.modules, {'stripe': stripe_fake.mod}), \
         patch('routes.registration_payments._load_registration', return_value=reg), \
         patch('routes.registration_payments._admin'), \
         patch('routes.registration_payments._parent_row',
               return_value={'email': PARENT_EMAIL}), \
         patch('services.registration_funnel_service._parent_row',
               return_value={'email': PARENT_EMAIL}), \
         patch('routes.registration_payments._org_config', return_value={}), \
         patch('routes.registration_payments._org_stripe_key', return_value=SECRET), \
         patch('routes.registration_payments._org_stripe_enabled', return_value=True), \
         patch('routes.registration_payments._finish_fee_step',
               return_value=finish_result) as finish:
        res = client.post(f'/api/registration/registrations/{REG_ID}/confirm-payment',
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


# ── Pre-metadata (2026-07-12 MaKenzie Candland) rescue ───────────────────────

def test_paid_metadata_less_session_in_history_is_accepted(client):
    """Sessions created before 2026-07-22 carry no registration_id metadata. One
    we recorded in THIS registration's history is ours by construction, so a paid
    one must verify even without metadata."""
    reg = {**BASE_REG, 'stripe_session_id': 'cs_new_unpaid',
           'stripe_session_ids': ['cs_old_paid_nometa', 'cs_new_unpaid']}
    stripe_fake = FakeStripe({
        'cs_new_unpaid': _session('cs_new_unpaid', paid=False),
        'cs_old_paid_nometa': _session_no_meta('cs_old_paid_nometa', paid=True),
    })
    res, finish = _confirm(client, reg, stripe_fake)
    assert res.status_code == 200
    assert res.get_json()['paid'] is True
    extra = finish.call_args.kwargs.get('extra_fields') or finish.call_args.args[3]
    assert extra['stripe_payment_ref'] == 'pi_cs_old_paid_nometa'


def test_pre_metadata_session_rescued_by_email_and_amount_in_sweep(client):
    """MaKenzie Candland's systemic case: the paid session has no registration_id
    metadata and isn't in the stored history, but carries the family's email and
    the exact fee amount — the sweep must rescue it."""
    reg = {**BASE_REG, 'stripe_session_id': 'cs_new_unpaid', 'stripe_session_ids': []}
    stripe_fake = FakeStripe(
        {'cs_new_unpaid': _session('cs_new_unpaid', paid=False)},
        listing=[_session_no_meta('cs_paid_orphan', paid=True, email=PARENT_EMAIL)],
    )
    res, _ = _confirm(client, reg, stripe_fake)
    assert res.status_code == 200
    assert res.get_json()['paid'] is True


def test_metadata_less_session_wrong_email_not_matched(client):
    """A metadata-less paid session for a DIFFERENT family (wrong email) must not
    complete this registration."""
    reg = {**BASE_REG, 'stripe_session_id': 'cs_new_unpaid', 'stripe_session_ids': []}
    stripe_fake = FakeStripe(
        {'cs_new_unpaid': _session('cs_new_unpaid', paid=False)},
        listing=[_session_no_meta('cs_other_family', paid=True,
                                  email='someone-else@example.com')],
    )
    res, finish = _confirm(client, reg, stripe_fake)
    assert res.status_code == 402
    finish.assert_not_called()


def test_metadata_less_session_right_email_wrong_amount_not_matched(client):
    """Email matches but amount doesn't — the email fallback must require the
    exact fee, so this stays unverified."""
    reg = {**BASE_REG, 'stripe_session_id': 'cs_new_unpaid', 'stripe_session_ids': []}
    stripe_fake = FakeStripe(
        {'cs_new_unpaid': _session('cs_new_unpaid', paid=False)},
        listing=[_session_no_meta('cs_wrong_amt', paid=True, amount=5000,
                                  email=PARENT_EMAIL)],
    )
    res, finish = _confirm(client, reg, stripe_fake)
    assert res.status_code == 402
    finish.assert_not_called()
