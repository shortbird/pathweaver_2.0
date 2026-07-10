"""
Regression test for the late-staged prepaid-fee dead end.

The family step zeroes the registration fee when a sis_family_directives row
with fee_prepaid=true already exists for the parent's email. But the school
imports its legacy prepaid list on its own schedule — when the directive lands
AFTER a family already ran the family step, their registration keeps
fee_cents > 0. With Stripe configured, /fee then refuses forever with
"Please pay the registration fee by card to finish" and the UI only offers the
card button: the family is stuck (Rachelle Hyer, 2026-07-10).

_apply_prepaid_directive re-checks the directive at resume/fee/checkout time:
  - /registrations/<id>/fee    -> prepaid family completes without a card
  - /registrations/<id>/checkout -> a prepaid family is never card-charged
"""

from unittest.mock import patch

import pytest
from flask import Flask


@pytest.fixture
def client():
    """Minimal app with only the iCreate blueprint (avoids importing app.py,
    which pulls in optional Swagger deps not needed for this route)."""
    from routes import icreate_registration
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(icreate_registration.bp)
    return app.test_client()


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    """Minimal fluent stand-in for a supabase-py table query."""

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

    def execute(self):
        if self._op == 'insert':
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


_PARENT = {'id': 'p1', 'email': 'prepaid@example.com', 'first_name': 'Rachelle'}
_CFG = {'stripe_secret_key': 'sk_test_school', 'scheduling_url': ''}


def _reg(**over):
    base = {'id': 'reg1', 'status': 'fee', 'fee_cents': 12500, 'access_token': 'tok',
            'parent_user_id': 'p1', 'organization_id': 'org1'}
    return {**base, **over}


def _call(client, admin, path, reg, directive):
    with patch('routes.icreate_registration._admin', return_value=admin), \
         patch('routes.icreate_registration._load_registration', return_value=reg), \
         patch('routes.icreate_registration._org_config', return_value=_CFG), \
         patch('routes.icreate_registration._parent_row', return_value=_PARENT), \
         patch('routes.icreate_registration._family_directive', return_value=directive):
        return client.post(path, json={'access_token': 'tok'})


def _fee_updates(admin):
    return [p for t, p in admin.updates if t == 'icreate_registrations' and 'fee_cents' in p]


@pytest.mark.unit
class TestPrepaidDirectiveFee:
    def test_without_directive_card_is_still_required(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, '/api/icreate/registrations/reg1/fee', _reg(), None)
        assert resp.status_code == 402
        assert 'card' in resp.get_json()['error'].lower()
        assert not _fee_updates(admin)

    def test_prepaid_directive_completes_without_card(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, '/api/icreate/registrations/reg1/fee',
                     _reg(), {'fee_prepaid': True})
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'completed'
        # The stored fee was zeroed so resume/UI agree nothing is owed.
        assert any(p['fee_cents'] == 0 for p in _fee_updates(admin))

    def test_directive_without_prepaid_flag_changes_nothing(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, '/api/icreate/registrations/reg1/fee',
                     _reg(), {'fee_prepaid': False, 'registration_hold': True})
        assert resp.status_code == 402
        assert not _fee_updates(admin)

    def test_checkout_refuses_to_charge_a_prepaid_family(self, client):
        admin = _FakeAdmin()
        with patch('routes.icreate_registration._admin', return_value=admin), \
             patch('routes.icreate_registration._load_registration', return_value=_reg()), \
             patch('routes.icreate_registration._org_config', return_value=_CFG), \
             patch('routes.icreate_registration._parent_row', return_value=_PARENT), \
             patch('routes.icreate_registration._family_directive',
                   return_value={'fee_prepaid': True}):
            resp = client.post('/api/icreate/registrations/reg1/checkout',
                               json={'access_token': 'tok', 'return_url': 'https://x/return'})
        assert resp.status_code == 400
        assert 'no registration fee' in resp.get_json()['error'].lower()
        assert any(p['fee_cents'] == 0 for p in _fee_updates(admin))


@pytest.mark.unit
class TestApplyPrepaidDirectiveHelper:
    def test_completed_and_zero_fee_rows_are_untouched(self):
        from routes.icreate_registration import _apply_prepaid_directive
        admin = _FakeAdmin()
        done = {'id': 'r', 'status': 'completed', 'fee_cents': 12500}
        free = {'id': 'r', 'status': 'fee', 'fee_cents': 0}
        assert _apply_prepaid_directive(admin, done) is done
        assert _apply_prepaid_directive(admin, free) is free
        assert not admin.updates
