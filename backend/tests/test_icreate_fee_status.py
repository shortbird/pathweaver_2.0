"""
Fee-decision matrix for the iCreate registration funnel.

The fee step used to render pay-vs-finish from a feeCents the browser cached
earlier in the funnel. When the stored fee was recomputed mid-flight (a prepaid
credit removed, a back-edited family step), the tab kept showing a stale
"$0 — finish" view; clicking Finish hit /fee, which correctly refused with
"Please pay the registration fee by card to finish" — a dead end with no way to
pay (erin4collins, 2026-07-28).

/registrations/<id>/fee-status is the authoritative read the fee step now syncs
from, and its `requires_card` mirrors the /fee 402 gate exactly. These tests
pin that mirror across the fee matrix (stripe on/off, deferred, $0, prepaid,
completed) plus the /fee branches that reach it.
"""

from unittest.mock import patch

import pytest
from flask import Flask


@pytest.fixture
def client():
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


_PARENT = {'id': 'p1', 'email': 'parent@example.com', 'first_name': 'Erin'}
_CFG_STRIPE = {'stripe_secret_key': 'sk_test_school', 'scheduling_url': ''}
_CFG_EXTERNAL = {'stripe_secret_key': '', 'scheduling_url': ''}


def _reg(**over):
    base = {'id': 'reg1', 'status': 'fee', 'fee_cents': 10000, 'access_token': 'tok',
            'parent_user_id': 'p1', 'organization_id': 'org1'}
    return {**base, **over}


def _call(client, admin, path, reg, cfg=_CFG_STRIPE, directive=None, token='tok'):
    # The Stripe key moved out of feature_flags into organization_secrets on
    # 2026-08-01 (AUDIT.md C1), so "is card payment configured?" is answered by
    # _org_stripe_key/_org_stripe_enabled rather than by the config blob. The
    # fixtures still express it as cfg['stripe_secret_key'], which stays the
    # readable way to say "this school takes cards" -- translate it here.
    key = cfg.get('stripe_secret_key') or None
    with patch('routes.icreate_registration._admin', return_value=admin), \
         patch('routes.icreate_registration._load_registration', return_value=reg), \
         patch('routes.icreate_registration._org_config', return_value=cfg), \
         patch('routes.icreate_registration._org_stripe_key', return_value=key), \
         patch('routes.icreate_registration._org_stripe_enabled', return_value=bool(key)), \
         patch('routes.icreate_registration._parent_row', return_value=_PARENT), \
         patch('services.registration_funnel_service._parent_row', return_value=_PARENT), \
         patch('routes.icreate_registration._family_directive', return_value=directive):
        return client.post(path, json={'access_token': token})


def _fee_updates(admin):
    return [p for t, p in admin.updates if t == 'icreate_registrations' and 'fee_cents' in p]


_STATUS = '/api/icreate/registrations/reg1/fee-status'
_FEE = '/api/icreate/registrations/reg1/fee'


@pytest.mark.unit
class TestFeeStatusEndpoint:
    def test_card_due_when_stripe_and_fee_and_not_deferred(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, _STATUS, _reg())
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['requires_card'] is True
        assert body['fee_cents'] == 10000
        assert body['stripe_enabled'] is True
        assert body['fee_deferred'] is False
        assert body['already_completed'] is False
        # A pure status read never completes the registration.
        assert not _fee_updates(admin)

    def test_deferred_fee_needs_no_card(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, _STATUS, _reg(fee_deferred=True))
        body = resp.get_json()
        assert resp.status_code == 200
        assert body['requires_card'] is False
        assert body['fee_deferred'] is True

    def test_zero_fee_needs_no_card(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, _STATUS, _reg(fee_cents=0))
        assert resp.get_json()['requires_card'] is False

    def test_external_org_needs_no_card(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, _STATUS, _reg(), cfg=_CFG_EXTERNAL)
        body = resp.get_json()
        assert body['requires_card'] is False
        assert body['stripe_enabled'] is False

    def test_prepaid_directive_zeroes_fee_and_drops_card(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, _STATUS, _reg(), directive={'fee_prepaid': True})
        body = resp.get_json()
        assert body['requires_card'] is False
        assert body['fee_cents'] == 0
        # Same idempotent zeroing /fee and /checkout apply, so the enforced
        # decision and the displayed one can't drift.
        assert any(p['fee_cents'] == 0 for p in _fee_updates(admin))

    def test_completed_registration_needs_no_card(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, _STATUS, _reg(status='completed'))
        body = resp.get_json()
        assert body['already_completed'] is True
        assert body['requires_card'] is False

    def test_bad_token_is_rejected(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, _STATUS, _reg(), token='wrong')
        assert resp.status_code == 403


@pytest.mark.unit
class TestFeeStatusMirrorsRecordFeeGate:
    """fee-status.requires_card must equal "record_fee refuses" for the same row,
    so the UI never offers a finish the server will reject (and vice versa)."""

    CASES = [
        ('card_due',   _CFG_STRIPE,   {},                      True),
        ('deferred',   _CFG_STRIPE,   {'fee_deferred': True},  False),
        ('zero_fee',   _CFG_STRIPE,   {'fee_cents': 0},        False),
        ('external',   _CFG_EXTERNAL, {},                      False),
    ]

    @pytest.mark.parametrize('name, cfg, over, expect_card', CASES)
    def test_mirror(self, client, name, cfg, over, expect_card):
        status_resp = _call(client, _FakeAdmin(), _STATUS, _reg(**over), cfg=cfg)
        assert status_resp.get_json()['requires_card'] is expect_card

        fee_resp = _call(client, _FakeAdmin(), _FEE, _reg(**over), cfg=cfg)
        # requires_card True  <=> record_fee refuses with 402.
        # requires_card False <=> record_fee completes the registration (200).
        assert (fee_resp.status_code == 402) is expect_card
        if not expect_card:
            assert fee_resp.get_json()['status'] == 'completed'


@pytest.mark.unit
class TestRecordFeeNonCardBranches:
    def test_external_org_completes_without_card(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, _FEE, _reg(), cfg=_CFG_EXTERNAL)
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'completed'

    def test_deferred_family_completes_without_card(self, client):
        admin = _FakeAdmin()
        resp = _call(client, admin, _FEE, _reg(fee_deferred=True))
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'completed'

    def test_stale_zero_fee_recompute_dead_end_is_recoverable(self, client):
        # The exact prod dead end: card is due, the tab's finish click hits /fee,
        # and the 402 now echoes the authoritative fee so the client self-corrects.
        admin = _FakeAdmin()
        resp = _call(client, admin, _FEE, _reg())
        assert resp.status_code == 402
        body = resp.get_json()
        assert body['requires_card'] is True
        assert body['fee_cents'] == 10000
        assert not _fee_updates(admin)
