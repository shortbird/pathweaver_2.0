"""
Correcting an invoice, and agreeing on what a family owes.

Two failures on 2026-08-19 motivate this file:

  1. A "Processing fee" box in the staff Record-payment dialog wrote the whole
     tuition into sis_invoices.processing_fee_cents on three iCreate invoices.
     Nobody in the office noticed, because the staff ledger and the outstanding
     report computed the balance as total - paid while the invoice status and
     the family portal computed total + fee - paid. The office read "Paid"; the
     families were shown a second full bill. amount_due_cents() is now the one
     definition, and these tests hold every surface to it.

  2. An invoice sent for the wrong amount could not be changed. The only remedy
     was a second invoice, which the tuition screen itself warns against.
     update_invoice/void_invoice are that remedy.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_billing_service as billing


@pytest.mark.unit
class TestAmountDue:
    """One sum, used by the ledger, the outstanding report, the family portal,
    the reminder emails and the status recompute."""

    def test_includes_the_processing_fee(self):
        assert billing.amount_due_cents(
            {'total_cents': 10000, 'processing_fee_cents': 300, 'amount_paid_cents': 0}) == 10300

    def test_subtracts_what_has_been_paid(self):
        assert billing.amount_due_cents(
            {'total_cents': 10000, 'processing_fee_cents': 300, 'amount_paid_cents': 10300}) == 0

    def test_missing_fields_are_zero(self):
        assert billing.amount_due_cents({}) == 0

    def test_the_corrupted_iCreate_shape_is_not_settled(self):
        """total == fee == paid. The ledger used to call this Paid while the
        family's portal still billed them the whole tuition again."""
        inv = {'total_cents': 295500, 'processing_fee_cents': 295500,
               'amount_paid_cents': 295500}
        assert billing.amount_due_cents(inv) == 295500


@pytest.mark.unit
class TestCleanLineItems:
    """The approver's lines are validated, never silently dropped: an invoice
    that quietly loses a charge is how the wrong amount gets emailed out."""

    def test_blank_description_is_rejected_by_position(self):
        clean, err = billing.clean_line_items([
            {'description': 'Piano', 'amount_cents': 100},
            {'description': '  ', 'amount_cents': 5000},
        ])
        assert clean == []
        assert 'Line 2' in err

    def test_named_line_reports_its_own_name(self):
        clean, err = billing.clean_line_items([{'description': 'Piano', 'amount_cents': 'lots'}])
        assert clean == []
        assert 'Piano' in err

    def test_empty_list_is_rejected(self):
        assert billing.clean_line_items([])[0] == []
        assert billing.clean_line_items([])[1]

    def test_booleans_are_not_amounts(self):
        assert billing.clean_line_items([{'description': 'X', 'amount_cents': True}])[1]

    def test_kind_is_kept_when_valid_and_dropped_when_not(self):
        clean, err = billing.clean_line_items([
            {'description': 'Piano', 'amount_cents': 100, 'kind': 'supply'},
            {'description': 'Art', 'amount_cents': 100, 'kind': 'nonsense'},
            {'description': 'Clay', 'amount_cents': 100},
        ])
        assert err is None
        assert [li['kind'] for li in clean] == ['supply', None, None]

    def test_zero_is_a_valid_amount(self):
        clean, err = billing.clean_line_items([{'description': 'Waived', 'amount_cents': 0}])
        assert err is None and clean[0]['amount_cents'] == 0


def _service_with_invoice(invoice):
    """A supabase admin mock whose first select().eq().eq().limit().execute()
    returns `invoice`. Enough for the guard clauses, which return before any
    write."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'update', 'insert', 'delete', 'order'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[invoice] if invoice else [])
    return client


@pytest.mark.unit
class TestUpdateInvoiceGuards:
    def test_missing_invoice(self):
        with patch('services.sis_billing_service._admin',
                   return_value=_service_with_invoice(None)):
            assert billing.update_invoice('org1', 'inv1', 'actor')['error'] == 'Invoice not found'

    def test_paid_invoice_is_refused(self):
        with patch('services.sis_billing_service._admin',
                   return_value=_service_with_invoice({'id': 'inv1', 'status': 'paid'})):
            err = billing.update_invoice('org1', 'inv1', 'actor')['error']
        assert 'paid in full' in err
        # Must not send the caller to void, which refuses a paid invoice too.
        assert 'void' not in err.lower()

    def test_void_invoice_is_refused(self):
        with patch('services.sis_billing_service._admin',
                   return_value=_service_with_invoice({'id': 'inv1', 'status': 'void'})):
            assert 'voided' in billing.update_invoice('org1', 'inv1', 'actor')['error']

    def test_bad_line_items_never_reach_the_database(self):
        client = _service_with_invoice({'id': 'inv1', 'status': 'sent', 'total_cents': 100})
        with patch('services.sis_billing_service._admin', return_value=client):
            result = billing.update_invoice('org1', 'inv1', 'actor',
                                            line_items=[{'amount_cents': 500}])
        assert result['error']
        client.table.return_value.delete.assert_not_called()


@pytest.mark.unit
class TestVoidInvoiceGuards:
    def test_missing_invoice(self):
        with patch('services.sis_billing_service._admin',
                   return_value=_service_with_invoice(None)):
            assert billing.void_invoice('org1', 'inv1', 'actor')['error'] == 'Invoice not found'

    def test_already_void_is_a_no_op(self):
        inv = {'id': 'inv1', 'status': 'void'}
        with patch('services.sis_billing_service._admin',
                   return_value=_service_with_invoice(inv)):
            assert billing.void_invoice('org1', 'inv1', 'actor') == {'invoice': inv}

    def test_paid_money_blocks_a_void(self):
        """Voiding an invoice a payment sits on would orphan money the school
        actually received."""
        inv = {'id': 'inv1', 'status': 'partial', 'amount_paid_cents': 5000}
        with patch('services.sis_billing_service._admin',
                   return_value=_service_with_invoice(inv)):
            assert 'payment has been recorded' in billing.void_invoice('org1', 'inv1', 'actor')['error']


def _service_with_payment(payment):
    """A supabase admin mock whose select and update both answer with `payment`."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'update', 'insert', 'delete', 'order'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[payment] if payment else [])
    return client, table


@pytest.mark.unit
class TestCorrectingARecordedPayment:
    """iCreate, 2026-08-14: "I accidentally chose the wrong form of payment for
    Simon Hamberger and can see no way to edit that."

    sis_payment_records was insert-only — one writer, no update, no delete — so
    a mistyped method was permanent. The correction is deliberately narrow: the
    three fields that DESCRIBE the payment, none of the money.
    """

    EXISTING = {'id': 'p1', 'invoice_id': 'inv1', 'method': 'card',
                'external_ref': None, 'note': 'Paid 2026-08-14'}

    def test_missing_payment(self):
        client, _ = _service_with_payment(None)
        with patch('services.sis_billing_service._admin', return_value=client):
            result = billing.update_payment_record('org1', 'p1', {'method': 'zelle'}, 'actor')
        assert result['error'] == 'Payment not found'

    def test_the_method_is_corrected(self):
        client, table = _service_with_payment(self.EXISTING)
        with patch('services.sis_billing_service._admin', return_value=client), \
                patch('services.sis_billing_service._audit') as audit:
            result = billing.update_payment_record('org1', 'p1', {'method': 'zelle'}, 'actor')
        assert 'error' not in result
        table.update.assert_called_once_with({'method': 'zelle'})
        # The audit records what it was, so a correction is not a silent rewrite.
        assert audit.call_args[0][4]['from'] == {'method': 'card'}

    def test_the_amount_cannot_be_changed_through_this_door(self):
        """A client posting the whole row back must not move money."""
        client, table = _service_with_payment(self.EXISTING)
        with patch('services.sis_billing_service._admin', return_value=client), \
                patch('services.sis_billing_service._audit'):
            billing.update_payment_record(
                'org1', 'p1',
                {'method': 'zelle', 'amount_cents': 1, 'invoice_id': 'other', 'id': 'other'},
                'actor')
        assert table.update.call_args[0][0] == {'method': 'zelle'}

    def test_a_body_with_nothing_correctable_is_refused(self):
        client, table = _service_with_payment(self.EXISTING)
        with patch('services.sis_billing_service._admin', return_value=client):
            result = billing.update_payment_record('org1', 'p1', {'amount_cents': 999}, 'actor')
        assert result['error'] == 'Nothing to update'
        table.update.assert_not_called()

    def test_an_emptied_reference_is_stored_as_null_not_blank(self):
        """So a cleared reference reads the same as one never filled in."""
        client, table = _service_with_payment({**self.EXISTING, 'external_ref': 'CHK-9'})
        with patch('services.sis_billing_service._admin', return_value=client), \
                patch('services.sis_billing_service._audit'):
            billing.update_payment_record('org1', 'p1', {'external_ref': '   '}, 'actor')
        assert table.update.call_args[0][0] == {'external_ref': None}

    def test_saving_without_changing_anything_writes_nothing(self):
        client, table = _service_with_payment(self.EXISTING)
        with patch('services.sis_billing_service._admin', return_value=client), \
                patch('services.sis_billing_service._audit') as audit:
            result = billing.update_payment_record('org1', 'p1', {'method': 'card'}, 'actor')
        assert result['unchanged'] is True
        table.update.assert_not_called()
        audit.assert_not_called()
