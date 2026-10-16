"""
The interest list (sis_interest_list_entries): families who want a place in
line BEFORE they register or pay anything.

Apogee NoCo, 2026-10-16: "I want to create a waitlist for 2027-28. I have a lot
of pre-K families asking about kinder for next year. I need a place to put them
before they pay a registration fee."

Three lists, three different jobs -- keep them apart:

    sis_interest_list_entries   this one. No account, no fee. A parent's
                                contact details and their children's first
                                names and birthdays, typed on the public
                                registration link. Families call it "the
                                waitlist"; staff see it as the Interest list.
    sis_enrollment_waitlist     a registered STUDENT whose age group is gated,
                                entered inside the funnel after the fee
                                (sis_enrollment_waitlist_service).
    sis_waitlist_entries        an enrolled student waiting on a class seat
                                (sis_waitlist_service).

Setting: feature_flags.registration.interest_list = {"enabled": bool,
"label": str}. The label ("2027-28 school year") is what families see on the
button and the form, and is copied onto each entry so a list kept across years
still says which year a family asked about.

Status: waiting -> invited (staff emailed the registration link) -> registered
(the same email submitted the funnel's family step; mark_registered) or
removed (staff took them off; restorable to waiting).

Admin (service_role) client throughout: the table is RLS-locked to the backend.
The public join is authorized by the school's own registration link; every
staff call is authorized by the route's role and org gate.
"""

import re
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from services.sis_eligibility import _coerce_date, age_on
from utils.registration_config import get_registration_config
from utils.validation import validate_uuid
from utils.logger import get_logger

logger = get_logger(__name__)

TABLE = 'sis_interest_list_entries'
STATUSES = ('waiting', 'invited', 'registered', 'removed')
# Rows a rejoin refreshes and a registration closes: the family is still in line.
LIVE_STATUSES = ('waiting', 'invited')

MAX_CHILDREN = 8
MAX_NAME = 80
MAX_TEXT = 200
MAX_NOTES = 2000
MAX_LABEL = 80

# Links go to families, so they point at the app host, never www (www 404s SPA
# routes it does not know). Same rule as routes/school_onboarding.py.
PROD_APP_URL = 'https://app.optioeducation.com'


# admin client justified: a public join has no session at all, and the staff
#   list reads every family's row in the org, which no single caller can see
#   under RLS; the registration link (public) or the route's role+org gate
#   (staff) is the authorization
from utils.admin_client import admin_client as _admin
from repositories.sis_interest_list_repository import SisInterestListRepository


def _repo() -> SisInterestListRepository:
    return SisInterestListRepository(client=_admin())


class InterestListError(Exception):
    """A request the list refuses. `message` is safe to show the caller."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


# ── Setting ──────────────────────────────────────────────────────────────────

def settings_from_flags(feature_flags: Any) -> Dict[str, Any]:
    """{'enabled': bool, 'label': str} from the org's registration config."""
    cfg = get_registration_config(feature_flags)
    raw = cfg.get('interest_list') if isinstance(cfg, dict) else None
    raw = raw if isinstance(raw, dict) else {}
    label = raw.get('label')
    return {
        'enabled': raw.get('enabled') is True,
        'label': label.strip()[:MAX_LABEL] if isinstance(label, str) else '',
    }


# ── Public join ──────────────────────────────────────────────────────────────

_TAG_RE = re.compile(r'<[^>]*>')


def _text(value: Any, limit: int) -> str:
    """Plain text as typed, tags and null bytes removed, cut to `limit`.

    Not utils.validation.sanitize_input: that one also HTML-escapes, so an
    "O'Brien" or a "Twins & cousins" note would be stored as entities and
    shown that way on the staff card. Escaping happens at output instead --
    React escapes on render, and the emails here escape with _esc."""
    text = _TAG_RE.sub('', str(value or '')).replace('\x00', '')
    return text.strip()[:limit].strip()


def _clean_children(raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        raise InterestListError('Add at least one child.')
    children = []
    today = date.today()
    for item in raw[:MAX_CHILDREN]:
        if not isinstance(item, dict):
            continue
        first = _text(item.get('first_name'), MAX_NAME)
        dob_raw = str(item.get('dob') or '').strip()
        if not first and not dob_raw:
            continue  # an empty card the parent added and never filled in
        if not first:
            raise InterestListError("Enter each child's first name.")
        dob = _coerce_date(dob_raw)
        if dob is None:
            raise InterestListError(f"Enter {first}'s date of birth.")
        if dob > today or age_on(dob, today) > 20:
            raise InterestListError(f"Check {first}'s date of birth.")
        children.append({'first_name': first, 'dob': dob.isoformat()})
    if not children:
        raise InterestListError('Add at least one child.')
    return children


def clean_join(body: Dict[str, Any]) -> Dict[str, Any]:
    """The family's form as it may be stored. Raises InterestListError."""
    from services.registration_funnel_support import _valid_email

    first = _text(body.get('parent_first_name'), MAX_NAME)
    last = _text(body.get('parent_last_name'), MAX_NAME)
    email = str(body.get('email') or '').strip().lower()
    if not first or not last:
        raise InterestListError('Enter your first and last name.')
    if not _valid_email(email) or len(email) > 254:
        raise InterestListError('Enter a valid email address.')
    return {
        'parent_first_name': first,
        'parent_last_name': last,
        'email': email,
        'phone': _text(body.get('phone'), 40) or None,
        'children': _clean_children(body.get('children')),
        'interest': _text(body.get('interest'), MAX_TEXT) or None,
        'notes': _text(body.get('notes'), MAX_NOTES) or None,
    }


def join(org: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    """Add a family to the org's interest list from the public form.

    A family already in line (waiting or invited) with the same email is
    refreshed in place and keeps its place, so a parent who fills the form in
    twice is one row, not two. The answer is the same either way: the public
    endpoint must not tell a stranger whether an email is already on a list.

    Raises InterestListError when the list is off or the form is invalid.
    """
    org_id = org['id']
    setting = settings_from_flags(org.get('feature_flags'))
    if not setting['enabled']:
        raise InterestListError('This school is not taking waitlist sign-ups right now.')
    fields = clean_join(body)
    now = datetime.now(timezone.utc).isoformat()
    repo = _repo()

    entry_id = repo.live_entry_id(org_id, fields['email'])
    if entry_id:
        repo.update(org_id, entry_id, {**fields, 'updated_at': now})
        entry = {**fields, 'id': entry_id, 'organization_id': org_id, 'list_label': setting['label'] or None}
        rejoined = True
    else:
        row = {**fields, 'organization_id': org_id, 'list_label': setting['label'] or None,
               'status': 'waiting'}
        entry = repo.insert(row)
        rejoined = False

    _send_confirmation(org, entry, setting['label'])
    if not rejoined:
        try:
            from services.registration_alerts import notify_interest_list_joined
            notify_interest_list_joined(org, entry)
        except Exception as e:  # noqa: BLE001 -- the family is on the list; never fail them over mail
            logger.warning(f'interest list: office alert failed for org {org_id[:8]}: {e}')
    logger.info(f'interest list: org {org_id[:8]} {"refreshed" if rejoined else "new"} entry '
                f'{str(entry.get("id"))[:8]} ({len(fields["children"])} children)')
    return {'id': entry.get('id')}


# ── Staff list ───────────────────────────────────────────────────────────────

def list_entries(org_id: str) -> List[Dict[str, Any]]:
    """Every entry for the org, oldest first (the order families joined), with
    each child's age today.

    Age TODAY, not the school-year age the rest of the SIS uses
    (services/sis_age): these families are asking about a year that has not
    started, so the configured first day of school is the wrong date. The
    birthday is shown beside it for the office to judge kindergarten cutoffs.
    """
    # Paged by id (fetch_all_rows owns the ordering), then put in join order.
    rows = _repo().list_for_org(org_id)
    rows.sort(key=lambda r: (str(r.get('created_at') or ''), str(r.get('id') or '')))
    for row in rows:
        row['children'] = [
            {**c, 'age': age_on(c.get('dob'))}
            for c in (row.get('children') or []) if isinstance(c, dict)
        ]
    return rows


def _entry(org_id: str, entry_id: str) -> Dict[str, Any]:
    ok, _ = validate_uuid(str(entry_id or ''))
    row = _repo().get(org_id, entry_id) if ok else None
    if not row:
        raise InterestListError('That family is not on this school\'s list.', 404)
    return row


def set_status(org_id: str, entry_id: str, status: str, *, by: str) -> Dict[str, Any]:
    """Remove a family (status 'removed') or put one back in line ('waiting')."""
    if status not in ('removed', 'waiting'):
        raise InterestListError('A family can be removed or put back in line.')
    entry = _entry(org_id, entry_id)
    now = datetime.now(timezone.utc).isoformat()
    patch: Dict[str, Any] = {'status': status, 'updated_at': now}
    if status == 'removed':
        patch.update({'removed_at': now, 'removed_by': by})
    else:
        patch.update({'removed_at': None, 'removed_by': None})
    _repo().update(org_id, entry['id'], patch)
    return {**entry, **patch}


def registration_link(org_id: str) -> Optional[str]:
    """The school's standing family registration link, or None when the school
    has not opened Registration yet (the setup tab creates it on first view)."""
    from app_config import Config
    from services.registration_funnel_support import LINK_PLACEHOLDER_SUFFIX
    rows = _repo().standing_parent_link_rows(org_id)
    row = next((r for r in rows if str(r.get('email') or '').endswith(LINK_PLACEHOLDER_SUFFIX)), None)
    if not row:
        return None
    url = (Config.FRONTEND_URL or '').rstrip('/')
    base = PROD_APP_URL if 'optioeducation.com' in url else (url or PROD_APP_URL)
    return f"{base}/enroll/{row['invitation_code']}"


def invite(org_id: str, entry_id: str, *, by: str) -> Dict[str, Any]:
    """Email the family the registration link and mark them invited.

    Inviting again re-sends (a family who lost the email); a registered or
    removed family is refused, because the email would be wrong for both.
    """
    entry = _entry(org_id, entry_id)
    if entry.get('status') not in LIVE_STATUSES:
        raise InterestListError(
            'This family has already registered.' if entry.get('status') == 'registered'
            else 'Put this family back in line before inviting them.')
    link = registration_link(org_id)
    if not link:
        raise InterestListError('Your school has no registration link yet. Open Registration > '
                                'Registration form once to create it, then try again.')
    org = _org(org_id)
    emailed = _send_invite(org, entry, link)
    now = datetime.now(timezone.utc).isoformat()
    patch = {'status': 'invited', 'invited_at': now, 'invited_by': by, 'updated_at': now}
    _repo().update(org_id, entry['id'], patch)
    return {'entry': {**entry, **patch}, 'emailed': emailed}


def mark_registered(org_id: str, email: Optional[str]) -> int:
    """Close the family's live entry once they register with the same email.

    Called from the funnel's family step (the moment a family has children on
    file). Never raises: the registration has already happened."""
    email = str(email or '').strip().lower()
    if not org_id or not email:
        return 0
    try:
        now = datetime.now(timezone.utc).isoformat()
        rows = _repo().close_live_by_email(
            org_id, email, {'status': 'registered', 'registered_at': now, 'updated_at': now})
        if rows:
            logger.info(f'interest list: {len(rows)} entr{"y" if len(rows) == 1 else "ies"} '
                        f'in org {org_id[:8]} marked registered')
        return len(rows)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'interest list: mark registered failed for org {org_id[:8]}: {e}')
        return 0


# ── Email ────────────────────────────────────────────────────────────────────

def _org(org_id: str) -> Dict[str, Any]:
    from repositories.organization_repository import OrganizationRepository
    return OrganizationRepository().find_by_id(org_id) or {'id': org_id}


def _esc(v: Any) -> str:
    return (str(v) if v is not None else '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _child_names(entry: Dict[str, Any]) -> str:
    names = [c.get('first_name') for c in (entry.get('children') or []) if c.get('first_name')]
    if len(names) <= 1:
        return names[0] if names else 'your child'
    return ', '.join(names[:-1]) + ' and ' + names[-1]


def _send_confirmation(org: Dict[str, Any], entry: Dict[str, Any], label: str) -> bool:
    """'You are on the waitlist' to the parent. Best effort."""
    try:
        from services.email_service import email_service
        org_name = org.get('name') or 'the school'
        for_what = f' for {label}' if label else ''
        html = (
            f"<p>Hi {_esc(entry.get('parent_first_name')) or 'there'},</p>"
            f"<p>You are on the {_esc(org_name)} waitlist{_esc(for_what)} with "
            f"{_esc(_child_names(entry))}.</p>"
            f"<p>You do not need to do anything now. When a spot is ready, the school "
            f"will email you a link to register.</p>"
            f"<p>If you did not ask to join this list, you can ignore this email.</p>"
        )
        return bool(email_service.send_email(
            entry['email'], f'{org_name}: you are on the waitlist', html))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'interest list: confirmation email failed for org {str(org.get("id"))[:8]}: {e}')
        return False


def _send_invite(org: Dict[str, Any], entry: Dict[str, Any], link: str) -> bool:
    """The registration link, to a family on the list. Best effort."""
    try:
        from services.email_service import email_service
        org_name = org.get('name') or 'the school'
        html = (
            f"<p>Hi {_esc(entry.get('parent_first_name')) or 'there'},</p>"
            f"<p>Thank you for waiting. {_esc(org_name)} is ready for you to register "
            f"{_esc(_child_names(entry))}.</p>"
            f"<p><a href=\"{_esc(link)}\" style=\"display:inline-block;background:#6d28d9;color:#fff;"
            f"text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;\">"
            f"Register now</a></p>"
            f"<p>Or copy this link into your browser: {_esc(link)}</p>"
            f"<p>Use this email address ({_esc(entry.get('email'))}) when you register, so the "
            f"school can match you to your place on the waitlist.</p>"
        )
        return bool(email_service.send_email(
            entry['email'], f'{org_name}: you can register now', html))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'interest list: invite email failed for entry {str(entry.get("id"))[:8]}: {e}')
        return False


def office_alert_lines(entry: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    """(children, details) lines for the office alert."""
    children = []
    for c in entry.get('children') or []:
        age = age_on(c.get('dob'))
        children.append(f"{c.get('first_name')} (born {c.get('dob')}"
                        + (f', {age} now)' if age is not None else ')'))
    details = [line for line in (
        f"Interested in: {entry['interest']}" if entry.get('interest') else '',
        f"Waitlist: {entry['list_label']}" if entry.get('list_label') else '',
        f"Notes: {entry['notes']}" if entry.get('notes') else '',
    ) if line]
    return children, details
