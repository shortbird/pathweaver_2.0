"""
The invoice a family actually receives, and the link that pays it.

iCreate, 2026-08-06: "add a 'preview invoice' button that shows what the parent
will receive as a PDF attachment to the email when they click Send", and "the
sent invoice should include a link to pay via stripe. if parents pay that way,
it should auto-record their payment on the /billing page."

Both asks assumed a PDF that did not exist — the email was a link to a portal
the parent had to sign into. So this covers three things that have to stay true:

  1. the preview and the attachment are the SAME renderer over the SAME shape,
     or "preview" means a drawing of an invoice rather than the invoice;
  2. the pay token authorizes exactly one invoice and cannot be forged or
     re-pointed;
  3. a card payment is recorded once, no matter which of the three paths
     notices it first.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_invoice_pdf as pdf
from services import sis_pay_links
from services import sis_billing_service as billing


DOC = {
    'organization': {'name': 'iCreate', 'billing_email': 'billing@icreate.com'},
    'invoice_number': 'INV-2026-3B3796',
    'issued_at': '2026-08-06T00:00:00Z', 'due_date': '2026-09-01',
    'family': {'name': 'Sadler Family',
               'address': {'address_line1': '12 Oak St', 'city': 'Provo',
                           'state': 'UT', 'postal_code': '84604'}},
    'student_name': 'Abigail Sadler',
    'line_items': [{'description': 'Reading Workshop', 'amount_cents': 36500},
                   {'description': 'Elementary Microschool (Monday)', 'amount_cents': 145000}],
    'subtotal_cents': 181500, 'discount_cents': 0, 'processing_fee_cents': 0,
    'total_cents': 181500, 'amount_paid_cents': 0, 'amount_due_cents': 181500,
}

INVOICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'


def _text(pdf_bytes):
    import fitz
    with fitz.open(stream=pdf_bytes, filetype='pdf') as d:
        return '\n'.join(p.get_text() for p in d)


def _links(pdf_bytes):
    import fitz
    with fitz.open(stream=pdf_bytes, filetype='pdf') as d:
        return [l.get('uri') for p in d for l in p.get_links() if l.get('uri')]


@pytest.mark.unit
class TestTheInvoicePdf:
    def test_it_is_a_pdf(self):
        assert pdf.render_invoice_pdf(DOC).startswith(b'%PDF-')

    def test_it_carries_what_a_parent_needs_to_recognise_the_bill(self):
        text = _text(pdf.render_invoice_pdf(DOC))
        for expected in ('iCreate', 'INV-2026-3B3796', 'Sadler Family', 'Abigail Sadler',
                         'Reading Workshop', '$365.00', '$1,815.00'):
            assert expected in text, f'missing {expected!r}'

    def test_money_is_formatted_for_humans(self):
        """$1,450.00 — not 145000, and not $1450.0."""
        assert pdf._money(145000) == '$1,450.00'
        assert pdf._money(0) == '$0.00'
        assert pdf._money(None) == '$0.00'

    def test_a_discount_shows_as_a_deduction(self):
        text = _text(pdf.render_invoice_pdf({**DOC, 'discount_cents': 5000,
                                             'total_cents': 176500, 'amount_due_cents': 176500}))
        assert 'Discount' in text and '-$50.00' in text

    def test_the_pay_link_is_clickable_AND_written_out(self):
        """A PDF read on paper, or in a viewer that ignores link annotations,
        still has to be payable by someone typing the URL in."""
        url = 'https://api.optioeducation.com/api/sis/pay/tok'
        out = pdf.render_invoice_pdf(DOC, pay_url=url)
        assert url in _links(out)
        assert url in _text(out)

    def test_no_pay_button_without_a_link(self):
        text = _text(pdf.render_invoice_pdf(DOC))
        assert 'Pay this invoice online' not in text

    def test_a_ufa_invoice_says_not_to_pay_by_card(self):
        """UFA families pay through UFA. Offering them a card button invites a
        double payment nobody wants to unpick."""
        text = _text(pdf.render_invoice_pdf({**DOC, 'funding_label': 'UFA'}))
        assert 'UFA' in text
        assert 'Pay this invoice online' not in text

    def test_an_invoice_with_no_lines_still_renders(self):
        out = pdf.render_invoice_pdf({**DOC, 'line_items': []})
        assert out.startswith(b'%PDF-') and 'No charges' in _text(out)

    def test_the_filename_is_findable_in_a_downloads_folder(self):
        assert pdf.invoice_filename(DOC) == 'INV-2026-3B3796-Abigail-Sadler.pdf'
        assert pdf.invoice_filename({'invoice_number': 'INV-1'}) == 'INV-1.pdf'


@pytest.mark.unit
class TestThePayToken:
    def test_a_token_round_trips(self):
        token = sis_pay_links.make_token(INVOICE_ID)
        assert sis_pay_links.invoice_id_from_token(token) == INVOICE_ID

    def test_a_tampered_signature_is_refused(self):
        token = sis_pay_links.make_token(INVOICE_ID)
        assert sis_pay_links.invoice_id_from_token(token[:-1] + 'f') is None

    def test_you_cannot_repoint_a_token_at_another_invoice(self):
        """The signature covers the invoice id, so swapping the id in the URL
        invalidates it — otherwise one valid link would pay any invoice."""
        other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        sig = sis_pay_links.make_token(INVOICE_ID).rpartition('.')[2]
        assert sis_pay_links.invoice_id_from_token(f'{other}.{sig}') is None

    def test_junk_is_refused_rather_than_raising(self):
        for junk in ('', 'nope', '.', 'not-a-uuid.abc', None):
            assert sis_pay_links.invoice_id_from_token(junk) is None

    def test_tokens_differ_per_invoice(self):
        other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        assert sis_pay_links.make_token(INVOICE_ID) != sis_pay_links.make_token(other)

    def test_the_url_points_at_the_api_not_the_app(self):
        with patch.object(sis_pay_links.Config, 'BACKEND_URL', 'https://api.example.com'):
            assert sis_pay_links.pay_url(INVOICE_ID).startswith(
                'https://api.example.com/api/sis/pay/')


def _stripe_session(paid=True, pi='pi_1', amount=181500):
    return {'payment_status': 'paid' if paid else 'unpaid', 'payment_intent': pi,
            'amount_total': amount, 'metadata': {'base_cents': amount, 'fee_cents': 0}}


def _settle(invoice, session, already_recorded=False):
    """Run settle_invoice_from_stripe against a stubbed Stripe + DB."""
    recorded = {}

    def _record(*a, **k):
        recorded.update(k)
        return {'payment': {'id': 'p1'}, 'invoice': {'id': INVOICE_ID}}

    table = Mock()
    for chained in ('select', 'eq', 'limit', 'update', 'in_', 'order'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'id': 'existing'}] if already_recorded else [])
    client = Mock()
    client.table.return_value = table

    stripe = Mock()
    stripe.checkout.Session.retrieve.return_value = session
    with patch.dict('sys.modules', {'stripe': stripe}), \
         patch.object(billing, '_admin', return_value=client), \
         patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
         patch.object(billing, 'record_payment', side_effect=_record), \
         patch.object(billing, '_audit'):
        result = billing.settle_invoice_from_stripe(invoice)
    return result, recorded


@pytest.mark.unit
class TestRecordingAnOnlinePayment:
    INVOICE = {'id': INVOICE_ID, 'organization_id': ORG, 'stripe_session_ids': ['cs_1']}

    def test_a_paid_session_becomes_a_payment_record(self):
        result, recorded = _settle(self.INVOICE, _stripe_session())
        assert result['paid'] is True
        assert recorded['amount_cents'] == 181500
        assert recorded['method'] == 'card'

    def test_it_is_recorded_once_however_many_paths_notice(self):
        """The return URL, the emailed link and the nightly sweep can all fire
        for one payment. A family charged once is recorded once."""
        result, recorded = _settle(self.INVOICE, _stripe_session(), already_recorded=True)
        assert result == {'paid': True, 'already_recorded': True}
        assert recorded == {}

    def test_an_unpaid_session_records_nothing(self):
        result, recorded = _settle(self.INVOICE, _stripe_session(paid=False))
        assert result['paid'] is False
        assert recorded == {}

    def test_an_invoice_with_no_session_records_nothing(self):
        result, _ = _settle({**self.INVOICE, 'stripe_session_ids': []}, _stripe_session())
        assert result == {'paid': False}

    def test_nobody_is_credited_with_recording_a_payment_they_did_not(self):
        """The emailed link and the sweep have no signed-in actor. Attributing
        the payment to a staff member would put a falsehood in the audit trail."""
        _, recorded = _settle(self.INVOICE, _stripe_session())
        assert recorded['recorded_by'] is None
