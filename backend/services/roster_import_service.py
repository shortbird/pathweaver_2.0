"""Roster import: a school hands us a spreadsheet instead of using signup links.

Hearthwood Academy enrolls families offline and sends the finished roster, so
there is no self-service moment where a parent creates their own account and
claims their kid. This module is that moment, performed in bulk by a superadmin:
one row is one student *and* their parent, and importing it produces two org
accounts, the parent_student_links row joining them, and a set-your-password
email to each new account.

Two entry points on purpose. `build_plan` reads the database but writes nothing,
so the superadmin sees exactly which accounts are new, which already exist, and
which rows are unusable before anything is created. `execute_plan` then does the
writes. A roster is a one-shot import against real families -- a preview that
can be wrong in the same ways as the commit is worth more than a faster path.

Re-running the same CSV is safe: an email that already has an account is reused
and linked, never recreated and never re-invited (that account already has a
password its owner chose).
"""

import csv
import io
import re
import secrets
import time
from typing import Any, Dict, List, Optional, Tuple

from utils.logger import get_logger

logger = get_logger(__name__)

# One paste, one school's roster. Beyond this the request outlives its own
# timeout -- every account is a serial auth call plus an email.
MAX_ROWS = 300

EMAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$')

# Header -> canonical field. The sheet comes from a school office, so match on
# the shape of the name rather than an exact string: "Student First Name",
# "student_first_name" and "First Name (Student)" all mean the same column.
FIELD_ALIASES = {
    'student_first': ('student first name', 'student first', 'first name student',
                      'studentfirstname', 'student_firstname'),
    'student_last': ('student last name', 'student last', 'last name student',
                     'studentlastname', 'student_lastname'),
    'student_email': ('student email', 'student email address', 'studentemail',
                      'student e mail'),
    'parent_first': ('parent first name', 'parent first', 'guardian first name',
                     'guardian first', 'parentfirstname'),
    'parent_last': ('parent last name', 'parent last', 'guardian last name',
                    'guardian last', 'parentlastname'),
    'parent_email': ('parent email', 'parent email address', 'guardian email',
                     'parentemail', 'parent e mail'),
}

REQUIRED_FIELDS = ('student_first', 'student_last', 'student_email')

PILLARS = ['Arts & Creativity', 'STEM & Logic', 'Life & Wellness',
           'Language & Communication', 'Society & Culture']


def _normalize_header(raw: str) -> str:
    """'Student  First_Name ' -> 'student first name'."""
    cleaned = re.sub(r'[^a-z0-9]+', ' ', (raw or '').lower()).strip()
    return re.sub(r'\s+', ' ', cleaned)


def _map_headers(fieldnames: List[str]) -> Dict[int, str]:
    """Map column index -> canonical field, ignoring columns we don't use."""
    mapping: Dict[int, str] = {}
    for index, raw in enumerate(fieldnames or []):
        header = _normalize_header(raw)
        if not header:
            continue
        for field, aliases in FIELD_ALIASES.items():
            if field in mapping.values():
                continue
            if header in aliases or header.replace(' ', '') in aliases:
                mapping[index] = field
                break
    return mapping


def _detect_delimiter(text: str) -> str:
    """The sample roster is tab-separated because it was pasted out of a sheet;
    a saved-as-CSV version of the same file is comma-separated."""
    first_line = text.splitlines()[0] if text.splitlines() else ''
    return '\t' if first_line.count('\t') >= first_line.count(',') and '\t' in first_line else ','


def parse_roster_csv(text: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    """Parse pasted roster text into normalized row dicts.

    Returns (rows, None) or (None, error). Rows carry `_row` (the line number the
    superadmin sees in their spreadsheet) so every message can point at one.
    """
    text = (text or '').lstrip('﻿').strip()
    if not text:
        return None, 'Paste the roster contents first'

    try:
        reader = csv.reader(io.StringIO(text), delimiter=_detect_delimiter(text))
        records = [r for r in reader if any((cell or '').strip() for cell in r)]
    except csv.Error as e:
        return None, f'Could not read that as a CSV: {e}'

    if not records:
        return None, 'No rows found'

    mapping = _map_headers(records[0])
    missing = [f for f in REQUIRED_FIELDS if f not in mapping.values()]
    if missing:
        readable = {'student_first': 'Student First Name',
                    'student_last': 'Student Last Name',
                    'student_email': 'Student Email'}
        return None, ('Missing required columns: '
                      + ', '.join(readable[f] for f in missing)
                      + '. Include the header row from the spreadsheet.')

    rows = []
    for offset, record in enumerate(records[1:]):
        row: Dict[str, Any] = {'_row': offset + 2}
        for index, field in mapping.items():
            row[field] = (record[index] if index < len(record) else '').strip()
        rows.append(row)

    if not rows:
        return None, 'The roster has a header row but no students'
    if len(rows) > MAX_ROWS:
        return None, f'Maximum {MAX_ROWS} rows per import. Split the roster into batches.'

    return rows, None


def _clean_email(value: str) -> str:
    return (value or '').strip().lower()


def _existing_accounts(admin, emails: List[str]) -> Dict[str, Dict[str, Any]]:
    """Look up every roster email at once, keyed by lowercase email.

    Chunked because the roster can carry hundreds of emails and a single `in_`
    filter that long makes for an unhappy URL.
    """
    found: Dict[str, Dict[str, Any]] = {}
    unique = sorted({e for e in emails if e})
    for start in range(0, len(unique), 50):
        chunk = unique[start:start + 50]
        try:
            res = (admin.table('users')
                   .select('id, email, first_name, last_name, organization_id, role, org_role')
                   .in_('email', chunk).execute())
        except Exception as e:  # noqa: BLE001
            logger.error(f'roster_import: existing-account lookup failed: {e}')
            raise
        for user in res.data or []:
            email = _clean_email(user.get('email'))
            if email:
                found[email] = user
    return found


def _org_names(admin, org_ids) -> Dict[str, str]:
    """Names for the orgs a roster email already belongs to, so the refusal can
    say which school rather than printing a uuid at the superadmin."""
    ids = [i for i in org_ids if i]
    if not ids:
        return {}
    try:
        res = admin.table('organizations').select('id, name').in_('id', ids).execute()
    except Exception as e:  # noqa: BLE001 -- the name is only for the message
        logger.warning(f'roster_import: org name lookup failed: {e}')
        return {}
    return {row['id']: row.get('name') or 'another organization' for row in res.data or []}


def _account_state(account: Optional[Dict[str, Any]], org_id: str) -> str:
    """What the import should do about an email that may already exist.

    'create'   nobody has this address
    'existing' already a member of this org: reuse and link
    'adopt'    an Optio account with no organization: the school says this is
               their student, so it joins the org
    'foreign'  belongs to a DIFFERENT school. Never moved silently -- pulling a
               student off another school's roster is not a decision an import
               of somebody's spreadsheet gets to make.
    """
    if not account:
        return 'create'
    account_org = account.get('organization_id')
    if account_org == org_id:
        return 'existing'
    return 'adopt' if not account_org else 'foreign'


def build_plan(rows: List[Dict[str, Any]], org_id: str, admin) -> Dict[str, Any]:
    """Work out what the import would do, without doing any of it.

    Siblings are the reason parents are collapsed by email rather than handled
    per row: two rows naming the same parent must produce one parent account
    with two links, not two accounts.
    """
    students: List[Dict[str, Any]] = []
    parents: Dict[str, Dict[str, Any]] = {}
    row_errors: List[Dict[str, Any]] = []
    seen_student_emails: Dict[str, int] = {}

    all_emails: List[str] = []
    for row in rows:
        all_emails.append(_clean_email(row.get('student_email')))
        all_emails.append(_clean_email(row.get('parent_email')))
    existing = _existing_accounts(admin, all_emails)
    org_names = _org_names(admin, {user.get('organization_id') for user in existing.values()
                                   if user.get('organization_id') != org_id})

    def foreign_error(email, account):
        name = org_names.get(account.get('organization_id'), 'another organization')
        return (f'{email} already has an Optio account at {name}. Remove the row, or move '
                'that account into this organization first.')

    for row in rows:
        line = row['_row']
        student_email = _clean_email(row.get('student_email'))
        parent_email = _clean_email(row.get('parent_email'))
        student_first = (row.get('student_first') or '').strip()
        student_last = (row.get('student_last') or '').strip()
        parent_first = (row.get('parent_first') or '').strip()
        parent_last = (row.get('parent_last') or '').strip()

        errors: List[str] = []
        if not student_first or not student_last:
            errors.append('Student first and last name are required')
        if not student_email:
            errors.append('Student email is required')
        elif not EMAIL_PATTERN.match(student_email):
            errors.append(f'"{student_email}" is not a valid email address')
        elif student_email in seen_student_emails:
            errors.append(f'Duplicate student email (also on row {seen_student_emails[student_email]})')

        if parent_email:
            if not EMAIL_PATTERN.match(parent_email):
                errors.append(f'"{parent_email}" is not a valid parent email address')
            elif parent_email == student_email:
                # Same inbox for both accounts means one of them can never
                # receive its own invite -- almost certainly a copy/paste slip.
                errors.append('Student and parent share an email address')
            elif not parent_first or not parent_last:
                errors.append('Parent first and last name are required when a parent email is given')

        # An account at another school blocks its row rather than being moved or
        # quietly linked from outside the org.
        student_account = existing.get(student_email)
        student_state = _account_state(student_account, org_id)
        if student_state == 'foreign':
            errors.append(foreign_error(student_email, student_account))

        parent_account = existing.get(parent_email) if parent_email else None
        parent_state = _account_state(parent_account, org_id) if parent_email else None
        if parent_state == 'foreign':
            errors.append(foreign_error(parent_email, parent_account))

        if errors:
            row_errors.append({
                'row': line,
                'student_email': student_email or '(empty)',
                'errors': errors,
            })
            continue

        seen_student_emails[student_email] = line
        students.append({
            'row': line,
            'email': student_email,
            'first_name': student_first,
            'last_name': student_last,
            'parent_email': parent_email or None,
            'status': student_state,
            'existing_user_id': (student_account or {}).get('id'),
        })

        if not parent_email:
            continue

        parent = parents.get(parent_email)
        if not parent:
            parent = {
                'row': line,
                'email': parent_email,
                'first_name': parent_first,
                'last_name': parent_last,
                'status': parent_state,
                'existing_user_id': (parent_account or {}).get('id'),
                'student_emails': [],
            }
            parents[parent_email] = parent
        parent['student_emails'].append(student_email)

    parent_list = list(parents.values())
    unlinked = [s['email'] for s in students if not s['parent_email']]
    adopting = [p for p in students + parent_list if p['status'] == 'adopt']

    warnings = []
    if unlinked:
        warnings.append(f'{len(unlinked)} student(s) have no parent email and will not be '
                        'linked to anyone')
    if adopting:
        # Joining an org is a real change to an account somebody else already
        # uses, so it is stated up front rather than discovered afterwards.
        warnings.append(f'{len(adopting)} existing Optio account(s) will be added to this '
                        'organization: ' + ', '.join(p['email'] for p in adopting))

    return {
        'students': students,
        'parents': parent_list,
        'row_errors': row_errors,
        'warnings': warnings,
        'counts': {
            'rows': len(rows),
            'students_new': sum(1 for s in students if s['status'] == 'create'),
            'students_existing': sum(1 for s in students if s['status'] != 'create'),
            'parents_new': sum(1 for p in parent_list if p['status'] == 'create'),
            'parents_existing': sum(1 for p in parent_list if p['status'] != 'create'),
            'adopted': len(adopting),
            'links': sum(len(p['student_emails']) for p in parent_list),
            'invalid_rows': len(row_errors),
        },
    }


def _insert_profile_with_retry(admin, profile: Dict[str, Any], attempts: int = 3) -> None:
    """The auth user isn't always visible to PostgREST immediately, so a FK
    violation here is usually a race, not a bad row. Same retry the teen-account
    path uses (services/family_student_service.py)."""
    delay = 0.5
    for attempt in range(attempts):
        try:
            admin.table('users').upsert(profile, on_conflict='id').execute()
            return
        except Exception as e:  # noqa: BLE001
            err = str(e).lower()
            if ('foreign key' in err or '23503' in err) and attempt < attempts - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise


def _create_account(admin, email: str, first_name: str, last_name: str,
                    org_role: str, org_id: str) -> str:
    """Create one org account, unconfirmed, with a password nobody will ever use.

    `email_confirm: False` is deliberate -- consuming the invite token confirms
    the address (routes/auth/password.py), which makes clicking the emailed link
    both the email verification and the password choice.
    """
    auth_user = admin.auth.admin.create_user({
        'email': email,
        # Placeholder: the recipient sets their own from the invite email.
        'password': secrets.token_urlsafe(18),
        'email_confirm': False,
        'user_metadata': {'first_name': first_name, 'last_name': last_name},
    })
    if not auth_user or not auth_user.user:
        raise RuntimeError('Supabase did not return a user')

    user_id = auth_user.user.id
    _insert_profile_with_retry(admin, {
        'id': user_id,
        'email': email,
        'first_name': first_name,
        'last_name': last_name,
        'display_name': f'{first_name} {last_name}'.strip(),
        'role': 'org_managed',
        'org_role': org_role,
        'org_roles': [org_role],
        'organization_id': org_id,
    })

    try:
        admin.table('user_skill_xp').upsert(
            [{'user_id': user_id, 'pillar': p, 'xp_amount': 0} for p in PILLARS],
            on_conflict='user_id,pillar').execute()
    except Exception as e:  # noqa: BLE001 -- cosmetic setup, never fail the create
        logger.warning(f'roster_import: skill init failed for {user_id[:8]}: {e}')

    return user_id


def _adopt(admin, user_id: str, org_role: str, org_id: str) -> None:
    """Move an existing account with no organization into this one.

    The school named them on its roster, so they become an org member the same
    way a newly created one does. Nothing else on the account is touched -- no
    new password, no invite, no name overwrite -- because this account already
    belongs to someone who is using it.
    """
    admin.table('users').update({
        'organization_id': org_id,
        'role': 'org_managed',
        'org_role': org_role,
        'org_roles': [org_role],
    }).eq('id', user_id).execute()


def _link(admin, parent_id: str, student_id: str) -> None:
    """Approved and admin_verified: the school told us these two belong
    together, so there is nobody left to ask for approval."""
    existing = (admin.table('parent_student_links').select('id')
                .eq('parent_user_id', parent_id)
                .eq('student_user_id', student_id).execute()).data
    if existing:
        return
    admin.table('parent_student_links').insert({
        'parent_user_id': parent_id,
        'student_user_id': student_id,
        'status': 'approved',
        'admin_verified': True,
        'admin_notes': 'Roster import',
    }).execute()


def _send_invite(admin, user_id: str, email: str, first_name: str,
                 org_name: str, is_parent: bool) -> bool:
    from urllib.parse import quote

    from app_config import Config
    from services.email_service import email_service
    from utils.invite_tokens import INVITE_EXPIRY_DAYS, mint_invite_token

    token = mint_invite_token(user_id, admin=admin)
    if not token:
        return False

    link = f'{Config.FRONTEND_URL}/reset-password?token={token}&email={quote(email)}'
    try:
        return email_service.send_roster_invite_email(
            user_email=email,
            user_name=first_name or 'there',
            org_name=org_name,
            invite_link=link,
            is_parent=is_parent,
            expiry_days=INVITE_EXPIRY_DAYS,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f'roster_import: invite email failed for {email}: {e}')
        return False


def audit_entry(user_id: str, org_id: str, counts: Dict[str, Any],
                send_emails: bool) -> Dict[str, Any]:
    """The admin_audit_logs row for one import.

    Its own function so the column names are covered by a test. The insert at
    the call site is wrapped in try/except -- an audit failure must not undo a
    successful import -- which means a wrong column name fails silently and
    stays wrong. It already did once: the first version copied
    action/entity_type/entity_id/details from bulk_import.py, and this table
    has none of those.
    """
    return {
        'user_id': user_id,
        'organization_id': org_id,
        'action_type': 'roster_import',
        'resource_type': 'organization',
        'resource_id': org_id,
        'changes': {**counts, 'send_emails': send_emails},
    }


def execute_plan(plan: Dict[str, Any], org_id: str, org_name: str, admin,
                 send_emails: bool = True) -> Dict[str, Any]:
    """Create the accounts the plan describes, link them, and invite the new ones.

    Parents come first because every student link needs one. A failure is
    recorded against its own row and the import carries on -- stopping halfway
    through a roster would leave the superadmin to work out by hand which
    families made it.
    """
    results: List[Dict[str, Any]] = []
    parent_ids: Dict[str, str] = {}

    for parent in plan['parents']:
        entry = {'row': parent['row'], 'kind': 'parent', 'email': parent['email'],
                 'name': f"{parent['first_name']} {parent['last_name']}".strip()}
        try:
            if parent['existing_user_id']:
                parent_ids[parent['email']] = parent['existing_user_id']
                if parent['status'] == 'adopt':
                    _adopt(admin, parent['existing_user_id'], 'parent', org_id)
                entry.update(status='adopted' if parent['status'] == 'adopt' else 'existing',
                             invited=False)
            else:
                user_id = _create_account(admin, parent['email'], parent['first_name'],
                                          parent['last_name'], 'parent', org_id)
                parent_ids[parent['email']] = user_id
                entry.update(status='created', user_id=user_id,
                             invited=bool(send_emails and _send_invite(
                                 admin, user_id, parent['email'], parent['first_name'],
                                 org_name, is_parent=True)))
        except Exception as e:  # noqa: BLE001
            logger.error(f"roster_import: parent {parent['email']} failed: {e}")
            entry.update(status='failed', error=str(e)[:200])
        results.append(entry)

    for student in plan['students']:
        entry = {'row': student['row'], 'kind': 'student', 'email': student['email'],
                 'name': f"{student['first_name']} {student['last_name']}".strip()}
        try:
            if student['existing_user_id']:
                student_id = student['existing_user_id']
                if student['status'] == 'adopt':
                    _adopt(admin, student_id, 'student', org_id)
                entry.update(status='adopted' if student['status'] == 'adopt' else 'existing',
                             invited=False)
            else:
                student_id = _create_account(admin, student['email'], student['first_name'],
                                             student['last_name'], 'student', org_id)
                entry.update(status='created', user_id=student_id,
                             invited=bool(send_emails and _send_invite(
                                 admin, student_id, student['email'], student['first_name'],
                                 org_name, is_parent=False)))
        except Exception as e:  # noqa: BLE001
            logger.error(f"roster_import: student {student['email']} failed: {e}")
            results.append({**entry, 'status': 'failed', 'error': str(e)[:200]})
            continue

        parent_id = parent_ids.get(student['parent_email']) if student['parent_email'] else None
        if parent_id:
            try:
                _link(admin, parent_id, student_id)
                entry['linked_to'] = student['parent_email']
            except Exception as e:  # noqa: BLE001 -- the accounts exist; report the
                # missing link rather than pretending the whole row failed.
                logger.error(f"roster_import: link {student['email']} failed: {e}")
                entry['link_error'] = str(e)[:200]
        results.append(entry)

    created = sum(1 for r in results if r.get('status') == 'created')
    return {
        'results': results,
        'counts': {
            'created': created,
            'existing': sum(1 for r in results if r.get('status') == 'existing'),
            'adopted': sum(1 for r in results if r.get('status') == 'adopted'),
            'failed': sum(1 for r in results if r.get('status') == 'failed'),
            'invited': sum(1 for r in results if r.get('invited')),
            'linked': sum(1 for r in results if r.get('linked_to')),
        },
    }
