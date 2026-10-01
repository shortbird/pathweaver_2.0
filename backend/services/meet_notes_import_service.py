"""
Google Meet "Notes by Gemini" onto the CRM file of everyone in the meeting.

Why email and not Drive (2026-10-01): the Drive reader was shared on the
"Google Meet" folder, and 62 notes were attached from it by hand. From
2026-09-22 Gemini stopped putting new notes there, so a folder watch would
have read nothing. The notes email always arrives, wherever the doc lives, so
tanner@optioeducation.com has a Gmail filter that forwards every message from
gemini-notes@google.com to the import address:

    notes+<token>@<INBOUND_EMAIL_DOMAIN>

The token is derived from INBOUND_EMAIL_WEBHOOK_SECRET (see import_address), so
there is no extra env var; rotating that secret changes the address and the
Gmail filter has to be updated with it. Superadmin only on the read side: the
notes land in crm_person_notes, which only the superadmin console reads.

Who a note is about, in order. Each step only adds; nothing is guessed:

  1. The calendar event the notes came from (same title, started in the hours
     before the notes were written) on GOOGLE_CALENDAR_ID. Every guest with an
     Optio account gets the note; a guest with no account but a CRM lead gets
     it on the lead. Staff (@optioeducation.com) never do.
  2. A guest who is a parent: each of their children whose first name appears
     in the meeting title or the notes. A parent call about one child must not
     land on the siblings.
  3. When the calendar gives nobody: full names from the title
     ("Tanner Bowman (Pat Lee)") and from the next-step tags ("[Pat Lee]"),
     each kept only when exactly one account has that name.

A meeting that matches nobody is logged and dropped. The owner chose no review
list; the doc link is still in Gmail, and a note can be attached by hand.

The note body is the summary from the email, not the doc. Gemini now writes
each meeting as a tab of one doc per series, so an export of the doc would be
every meeting at once. The link keeps the tab, so it opens on this meeting.
"""
import hashlib
import hmac
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set
from zoneinfo import ZoneInfo

import requests

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

GEMINI_SENDER = 'gemini-notes@google.com'
FORWARDING_SENDER = 'forwarding-noreply@google.com'
STAFF_DOMAIN = 'optioeducation.com'
CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
REQUEST_TIMEOUT = 15
# Notes are written when the meeting ends; a long meeting started hours before.
EVENT_LOOKBACK = timedelta(hours=8)
FORWARDING_CODE_KEY = 'meet_notes_forwarding_confirmation'
MAX_SUMMARY_CHARS = 20_000
DENVER = ZoneInfo('America/Denver')

_ADDRESS_RE = re.compile(r'notes\+([a-f0-9]{24})@', re.IGNORECASE)
_TITLE_RE = re.compile(r'Notes from [“"](.+?)[”"]')
_GENERATED_RE = re.compile(
    r'auto-generated on\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4}),\s+(\d{1,2}:\d{2}\s*[AP]M)', re.IGNORECASE)
_DOC_RE = re.compile(r'https://docs\.google\.com/document/d/([A-Za-z0-9_-]{20,})[^"\'\s<>]*')
_TAB_RE = re.compile(r'[?&]tab=([A-Za-z0-9._-]+)')
_PAREN_NAME_RE = re.compile(r'\(([^()]+)\)')
_TAG_NAME_RE = re.compile(r'^\s*\[([^\[\]]+)\]', re.MULTILINE)
_SUMMARY_START = re.compile(r'may\s+contain\s+errors\.\s*', re.IGNORECASE)
_SUMMARY_END = re.compile(r'\n\s*(Meeting records|Is the content of this email helpful\?)', re.IGNORECASE)


# admin client justified: crm_* tables are service-role only, and the inbound
# webhook that calls this has no user session.
from utils.admin_client import admin_client as _db


def _repo():
    from repositories.crm_person_notes_repository import CrmPersonNotesRepository
    return CrmPersonNotesRepository(client=_db())


# ------------------------------------------------------------------ address

def _token() -> Optional[str]:
    secret = Config.INBOUND_EMAIL_WEBHOOK_SECRET
    if not secret:
        return None
    return hmac.new(str(secret).encode(), b'meet-notes-import', hashlib.sha256).hexdigest()[:24]


def import_address() -> Optional[str]:
    """Where the Gmail filter forwards the notes. None until inbound mail is
    configured."""
    token = _token()
    if not token or not Config.INBOUND_EMAIL_DOMAIN:
        return None
    return f'notes+{token}@{Config.INBOUND_EMAIL_DOMAIN}'


def is_import_address(*values: Optional[str]) -> bool:
    """True when any recipient field names the import address. A notes+ token
    that is not ours is still claimed, so it never falls through to the reply
    relay and gets logged there as a broken reply."""
    return any(v and _ADDRESS_RE.search(v) for v in values)


def _token_matches(*values: Optional[str]) -> bool:
    expected = _token()
    if not expected:
        return False
    for value in values:
        found = _ADDRESS_RE.search(value or '')
        if found and hmac.compare_digest(found.group(1).lower(), expected):
            return True
    return False


# ------------------------------------------------------------------ parsing

def _flatten(html: str) -> str:
    from services.crm_gmail_service import _html_to_text
    return _html_to_text(html)


def parse_notes_email(subject: Optional[str], text: Optional[str],
                      html: Optional[str]) -> Optional[Dict[str, Any]]:
    """{title, generated_at, doc_url, summary} from a Gemini notes email, or
    None when it is not one. Read from the body rather than the subject, so a
    hand-forwarded copy ("Fwd: ...") parses the same as the filter's."""
    body = text or _flatten(html or '')
    title_match = _TITLE_RE.search(body) or _TITLE_RE.search(subject or '')
    if not title_match:
        return None
    title = title_match.group(1).strip()

    generated_at = None
    gen = _GENERATED_RE.search(body)
    if gen:
        try:
            generated_at = datetime.strptime(
                f'{gen.group(1)} {gen.group(2).replace(" ", "")}', '%B %d, %Y %I:%M%p'
            ).replace(tzinfo=DENVER)
        except ValueError:
            generated_at = None

    doc_url = None
    doc = _DOC_RE.search(html or '') or _DOC_RE.search(body)
    if doc:
        tab = _TAB_RE.search(doc.group(0).replace('&amp;', '&'))
        doc_url = f'https://docs.google.com/document/d/{doc.group(1)}/edit'
        if tab:
            doc_url += f'?tab={tab.group(1)}'

    summary = body
    start = _SUMMARY_START.search(summary)
    if start:
        summary = summary[start.end():]
    end = _SUMMARY_END.search(summary)
    if end:
        summary = summary[:end.start()]
    summary = summary.strip()[:MAX_SUMMARY_CHARS]

    return {'title': title, 'generated_at': generated_at, 'doc_url': doc_url,
            'summary': summary}


def names_in(title: str, summary: str) -> List[str]:
    """Full names the notes name: "(Pat Lee)" in the title, "[Pat Lee]" at the
    start of a next-step line. Single words are not names here."""
    found = _PAREN_NAME_RE.findall(title) + _TAG_NAME_RE.findall(summary)
    out = []
    for name in found:
        name = ' '.join(name.split())
        if len(name.split()) >= 2 and name not in out:
            out.append(name)
    return out


def _mentions(first_name: Optional[str], *texts: str) -> bool:
    if not first_name or len(first_name.strip()) < 2:
        return False
    pattern = re.compile(rf'\b{re.escape(first_name.strip())}\b', re.IGNORECASE)
    return any(pattern.search(t or '') for t in texts)


# ------------------------------------------------------------------ calendar

def guest_emails(title: str, generated_at: Optional[datetime]) -> List[str]:
    """Guest emails of the calendar event these notes came from. Empty when
    the calendar is not configured, the event is not found, or Google fails;
    the name fallback still runs."""
    calendar_id = Config.GOOGLE_CALENDAR_ID
    if not calendar_id or not generated_at:
        return []
    from services.crm_calendar_service import _access_token
    token = _access_token()
    if not token:
        return []
    try:
        resp = requests.get(
            f'{CALENDAR_API}/calendars/{calendar_id}/events',
            headers={'Authorization': f'Bearer {token}'},
            params={'q': title, 'singleEvents': 'true', 'maxResults': '50',
                    'timeMin': (generated_at - EVENT_LOOKBACK).isoformat(),
                    'timeMax': (generated_at + timedelta(minutes=30)).isoformat()},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        events = resp.json().get('items') or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Meet notes: calendar lookup failed: {e}')
        return []

    wanted = ' '.join(title.split()).lower()
    matches = [e for e in events
               if ' '.join((e.get('summary') or '').split()).lower() == wanted
               and e.get('status') != 'cancelled']
    if not matches:
        return []
    # The latest start before the notes were written is this meeting.
    event = max(matches, key=lambda e: (e.get('start') or {}).get('dateTime') or '')
    owner = calendar_id.lower()
    emails = []
    for guest in event.get('attendees') or []:
        email = (guest.get('email') or '').strip().lower()
        if email and email != owner and not guest.get('resource') and not guest.get('self'):
            emails.append(email)
    return emails


# ------------------------------------------------------------------ matching

def _is_staff(email: Optional[str]) -> bool:
    return (email or '').lower().endswith('@' + STAFF_DOMAIN)


def _eligible(user: Dict[str, Any]) -> bool:
    return user.get('role') != 'superadmin' and not _is_staff(user.get('email'))


def resolve_people(title: str, summary: str, emails: List[str]) -> Dict[str, Any]:
    """{'users': [user rows], 'leads': [lead rows]} the note goes on."""
    repo = _repo()
    users: Dict[str, Dict[str, Any]] = {}
    leads: Dict[str, Dict[str, Any]] = {}

    guests = [e for e in emails if not _is_staff(e)]
    found = {u['email'].lower(): u for u in repo.users_by_emails(guests) if _eligible(u)}
    for email in guests:
        if email in found:
            users[found[email]['id']] = found[email]
            continue
        lead = repo.lead_for_email(email)
        if lead:
            leads[lead['id']] = lead

    # A parent guest: the children the meeting is about.
    from utils.class_membership import links_of_parent
    for user in list(users.values()):
        child_ids = list(links_of_parent(user['id']))
        for child in repo.users_by_ids(child_ids):
            if _eligible(child) and _mentions(child.get('first_name'), title, summary):
                users[child['id']] = child

    if not users and not leads:
        for name in names_in(title, summary):
            first, last = name.split(' ', 1)
            hits = [u for u in repo.users_by_full_name(first, last) if _eligible(u)]
            if len(hits) == 1:
                users[hits[0]['id']] = hits[0]

    return {'users': list(users.values()), 'leads': list(leads.values())}


def _author_id() -> Optional[str]:
    """Notes are written as the owner, like the ones attached by hand."""
    email = (Config.SUPERADMIN_EMAIL or '').strip().lower()
    if not email:
        return None
    user_id = _repo().user_id_for_email(email)
    return user_id


# ------------------------------------------------------------------ entry

def handle_inbound(*, to_header: Optional[str], envelope_to: Optional[str],
                   from_header: Optional[str], subject: Optional[str],
                   text: Optional[str], html: Optional[str],
                   dkim: Optional[str]) -> Dict[str, Any]:
    """Attach one forwarded notes email. Never raises for a bad message: the
    webhook answers 200 either way (see routes/inbound_email.py)."""
    from services.message_email_relay_service import extract_sender_email

    if not _token_matches(envelope_to, to_header):
        logger.warning('Meet notes rejected: wrong import token')
        return {'status': 'ignored', 'detail': 'bad token'}

    sender = extract_sender_email(from_header) or ''
    sender_domain = sender.rsplit('@', 1)[-1]
    # SendGrid reports "{@google.com : pass}". The token already gates this;
    # DKIM stops a leaked address from carrying a forged Gemini email.
    if f'@{sender_domain} : pass' not in (dkim or '').lower():
        logger.warning(f'Meet notes rejected: DKIM for {sender_domain} did not pass ({dkim!r})')
        return {'status': 'ignored', 'detail': 'dkim'}

    if sender == FORWARDING_SENDER:
        # Gmail's one-time "confirm this forwarding address" mail. The code is
        # kept so the owner can read it back once and finish the filter.
        from repositories.crm_mail_repository import CrmMailRepository
        CrmMailRepository(client=_db()).set_setting(
            FORWARDING_CODE_KEY, {'subject': subject, 'text': (text or '')[:2000]})
        logger.warning(f'Meet notes: Gmail forwarding confirmation received: {subject}')
        return {'status': 'forwarding_confirmation'}

    owners = {GEMINI_SENDER}
    owner_email = (Config.SUPERADMIN_EMAIL or '').strip().lower()
    if owner_email:
        owners.add(owner_email)
    if (Config.ADMIN_EMAIL or '').strip():
        owners.add(Config.ADMIN_EMAIL.strip().lower())
    if sender not in owners:
        logger.warning(f'Meet notes rejected: sender {sender!r} is not Gemini or the owner')
        return {'status': 'ignored', 'detail': 'sender'}

    parsed = parse_notes_email(subject, text, html)
    if not parsed or not parsed['doc_url']:
        logger.warning(f'Meet notes: not a Gemini notes email ({subject!r})')
        return {'status': 'ignored', 'detail': 'not notes'}

    return attach(parsed)


def attach(parsed: Dict[str, Any]) -> Dict[str, Any]:
    title, summary, doc_url = parsed['title'], parsed['summary'], parsed['doc_url']
    generated_at = parsed.get('generated_at')
    emails = guest_emails(title, generated_at)
    people = resolve_people(title, summary, emails)
    if not people['users'] and not people['leads']:
        logger.warning(f'Meet notes: nobody matched for {title!r} (guests {emails})')
        return {'status': 'unmatched', 'title': title}

    author_id = _author_id()
    if not author_id:
        logger.error('Meet notes: SUPERADMIN_EMAIL has no account; cannot write notes')
        return {'status': 'error', 'detail': 'no author'}

    from utils.timestamps import now_iso
    met_on = generated_at.date().isoformat() if generated_at else None
    when = generated_at.strftime('%b %-d, %Y') if generated_at else ''
    body = f'Meet notes: {title}' + (f' ({when})' if when else '')
    doc = {'doc_url': doc_url, 'doc_title': f'{title} - Notes by Gemini',
           'doc_text': summary or None, 'doc_fetched_at': now_iso() if summary else None}

    repo = _repo()
    attached: Set[str] = set()
    for user in people['users']:
        if repo.has_doc_note(user['id'], doc_url):
            continue
        repo.add_note(user['id'], author_id, body, met_on, doc)
        attached.add(user['id'])
    for lead in people['leads']:
        if repo.has_lead_doc_note(lead['id'], doc_url):
            continue
        repo.add_lead_note(lead['id'], author_id, body, met_on, doc)
        attached.add(lead['id'])

    result = {'status': 'attached', 'title': title, 'notes': len(attached),
              'users': [u['id'] for u in people['users']],
              'leads': [lead['id'] for lead in people['leads']]}
    logger.info(f'Meet notes: {result}')
    return result
