"""
Two iCreate billing asks, both in the office's /billing page.

Ticket 0034e67c: "select certain individuals to send payment reminders to
instead of everyone". run_payment_reminders(org_id, invoice_ids=[...]) sends
to the picked invoices only. Owner decision: a picked send skips the past-due
check and the 25-day cooldown; it still only reminds about open, unpaid,
non-void invoices with a balance, and only in the caller's own org. The
everyone-send keeps today's rules exactly.

Ticket eacb3356: "invoice for half now and half in January ... ability to have
multiple invoices", for a family reimbursed per bill. split_invoice keeps the
invoice number on the first part and creates a sibling for the rest, or
refuses with nothing written.
"""

import copy
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from services import sis_billing_service as billing
from tests.crm_fakes import FakeSupabase

ORG = '11111111-1111-1111-1111-111111111111'
OTHER_ORG = '22222222-2222-2222-2222-222222222222'
INV = 'aaaaaaaa-0000-0000-0000-000000000001'
HH = 'bbbbbbbb-0000-0000-0000-000000000001'
STUDENT = 'cccccccc-0000-0000-0000-000000000001'
REG = 'dddddddd-0000-0000-0000-000000000001'


def _past(days=10):
    return (date.today() - timedelta(days=days)).isoformat()


def _future(days=30):
    return (date.today() + timedelta(days=days)).isoformat()


# ── Split ────────────────────────────────────────────────────────────────────

def _split_world(**inv_over):
    inv = {'id': INV, 'organization_id': ORG, 'household_id': HH,
           'student_user_id': STUDENT, 'registration_id': REG, 'status': 'sent',
           'subtotal_cents': 100001, 'discount_cents': 10001, 'total_cents': 90000,
           'amount_paid_cents': 0, 'processing_fee_cents': 0, 'due_date': '2026-10-15',
           'invoice_number': 'INV-2026-AAAAAA', 'updated_at': '2026-10-01T00:00:00+00:00',
           'issued_at': '2026-10-01T00:00:00+00:00'}
    inv.update(inv_over)
    return FakeSupabase({
        'sis_invoices': [inv],
        'sis_invoice_line_items': [
            {'id': 'l1', 'invoice_id': INV, 'description': 'Pottery', 'amount_cents': 60001,
             'class_id': 'class-1', 'kind': 'tuition', 'quantity': 1,
             'created_at': '2026-10-01T00:00:01'},
            {'id': 'l2', 'invoice_id': INV, 'description': 'Clay supply fee', 'amount_cents': 40000,
             'class_id': 'class-1', 'kind': 'supply', 'quantity': 1,
             'created_at': '2026-10-01T00:00:02'},
        ],
        'sis_payment_records': [], 'sis_payment_plans': [], 'sis_installments': [],
        'sis_billing_audit': [], 'sis_quickbooks_sync_log': [],
    })


def _split(db, **kw):
    args = dict(first_amount_cents=45000, first_due_date='2026-10-15',
                second_due_date='2027-01-15')
    args.update(kw)
    with patch.object(billing, '_admin', return_value=db), \
         patch.object(billing, 'notify_family_of_invoice_change') as notify:
        result = billing.split_invoice(ORG, INV, 'actor-1', **args)
    return result, notify


def _invoices(db):
    return db.data['sis_invoices']


@pytest.mark.unit
class TestSplitLineAmounts:
    """eacb3356: the per-line share is exact to the cent."""

    def test_parts_add_up_and_never_exceed_a_line(self):
        amounts = [60001, 40000, 0, 333]
        for part in (1, 7, 50167, 100333):
            got = billing.split_line_amounts(amounts, part)
            assert sum(got) == part
            assert all(0 <= g <= a for g, a in zip(got, amounts, strict=True))

    def test_half_of_an_odd_cent_goes_to_the_first_line(self):
        assert billing.split_line_amounts([101], 51) == [51]
        assert billing.split_line_amounts([1, 1], 1) == [1, 0]


@pytest.mark.unit
class TestSplitInvoice:
    """eacb3356 (iCreate): half now, half in January, as two real invoices."""

    def test_split_sums_to_the_original_and_keeps_the_number(self):
        db = _split_world()
        result, notify = _split(db)
        assert 'error' not in result, result
        first, second = result['invoice'], result['second_invoice']
        assert first['id'] == INV
        assert first['invoice_number'] == 'INV-2026-AAAAAA'
        assert first['total_cents'] == 45000
        assert second['total_cents'] == 45000
        assert first['total_cents'] + second['total_cents'] == 90000
        assert first['discount_cents'] + second['discount_cents'] == 10001
        assert first['subtotal_cents'] + second['subtotal_cents'] == 100001
        # Each invoice's own lines add up to its own subtotal.
        for inv in (first, second):
            assert sum(li['amount_cents'] for li in inv['line_items']) == inv['subtotal_cents']
            assert inv['subtotal_cents'] - inv['discount_cents'] == inv['total_cents']
        # Same family, student and registration; new number; second due date.
        assert second['household_id'] == HH
        assert second['student_user_id'] == STUDENT
        assert second['registration_id'] == REG
        assert second['invoice_number'] and second['invoice_number'] != first['invoice_number']
        assert second['due_date'] == '2027-01-15'
        assert second['status'] == 'sent'
        # Descriptions stay meaningful for a reimbursement program.
        assert sorted(li['description'] for li in first['line_items']) == \
            ['Clay supply fee (1 of 2)', 'Pottery (1 of 2)']
        assert sorted(li['description'] for li in second['line_items']) == \
            ['Clay supply fee (2 of 2)', 'Pottery (2 of 2)']
        assert {li['class_id'] for li in second['line_items']} == {'class-1'}
        notify.assert_called_once()

    def test_audit_rows_on_both_invoices(self):
        db = _split_world()
        result, _ = _split(db)
        audits = db.data['sis_billing_audit']
        by_action = {a['action']: a for a in audits}
        assert by_action['invoice_split']['invoice_id'] == INV
        assert by_action['invoice_split']['actor_user_id'] == 'actor-1'
        assert by_action['invoice_split']['organization_id'] == ORG
        detail = by_action['invoice_split']['detail']
        assert detail['from_total_cents'] == 90000
        assert detail['second_invoice_id'] == result['second_invoice']['id']
        assert by_action['invoice_split_created']['invoice_id'] == result['second_invoice']['id']

    def test_uneven_split(self):
        db = _split_world()
        result, _ = _split(db, first_amount_cents=1)
        assert result['invoice']['total_cents'] == 1
        assert result['second_invoice']['total_cents'] == 89999

    def test_draft_stays_draft_and_family_is_not_told(self):
        db = _split_world(status='draft')
        result, notify = _split(db)
        assert result['invoice']['status'] == 'draft'
        assert result['second_invoice']['status'] == 'draft'
        notify.assert_not_called()

    @pytest.mark.parametrize('over,needle', [
        ({'status': 'void'}, 'voided'),
        ({'status': 'paid', 'amount_paid_cents': 90000}, 'paid'),
        ({'status': 'partial', 'amount_paid_cents': 100}, 'payment'),
        ({'processing_fee_cents': 300}, 'card processing fee'),
    ])
    def test_refused_states_write_nothing(self, over, needle):
        db = _split_world(**over)
        before = copy.deepcopy(db.data)
        result, notify = _split(db)
        assert needle in result['error'].lower()
        assert db.data == before
        notify.assert_not_called()

    def test_refused_when_a_payment_was_ever_recorded(self):
        """A refund can net amount_paid back to 0; the record still counts."""
        db = _split_world()
        db.data['sis_payment_records'] = [{'id': 'p1', 'invoice_id': INV, 'amount_cents': 0}]
        before = copy.deepcopy(db.data)
        result, _ = _split(db)
        assert 'payment' in result['error'].lower()
        assert db.data == before

    def test_refused_with_a_payment_plan_or_autopay(self):
        db = _split_world()
        db.data['sis_payment_plans'] = [{'id': 'plan1', 'invoice_id': INV, 'status': 'active',
                                         'auto_charge': True}]
        db.data['sis_installments'] = [{'id': 'i1', 'payment_plan_id': 'plan1',
                                        'status': 'scheduled', 'amount_cents': 9000,
                                        'due_date': '2026-11-01'}]
        before = copy.deepcopy(db.data)
        result, _ = _split(db)
        assert 'autopay' in result['error'].lower()
        assert db.data == before

    def test_a_stopped_plan_with_only_waived_installments_does_not_block(self):
        db = _split_world()
        db.data['sis_payment_plans'] = [{'id': 'plan1', 'invoice_id': INV,
                                         'status': 'cancelled'}]
        db.data['sis_installments'] = [{'id': 'i1', 'payment_plan_id': 'plan1',
                                        'status': 'waived', 'amount_cents': 9000,
                                        'due_date': '2026-11-01'}]
        result, _ = _split(db)
        assert 'error' not in result

    @pytest.mark.parametrize('amount', [0, -5, 90000, 90001, True, '45000', 450.5])
    def test_amount_must_be_strictly_inside_the_balance(self, amount):
        db = _split_world()
        before = copy.deepcopy(db.data)
        result, _ = _split(db, first_amount_cents=amount)
        assert result.get('error')
        assert db.data == before

    def test_second_due_date_is_required(self):
        db = _split_world()
        before = copy.deepcopy(db.data)
        result, _ = _split(db, second_due_date='not a date')
        assert 'due date' in result['error']
        assert db.data == before

    def test_another_orgs_invoice_is_not_found(self):
        db = _split_world(organization_id=OTHER_ORG)
        before = copy.deepcopy(db.data)
        result, _ = _split(db)
        assert result['error'] == 'Invoice not found'
        assert db.data == before

    def test_lines_that_disagree_with_the_total_are_refused(self):
        db = _split_world(subtotal_cents=99999)
        before = copy.deepcopy(db.data)
        result, _ = _split(db)
        assert 'add up' in result['error']
        assert db.data == before

    def test_a_failed_second_invoice_undoes_everything(self):
        """Half a split is two bills that do not add up. Any failure puts the
        original back exactly and leaves no sibling behind."""
        db = _split_world()
        before = copy.deepcopy(db.data)
        real_write = billing.write_invoice

        def write_then_fail(*a, **kw):
            real_write(*a, **kw)
            raise RuntimeError('network went away')

        with patch.object(billing, 'write_invoice', side_effect=write_then_fail):
            result, notify = _split(db)
        assert 'Nothing was changed' in result['error']
        assert _invoices(db) == before['sis_invoices']
        lines = sorted(db.data['sis_invoice_line_items'], key=lambda r: r['id'])
        assert lines == sorted(before['sis_invoice_line_items'], key=lambda r: r['id'])
        assert db.data['sis_billing_audit'] == []
        notify.assert_not_called()

    def test_an_invoice_changed_since_it_was_read_is_left_alone(self):
        """A payment landing between the read and the write bumps updated_at;
        the conditional update then matches nothing and the split stops."""
        db = _split_world()
        real = billing.SisInvoiceRepository.for_org

        def stale_read(self, org_id, invoice_id):
            row = real(self, org_id, invoice_id)
            return dict(row, updated_at='2026-09-01T00:00:00+00:00') if row else row

        before = copy.deepcopy(db.data)
        with patch.object(billing.SisInvoiceRepository, 'for_org', stale_read):
            result, _ = _split(db)
        assert 'changed' in result['error']
        assert db.data == before


# ── Selected payment reminders ───────────────────────────────────────────────

def _reminder_world():
    def inv(i, org=ORG, status='sent', due=None, paid=0, total=10000):
        return {'id': i, 'organization_id': org, 'household_id': HH, 'status': status,
                'total_cents': total, 'amount_paid_cents': paid, 'due_date': due,
                'invoice_number': f'INV-{i[-4:]}'}
    return FakeSupabase({
        'sis_invoices': [
            inv('aaaaaaaa-0000-0000-0000-00000000a001', due=_future()),         # not yet due
            inv('aaaaaaaa-0000-0000-0000-00000000a002', due=_past()),           # past due
            inv('aaaaaaaa-0000-0000-0000-00000000a003', due=_past(), status='void'),
            inv('aaaaaaaa-0000-0000-0000-00000000a004', due=_past(), status='paid', paid=10000),
            inv('aaaaaaaa-0000-0000-0000-00000000a005', org=OTHER_ORG, due=_past()),
        ],
        'households': [{'id': HH, 'name': 'Bowman', 'primary_contact_user_id': 'g1'}],
        'sis_payment_reminders': [
            # A reminder yesterday: inside the 25-day cooldown.
            {'id': 'r0', 'organization_id': ORG,
             'invoice_id': 'aaaaaaaa-0000-0000-0000-00000000a002',
             'sent_to': 'p@x.com', 'sent_at': '2999-01-01T00:00:00+00:00'},
        ],
    })


def _run(db, **kw):
    sent = []

    class _Email:
        def send_email(self, **k):
            sent.append(k)
            return True

    with patch.object(billing, '_admin', return_value=db), \
         patch.object(billing, '_hydrate_invoices',
                      side_effect=lambda invs: [i.setdefault('installments', []) for i in invs]), \
         patch.object(billing, '_org_branding', return_value={ORG: {'name': 'iCreate'}}), \
         patch.object(billing, '_guardian_emails_for_household',
                      return_value=[{'user_id': 'g1', 'email': 'p@x.com', 'name': 'P'}]), \
         patch('services.email_service.EmailService', _Email):
        result = billing.run_payment_reminders(**kw)
    return result, sent


@pytest.mark.unit
class TestSelectedReminders:
    """0034e67c (iCreate): remind the families the office picks."""

    def test_everyone_send_keeps_the_past_due_check_and_cooldown(self):
        db = _reminder_world()
        result, sent = _run(db, org_id=ORG)
        # a001 is not due yet; a002 was reminded inside the cooldown.
        assert result == {'checked': 2, 'reminded': 0, 'skipped': 1}
        assert sent == []

    def test_picked_send_skips_past_due_and_cooldown(self):
        db = _reminder_world()
        ids = ['aaaaaaaa-0000-0000-0000-00000000a001', 'aaaaaaaa-0000-0000-0000-00000000a002']
        result, sent = _run(db, org_id=ORG, invoice_ids=ids)
        assert result['reminded'] == 2
        assert result['invoices_reminded'] == 2
        assert result['not_sent'] == 0
        assert len(sent) == 2
        logged = {r['invoice_id'] for r in db.data['sis_payment_reminders'] if r['id'] != 'r0'}
        assert logged == set(ids)
        # A bill not due yet is not called overdue.
        not_yet = next(s for s in sent if 'It is due on' in s['text_body'])
        assert 'It was due' not in not_yet['text_body']

    def test_picked_send_only_reminds_open_unpaid_invoices(self):
        db = _reminder_world()
        ids = ['aaaaaaaa-0000-0000-0000-00000000a003', 'aaaaaaaa-0000-0000-0000-00000000a004']
        result, sent = _run(db, org_id=ORG, invoice_ids=ids)
        assert sent == []
        assert result['invoices_reminded'] == 0
        assert result['not_sent'] == 2

    def test_another_orgs_invoice_is_ignored(self):
        db = _reminder_world()
        result, sent = _run(db, org_id=ORG,
                            invoice_ids=['aaaaaaaa-0000-0000-0000-00000000a005'])
        assert sent == []
        assert result['reminded'] == 0
        assert len(db.data['sis_payment_reminders']) == 1

    def test_picked_send_without_an_org_sends_nothing(self):
        db = _reminder_world()
        result, sent = _run(db, org_id=None,
                            invoice_ids=['aaaaaaaa-0000-0000-0000-00000000a002'])
        assert sent == [] and result['reminded'] == 0

    def test_garbage_ids_send_nothing(self):
        db = _reminder_world()
        result, sent = _run(db, org_id=ORG, invoice_ids=['not-a-uuid'])
        assert sent == [] and result['reminded'] == 0


# ── Routes ───────────────────────────────────────────────────────────────────

def _staff(role='org_admin'):
    from tests.test_sis_billing_routes import staff
    return staff(role)


@pytest.mark.unit
class TestRoutes:
    def test_reminders_route_passes_ids(self, client, auth_headers, mock_verify_token):
        """0034e67c: the picked ids reach the service with the caller's org."""
        ids = ['aaaaaaaa-0000-0000-0000-00000000a001']
        with _staff(), patch('routes.sis.billing.billing.run_payment_reminders',
                             return_value={'checked': 1, 'reminded': 1, 'skipped': 0}) as run:
            resp = client.post('/api/sis/billing/reminders/run', headers=auth_headers,
                               json={'organization_id': 'org-1', 'invoice_ids': ids})
        assert resp.status_code == 200
        run.assert_called_once_with(org_id='org-1', invoice_ids=ids)

    def test_reminders_route_without_ids_is_the_everyone_send(self, client, auth_headers,
                                                               mock_verify_token):
        with _staff(), patch('routes.sis.billing.billing.run_payment_reminders',
                             return_value={'checked': 0, 'reminded': 0, 'skipped': 0}) as run:
            resp = client.post('/api/sis/billing/reminders/run', headers=auth_headers,
                               json={'organization_id': 'org-1'})
        assert resp.status_code == 200
        run.assert_called_once_with(org_id='org-1')

    def test_reminders_route_rejects_a_bad_id_list(self, client, auth_headers, mock_verify_token):
        with _staff(), patch('routes.sis.billing.billing.run_payment_reminders') as run:
            resp = client.post('/api/sis/billing/reminders/run', headers=auth_headers,
                               json={'invoice_ids': []})
        assert resp.status_code == 400
        run.assert_not_called()

    def test_split_route_passes_the_body(self, client, auth_headers, mock_verify_token):
        """eacb3356: the split route is finance-gated and passes the body on."""
        with _staff(), patch('routes.sis.billing.billing.split_invoice',
                             return_value={'invoice': {'id': INV},
                                           'second_invoice': {'id': 'x'}}) as split:
            resp = client.post(f'/api/sis/invoices/{INV}/split', headers=auth_headers,
                               json={'first_amount_cents': 45000, 'first_due_date': '2026-10-15',
                                     'second_due_date': '2027-01-15'})
        assert resp.status_code == 201
        split.assert_called_once_with('org-1', INV, actor_user_id='test-user-123',
                                      first_amount_cents=45000, first_due_date='2026-10-15',
                                      second_due_date='2027-01-15')

    def test_split_route_refusal_is_a_400(self, client, auth_headers, mock_verify_token):
        with _staff(), patch('routes.sis.billing.billing.split_invoice',
                             return_value={'error': 'This invoice is paid and cannot be split'}):
            resp = client.post(f'/api/sis/invoices/{INV}/split', headers=auth_headers,
                               json={'first_amount_cents': 100, 'second_due_date': '2027-01-15'})
        assert resp.status_code == 400

    def test_split_route_closed_to_campus_coordinators(self, client, auth_headers,
                                                       mock_verify_token):
        """FINANCE_ROLES: a coordinator runs the office, not the money."""
        with _staff('campus_coordinator'), \
             patch('routes.sis.billing.billing.split_invoice') as split:
            resp = client.post(f'/api/sis/invoices/{INV}/split', headers=auth_headers,
                               json={'first_amount_cents': 100, 'second_due_date': '2027-01-15'})
        assert resp.status_code == 403
        split.assert_not_called()
