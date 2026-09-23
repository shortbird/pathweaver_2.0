"""
A family the school registers free (sis_family_directives.no_charge).

fee_prepaid only zeroes the one-time registration fee. Optio Academy has no
one-time fee and bills a monthly plan ($50 per student, a teacher-support
add-on), so a "prepaid" family there was still asked for a card. no_charge
prices the family under a config with no fee and no plan: the payment step
quotes nothing, offers no add-on, asks for no card, and /fee finishes.

The harness is test_registration_prepaid_fee.py's: the payment routes resolve
their helpers from routes.registration_payments, and the directive lookup is
read inside services.registration_funnel_support.
"""

from unittest.mock import patch

import pytest
from flask import Flask


@pytest.fixture
def client():
    from routes import registration_funnel
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(registration_funnel.bp)
    return app.test_client()


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table, admin):
        self.table = table
        self.admin = admin
        self._op = 'select'
        self._payload = None

    def select(self, *a, **k):
        self._op = 'select'; return self

    def insert(self, payload):
        self._op = 'insert'; self._payload = payload; return self

    def update(self, payload):
        self._op = 'update'; self._payload = payload; return self

    def upsert(self, payload, **k):
        self._op = 'upsert'; self._payload = payload; return self

    def eq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def single(self):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if self._op in ('insert', 'upsert'):
            self.admin.inserts.append((self.table, self._payload))
            return _Resp([{**self._payload, 'id': 'new-id'}])
        if self._op == 'update':
            self.admin.updates.append((self.table, self._payload))
            return _Resp([])
        return _Resp(list(self.admin.selects.get(self.table, [])))


class _FakeAdmin:
    def __init__(self, selects=None):
        self.selects = selects or {}
        self.inserts = []
        self.updates = []

    def table(self, name):
        return _Query(name, self)


_PARENT = {'id': 'p1', 'email': 'free@example.com', 'first_name': 'Free'}
# Optio Academy's shape: no one-time fee, a monthly plan with an add-on.
_CFG = {
    'scheduling_url': '',
    'fee_mode': 'flat', 'registration_fee_cents': 0, 'per_student_fee_cents': 0,
    'monthly': {
        'per_student_cents': 5000, 'family_cap_cents': 15000,
        'add_ons': [{'key': 'teacher_support', 'label': 'Optio teacher support',
                     'amount_cents': 50000, 'includes_program_fee': True}],
    },
}
_KIDS = [{'user_id': 'k1', 'first_name': 'Ada', 'add_ons': []},
         {'user_id': 'k2', 'first_name': 'Bo', 'add_ons': []}]
_NO_CHARGE = {'id': 'd1', 'no_charge': True, 'fee_prepaid': False}


def _reg(**over):
    base = {'id': 'reg1', 'status': 'fee', 'fee_cents': 0, 'monthly_cents': 10000,
            'kids': _KIDS, 'access_token': 'tok', 'parent_user_id': 'p1', 'organization_id': 'org1'}
    return {**base, **over}


def _post(client, admin, path, reg, directive, body=None):
    with patch('routes.registration_payments._admin', return_value=admin), \
         patch('routes.registration_payments._load_registration', return_value=reg), \
         patch('routes.registration_payments._org_config', return_value=_CFG), \
         patch('routes.registration_payments._org_stripe_key', return_value='sk_test_school'), \
         patch('routes.registration_payments._org_stripe_enabled', return_value=True), \
         patch('routes.registration_payments._parent_row', return_value=_PARENT), \
         patch('services.registration_funnel_service._parent_row', return_value=_PARENT), \
         patch('services.registration_funnel_service.notify_registration_completed', return_value=True), \
         patch('services.registration_funnel_support._parent_row', return_value=_PARENT), \
         patch('services.registration_funnel_support._family_directive', return_value=directive):
        return client.post(path, json={'access_token': 'tok', **(body or {})})


@pytest.mark.unit
class TestNoChargeFamily:
    def test_fee_status_says_nothing_is_due(self, client):
        admin = _FakeAdmin()
        resp = _post(client, admin, '/api/registration/registrations/reg1/fee-status', _reg(), _NO_CHARGE)
        body = resp.get_json()
        assert resp.status_code == 200
        assert body['no_charge'] is True
        assert body['requires_card'] is False
        assert body['monthly_cents'] == 0
        # No plan means the step draws no plan and offers no add-on.
        assert body['quote']['monthly']['plan'] is None
        assert body['quote']['lines'] == []
        assert body['quote']['due_today_cents'] == 0
        assert any(p.get('monthly_cents') == 0 for t, p in admin.updates if t == 'registrations')

    def test_a_family_not_on_the_list_still_pays_monthly(self, client):
        resp = _post(client, _FakeAdmin(), '/api/registration/registrations/reg1/fee-status', _reg(), None)
        body = resp.get_json()
        assert body['no_charge'] is False
        assert body['requires_card'] is True
        assert body['monthly_cents'] == 10000

    def test_prepaid_alone_does_not_waive_the_monthly_plan(self, client):
        resp = _post(client, _FakeAdmin(), '/api/registration/registrations/reg1/fee-status', _reg(),
                     {'id': 'd1', 'fee_prepaid': True, 'no_charge': False})
        assert resp.get_json()['requires_card'] is True

    def test_finish_completes_without_a_card(self, client):
        admin = _FakeAdmin()
        resp = _post(client, admin, '/api/registration/registrations/reg1/fee', _reg(), _NO_CHARGE,
                     {'add_ons': {'k1': ['teacher_support']}})
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'completed'

    def test_a_ticked_add_on_is_not_priced(self, client):
        resp = _post(client, _FakeAdmin(), '/api/registration/registrations/reg1/quote', _reg(), _NO_CHARGE,
                     {'add_ons': {'k1': ['teacher_support']}})
        quote = resp.get_json()['quote']
        assert quote['due_today_cents'] == 0
        assert quote['lines'] == []

    def test_checkout_never_charges(self, client):
        resp = _post(client, _FakeAdmin(), '/api/registration/registrations/reg1/checkout', _reg(), _NO_CHARGE,
                     {'return_url': 'https://x/return', 'add_ons': {'k1': ['teacher_support']}})
        assert resp.status_code == 400
        assert 'no registration fee' in resp.get_json()['error'].lower()

    def test_a_stored_fee_is_zeroed(self, client):
        admin = _FakeAdmin()
        _post(client, admin, '/api/registration/registrations/reg1/fee-status',
              _reg(fee_cents=12500), _NO_CHARGE)
        assert any(p.get('fee_cents') == 0 for t, p in admin.updates if t == 'registrations')


@pytest.mark.unit
class TestStageDirective:
    def test_no_charge_is_written_when_given(self):
        from services import sis_holds
        admin = _FakeAdmin()
        with patch('services.sis_holds._admin', return_value=admin):
            sis_holds.stage_directive('org1', 'Free@Example.com', no_charge=True)
        _table, row = admin.inserts[0]
        assert row['email'] == 'free@example.com'
        assert row['no_charge'] is True

    def test_callers_that_do_not_know_it_leave_it_alone(self):
        """The prepaid import and the waive-fee route must not turn a free
        family back into a paying one."""
        from services import sis_holds
        admin = _FakeAdmin()
        with patch('services.sis_holds._admin', return_value=admin):
            sis_holds.stage_directive('org1', 'free@example.com', fee_prepaid=True)
        _table, row = admin.inserts[0]
        assert 'no_charge' not in row
