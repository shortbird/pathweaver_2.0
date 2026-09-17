"""
One Stripe Checkout factory, one session reader, one invoice writer
(sis_billing_service, M6, 2026-09-17).

Seven places opened a Checkout Session with their own metadata, seven read
one back with their own idea of "paid", and three inserted sis_invoices rows
that had drifted on which columns they set. These pin the shared pieces:
every session carries kind / organization_id / ref_id beside its own keys,
first_session() reads newest-first and skips what Stripe cannot return, and
write_invoice() is the only insert.
"""

import sys
import types
from unittest.mock import Mock, patch

import pytest

from services import sis_billing_service as billing


class FakeStripe:
    def __init__(self, sessions=None):
        self.created = []
        self.retrieved = []
        self.listed = []
        mod = types.ModuleType('stripe')
        created, retrieved, listed = self.created, self.retrieved, self.listed

        class Session:
            @staticmethod
            def create(**kwargs):
                created.append(kwargs)
                return types.SimpleNamespace(id='cs_new', url='https://checkout.stripe.test/cs_new')

            @staticmethod
            def retrieve(sid, api_key=None, **params):
                retrieved.append((sid, api_key, params))
                if sid not in (sessions or {}):
                    raise Exception(f'No such session: {sid}')
                return sessions[sid]

            @staticmethod
            def list(**params):
                listed.append(params)
                return {'data': [], 'has_more': False}

        mod.checkout = types.SimpleNamespace(Session=Session)
        self.mod = mod


@pytest.mark.unit
class TestStartCheckout:
    def test_every_session_carries_the_convention(self):
        fake = FakeStripe()
        with patch.dict(sys.modules, {'stripe': fake.mod}):
            sess = billing.start_checkout(
                'rk_test', kind='invoice', org_id='org-1', ref_id='inv-1',
                success_url='https://app/x?payment=return', cancel_url='https://app/x?payment=canceled',
                line_items=[{'quantity': 1}], customer_email='p@example.com',
                metadata={'invoice_id': 'inv-1', 'base_cents': 100})
        assert sess.url.startswith('https://checkout.stripe.test/')
        (call,) = fake.created
        assert call['api_key'] == 'rk_test'
        assert call['mode'] == 'payment'
        assert call['metadata'] == {'kind': 'invoice', 'organization_id': 'org-1', 'ref_id': 'inv-1',
                                    'invoice_id': 'inv-1', 'base_cents': 100}
        assert call['customer_email'] == 'p@example.com'
        assert call['line_items'] == [{'quantity': 1}]
        assert 'idempotency_key' not in call

    def test_setup_mode_passes_customer_and_currency_and_no_line_items(self):
        fake = FakeStripe()
        with patch.dict(sys.modules, {'stripe': fake.mod}):
            billing.start_checkout('rk_test', kind='autopay_setup', org_id='org-1', ref_id='inv-1',
                                   mode='setup', customer='cus_1', currency='usd',
                                   success_url='https://a', cancel_url='https://b',
                                   idempotency_key='once')
        (call,) = fake.created
        assert call['mode'] == 'setup'
        assert call['customer'] == 'cus_1' and call['currency'] == 'usd'
        assert 'line_items' not in call
        assert call['idempotency_key'] == 'once'

    def test_an_unknown_kind_is_refused_before_stripe_is_touched(self):
        fake = FakeStripe()
        with patch.dict(sys.modules, {'stripe': fake.mod}), pytest.raises(ValueError):
            billing.start_checkout('rk_test', kind='mystery', org_id='o', ref_id='r',
                                   success_url='https://a', cancel_url='https://b')
        assert fake.created == []


@pytest.mark.unit
class TestFirstSession:
    SESSIONS = {
        'cs_old_paid': {'id': 'cs_old_paid', 'payment_status': 'paid', 'metadata': {'kind': 'invoice'}},
        'cs_new_unpaid': {'id': 'cs_new_unpaid', 'payment_status': 'unpaid', 'metadata': {'kind': 'invoice'}},
        'cs_setup': {'id': 'cs_setup', 'status': 'complete', 'metadata': {'kind': 'autopay_setup'}},
    }

    def test_newest_first_and_unpaid_skipped(self):
        fake = FakeStripe(self.SESSIONS)
        with patch.dict(sys.modules, {'stripe': fake.mod}):
            sess = billing.first_session('rk', ['cs_old_paid', 'cs_new_unpaid'], billing.is_paid)
        assert sess['id'] == 'cs_old_paid'
        assert [r[0] for r in fake.retrieved] == ['cs_new_unpaid', 'cs_old_paid']

    def test_oldest_first_when_asked(self):
        fake = FakeStripe(self.SESSIONS)
        with patch.dict(sys.modules, {'stripe': fake.mod}):
            billing.first_session('rk', ['cs_old_paid', 'cs_new_unpaid'], billing.is_paid, newest_first=False)
        assert [r[0] for r in fake.retrieved] == ['cs_old_paid']

    def test_unreadable_sessions_are_skipped_and_counted(self):
        fake = FakeStripe(self.SESSIONS)
        errors = []
        with patch.dict(sys.modules, {'stripe': fake.mod}):
            sess = billing.first_session('rk', ['cs_old_paid', 'cs_gone'], billing.is_paid, errors=errors)
        assert sess['id'] == 'cs_old_paid'
        assert len(errors) == 1

    def test_kind_and_completion_and_expand(self):
        fake = FakeStripe(self.SESSIONS)
        with patch.dict(sys.modules, {'stripe': fake.mod}):
            sess = billing.first_session('rk', ['cs_setup', 'cs_new_unpaid'],
                                         billing.is_complete_of_kind('autopay_setup'), expand=['setup_intent'])
        assert sess['id'] == 'cs_setup'
        assert fake.retrieved[0][2] == {'expand': ['setup_intent']}

    def test_nothing_recorded_is_none(self):
        fake = FakeStripe(self.SESSIONS)
        with patch.dict(sys.modules, {'stripe': fake.mod}):
            assert billing.first_session('rk', [], billing.is_paid) is None
        assert fake.retrieved == []

    def test_list_sessions_carries_the_key(self):
        fake = FakeStripe()
        with patch.dict(sys.modules, {'stripe': fake.mod}):
            billing.list_sessions('rk', limit=100, created={'gte': 1})
        assert fake.listed == [{'api_key': 'rk', 'limit': 100, 'created': {'gte': 1}}]


@pytest.mark.unit
class TestWriteInvoice:
    def _admin(self):
        admin = Mock()
        inserted = []

        def table(name):
            t = Mock()
            t.insert.side_effect = lambda row: (inserted.append((name, row)) or t)
            t.update.return_value = t
            t.eq.return_value = t
            t.execute.return_value = Mock(data=[{'id': 'inv-new', 'created_at': '2026-09-17T00:00:00+00:00',
                                                  **(inserted[-1][1] if inserted and inserted[-1][0] == 'sis_invoices' and isinstance(inserted[-1][1], dict) else {})}])
            return t
        admin.table.side_effect = table
        return admin, inserted

    def test_one_insert_for_the_row_and_one_for_the_lines(self):
        admin, inserted = self._admin()
        with patch.object(billing, '_admin', return_value=admin), \
             patch.object(billing, '_assign_invoice_number', side_effect=lambda inv: {**inv, 'invoice_number': 'INV-1'}):
            inv = billing.write_invoice('org-1', household_id='hh-1', student_user_id='s-1',
                                        lines=[{'description': 'Pottery (T)', 'amount_cents': 5000, 'class_id': 'c1', 'kind': 'tuition'},
                                               {'description': 'Pottery (T) — supplies', 'amount_cents': 3500, 'kind': 'supply'}],
                                        discount_cents=1000, due_date='2026-10-01')
        rows = dict(inserted)
        assert rows['sis_invoices'] == {
            'organization_id': 'org-1', 'household_id': 'hh-1', 'student_user_id': 's-1', 'status': 'sent',
            'subtotal_cents': 8500, 'discount_cents': 1000, 'total_cents': 7500, 'amount_paid_cents': 0,
            'issued_at': rows['sis_invoices']['issued_at'], 'due_date': '2026-10-01'}
        assert rows['sis_invoices']['issued_at']
        assert [l['description'] for l in rows['sis_invoice_line_items']] == ['Pottery (T)', 'Pottery (T) — supplies']
        assert rows['sis_invoice_line_items'][0]['invoice_id'] == 'inv-new'
        assert inv['invoice_number'] == 'INV-1'

    def test_a_draft_has_no_issued_at_and_a_reserved_id_is_used(self):
        admin, inserted = self._admin()
        with patch.object(billing, '_admin', return_value=admin), \
             patch.object(billing, '_assign_invoice_number', side_effect=lambda inv: inv):
            billing.write_invoice('org-1', household_id=None, student_user_id='s-1',
                                  lines=[{'description': 'x', 'amount_cents': 1}], status='draft',
                                  invoice_id='reserved-1', registration_id='reg-1')
        row = dict(inserted)['sis_invoices']
        assert row['issued_at'] is None
        assert row['id'] == 'reserved-1'
        assert row['registration_id'] == 'reg-1'

    def test_discount_never_exceeds_the_subtotal(self):
        admin, inserted = self._admin()
        with patch.object(billing, '_admin', return_value=admin), \
             patch.object(billing, '_assign_invoice_number', side_effect=lambda inv: inv):
            billing.write_invoice('org-1', household_id='hh', student_user_id=None,
                                  lines=[{'description': 'x', 'amount_cents': 100}], discount_cents=500)
        row = dict(inserted)['sis_invoices']
        assert (row['discount_cents'], row['total_cents']) == (100, 0)
