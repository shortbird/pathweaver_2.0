"""
The invoice PDF a family receives.

One renderer, taking the same `document` payload that
sis_billing_service.invoice_document() returns and that the console's invoice
modal draws on screen. That sharing is the point: the approver's "Preview
invoice" and the file attached to the email must be the same bytes, or the
preview is a mock-up of something else.

reportlab rather than weasyprint: weasyprint was declared in
backend/requirements.txt for two years, imported by nothing, and cannot import
at all without Pango/cairo system libraries that neither a dev machine nor the
Render image carries. reportlab is pure Python — no system dependencies, and a
much smaller footprint on a backend with an OOM history.

Nothing here touches the database or the network. Feed it a dict, get bytes.
"""

from io import BytesIO
from typing import Any, Dict, List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)

# Optio brand. Kept as literals rather than imported from a theme module because
# a PDF is not a web page and shouldn't drift with the site's CSS.
PURPLE = '#6d469b'
INK = '#1f2937'
MUTED = '#6b7280'
RULE = '#e5e7eb'


def _money(cents: Optional[int]) -> str:
    return f"${(cents or 0) / 100:,.2f}"


def _address_lines(address: Optional[Dict[str, Any]]) -> List[str]:
    if not isinstance(address, dict):
        return []
    street = ' '.join(x for x in [address.get('address_line1'), address.get('address_line2')] if x)
    city_line = ', '.join(x for x in [address.get('city'), address.get('state')] if x)
    if address.get('postal_code'):
        city_line = f"{city_line} {address['postal_code']}".strip()
    return [x for x in [street, city_line] if x]


def render_invoice_pdf(document: Dict[str, Any], pay_url: Optional[str] = None) -> bytes:
    """Render one invoice to PDF bytes.

    `document` is the shape from sis_billing_service.invoice_document()['document'].
    `pay_url`, when given, is printed as a Pay online button + the URL in text —
    the text matters, because a PDF opened in a viewer that doesn't do links
    still has to be payable by someone typing it in.
    """
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether,
    )

    org = document.get('organization') or {}
    org_name = org.get('name') or 'School'
    family = document.get('family') or {}
    styles = getSampleStyleSheet()

    base = ParagraphStyle('base', parent=styles['Normal'], fontSize=9.5, leading=13,
                          textColor=colors.HexColor(INK))
    small = ParagraphStyle('small', parent=base, fontSize=8, leading=11,
                           textColor=colors.HexColor(MUTED))
    right = ParagraphStyle('right', parent=base, alignment=TA_RIGHT)
    right_small = ParagraphStyle('right_small', parent=small, alignment=TA_RIGHT)
    h1 = ParagraphStyle('h1', parent=base, fontSize=17, leading=21,
                        textColor=colors.HexColor(PURPLE), fontName='Helvetica-Bold')
    label = ParagraphStyle('label', parent=small, fontName='Helvetica-Bold')

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch,
        title=f"Invoice {document.get('invoice_number') or ''}".strip(),
        author=org_name,
    )
    story: List[Any] = []

    # ── Header: who is billing, and which invoice ────────────────────────────
    number = document.get('invoice_number') or '—'
    issued = str(document.get('issued_at') or '')[:10]
    due = str(document.get('due_date') or '')[:10]
    meta = [f"Invoice {number}"]
    if issued:
        meta.append(f"Issued {issued}")
    if due:
        meta.append(f"Due {due}")
    story.append(Table(
        [[Paragraph(org_name, h1), Paragraph('<br/>'.join(meta), right_small)]],
        colWidths=[doc.width * 0.6, doc.width * 0.4],
        style=TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                          ('LEFTPADDING', (0, 0), (-1, -1), 0),
                          ('RIGHTPADDING', (0, 0), (-1, -1), 0)]),
    ))
    story.append(Spacer(1, 4))
    story.append(Table([['']], colWidths=[doc.width],
                       style=TableStyle([('LINEBELOW', (0, 0), (-1, -1), 1, colors.HexColor(PURPLE))])))
    story.append(Spacer(1, 12))

    # ── Who it is for ────────────────────────────────────────────────────────
    bill_to = [Paragraph('BILL TO', label)]
    if family.get('name'):
        bill_to.append(Paragraph(family['name'], base))
    for line in _address_lines(family.get('address')):
        bill_to.append(Paragraph(line, small))

    student_block = [Paragraph('STUDENT', label),
                     Paragraph(document.get('student_name') or '—', base)]
    if document.get('funding_label'):
        student_block.append(Paragraph(f"Funding: {document['funding_label']}", small))

    story.append(Table(
        [[bill_to, student_block]],
        colWidths=[doc.width * 0.55, doc.width * 0.45],
        style=TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                          ('LEFTPADDING', (0, 0), (-1, -1), 0),
                          ('RIGHTPADDING', (0, 0), (-1, -1), 0)]),
    ))
    story.append(Spacer(1, 16))

    # ── Line items ───────────────────────────────────────────────────────────
    rows: List[List[Any]] = [[Paragraph('DESCRIPTION', label), Paragraph('AMOUNT', right_small)]]
    for li in (document.get('line_items') or []):
        rows.append([Paragraph(str(li.get('description') or 'Charge'), base),
                     Paragraph(_money(li.get('amount_cents')), right)])
    if len(rows) == 1:
        rows.append([Paragraph('No charges', small), Paragraph(_money(0), right)])

    items = Table(rows, colWidths=[doc.width * 0.72, doc.width * 0.28], repeatRows=1)
    items.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, 0), 0.75, colors.HexColor(RULE)),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, colors.HexColor(RULE)),
    ]))
    story.append(items)
    story.append(Spacer(1, 10))

    # ── Totals ───────────────────────────────────────────────────────────────
    total_rows: List[List[Any]] = [
        [Paragraph('Subtotal', small), Paragraph(_money(document.get('subtotal_cents')), right)],
    ]
    if document.get('discount_cents'):
        total_rows.append([Paragraph('Discount', small),
                           Paragraph(f"-{_money(document['discount_cents'])}", right)])
    if document.get('processing_fee_cents'):
        total_rows.append([Paragraph('Card processing fee', small),
                           Paragraph(_money(document['processing_fee_cents']), right)])
    total_rows.append([Paragraph('<b>Total</b>', base),
                       Paragraph(f"<b>{_money(document.get('total_cents'))}</b>", right)])
    if document.get('amount_paid_cents'):
        total_rows.append([Paragraph('Paid', small),
                           Paragraph(f"-{_money(document['amount_paid_cents'])}", right)])
    total_rows.append([Paragraph('<b>Amount due</b>', base),
                       Paragraph(f"<b>{_money(document.get('amount_due_cents'))}</b>", right)])

    totals = Table(total_rows, colWidths=[doc.width * 0.52, doc.width * 0.20],
                   hAlign='RIGHT')
    totals.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEABOVE', (0, len(total_rows) - 1), (-1, len(total_rows) - 1), 0.75, colors.HexColor(RULE)),
    ]))
    story.append(totals)
    story.append(Spacer(1, 18))

    # ── How to pay ───────────────────────────────────────────────────────────
    pay_block: List[Any] = []
    if pay_url:
        button = Table(
            [[Paragraph(
                f'<link href="{pay_url}"><font color="white"><b>Pay this invoice online</b></font></link>',
                base)]],
            colWidths=[2.6 * inch],
            style=TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(PURPLE)),
                ('TOPPADDING', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
                ('LEFTPADDING', (0, 0), (-1, -1), 14),
                ('ROUNDEDCORNERS', [4, 4, 4, 4]),
            ]),
            hAlign='LEFT',
        )
        # The button text carries the link, and the URL is ALSO printed in full
        # underneath — a PDF read on paper, or in a viewer that ignores link
        # annotations, still has to be payable by someone typing it in.
        pay_block.append(button)
        pay_block.append(Spacer(1, 5))
        pay_block.append(Paragraph(
            f'Pay by card at <link href="{pay_url}"><font color="{PURPLE}">{pay_url}</font></link>',
            small))
        pay_block.append(Spacer(1, 4))
        pay_block.append(Paragraph(
            'Paying online records the payment on your account automatically. '
            'You can also pay the school directly — cash, check, Zelle or scholarship — '
            'and the office will record it for you.', small))
    elif document.get('funding_label'):
        pay_block.append(Paragraph(
            f"This invoice is funded through {document['funding_label']}. "
            'No card payment is needed — it is provided as a record.', small))
    else:
        pay_block.append(Paragraph(
            'Please pay the school directly. The office will record your payment.', small))

    story.append(KeepTogether(pay_block))
    story.append(Spacer(1, 16))

    contact = ' · '.join(x for x in [org.get('billing_email'), org.get('billing_phone')] if x)
    if contact:
        story.append(Paragraph(f'Questions about this invoice? {contact}', small))

    doc.build(story)
    return buf.getvalue()


def invoice_filename(document: Dict[str, Any]) -> str:
    """A filename a parent can find again in their downloads folder."""
    number = (document.get('invoice_number') or 'invoice').replace('/', '-')
    student = (document.get('student_name') or '').strip()
    safe = ''.join(ch for ch in student if ch.isalnum() or ch in ' -_').strip().replace(' ', '-')
    return f"{number}-{safe}.pdf" if safe else f"{number}.pdf"
