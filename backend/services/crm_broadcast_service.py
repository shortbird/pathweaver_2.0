"""Mail merge for /admin/crm/lists: one email, one personal copy per person.

A superadmin resolves a list on the page (emailListRules.js), writes a
subject and a plain-text body with {{variables}}, and Optio sends each person
their own copy through SendGrid. The first use is the monthly note to school
admins: "you have {{student_count}} students, at {{price_per_student}} that is
{{amount_due}}, tell me if anything looks off".

Three kinds of variable:

  person   the recipient's own name, email, roles, school
  family   their children and the classes the children (or they) are in
  school   the billing sheet: one row per school, filled on the page. Student
           count and the student names come from the live roster; price,
           amount and note are the superadmin's own figures, sent as typed.
           Extra sheet columns become variables of their own.

The amount is NOT computed here. The page shows count x price and lets the
superadmin overwrite it, and whatever the sheet says when Send is pressed is
what every school is told. One rule, in one place (the page).

Rendering is a plain token replace, like the funnel steps
(crm_funnel_engine.render_step_content), not Jinja: the body is the
superadmin's text, escaped, with the values escaped too. An unknown token is
left in place and reported, so a typo is visible in the preview instead of
silently becoming an empty string.
"""
import re
import threading
from decimal import Decimal, InvalidOperation
from html import escape
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from services.crm_email_lists import display_name, roles_of
from utils.logger import get_logger
from utils.timestamps import now_iso

logger = get_logger(__name__)

TOKEN_RE = re.compile(r'\{\{\s*([A-Za-z0-9_]+)\s*\}\}')
COLUMN_KEY_RE = re.compile(r'^[a-z][a-z0-9_]{0,39}$')
URL_RE = re.compile(r'(https?://[^\s<]+[^\s<.,;:!?)\]])')

MAX_RECIPIENTS = 3000
MAX_VALUE = 2000

ROLE_WORDS = {
    'org_admin': 'school admin', 'campus_coordinator': 'campus coordinator',
    'superadmin': 'Optio admin',
}

# (name, label, group, example). The page draws its chips from this list.
VARIABLES: List[Tuple[str, str, str, str]] = [
    ('first_name', 'First name', 'person', 'Jordan'),
    ('last_name', 'Last name', 'person', 'Rivera'),
    ('full_name', 'Full name', 'person', 'Jordan Rivera'),
    ('email', 'Email', 'person', 'jordan@example.com'),
    ('roles', 'Roles', 'person', 'parent and school admin'),
    ('school', 'School name', 'person', 'Horizon'),
    ('children', 'Children (full names)', 'family', 'Ava Rivera and Max Rivera'),
    ('children_first_names', 'Children (first names)', 'family', 'Ava and Max'),
    ('child_count', 'Number of children', 'family', '2'),
    ('classes', 'Classes (theirs or their children\'s)', 'family', 'Robotics and Art'),
    ('billing_month', 'Billing month', 'school', 'November 2026'),
    ('student_count', 'Students in the school', 'school', '40'),
    ('student_list', 'Student names', 'school', 'Ava Rivera, Max Rivera and 38 more'),
    ('price_per_student', 'Price per student', 'school', '$25.00'),
    ('amount_due', 'Amount due', 'school', '$1,000.00'),
    ('billing_note', 'Billing note', 'school', ''),
    ('today', 'Today\'s date', 'person', 'October 12, 2026'),
]
BUILTIN = {v[0] for v in VARIABLES}
MONEY_KEYS = ('price_per_student', 'amount_due')


class BroadcastError(ValueError):
    """A refusal the route returns as a 400."""


# ── formatting ───────────────────────────────────────────────────────────────

def join_names(names: Iterable[str]) -> str:
    """'A', 'A and B', 'A, B and C'."""
    names = [n for n in names if n]
    if len(names) <= 1:
        return names[0] if names else ''
    return f"{', '.join(names[:-1])} and {names[-1]}"


def format_money(value: Any) -> str:
    """'1000' -> '$1,000.00'. Text that is not a number passes through as typed
    ("waived", "$40/student"), and blank stays blank."""
    text = str(value if value is not None else '').strip()
    if not text:
        return ''
    try:
        amount = Decimal(text.replace('$', '').replace(',', ''))
    except InvalidOperation:
        return text
    sign = '-' if amount < 0 else ''
    return f'{sign}${abs(amount):,.2f}'


def format_month(month: Optional[str]) -> str:
    """'2026-11' -> 'November 2026'; anything else as typed."""
    from datetime import datetime
    text = (month or '').strip()
    if not text:
        return ''
    try:
        return datetime.strptime(text, '%Y-%m').strftime('%B %Y')
    except ValueError:
        return text


def _first_name(user: Dict[str, Any]) -> str:
    first = (user.get('first_name') or '').strip()
    if first:
        return first
    return (display_name(user).split(' ') or [''])[0]


# ── the billing sheet ────────────────────────────────────────────────────────

def clean_sheet(raw: Any) -> Dict[str, Any]:
    """{'month', 'columns': [{key, label}], 'schools': {org_id: {key: text}}},
    validated. Raises BroadcastError."""
    raw = raw or {}
    if not isinstance(raw, dict):
        raise BroadcastError('The billing sheet must be an object')
    columns = []
    seen: Set[str] = set()
    for col in raw.get('columns') or []:
        key = (col or {}).get('key') if isinstance(col, dict) else None
        if not isinstance(key, str) or not COLUMN_KEY_RE.match(key):
            raise BroadcastError(f'Column name "{key}" must be lower-case letters, digits and _')
        if key in BUILTIN:
            raise BroadcastError(f'"{key}" is already a variable; name the column something else')
        if key in seen:
            continue
        seen.add(key)
        columns.append({'key': key, 'label': str(col.get('label') or key)[:80]})
    allowed = {'student_count', 'price_per_student', 'amount_due', 'billing_note'} | seen
    schools: Dict[str, Dict[str, str]] = {}
    for org_id, row in (raw.get('schools') or {}).items():
        if not isinstance(row, dict):
            raise BroadcastError('Each school row must be an object')
        schools[str(org_id)] = {
            k: str(v if v is not None else '').strip()[:MAX_VALUE]
            for k, v in row.items() if k in allowed}
    return {'month': str(raw.get('month') or '').strip()[:40], 'columns': columns, 'schools': schools}


def school_rosters(users: Iterable[Dict[str, Any]]) -> Dict[str, List[str]]:
    """{org_id: sorted student names}: every live account in the school that
    holds the student role, with or without an email of its own."""
    out: Dict[str, List[str]] = {}
    for u in users:
        org_id = u.get('organization_id')
        if not org_id or (u.get('deletion_status') or 'none') != 'none':
            continue
        if 'student' in roles_of(u):
            out.setdefault(org_id, []).append(display_name(u))
    for names in out.values():
        names.sort(key=str.lower)
    return out


# ── the per-person values ────────────────────────────────────────────────────

class MergeContext:
    """Everything a render needs, read once per preview or send."""

    def __init__(self, users: List[Dict[str, Any]],
                 classes_by_student: Dict[str, Set[str]],
                 guardians: Dict[str, Set[str]],
                 class_names: Dict[str, str],
                 org_names: Dict[str, str],
                 sheet: Dict[str, Any]):
        self.users = {u['id']: u for u in users}
        self.classes_by_student = classes_by_student
        self.class_names = class_names
        self.org_names = org_names
        self.sheet = sheet
        self.rosters = school_rosters(users)
        self.children: Dict[str, Set[str]] = {}
        for student_id, parent_ids in guardians.items():
            for parent_id in parent_ids:
                self.children.setdefault(parent_id, set()).add(student_id)

    def variables(self, user_id: str) -> Dict[str, str]:
        from datetime import date
        u = self.users.get(user_id) or {}
        kids = sorted((self.users[k] for k in self.children.get(user_id, ()) if k in self.users),
                      key=lambda k: display_name(k).lower())
        class_ids = set(self.classes_by_student.get(user_id, ()))
        for kid in kids:
            class_ids |= self.classes_by_student.get(kid['id'], set())
        org_id = u.get('organization_id')
        roster = self.rosters.get(org_id, []) if org_id else []
        row = (self.sheet.get('schools') or {}).get(org_id or '', {}) if org_id else {}
        roles = [ROLE_WORDS.get(r, r.replace('_', ' ')) for r in roles_of(u)] if u else []

        values = {
            'first_name': _first_name(u) if u else '',
            'last_name': (u.get('last_name') or '').strip(),
            'full_name': display_name(u) if u else '',
            'email': (u.get('email') or '').strip(),
            'roles': join_names(roles),
            'school': self.org_names.get(org_id, '') if org_id else '',
            'children': join_names(display_name(k) for k in kids),
            'children_first_names': join_names(_first_name(k) for k in kids),
            'child_count': str(len(kids)),
            'classes': join_names(sorted({self.class_names[c] for c in class_ids if c in self.class_names},
                                         key=str.lower)),
            'billing_month': format_month(self.sheet.get('month')),
            'student_count': '',
            'student_list': '',
            'price_per_student': '',
            'amount_due': '',
            'billing_note': '',
            'today': date.today().strftime('%B %-d, %Y'),
        }
        if org_id:
            values['student_count'] = row.get('student_count') or str(len(roster))
            values['student_list'] = join_names(roster)
            values['price_per_student'] = format_money(row.get('price_per_student'))
            values['amount_due'] = format_money(row.get('amount_due'))
            values['billing_note'] = row.get('billing_note', '')
        for col in self.sheet.get('columns') or []:
            values[col['key']] = row.get(col['key'], '') if org_id else ''
        return values


# ── rendering ────────────────────────────────────────────────────────────────

def tokens_in(*texts: str) -> List[str]:
    found: List[str] = []
    for text in texts:
        for name in TOKEN_RE.findall(text or ''):
            if name not in found:
                found.append(name)
    return found


def render_text(template: str, values: Dict[str, str]) -> str:
    return TOKEN_RE.sub(lambda m: values[m.group(1)] if m.group(1) in values else m.group(0),
                        template or '')


def render_html(body: str, values: Dict[str, str]) -> str:
    """The plain-text body as a plain, personal-looking HTML email: blank lines
    make paragraphs, single newlines make line breaks, bare links are linked.
    Escape first, so neither the body nor a value can inject markup."""
    escaped_values = {k: escape(v) for k, v in values.items()}
    text = render_text(escape(body or '', quote=False), escaped_values)
    paragraphs = [p.strip('\n') for p in re.split(r'\n\s*\n', text.replace('\r\n', '\n')) if p.strip()]
    html_paragraphs = ''.join(
        '<p style="margin:0 0 16px;">'
        + URL_RE.sub(r'<a href="\1" style="color:#6D469B;">\1</a>', p).replace('\n', '<br>')
        + '</p>'
        for p in paragraphs)
    return ('<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;">'
            '<div style="max-width:600px;font-family:Arial,Helvetica,sans-serif;font-size:15px;'
            f'line-height:1.55;color:#1f2937;">{html_paragraphs}</div></body></html>')


def render(subject: str, body: str, values: Dict[str, str]) -> Dict[str, Any]:
    used = tokens_in(subject, body)
    return {
        'subject': render_text(subject, values).replace('\n', ' ').strip(),
        'html': render_html(body, values),
        'text': render_text(body, values),
        'unknown': [t for t in used if t not in values],
        'blank': [t for t in used if t in values and not values[t].strip()],
    }


# ── who gets it ──────────────────────────────────────────────────────────────

def plan_recipients(user_ids: Iterable[str], users: Dict[str, Dict[str, Any]],
                    suppressed: Set[str], include_suppressed: bool) -> List[Dict[str, Any]]:
    """One row per address, in the order given. A person the page sent who has
    no email, is being deleted or (unless asked) unsubscribed is kept as a
    skipped row with the reason, so the history says why they got nothing."""
    rows: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for uid in user_ids:
        u = users.get(uid)
        if not u:
            continue
        email = (u.get('email') or '').strip().lower()
        if not email or email in seen:
            continue
        seen.add(email)
        reason = None
        if (u.get('deletion_status') or 'none') != 'none':
            reason = 'Account is being deleted'
        elif email in suppressed and not include_suppressed:
            reason = 'Unsubscribed'
        rows.append({'user_id': uid, 'email': email, 'name': display_name(u),
                     'status': 'skipped' if reason else 'queued', 'reason': reason})
    return rows


def summarize(rows: List[Dict[str, Any]], ctx: MergeContext, subject: str, body: str) -> Dict[str, Any]:
    """For the confirm step: who would be blank on which variable."""
    used = tokens_in(subject, body)
    unknown = [t for t in used if t not in BUILTIN and t not in {c['key'] for c in ctx.sheet.get('columns') or []}]
    blank: Dict[str, List[str]] = {}
    for r in rows:
        if r['status'] != 'queued':
            continue
        values = ctx.variables(r['user_id'])
        for t in used:
            if t in values and not values[t].strip():
                blank.setdefault(t, []).append(r['name'])
    return {
        'sendable': sum(1 for r in rows if r['status'] == 'queued'),
        'skipped': [{'name': r['name'], 'email': r['email'], 'reason': r['reason']}
                    for r in rows if r['status'] == 'skipped'],
        'unknown': unknown,
        'blank': [{'variable': k, 'count': len(v), 'names': v[:10]} for k, v in blank.items()],
    }


# ── sending ──────────────────────────────────────────────────────────────────

def send_one(to_email: str, rendered: Dict[str, Any], sender_name: str, reply_to: str,
             broadcast_id: Optional[str] = None) -> bool:
    from services.email_service import email_service
    return email_service.send_email(
        to_email=to_email,
        subject=rendered['subject'],
        html_body=rendered['html'],
        text_body=rendered['text'],
        sender_name_override=sender_name or None,
        reply_to=reply_to or None,
        # One personal note per person; a copy each to support would flood it.
        support_copy=False,
        categories=['crm', 'broadcast'],
        custom_args={'broadcast_id': broadcast_id} if broadcast_id else None,
    )


def run_broadcast(repo, broadcast: Dict[str, Any], queued: List[Dict[str, Any]],
                  ctx: MergeContext, skipped: int) -> Dict[str, int]:
    """Send every queued row and record each outcome. Never raises: a failure
    on one person is that person's row, not the end of the send."""
    sent = failed = 0
    for row in queued:
        try:
            rendered = render(broadcast['subject'], broadcast['body'], ctx.variables(row['user_id']))
            ok = send_one(row['email'], rendered, broadcast.get('sender_name') or '',
                          broadcast.get('reply_to') or '', broadcast['id'])
        except Exception as e:  # noqa: BLE001
            logger.error(f'[broadcast {broadcast["id"][:8]}] render/send to {row["email"]} failed: {e}')
            rendered, ok = {'subject': None}, False
        fields = {'status': 'sent' if ok else 'failed', 'subject': rendered.get('subject')}
        if ok:
            sent += 1
            fields['sent_at'] = now_iso()
        else:
            failed += 1
            fields['reason'] = 'SendGrid did not accept it'
        try:
            repo.mark_recipient(row['id'], fields)
            if (sent + failed) % 10 == 0:
                repo.set_fields(broadcast['id'], {'sent_count': sent, 'failed_count': failed})
        except Exception as e:  # noqa: BLE001
            logger.warning(f'[broadcast {broadcast["id"][:8]}] could not record {row["email"]}: {e}')
    counts = {'sent_count': sent, 'failed_count': failed, 'skipped_count': skipped}
    try:
        repo.finish(broadcast['id'], counts, 'failed' if queued and not sent else 'sent')
    except Exception as e:  # noqa: BLE001
        logger.error(f'[broadcast {broadcast["id"][:8]}] could not finish: {e}')
    return counts


def start_broadcast(repo, broadcast, queued, ctx, skipped) -> None:
    threading.Thread(target=run_broadcast, args=(repo, broadcast, queued, ctx, skipped),
                     daemon=True).start()
