"""Who to contact: the school's list of "for this, ask that person".

Ticket c58b7c0b (iCreate, org admin): "On parent dashboards, could we create
a section where there is who to contact info? So they can get in touch with
the right person for what they need without having to go through multiple
people... e.g. a question about something in the building message Becky;
late pick-up; general concern about classes message Sharmaine."

Stored in organizations.feature_flags.sis_settings.family_contacts as

    [{topic, staff_user_id?, name?, phone?, email?}, ...]

in the order the office set. The SIS Settings "Who to contact" card writes it
through PATCH /api/sis/settings, which runs `clean_contacts` first: a bad list
is refused whole and nothing is written. Families read it on the parent
context (/api/sis/parent/context) and the school hub context
(/api/sis/school/context), resolved by `contacts_for_orgs`.

A row names a person one of two ways: a staff member of the school
(staff_user_id -- their current name is read at display time, and the family
gets a Message button), or a plain name for someone without an account. The
phone and email are what the office typed; the staff member's own account
email is never handed out from here.
"""

import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from utils.logger import get_logger

logger = get_logger(__name__)

# admin client justified: the family reads the names of its school's staff,
#   which RLS does not grant a guardian; the caller is gated to its own
#   schools by the context it is building
from utils.admin_client import admin_client as _admin

SETTING_KEY = 'family_contacts'
MAX_CONTACTS = 20
MAX_TOPIC = 80
MAX_NAME = 80
MAX_PHONE = 40
MAX_EMAIL = 120

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
_PHONE_RE = re.compile(r'^[0-9+().\-\s]+(\s*(x|ext\.?)\s*[0-9]+)?$', re.I)


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ''


def _users(ids: List[str], columns: str) -> Dict[str, Dict[str, Any]]:
    from repositories.user_repository import UserRepository
    return UserRepository(client=_admin()).find_by_ids(ids, select_fields=columns)


def _staff_of_org(org_id: str, user_ids: Iterable[str]) -> set:
    """The ids, of those given, that are staff members of this school."""
    from services.sis_service import STAFF_ORG_ROLES, _user_org_roles
    ids = [i for i in dict.fromkeys(user_ids) if isinstance(i, str) and i]
    if not ids:
        return set()
    rows = _users(ids, 'id, organization_id, org_role, org_roles').values()
    return {u['id'] for u in rows
            if u.get('organization_id') == org_id
            and set(_user_org_roles(u)) & set(STAFF_ORG_ROLES)}


def clean_contacts(org_id: str, raw: Any) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    """(the list to store, None) or (None, the reason it is refused).

    None or [] clears the list (stored as null, so the key goes away)."""
    if raw is None:
        return [], None
    if not isinstance(raw, list):
        return None, 'Who to contact must be a list'
    if len(raw) > MAX_CONTACTS:
        return None, f'Who to contact holds at most {MAX_CONTACTS} people'
    out: List[Dict[str, Any]] = []
    for i, entry in enumerate(raw, start=1):
        if not isinstance(entry, dict):
            return None, f'Contact {i} is not a contact'
        topic = _text(entry.get('topic'))
        name = _text(entry.get('name'))
        phone = _text(entry.get('phone'))
        email = _text(entry.get('email'))
        staff = entry.get('staff_user_id') or None
        if not topic:
            return None, f'Contact {i} needs a topic (what to contact them about)'
        if len(topic) > MAX_TOPIC:
            return None, f'Contact {i}: the topic is longer than {MAX_TOPIC} characters'
        if len(name) > MAX_NAME:
            return None, f'Contact {i}: the name is longer than {MAX_NAME} characters'
        if staff is not None and not isinstance(staff, str):
            return None, f'Contact {i}: the staff member is not valid'
        if not staff and not name:
            return None, f'Contact {i} needs a staff member or a name'
        if phone and (len(phone) > MAX_PHONE or not _PHONE_RE.match(phone)):
            return None, f'Contact {i}: the phone number is not valid'
        if email and (len(email) > MAX_EMAIL or not _EMAIL_RE.match(email)):
            return None, f'Contact {i}: the email address is not valid'
        row: Dict[str, Any] = {'topic': topic}
        if staff:
            row['staff_user_id'] = staff
        if name:
            row['name'] = name
        if phone:
            row['phone'] = phone
        if email:
            row['email'] = email
        out.append(row)
    wanted = {r['staff_user_id'] for r in out if r.get('staff_user_id')}
    if wanted:
        staff_ids = _staff_of_org(org_id, wanted)
        if wanted - staff_ids:
            return None, 'A contact can only be a staff member of this school'
    return out, None


def _stored(settings: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = (settings or {}).get(SETTING_KEY)
    return [c for c in (raw if isinstance(raw, list) else [])
            if isinstance(c, dict) and _text(c.get('topic'))]


def contacts_for_orgs(viewer_id: Optional[str],
                      settings_by_org: Dict[str, Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Each school's list as a family reads it: {org_id: [contact, ...]}.

    A contact is {topic, name, phone, email, staff_user_id, message_user_id}.
    `name` is the staff member's current name when the row names one (else
    the typed name). A staff member who has left the school is shown by the
    typed name alone, with no Message button, or dropped when there is none.

    `message_user_id` is who "Message" opens a thread with: the staff member,
    or -- when this family writes to the front office through the school's
    shared inbox (school_inbox_service.school_mail_contact_ids) -- the school
    account, because a thread with the person by name would never open.

    One users read for every school; never raises (an empty answer hides the
    card, which is better than a broken family home).
    """
    lists = {oid: _stored(s) for oid, s in (settings_by_org or {}).items()}
    if not any(lists.values()):
        return {oid: [] for oid in lists}
    staff_ids = list({c['staff_user_id'] for cs in lists.values() for c in cs
                      if isinstance(c.get('staff_user_id'), str)})
    people: Dict[str, Dict[str, Any]] = {}
    hidden: set = set()
    inbox_by_org: Dict[str, str] = {}
    try:
        if staff_ids:
            from services.sis_service import STAFF_ORG_ROLES, _full_name, _user_org_roles
            found = _users(staff_ids, 'id, first_name, last_name, display_name, preferred_name, '
                                      'organization_id, org_role, org_roles').values()
            people = {u['id']: {'name': _full_name(u), 'org': u.get('organization_id')}
                      for u in found if set(_user_org_roles(u)) & set(STAFF_ORG_ROLES)}
            if viewer_id and people:
                from services import school_inbox_service
                hidden = set(school_inbox_service.school_mail_contact_ids(viewer_id, list(people)))
                for oid in (lists if hidden else ()):
                    org = school_inbox_service.get_org(oid) or {}
                    if org.get('inbox_user_id'):
                        inbox_by_org[oid] = org['inbox_user_id']
    except Exception as e:  # noqa: BLE001
        logger.warning(f'family contacts: staff lookup failed: {e}')
        people, hidden = {}, set()

    out: Dict[str, List[Dict[str, Any]]] = {}
    for oid, cs in lists.items():
        rows = []
        for c in cs:
            sid = c.get('staff_user_id') if isinstance(c.get('staff_user_id'), str) else None
            person = people.get(sid) if sid else None
            if person and person['org'] != oid:
                person = None
            typed = _text(c.get('name'))
            name = (person or {}).get('name') or typed
            if not name and not _text(c.get('phone')) and not _text(c.get('email')):
                continue
            message_to = None
            if person:
                message_to = inbox_by_org.get(oid) if sid in hidden else sid
            rows.append({
                'topic': _text(c.get('topic')),
                'name': name or None,
                'phone': _text(c.get('phone')) or None,
                'email': _text(c.get('email')) or None,
                'staff_user_id': sid if person else None,
                'message_user_id': message_to,
            })
        out[oid] = rows
    return out
