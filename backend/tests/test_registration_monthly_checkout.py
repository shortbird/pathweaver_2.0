"""
The payment step for an org on a monthly plan (Optio Academy, 2026-09-14).

Optio Academy has no registration fee. The last funnel step sets up $50 per
student per month (capped at $150 per family), with an Optio teacher as a
$500/month per-student add-on that includes the program fee. These pin the
three endpoints that carry the money through Stripe:

  /checkout          subscription mode, one recurring line per plan item, the
                     add-ons ticked in the request stored on the kids BEFORE
                     the session exists
  /confirm-payment   amount_total must equal fee + first month; the
                     subscription id is recorded
  /fee-status, /fee  a monthly total requires the card exactly like a fee does
"""

import sys
import types
from unittest.mock import patch

import pytest
from flask import Flask

SECRET = 'rk_live_test'
ORG = 'org-academy'
REG_ID = 'reg-1'
TEACHER = {
    'key': 'teacher_support', 'label': 'Optio teacher support',
    'description': 'A weekly meeting with an Optio teacher.',
    'amount_cents': 50000, 'includes_program_fee': True,
}
ACADEMY_CFG = {
    'fee_mode': 'flat', 'registration_fee_cents': 0, 'per_student_fee_cents': 0,
    'monthly': {'per_student_cents': 5000, 'family_cap_cents': 15000, 'add_ons': [TEACHER]},
}
KIDS = [
    {'user_id': 'kid-1', 'first_name': 'Casey', 'name': 'Casey Sample', 'add_ons': []},
    {'user_id': 'kid-2', 'first_name': 'Riley', 'name': 'Riley Sample', 'add_ons': []},
]


def _reg(**over):
    base = {'id': REG_ID, 'organization_id': ORG, 'parent_user_id': 'parent-1',
            'access_token': 'tok', 'status': 'fee', 'fee_cents': 0, 'monthly_cents': 10000,
            'kids': [dict(k) for k in KIDS], 'stripe_session_ids': [],
            'created_at': '2026-09-14T10:00:00+00:00'}
    return {**base, **over}


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

    def limit(self, *a, **k):
        return self

    def execute(self):
        if self._op == 'update':
            self.admin.updates.append((self.table, self._payload))
            return _Resp([])
        return _Resp(self.admin.selects.get(self.table, {}))


class _FakeAdmin:
    def __init__(self, selects=None):
        self.selects = selects or {'organizations': {'name': 'Optio Academy'}}
        self.updates = []

    def table(self, name):
        return _Query(name, self)


class FakeStripe:
    """stripe.checkout.Session with create() captured and retrieve() canned."""

    def __init__(self, sessions=None):
        self.created = []
        mod = types.ModuleType('stripe')
        checkout = types.SimpleNamespace()
        created = self.created

        class Session:
            @staticmethod
            def create(**kwargs):
                created.append(kwargs)
                return types.SimpleNamespace(id='cs_new', url='https://checkout.stripe.test/cs_new')

            @staticmethod
            def retrieve(sid, api_key=None):
                if sid not in (sessions or {}):
                    raise Exception(f'No such session: {sid}')
                return sessions[sid]

            @staticmethod
            def list(**params):
                return {'data': [], 'has_more': False}

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


def _post(client, path, reg, admin, stripe_fake, body=None, cfg=ACADEMY_CFG, stripe_on=True):
    parent = {'id': 'parent-1', 'email': 'parent@example.com', 'first_name': 'Pat'}
    with patch.dict(sys.modules, {'stripe': stripe_fake.mod}), \
         patch('routes.registration_payments._admin', return_value=admin), \
         patch('routes.registration_payments._load_registration', return_value=reg), \
         patch('routes.registration_payments._org_config', return_value=cfg), \
         patch('routes.registration_payments._org_stripe_key', return_value=SECRET if stripe_on else None), \
         patch('routes.registration_payments._org_stripe_enabled', return_value=stripe_on), \
         patch('routes.registration_payments._parent_row', return_value=parent), \
         patch('services.registration_funnel_service._parent_row', return_value=parent), \
         patch('services.registration_funnel_support._parent_row', return_value=parent), \
         patch('services.registration_funnel_support._family_directive', return_value=None), \
         patch('routes.registration_payments._finish_fee_step',
               return_value={'success': True, 'status': 'completed'}) as finish:
        res = client.post(path, json={'access_token': 'tok', **(body or {})})
    return res, finish


def _reg_updates(admin):
    return [p for t, p in admin.updates if t == 'registrations']


CHECKOUT = f'/api/registration/registrations/{REG_ID}/checkout'
CONFIRM = f'/api/registration/registrations/{REG_ID}/confirm-payment'
STATUS = f'/api/registration/registrations/{REG_ID}/fee-status'
FEE = f'/api/registration/registrations/{REG_ID}/fee'


@pytest.mark.unit
class TestCheckout:
    def test_monthly_plan_opens_a_subscription(self, client):
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        res, _ = _post(client, CHECKOUT, _reg(), admin, stripe_fake,
                       body={'return_url': 'https://app.test/enroll/X'})
        assert res.status_code == 200, res.get_json()
        (call,) = stripe_fake.created
        assert call['mode'] == 'subscription'
        assert call['api_key'] == SECRET
        assert call['subscription_data']['metadata']['registration_id'] == REG_ID
        names = [li['price_data']['product_data']['name'] for li in call['line_items']]
        assert names == ['Optio Academy monthly program fee (2 students)']
        assert call['line_items'][0]['price_data']['recurring'] == {'interval': 'month'}
        assert call['line_items'][0]['price_data']['unit_amount'] == 10000

    def test_ticked_teacher_is_stored_and_priced_before_the_session(self, client):
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        res, _ = _post(client, CHECKOUT, _reg(), admin, stripe_fake,
                       body={'return_url': 'https://app.test/enroll/X',
                             'add_ons': {'kid-1': ['teacher_support']}})
        assert res.status_code == 200, res.get_json()
        # Stored on the kid, and the month re-priced: $500 (teacher, includes
        # Casey's fee) + $50 (Riley) -- never $550 + $50.
        stored = [u for u in _reg_updates(admin) if 'kids' in u]
        assert stored, 'add-on selection was not persisted'
        assert stored[0]['kids'][0]['add_ons'] == ['teacher_support']
        assert stored[0]['kids'][1]['add_ons'] == []
        assert stored[0]['monthly_cents'] == 55000
        (call,) = stripe_fake.created
        lines = {li['price_data']['product_data']['name']: li['price_data']['unit_amount']
                 for li in call['line_items']}
        assert lines == {'Optio Academy monthly program fee (1 student)': 5000,
                         'Optio teacher support (Casey)': 50000}

    def test_unoffered_add_on_is_ignored(self, client):
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        res, _ = _post(client, CHECKOUT, _reg(), admin, stripe_fake,
                       body={'return_url': 'https://app.test/enroll/X',
                             'add_ons': {'kid-1': ['pony']}})
        assert res.status_code == 200
        assert stripe_fake.created[0]['line_items'][0]['price_data']['unit_amount'] == 10000

    def test_one_time_fee_rides_on_the_first_invoice(self, client):
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        cfg = {**ACADEMY_CFG, 'registration_fee_cents': 2500}
        res, _ = _post(client, CHECKOUT, _reg(fee_cents=2500), admin, stripe_fake,
                       body={'return_url': 'https://app.test/enroll/X'}, cfg=cfg)
        assert res.status_code == 200
        (call,) = stripe_fake.created
        assert call['mode'] == 'subscription'
        one_time = [li for li in call['line_items'] if 'recurring' not in li['price_data']]
        assert len(one_time) == 1 and one_time[0]['price_data']['unit_amount'] == 2500

    def test_deferred_fee_stays_off_the_first_invoice(self, client):
        # Legacy all-waitlisted family: the registration fee is not due until a
        # release, but the month is. Only the recurring lines go to Stripe, and
        # /confirm-payment expects the month alone.
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        cfg = {**ACADEMY_CFG, 'registration_fee_cents': 2500}
        res, _ = _post(client, CHECKOUT, _reg(fee_cents=2500, fee_deferred=True), admin, stripe_fake,
                       body={'return_url': 'https://app.test/enroll/X'}, cfg=cfg)
        assert res.status_code == 200
        (call,) = stripe_fake.created
        assert all('recurring' in li['price_data'] for li in call['line_items'])
        from routes.registration_payments import _amount_due_cents
        assert _amount_due_cents(_reg(fee_cents=2500, fee_deferred=True)) == 10000

    def test_fee_only_org_is_still_a_one_time_payment(self, client):
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        cfg = {'fee_mode': 'flat', 'registration_fee_cents': 2500}
        res, _ = _post(client, CHECKOUT, _reg(fee_cents=2500, monthly_cents=0), admin, stripe_fake,
                       body={'return_url': 'https://app.test/enroll/X'}, cfg=cfg)
        assert res.status_code == 200
        (call,) = stripe_fake.created
        assert call['mode'] == 'payment'
        assert 'subscription_data' not in call
        assert [li['price_data']['unit_amount'] for li in call['line_items']] == [2500]

    def test_nothing_due_refuses(self, client):
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        res, _ = _post(client, CHECKOUT, _reg(monthly_cents=0, kids=[]), admin, stripe_fake,
                       body={'return_url': 'https://app.test/enroll/X'},
                       cfg={'fee_mode': 'flat', 'registration_fee_cents': 0})
        assert res.status_code == 400
        assert not stripe_fake.created


@pytest.mark.unit
class TestConfirmPayment:
    def test_first_month_verifies_and_records_the_subscription(self, client):
        session = {'id': 'cs_paid', 'metadata': {'registration_id': REG_ID},
                   'payment_status': 'paid', 'amount_total': 55000,
                   'payment_intent': None, 'subscription': 'sub_123', 'customer': 'cus_123'}
        admin, stripe_fake = _FakeAdmin(), FakeStripe({'cs_paid': session})
        reg = _reg(monthly_cents=55000, stripe_session_id='cs_paid', stripe_session_ids=['cs_paid'],
                   kids=[{**KIDS[0], 'add_ons': ['teacher_support']}, KIDS[1]])
        res, finish = _post(client, CONFIRM, reg, admin, stripe_fake)
        assert res.status_code == 200, res.get_json()
        extra = finish.call_args.kwargs['extra_fields']
        assert extra['stripe_subscription_id'] == 'sub_123'
        assert extra['stripe_customer_id'] == 'cus_123'
        assert extra['stripe_payment_ref'] == 'sub_123'

    def test_amount_must_be_fee_plus_first_month(self, client):
        session = {'id': 'cs_paid', 'metadata': {'registration_id': REG_ID},
                   'payment_status': 'paid', 'amount_total': 10000,
                   'payment_intent': 'pi_1', 'subscription': 'sub_123'}
        admin, stripe_fake = _FakeAdmin(), FakeStripe({'cs_paid': session})
        # $25 fee + $100 month = $125 expected; Stripe says $100.
        reg = _reg(fee_cents=2500, monthly_cents=10000,
                   stripe_session_id='cs_paid', stripe_session_ids=['cs_paid'])
        res, finish = _post(client, CONFIRM, reg, admin, stripe_fake)
        assert res.status_code == 400
        assert not finish.called


@pytest.mark.unit
class TestFeeStatusAndRecordFee:
    def test_monthly_total_requires_the_card(self, client):
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        res, _ = _post(client, STATUS, _reg(), admin, stripe_fake)
        body = res.get_json()
        assert body['requires_card'] is True
        assert body['fee_cents'] == 0
        assert body['monthly_cents'] == 10000
        assert [k['user_id'] for k in body['kids']] == ['kid-1', 'kid-2']

    def test_fee_status_reprices_a_stale_month(self, client):
        # Stored at $100 by the family step; a kid has since chosen a teacher.
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        reg = _reg(monthly_cents=10000, kids=[{**KIDS[0], 'add_ons': ['teacher_support']}, KIDS[1]])
        res, _ = _post(client, STATUS, reg, admin, stripe_fake)
        assert res.get_json()['monthly_cents'] == 55000
        assert res.get_json()['kids'][0]['add_ons'] == ['teacher_support']

    def test_record_fee_refuses_while_a_month_is_due(self, client):
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        res, finish = _post(client, FEE, _reg(), admin, stripe_fake)
        assert res.status_code == 402
        assert res.get_json()['monthly_cents'] == 10000
        assert not finish.called

    def test_record_fee_keeps_the_choice_for_a_no_card_school(self, client):
        # No Stripe key: the school collects the money itself, and needs to
        # know who wanted a teacher.
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        res, finish = _post(client, FEE, _reg(), admin, stripe_fake,
                            body={'add_ons': {'kid-2': ['teacher_support']}}, stripe_on=False)
        assert res.status_code == 200
        assert finish.called
        stored = [u for u in _reg_updates(admin) if 'kids' in u]
        assert stored[0]['kids'][1]['add_ons'] == ['teacher_support']
        assert stored[0]['monthly_cents'] == 55000

    def test_plan_switched_off_zeroes_the_month(self, client):
        admin, stripe_fake = _FakeAdmin(), FakeStripe()
        res, _ = _post(client, STATUS, _reg(), admin, stripe_fake,
                       cfg={'fee_mode': 'flat', 'registration_fee_cents': 0})
        body = res.get_json()
        assert body['monthly_cents'] == 0
        assert body['requires_card'] is False
