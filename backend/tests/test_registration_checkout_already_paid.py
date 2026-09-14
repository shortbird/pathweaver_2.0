"""
/checkout refuses to open a second Stripe session once one of ours is paid
(Sadie Davis, 2026-09-10).

The parent returned from Stripe to /enroll/resume, where the web funnel's
return handler never ran, so the fee step showed "Pay $125" again. She paid
three Checkout Sessions in ninety seconds; Jacob Zonts paid two on 2026-08-28
the same way. The client fix makes /enroll/resume verify on return; THIS is
the server-side guard that holds for any client path: a registration whose
recorded sessions include a paid one gets 409 + already_paid, and the client
runs /confirm-payment instead of a new checkout.
"""

import sys
import types
from unittest.mock import patch

import pytest
from flask import Flask

SECRET = 'rk_live_test'
REG_ID = 'reg-1'
CHECKOUT = f'/api/registration/registrations/{REG_ID}/checkout'
CFG = {'fee_mode': 'flat', 'registration_fee_cents': 12500, 'per_student_fee_cents': 0}


def _reg(**over):
    base = {'id': REG_ID, 'organization_id': 'org-1', 'parent_user_id': 'parent-1',
            'access_token': 'tok', 'status': 'fee', 'fee_cents': 12500, 'monthly_cents': 0,
            'kids': [], 'stripe_session_id': None, 'stripe_session_ids': [],
            'created_at': '2026-09-10T20:23:41+00:00'}
    return {**base, **over}


def _session(sid, paid, reg_id=REG_ID):
    return {'id': sid, 'metadata': {'registration_id': reg_id},
            'payment_status': 'paid' if paid else 'unpaid',
            'amount_total': 12500, 'payment_intent': f'pi_{sid}'}


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table, admin):
        self.table, self.admin, self._payload, self._op = table, admin, None, 'select'

    def select(self, *a, **k):
        self._op = 'select'; return self

    def update(self, payload):
        self._op = 'update'; self._payload = payload; return self

    def eq(self, *a, **k):
        return self

    def single(self):
        return self

    def execute(self):
        if self._op == 'update':
            self.admin.updates.append((self.table, self._payload))
            return _Resp([])
        return _Resp({'name': 'iCreate'})


class _FakeAdmin:
    def __init__(self):
        self.updates = []

    def table(self, name):
        return _Query(name, self)


class FakeStripe:
    def __init__(self, sessions=None, retrieve_raises=False):
        self.created = []
        self.retrieved = []
        mod = types.ModuleType('stripe')
        checkout = types.SimpleNamespace()
        created, retrieved = self.created, self.retrieved

        class Session:
            @staticmethod
            def create(**kwargs):
                created.append(kwargs)
                return types.SimpleNamespace(id='cs_new', url='https://checkout.stripe.test/cs_new')

            @staticmethod
            def retrieve(sid, api_key=None):
                retrieved.append(sid)
                if retrieve_raises:
                    raise Exception('stripe is down')
                if sid not in (sessions or {}):
                    raise Exception(f'No such session: {sid}')
                return sessions[sid]

            @staticmethod
            def list(**params):
                raise AssertionError('checkout must not sweep the account')

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


def _checkout(client, reg, stripe_fake):
    admin = _FakeAdmin()
    parent = {'id': 'parent-1', 'email': 'parent@example.com', 'first_name': 'Sadie'}
    with patch.dict(sys.modules, {'stripe': stripe_fake.mod}), \
         patch('routes.registration_payments._admin', return_value=admin), \
         patch('routes.registration_payments._load_registration', return_value=reg), \
         patch('routes.registration_payments._org_config', return_value=CFG), \
         patch('routes.registration_payments._org_stripe_key', return_value=SECRET), \
         patch('routes.registration_payments._org_stripe_enabled', return_value=True), \
         patch('routes.registration_payments._parent_row', return_value=parent), \
         patch('services.registration_funnel_support._family_directive', return_value=None):
        res = client.post(CHECKOUT, json={'access_token': 'tok',
                                          'return_url': 'https://app.test/enroll/resume'})
    return res, admin


@pytest.mark.unit
class TestCheckoutRefusesWhenAlreadyPaid:
    def test_paid_history_session_blocks_a_new_checkout(self, client):
        # The Davis shape: the latest click is unpaid, an earlier one is paid.
        reg = _reg(stripe_session_id='cs_3',
                   stripe_session_ids=['cs_1', 'cs_2', 'cs_3'])
        fake = FakeStripe({'cs_1': _session('cs_1', paid=True),
                           'cs_2': _session('cs_2', paid=False),
                           'cs_3': _session('cs_3', paid=False)})
        res, admin = _checkout(client, reg, fake)
        assert res.status_code == 409, res.get_json()
        assert res.get_json()['already_paid'] is True
        assert fake.created == []
        assert admin.updates == []

    def test_paid_current_session_blocks_a_new_checkout(self, client):
        reg = _reg(stripe_session_id='cs_1', stripe_session_ids=['cs_1'])
        fake = FakeStripe({'cs_1': _session('cs_1', paid=True)})
        res, _ = _checkout(client, reg, fake)
        assert res.status_code == 409
        assert fake.created == []

    def test_unpaid_sessions_still_allow_a_new_checkout(self, client):
        # Pay clicked, Stripe page abandoned, Pay clicked again: legitimate.
        reg = _reg(stripe_session_id='cs_1', stripe_session_ids=['cs_1'])
        fake = FakeStripe({'cs_1': _session('cs_1', paid=False)})
        res, admin = _checkout(client, reg, fake)
        assert res.status_code == 200, res.get_json()
        assert len(fake.created) == 1
        (update,) = [p for t, p in admin.updates if t == 'registrations']
        assert update['stripe_session_ids'] == ['cs_1', 'cs_new']

    def test_first_checkout_does_not_touch_stripe_retrieve(self, client):
        fake = FakeStripe({})
        res, _ = _checkout(client, _reg(), fake)
        assert res.status_code == 200, res.get_json()
        assert fake.retrieved == []

    def test_retrieve_failure_does_not_block_the_checkout(self, client):
        # No evidence of a payment: refusing would strand an unpaid family.
        reg = _reg(stripe_session_id='cs_1', stripe_session_ids=['cs_1'])
        fake = FakeStripe({}, retrieve_raises=True)
        res, _ = _checkout(client, reg, fake)
        assert res.status_code == 200, res.get_json()
        assert len(fake.created) == 1

    def test_paid_session_for_another_registration_is_not_ours(self, client):
        # Defensive: a recorded id whose metadata names a different registration.
        reg = _reg(stripe_session_id='cs_x', stripe_session_ids=['cs_x'])
        fake = FakeStripe({'cs_x': _session('cs_x', paid=True, reg_id='reg-other')})
        res, _ = _checkout(client, reg, fake)
        assert res.status_code == 200, res.get_json()
