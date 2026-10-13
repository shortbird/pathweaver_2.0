"""
The credit report a reviewer sends to a family (2026-10-13).

Tanner asked for "an optio-branded PDF outlining exactly what credits were
awarded from which sources that I can send to the parent". So the report
answers three questions, in this order:

  1. Where does the student stand against the diploma, per subject?
  2. Where did each credit come from -- Optio work, or which other school?
  3. What does the transferred credit cost? (Free from an accredited school's
     transcript; otherwise the student's credit price, from pricing.json.)

The per-record decisions were dropped on 2026-10-13 ("we don't need the prior
learning decisions here"); records still waiting are listed so nobody reads
them as counted.

It reads the same numbers the reviewer sees in the student workspace
(sis_prior_learning_queue.workspace), so the PDF and the screen cannot
disagree. Nothing here writes; feed it the workspace payload, get bytes.

PyMuPDF Story (HTML + CSS) like class_credit_pdf_service: already deployed,
no new dependency, and it embeds the Poppins files in backend/assets/fonts.
"""

import html as html_lib
import io
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import fitz  # PyMuPDF

from utils.logger import get_logger
from utils.money import format_cents
from utils.school_subjects import get_display_name

logger = get_logger(__name__)

PURPLE = '#6D469B'
PINK = '#EF597B'
INK = '#111827'
BODY = '#374151'
MUTED = '#6b7280'
RULE = '#e5e7eb'

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')
LOGO_FILE = 'optio-logo.png'
LOGO_WIDTH = 130
LOGO_ASPECT = 229 / 560
FONTS = {'Poppins-Regular.ttf': 'normal', 'Poppins-SemiBold.ttf': 'bold'}

PAGE_MARGIN = 50

CSS = f"""
@font-face {{ font-family: Poppins; src: url(Poppins-Regular.ttf); }}
@font-face {{ font-family: Poppins; src: url(Poppins-SemiBold.ttf); font-weight: bold; }}
body {{ font-family: Poppins, sans-serif; font-size: 9.5pt; color: {BODY}; }}
h1 {{ font-size: 19pt; color: {INK}; margin: 6pt 0 0 0; }}
h2 {{ font-size: 12pt; color: {PURPLE}; margin: 16pt 0 4pt 0; }}
h3 {{ font-size: 10pt; color: {INK}; margin: 8pt 0 2pt 0; }}
p {{ margin: 3pt 0; line-height: 1.4; }}
.eyebrow {{ font-size: 7.5pt; color: {PINK}; font-weight: bold; letter-spacing: 1.5px; }}
.muted {{ color: {MUTED}; font-size: 8.5pt; }}
.summary {{ border: 1px solid {RULE}; border-left: 3px solid {PINK}; padding: 8pt 10pt; margin: 10pt 0; }}
.big {{ font-size: 15pt; color: {PURPLE}; font-weight: bold; }}
table {{ width: 100%; border-collapse: collapse; margin: 4pt 0; }}
th {{ text-align: left; font-size: 8pt; color: {MUTED}; border-bottom: 1px solid {RULE}; padding: 3pt 4pt; }}
td {{ font-size: 9pt; border-bottom: 1px solid {RULE}; padding: 3pt 4pt; }}
.num {{ text-align: right; }}
.met {{ color: #15803d; font-weight: bold; }}
.dash {{ color: #d1d5db; }}
tr.total td {{ font-weight: bold; color: {INK}; border-top: 1px solid {MUTED}; border-bottom: none; }}
.tag {{ font-size: 7.5pt; font-weight: bold; color: {MUTED}; }}
.tag-free {{ font-size: 7.5pt; font-weight: bold; color: #15803d; }}
.source {{ border-left: 3px solid {PURPLE}; padding: 2pt 0 2pt 8pt; margin: 8pt 0; }}
"""


def _esc(value: Any) -> str:
    return html_lib.escape(str(value if value is not None else ''))


def _num(value: Any) -> str:
    """1.0 -> '1', 0.5 -> '0.5', 1.25 -> '1.25'."""
    try:
        n = round(float(value), 2)
    except (TypeError, ValueError):
        return '0'
    return f'{n:g}'


def _cell(value: Any) -> str:
    """A table number, with a faint dash for zero so the real numbers stand out."""
    try:
        zero = round(float(value or 0), 2) == 0
    except (TypeError, ValueError):
        zero = True
    return '<span class="dash">–</span>' if zero else _num(value)


def _price(cents: Any) -> str:
    """'Free' for nothing owed, else utils.money's compact dollars ('$50')."""
    return 'Free' if not int(cents or 0) else (format_cents(cents, compact=True) or '')


def _date(value: Optional[str]) -> str:
    if not value:
        return ''
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).strftime('%B %-d, %Y')
    except ValueError:
        return str(value)[:10]


def _credit_list(credits: Dict[str, Any], order: Optional[List[str]] = None) -> str:
    """'1 Language Arts, 2 Social Studies', in the subject table's order."""
    rank = {s: i for i, s in enumerate(order or [])}
    items = sorted((credits or {}).items(), key=lambda kv: rank.get(kv[0], len(rank)))
    parts = [f'{_num(c)} {_esc(get_display_name(s))}' for s, c in items if float(c or 0) > 0]
    return ', '.join(parts) or 'no credit'


def _archive() -> fitz.Archive:
    archive = fitz.Archive()
    for name in [LOGO_FILE, *FONTS]:
        sub = 'fonts' if name.endswith('.ttf') else ''
        try:
            with open(os.path.join(ASSETS, sub, name), 'rb') as fh:
                archive.add(fh.read(), name)
        except OSError as e:
            logger.warning(f'credit report asset {name} unavailable: {e}')
    return archive


def build_html(data: Dict[str, Any], generated_on: Optional[str] = None) -> str:
    """The report as HTML. Separate from rendering so tests can read it."""
    student = data.get('student') or {}
    progress = data.get('progress') or {}
    records = data.get('records') or []
    transfers = data.get('transfer_credits') or []
    cost = data.get('transfer_cost') or {}
    generated = generated_on or datetime.now().strftime('%B %-d, %Y')

    subjects = progress.get('subjects') or []
    order = [s.get('subject') for s in subjects]
    optio_total = round(sum(s.get('optio', 0) for s in subjects), 2)
    transfer_total = round(sum(s.get('transfer', 0) for s in subjects), 2)
    needed_total = round(sum(max(0, s.get('required', 0) - s.get('earned', 0)) for s in subjects), 2)

    out: List[str] = [
        f'<p><img src="{LOGO_FILE}" width="{LOGO_WIDTH}" height="{int(LOGO_WIDTH * LOGO_ASPECT)}"></p>',
        '<p class="eyebrow">CREDIT REPORT</p>',
        f'<h1>{_esc(student.get("name") or "Student")}</h1>',
        f'<p class="muted">{_esc(", ".join(student.get("schools") or []))}'
        f'{" · " if student.get("schools") else ""}Prepared {generated}</p>',
        '<div class="summary">',
        f'<p><span class="big">{_num(progress.get("total_counted"))}</span> of '
        f'{_num(progress.get("total_required"))} diploma credits complete</p>',
        f'<p class="muted">{_num(optio_total)} earned through Optio · '
        f'{_num(transfer_total)} transferred from other schools and prior learning'
        + (f' · transfer cost {_price(cost.get("total_cents"))}' if cost.get('lines') else '')
        + '</p>',
        '</div>',
    ]

    # Fixed widths: left to the renderer, the subject column took the slack
    # and "Still needed" drifted to the far edge.
    out += [
        '<h2>Credit by subject</h2>',
        '<table><tr><th style="width:34%">Subject</th>'
        '<th class="num" style="width:13%">Optio</th>'
        '<th class="num" style="width:13%">Transferred</th>'
        '<th class="num" style="width:13%">Earned</th>'
        '<th class="num" style="width:13%">Required</th>'
        '<th class="num" style="width:14%">Still needed</th></tr>',
    ]
    for s in subjects:
        needed = max(0, s.get('required', 0) - s.get('earned', 0))
        out.append(
            f'<tr><td>{_esc(s.get("name"))}</td>'
            f'<td class="num">{_cell(s.get("optio"))}</td>'
            f'<td class="num">{_cell(s.get("transfer"))}</td>'
            f'<td class="num">{_cell(s.get("earned"))}</td>'
            f'<td class="num">{_num(s.get("required"))}</td>'
            + ('<td class="num met">Met</td>' if needed <= 0 else f'<td class="num">{_num(needed)}</td>')
            + '</tr>')
    out.append(
        f'<tr class="total"><td>Total</td><td class="num">{_num(optio_total)}</td>'
        f'<td class="num">{_num(transfer_total)}</td>'
        f'<td class="num">{_num(progress.get("total_counted"))}</td>'
        f'<td class="num">{_num(progress.get("total_required"))}</td>'
        f'<td class="num">{_num(needed_total)}</td></tr>')
    out.append('</table>')
    out.append('<p class="muted">Credit beyond a subject\'s requirement is shown but '
               'counts toward the diploma total once.</p>')

    line_for = {line.get('transfer_credit_id'): line for line in cost.get('lines') or []}
    out.append('<h2>Where transferred credit came from</h2>')
    if not transfers:
        out.append('<p>No credit has been transferred in from other schools or prior learning.</p>')
    for t in transfers:
        # The cost line holds the accredited call that priced the row: the
        # records' for prior learning, the row's own for hand-entered credit.
        mark = line_for.get(t.get('id'), {}).get('accredited', t.get('accredited'))
        tag = ('<span class="tag-free">ACCREDITED</span>' if mark is True
               else '<span class="tag">PARTLY ACCREDITED</span>' if mark is None
               else '<span class="tag">NOT ACCREDITED</span>')
        out.append('<div class="source">')
        out.append(f'<h3>{_esc(t.get("school_name") or "Previous school")} &nbsp;{tag}</h3>')
        out.append(f'<p>{_credit_list(t.get("credits") or {}, order)}</p>')
        courses = [c for cs in (t.get('course_names') or {}).values() for c in (cs or [])]
        if courses:
            out.append('<p class="muted">Courses: ' + '; '.join(
                f'{_esc(c.get("name"))} ({_num(c.get("credits"))})' for c in courses) + '</p>')
        out.append('</div>')

    lines = cost.get('lines') or []
    if lines:
        rate = _price(cost.get('unaccredited_rate_cents'))
        out += [
            '<h2>Transfer credit cost</h2>',
            '<table><tr><th style="width:46%">School</th>'
            '<th class="num" style="width:18%">Credits</th>'
            '<th class="num" style="width:18%">Per credit</th>'
            '<th class="num" style="width:18%">Cost</th></tr>',
        ]
        for line in lines:
            out.append(
                f'<tr><td>{_esc(line.get("school_name") or "Previous school")}</td>'
                f'<td class="num">{_num(line.get("credits"))}</td>'
                f'<td class="num">{"Mixed" if line.get("rate_cents") is None else _price(line.get("rate_cents"))}</td>'
                f'<td class="num">{_price(line.get("cost_cents"))}</td></tr>')
        out.append(
            f'<tr class="total"><td>Total</td>'
            f'<td class="num">{_num(sum(line.get("credits", 0) for line in lines))}</td><td></td>'
            f'<td class="num">{_price(cost.get("total_cents"))}</td></tr>')
        out.append('</table>')
        why = ('the half-price rate for students whose school uses Optio'
               if cost.get('price_list') == 'licensed' else 'the Optio Academy rate')
        out.append(f'<p class="muted">Credit on an accredited school\'s official transcript '
                   f'transfers free. Other credit is reviewed and costs {rate} per credit, '
                   f'{why}.</p>')

    waiting = [r for r in records if r.get('status') in ('submitted', 'under_review', 'needs_info')]
    if waiting:
        out.append('<h2>Still in progress</h2>')
        out.append('<p>These records are not counted above yet.</p>')
        for r in waiting:
            status = 'Waiting for more from the family' if r['status'] == 'needs_info' else 'In review'
            out.append(f'<p>• {_esc(r.get("title"))} <span class="muted">— {status}</span></p>')

    out.append('<p class="muted" style="margin-top:16pt">Questions about this report? '
               'Reply to the email it came with, or write to support@optioeducation.com.</p>')
    return '<body>' + ''.join(out) + '</body>'


def render(data: Dict[str, Any]) -> bytes:
    """The report as PDF bytes."""
    archive = _archive()
    buf = io.BytesIO()
    writer = fitz.DocumentWriter(buf)
    story = fitz.Story(html=build_html(data), user_css=CSS, archive=archive)
    mediabox = fitz.paper_rect('letter')
    where = mediabox + (PAGE_MARGIN, PAGE_MARGIN, -PAGE_MARGIN, -PAGE_MARGIN)
    more = 1
    while more:
        device = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(device)
        writer.end_page()
    writer.close()
    with fitz.open(stream=buf.getvalue(), filetype='pdf') as doc:
        doc.set_metadata({
            'title': f"Credit report - {(data.get('student') or {}).get('name') or 'Student'}",
            'creator': 'Optio',
        })
        return doc.tobytes(garbage=3, deflate=True)
