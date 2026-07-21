"""
SIS Service - read-side aggregation for the microschool Student Information System.

Composes existing org/user data with the new SIS tables (school_enrollments,
households, household_members, emergency_contacts) into roster + dashboard views.
Uses the admin (service_role) client: the SIS tables are RLS-locked to backend-only
and roster assembly is a cross-table read that would otherwise need many overlapping
RLS policies for a single org-admin read (same justification the /me endpoint uses).
"""

from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

ENROLLMENT_STATUSES = ('applicant', 'enrolled', 'withdrawn', 'graduated')


def _admin():
    return get_supabase_admin_client()


def is_student(user: Dict[str, Any]) -> bool:
    if user.get('role') == 'student':
        return True
    if user.get('org_role') == 'student':
        return True
    roles = user.get('org_roles')
    if isinstance(roles, list) and 'student' in roles:
        return True
    return False


def get_user_org_context(user_id: str) -> Dict[str, Any]:
    """Return the caller's role + organization_id (used to scope/authorize)."""
    resp = (
        _admin().table('users')
        .select('id, role, org_role, org_roles, organization_id')
        .eq('id', user_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else {}


def resolve_org_id(user_id: str, requested_org_id: Optional[str]) -> Optional[str]:
    """Resolve which org the SIS request operates on.

    - Superadmin may target any org via requested_org_id.
    - Everyone else is locked to their own organization_id (requested is ignored
      unless it matches, preventing cross-org access).
    """
    ctx = get_user_org_context(user_id)
    if ctx.get('role') == 'superadmin':
        return requested_org_id or ctx.get('organization_id')
    own = ctx.get('organization_id')
    if requested_org_id and requested_org_id != own:
        # Non-superadmin asked for a different org — deny by returning their own.
        return own
    return own


def _org_users(org_id: str) -> List[Dict[str, Any]]:
    resp = (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, email, username, '
                'role, org_role, org_roles, total_xp, last_active, created_at, date_of_birth, '
                'preferred_name, gender, allergies, medications, sis_tuition_plan')
        .eq('organization_id', org_id)
        .execute()
    )
    return resp.data or []


def _org_students(org_id: str) -> List[Dict[str, Any]]:
    return [u for u in _org_users(org_id) if is_student(u)]


def _enrollments_by_student(org_id: str) -> Dict[str, Dict[str, Any]]:
    resp = (
        _admin().table('school_enrollments')
        .select('*')
        .eq('organization_id', org_id)
        .execute()
    )
    return {row['student_user_id']: row for row in (resp.data or [])}


def _household_by_user(org_id: str) -> Dict[str, Dict[str, Any]]:
    """Map user_id -> {household_id, household_name, relationship} for an org."""
    households = (
        _admin().table('households')
        .select('id, name')
        .eq('organization_id', org_id)
        .execute()
    ).data or []
    if not households:
        return {}
    hh_by_id = {h['id']: h for h in households}
    members = (
        _admin().table('household_members')
        .select('household_id, user_id, relationship, is_primary_guardian')
        .in_('household_id', list(hh_by_id.keys()))
        .execute()
    ).data or []
    out: Dict[str, Dict[str, Any]] = {}
    for m in members:
        hh = hh_by_id.get(m['household_id'])
        if not hh:
            continue
        out[m['user_id']] = {
            'household_id': hh['id'],
            'household_name': hh['name'],
            'relationship': m.get('relationship'),
            'is_primary_guardian': m.get('is_primary_guardian'),
        }
    return out


def _full_name(u: Dict[str, Any]) -> str:
    name = (u.get('display_name') or
            f"{u.get('first_name') or ''} {u.get('last_name') or ''}").strip()
    return name or (u.get('username') or u.get('email') or 'Unnamed')


# ── Duplicate-student detection ──────────────────────────────────────────────
# The iCreate funnel can only auto-match a re-registered kid to their existing
# Optio account by email (or the parent's own prior dependents). A parent who
# registers an under-13 kid as a fresh dependent — while that kid already has an
# account — slips past both checks and a duplicate is created. Staff then attach
# the original account to the same family and end up with the kid twice. These
# helpers flag those look-alikes so the add-member flow can warn and the Families
# view can badge them, WITHOUT tripping on twins/siblings who share a birthday.

def _norm_name(v: Any) -> str:
    return (v or '').strip().lower()


def _parse_iso_date(v: Any):
    from datetime import date
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except (ValueError, TypeError):
        return None


def _dob_gap_days(a: Any, b: Any) -> Optional[int]:
    """Absolute day gap between two DOBs, or None when either is unknown."""
    da, db = _parse_iso_date(a), _parse_iso_date(b)
    if da is None or db is None:
        return None
    return abs((da - db).days)


def likely_same_student(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    """Do two student records look like the same child entered twice?

    Compares names + DOB. Tuned for the re-registration pattern (a kid entered a
    second time, often as a dependent with the name spelled differently or the
    DOB off by a day) while deliberately NOT flagging twins/siblings, who share a
    birthday but have distinct first names:

      - Same last name is required (a duplicate of a kid keeps the surname).
      - Identical first name -> duplicate regardless of DOB. No family names two
        living children the exact same first + last name, so this safely catches
        a re-registration where the DOB was mistyped (off by a day, or a year).
      - Nickname/typo first name (one a prefix of the other, e.g. Zach/Zachary)
        -> duplicate ONLY when the DOB matches exactly, so same-birthday siblings
        with unrelated names (twins) never match.
    """
    la, lb = _norm_name(a.get('last_name')), _norm_name(b.get('last_name'))
    if la and lb and la != lb:
        return False
    fa, fb = _norm_name(a.get('first_name')), _norm_name(b.get('first_name'))
    if not fa or not fb:
        return False
    if fa == fb:
        return True
    if min(len(fa), len(fb)) >= 3 and (fa.startswith(fb) or fb.startswith(fa)):
        return _dob_gap_days(a.get('date_of_birth'), b.get('date_of_birth')) == 0
    return False


def _mark_duplicate_members(members: List[Dict[str, Any]]) -> None:
    """Flag student members of one household that look like duplicates of each
    other (in place). Each flagged member gets possible_duplicate=True and a
    duplicate_with list of the matching members' {user_id, name}."""
    students = [m for m in members if m.get('relationship') == 'student']
    for i, a in enumerate(students):
        for b in students[i + 1:]:
            if likely_same_student(a, b):
                for x, y in ((a, b), (b, a)):
                    x['possible_duplicate'] = True
                    x.setdefault('duplicate_with', []).append(
                        {'user_id': y['user_id'], 'name': y['name']})


def find_household_duplicates(org_id: str, household_id: str,
                              candidate_user_id: str) -> List[Dict[str, Any]]:
    """Existing student members of a household that look like the same child as
    candidate_user_id (see likely_same_student). Empty when nothing matches."""
    from repositories.household_repository import HouseholdRepository
    admin = _admin()
    crow = (admin.table('users')
            .select('id, first_name, last_name, date_of_birth')
            .eq('id', candidate_user_id).limit(1).execute()).data or []
    if not crow:
        return []
    candidate = crow[0]
    members = HouseholdRepository(client=admin).members_for_households([household_id])
    student_ids = [m['user_id'] for m in members
                   if m.get('relationship') == 'student'
                   and m['user_id'] != candidate_user_id]
    if not student_ids:
        return []
    rows = (admin.table('users')
            .select('id, first_name, last_name, display_name, date_of_birth, email, username')
            .in_('id', student_ids).execute()).data or []
    return [{'user_id': r['id'], 'name': _full_name(r), 'email': r.get('email')}
            for r in rows if likely_same_student(candidate, r)]


def get_roster(org_id: str) -> List[Dict[str, Any]]:
    """Every account in the org (students, parents, teachers, admins, observers)
    with a role label; students also carry their enrollment fields."""
    users = _org_users(org_id)
    enrollments = _enrollments_by_student(org_id)
    households = _household_by_user(org_id)
    roster = []
    for s in users:
        student = is_student(s)
        enr = enrollments.get(s['id']) if student else None
        hh = households.get(s['id'])
        roles = _user_org_roles(s) or ([s['role']] if s.get('role') and s['role'] != 'org_managed' else [])
        roster.append({
            'student_id': s['id'],
            'name': _full_name(s),
            'is_student': student,
            'role': roles[0] if roles else None,
            'roles': roles,
            'first_name': s.get('first_name'),
            'last_name': s.get('last_name'),
            'date_of_birth': s.get('date_of_birth'),
            'preferred_name': s.get('preferred_name'),
            'gender': s.get('gender'),
            'allergies': s.get('allergies'),
            'medications': s.get('medications'),
            'email': s.get('email'),
            'username': s.get('username'),
            'total_xp': s.get('total_xp'),
            'last_active': s.get('last_active'),
            'sis_tuition_plan': s.get('sis_tuition_plan'),
            'enrollment_status': ((enr or {}).get('status') or 'unassigned') if student else None,
            'grade_level': (enr or {}).get('grade_level'),
            'start_date': (enr or {}).get('start_date'),
            'household_id': (hh or {}).get('household_id'),
            'household_name': (hh or {}).get('household_name'),
        })
    roster.sort(key=lambda r: r['name'].lower())
    return roster


def get_dashboard(org_id: str) -> Dict[str, Any]:
    students = _org_students(org_id)
    enrollments = _enrollments_by_student(org_id)

    status_counts = {s: 0 for s in ENROLLMENT_STATUSES}
    status_counts['unassigned'] = 0
    for s in students:
        enr = enrollments.get(s['id'])
        key = (enr or {}).get('status') or 'unassigned'
        status_counts[key] = status_counts.get(key, 0) + 1

    households_count = (
        _admin().table('households')
        .select('id', count='exact')
        .eq('organization_id', org_id)
        .execute()
    ).count or 0

    # "Active" = last_active within 7 days (string compare on ISO timestamps).
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    active = sum(1 for s in students if (s.get('last_active') or '') >= cutoff)

    org = (
        _admin().table('organizations')
        .select('id, name, slug')
        .eq('id', org_id)
        .limit(1)
        .execute()
    ).data
    return {
        'organization': org[0] if org else {'id': org_id},
        'total_students': len(students),
        'active_last_7_days': active,
        'households': households_count,
        'enrollment_status': status_counts,
    }


def upsert_enrollment(org_id: str, student_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    payload = {'organization_id': org_id, 'student_user_id': student_id}
    for k in ('status', 'grade_level', 'start_date', 'end_date'):
        if k in fields and fields[k] is not None:
            payload[k] = fields[k]
    from datetime import datetime, timezone
    payload['updated_at'] = datetime.now(timezone.utc).isoformat()
    resp = (
        _admin().table('school_enrollments')
        .upsert(payload, on_conflict='organization_id,student_user_id')
        .execute()
    )
    return resp.data[0] if resp.data else None


def list_emergency_contacts(student_id: str) -> List[Dict[str, Any]]:
    resp = (
        _admin().table('emergency_contacts')
        .select('*')
        .eq('student_user_id', student_id)
        .order('priority')
        .execute()
    )
    return resp.data or []


def add_emergency_contact(student_id: str, org_id: Optional[str],
                          fields: Dict[str, Any]) -> Dict[str, Any]:
    payload = {
        'student_user_id': student_id,
        'organization_id': org_id,
        'name': fields.get('name'),
        'relationship': fields.get('relationship'),
        'phone': fields.get('phone'),
        'email': fields.get('email'),
        'priority': fields.get('priority') or 1,
        'can_pickup': bool(fields.get('can_pickup')),
    }
    resp = _admin().table('emergency_contacts').insert(payload).execute()
    return resp.data[0] if resp.data else None


def delete_emergency_contact(contact_id: str) -> None:
    _admin().table('emergency_contacts').delete().eq('id', contact_id).execute()


# ── Family-level emergency contacts (per-student rows shared across a household) ─
def _household_org(household_id: str) -> Optional[str]:
    r = (
        _admin().table('households').select('id, organization_id')
        .eq('id', household_id).limit(1).execute()
    ).data
    return r[0].get('organization_id') if r else None


def household_student_ids(org_id: str, household_id: str) -> List[str]:
    if _household_org(household_id) != org_id:
        return []
    members = (
        _admin().table('household_members').select('user_id, relationship')
        .eq('household_id', household_id).execute()
    ).data or []
    return [m['user_id'] for m in members if m.get('relationship') == 'student']


def attach_student_to_org(org_id: str, student_id: str,
                          guardian_ids: Optional[List[str]] = None) -> bool:
    """Normalize an existing account into a full org student, so a student who
    'already had an Optio account' ends up indistinguishable from one created by
    the org's own flows: org fields set (org_managed/student — dependents keep
    role='student'), plus parent_student_links to the given guardians.

    Refuses (returns False) rather than converting anything that isn't a plain
    student account, or moving an account between orgs. Safe to call repeatedly.
    """
    rows = (
        _admin().table('users')
        .select('id, role, org_role, organization_id, is_dependent')
        .eq('id', student_id).limit(1).execute()
    ).data
    if not rows:
        return False
    u = rows[0]
    if u.get('role') == 'superadmin':
        return False
    if u.get('organization_id') and u['organization_id'] != org_id:
        return False
    effective = u.get('org_role') if u.get('organization_id') else u.get('role')
    if effective not in (None, 'student'):
        return False

    if u.get('is_dependent'):
        updates: Dict[str, Any] = {'organization_id': org_id}
    else:
        updates = {'organization_id': org_id, 'role': 'org_managed',
                   'org_role': 'student', 'org_roles': ['student']}
    _admin().table('users').update(updates).eq('id', student_id).execute()

    for gid in (guardian_ids or []):
        if u.get('is_dependent'):
            continue  # dependents are linked via managed_by_parent_id, not links
        try:
            existing = (
                _admin().table('parent_student_links').select('id')
                .eq('parent_user_id', gid).eq('student_user_id', student_id)
                .execute()
            ).data
            if not existing:
                _admin().table('parent_student_links').insert({
                    'parent_user_id': gid, 'student_user_id': student_id,
                    'status': 'approved', 'admin_verified': True,
                    'admin_notes': 'Auto-linked when added to SIS household',
                }).execute()
        except Exception as e:  # noqa: BLE001 — linking is best-effort
            logger.warning(f'attach_student_to_org: link {gid[:8]}->{student_id[:8]} failed: {e}')
    return True


def _contact_key(c: Dict[str, Any]):
    return ((c.get('name') or '').strip().lower(), (c.get('phone') or '').strip())


def household_emergency_contacts(org_id: str, household_id: str) -> List[Dict[str, Any]]:
    """Emergency contacts across a household's students, deduped into one family list.
    Each item carries the underlying per-student row ids so it can be removed family-wide."""
    sids = household_student_ids(org_id, household_id)
    if not sids:
        return []
    rows = (
        _admin().table('emergency_contacts').select('*')
        .in_('student_user_id', sids).execute()
    ).data or []
    agg: Dict[Any, Dict[str, Any]] = {}
    for r in rows:
        key = _contact_key(r)
        a = agg.setdefault(key, {
            'name': r.get('name'), 'relationship': r.get('relationship'),
            'phone': r.get('phone'), 'email': r.get('email'),
            'ids': [], 'student_ids': set(),
        })
        a['ids'].append(r['id'])
        a['student_ids'].add(r['student_user_id'])
    out = [{
        'name': a['name'], 'relationship': a['relationship'], 'phone': a['phone'], 'email': a['email'],
        'ids': a['ids'], 'student_count': len(a['student_ids']), 'total_students': len(sids),
    } for a in agg.values()]
    out.sort(key=lambda x: (x['name'] or '').lower())
    return out


def add_household_emergency_contact(org_id: str, household_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    """Add a contact to every student in the household (skipping students who already have it)."""
    sids = household_student_ids(org_id, household_id)
    name = (fields.get('name') or '').strip()
    if not name or not sids:
        return {'added': 0}
    key = _contact_key({'name': name, 'phone': fields.get('phone')})
    added = 0
    for sid in sids:
        existing = list_emergency_contacts(sid)
        if any(_contact_key(c) == key for c in existing):
            continue
        add_emergency_contact(sid, org_id, fields)
        added += 1
    return {'added': added}


def remove_household_emergency_contacts(ids: List[str]) -> None:
    if ids:
        _admin().table('emergency_contacts').delete().in_('id', ids).execute()


def copy_family_contacts_to_student(org_id: str, student_id: str) -> Dict[str, Any]:
    """Copy the student's family contacts onto their own record (skipping ones they have)."""
    hh = _household_by_user(org_id).get(student_id)
    if not hh:
        return {'copied': 0, 'no_family': True}
    fam = household_emergency_contacts(org_id, hh['household_id'])
    have = {_contact_key(c) for c in list_emergency_contacts(student_id)}
    copied = 0
    for c in fam:
        if _contact_key(c) in have:
            continue
        add_emergency_contact(student_id, org_id, c)
        copied += 1
    return {'copied': copied}


def list_org_members(org_id: str) -> List[Dict[str, Any]]:
    """All users in an org (students + guardians + staff) for household assignment pickers."""
    resp = (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, email, username, role, org_role, org_roles')
        .eq('organization_id', org_id)
        .execute()
    )
    out = []
    for u in (resp.data or []):
        out.append({
            'id': u['id'],
            'name': _full_name(u),
            'email': u.get('email'),
            'is_student': is_student(u),
        })
    out.sort(key=lambda r: r['name'].lower())
    return out


# Org roles considered "staff" (people who run the school), in display precedence.
STAFF_ORG_ROLES = ('org_admin', 'advisor')
_STAFF_ROLE_LABEL = {'org_admin': 'Org Admin', 'advisor': 'Teacher'}


def _user_org_roles(u: Dict[str, Any]) -> List[str]:
    """All org roles held by a user (org_role + org_roles array), de-duped."""
    roles = []
    if u.get('org_role'):
        roles.append(u['org_role'])
    if isinstance(u.get('org_roles'), list):
        roles.extend(u['org_roles'])
    return list(dict.fromkeys(roles))


def list_org_staff(org_id: str) -> List[Dict[str, Any]]:
    """Org staff (org_admin / advisor) with their role labels, for the SIS Staff page."""
    resp = (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, email, username, '
                'role, org_role, org_roles, last_active, created_at, bio, avatar_url')
        .eq('organization_id', org_id)
        .execute()
    )
    out = []
    school_account_email = org_messaging_email(org_id)
    for u in (resp.data or []):
        # The org's messaging identity is infrastructure, not a staff member.
        if u.get('email') == school_account_email:
            continue
        roles = _user_org_roles(u)
        staff_roles = [r for r in STAFF_ORG_ROLES if r in roles]
        if not staff_roles:
            continue
        out.append({
            'id': u['id'],
            'name': _full_name(u),
            'first_name': u.get('first_name'),
            'last_name': u.get('last_name'),
            'email': u.get('email'),
            'roles': staff_roles,
            'role_labels': [_STAFF_ROLE_LABEL.get(r, r) for r in staff_roles],
            'last_active': u.get('last_active'),
            'bio': u.get('bio'),
            'avatar_url': u.get('avatar_url'),
        })
    # Org admins first, then advisors; alphabetical within.
    out.sort(key=lambda r: ('org_admin' not in r['roles'], r['name'].lower()))
    return out


def create_org_teacher(org_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    """Create a teacher (advisor) account in this org, with an optional bio.

    Creates the auth user with a placeholder password and sends the standard
    set-password (signup confirmation) email best-effort — same pattern as the
    iCreate registration student accounts. Returns {'error': ...} on bad input
    or a duplicate email."""
    import secrets

    first = (fields.get('first_name') or '').strip()
    last = (fields.get('last_name') or '').strip()
    email = (fields.get('email') or '').strip().lower()
    if not first or not last:
        return {'error': 'First and last name are required'}
    if not email or '@' not in email:
        return {'error': 'A valid email is required'}
    admin = _admin()
    existing = admin.table('users').select('id').eq('email', email).limit(1).execute().data
    if existing:
        return {'error': 'A user with this email already exists'}
    try:
        auth = admin.auth.admin.create_user({
            'email': email,
            'password': secrets.token_urlsafe(18),  # placeholder; teacher sets their own via email
            'email_confirm': False,
            'user_metadata': {'first_name': first, 'last_name': last},
        })
    except Exception as e:
        logger.error(f"SIS teacher auth create failed: {e}")
        return {'error': 'Could not create the account (is the email already in use?)'}
    if not auth.user:
        return {'error': 'Could not create the account'}
    profile = {
        'id': auth.user.id,
        'email': email,
        'first_name': first,
        'last_name': last,
        'display_name': f'{first} {last}'.strip(),
        'role': 'org_managed',
        'org_role': 'advisor',
        'org_roles': ['advisor'],
        'organization_id': org_id,
        'bio': (fields.get('bio') or '').strip() or None,
    }
    # The auth user can take a beat to be visible to the users FK — retry briefly
    # (same race the iCreate registration insert handles).
    import time
    for attempt in range(3):
        try:
            admin.table('users').insert(profile).execute()
            break
        except Exception as e:
            msg = str(e).lower()
            if ('foreign key' in msg or '23503' in msg) and attempt < 2:
                time.sleep(0.5 * (attempt + 1))
                continue
            logger.error(f"SIS teacher profile insert failed: {e}")
            try:
                admin.auth.admin.delete_user(auth.user.id)
            except Exception:
                pass
            return {'error': 'Could not create the account'}
    email_sent = True
    try:
        admin.auth.resend({'type': 'signup', 'email': email})
    except Exception as e:  # noqa: BLE001
        email_sent = False
        logger.warning(f"SIS teacher set-password email failed for {email}: {e}")
    # email_sent lets the UI warn instead of promising an email that never left.
    return {'teacher': {'id': auth.user.id, 'name': profile['display_name'], 'email': email},
            'email_sent': email_sent}


_STAFF_EDIT_FIELDS = ('first_name', 'last_name', 'email', 'bio')


def update_staff_member(org_id: str, staff_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Edit a staff member's profile (name/email/bio). Keeps display_name in sync
    and best-effort syncs the auth email, mirroring update_student_profile."""
    row = (
        _admin().table('users').select('id, organization_id, first_name, last_name, email')
        .eq('id', staff_id).limit(1).execute()
    ).data
    if not row or row[0].get('organization_id') != org_id:
        return None
    cur = row[0]
    payload: Dict[str, Any] = {}
    for k in _STAFF_EDIT_FIELDS:
        if k in fields:
            v = fields[k]
            payload[k] = (v.strip() if isinstance(v, str) else v) or None
    first = payload.get('first_name', cur.get('first_name')) or ''
    last = payload.get('last_name', cur.get('last_name')) or ''
    combined = f"{first} {last}".strip()
    if combined:
        payload['display_name'] = combined
    if not payload:
        return {'id': staff_id}
    resp = _admin().table('users').update(payload).eq('id', staff_id).execute()
    new_email = payload.get('email')
    if new_email and new_email != cur.get('email'):
        try:
            _admin().auth.admin.update_user_by_id(staff_id, {'email': new_email})
        except Exception as e:
            logger.warning(f"Auth email sync failed for {staff_id[:8]}: {e}")
    return resp.data[0] if resp.data else {'id': staff_id}


def student_in_org(student_id: str, org_id: str) -> bool:
    row = (
        _admin().table('users').select('id, organization_id')
        .eq('id', student_id).limit(1).execute()
    ).data
    return bool(row and row[0].get('organization_id') == org_id)


_PROFILE_FIELDS = ('first_name', 'last_name', 'email', 'date_of_birth',
                   'preferred_name', 'gender', 'allergies', 'medications',
                   'sis_tuition_plan')


def update_student_profile(org_id: str, student_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Edit a student's profile (name/email/DOB). Keeps display_name in sync and,
    when the email changes, best-effort syncs the auth account so login still works."""
    if not student_in_org(student_id, org_id):
        return None
    current = (
        _admin().table('users').select('first_name, last_name, email')
        .eq('id', student_id).limit(1).execute()
    ).data
    cur = current[0] if current else {}

    payload: Dict[str, Any] = {}
    for k in _PROFILE_FIELDS:
        if k in fields:
            v = fields[k]
            payload[k] = (v.strip() if isinstance(v, str) else v) or None
    # Only known tuition plans (NULL = standard block/class pricing).
    if payload.get('sis_tuition_plan') not in (None, 'ufa_academy'):
        payload.pop('sis_tuition_plan')
    # Recompute display_name from the resulting first/last.
    first = payload.get('first_name', cur.get('first_name')) or ''
    last = payload.get('last_name', cur.get('last_name')) or ''
    combined = f"{first} {last}".strip()
    if combined:
        payload['display_name'] = combined
    if not payload:
        return {'id': student_id}

    resp = _admin().table('users').update(payload).eq('id', student_id).execute()

    # Sync the auth email if it changed (best-effort; login uses the auth email).
    new_email = payload.get('email')
    if new_email and new_email != cur.get('email'):
        try:
            _admin().auth.admin.update_user_by_id(student_id, {'email': new_email})
        except Exception as e:
            logger.warning(f"Auth email sync failed for {student_id[:8]}: {e}")

    return resp.data[0] if resp.data else {'id': student_id}


def list_student_classes(org_id: str, student_id: str) -> List[Dict[str, Any]]:
    """A student's active class enrollments with the teacher and a linked quest (if any)."""
    enr = (
        _admin().table('class_enrollments').select('class_id')
        .eq('student_id', student_id).eq('status', 'active').execute()
    ).data or []
    class_ids = [e['class_id'] for e in enr]
    if not class_ids:
        return []

    classes = (
        _admin().table('org_classes').select('id, name, primary_instructor_id')
        .in_('id', class_ids).eq('organization_id', org_id).execute()
    ).data or []
    if not classes:
        return []
    cids = [c['id'] for c in classes]

    # Teacher: primary instructor, else first active class advisor.
    advisors_by_class: Dict[str, str] = {}
    for a in (_admin().table('class_advisors').select('class_id, advisor_id, is_active')
              .in_('class_id', cids).execute()).data or []:
        if a.get('is_active', True) and a['class_id'] not in advisors_by_class:
            advisors_by_class[a['class_id']] = a['advisor_id']
    teacher_ids = {c['primary_instructor_id'] for c in classes if c.get('primary_instructor_id')}
    teacher_ids.update(advisors_by_class.values())
    teacher_names: Dict[str, str] = {}
    if teacher_ids:
        for u in (_admin().table('users')
                  .select('id, display_name, first_name, last_name, username, email')
                  .in_('id', list(teacher_ids)).execute()).data or []:
            teacher_names[u['id']] = _full_name(u)

    # First quest per class (by sequence), + its title for display.
    first_quest: Dict[str, str] = {}
    for q in (_admin().table('class_quests').select('class_id, quest_id, sequence_order')
              .in_('class_id', cids).order('sequence_order').execute()).data or []:
        first_quest.setdefault(q['class_id'], q['quest_id'])
    quest_titles: Dict[str, str] = {}
    if first_quest:
        for q in (_admin().table('quests').select('id, title')
                  .in_('id', list(set(first_quest.values()))).execute()).data or []:
            quest_titles[q['id']] = q.get('title')

    # Weekly meetings (for the block-schedule grid view).
    meetings_by_class: Dict[str, List[Dict[str, Any]]] = {}
    for m in (_admin().table('class_meetings')
              .select('class_id, day_of_week, start_time, end_time, location')
              .in_('class_id', cids).execute()).data or []:
        if m.get('day_of_week') is None:
            continue
        meetings_by_class.setdefault(m['class_id'], []).append({
            'day_of_week': m['day_of_week'],
            'start_time': str(m.get('start_time') or '')[:5],
            'end_time': str(m.get('end_time') or '')[:5],
            'location': m.get('location'),
        })

    out = []
    for c in classes:
        tid = c.get('primary_instructor_id') or advisors_by_class.get(c['id'])
        qid = first_quest.get(c['id'])
        out.append({
            'class_id': c['id'],
            'name': c['name'],
            'teacher_name': teacher_names.get(tid) if tid else None,
            'quest_id': qid,
            'quest_title': quest_titles.get(qid) if qid else None,
            'meetings': sorted(meetings_by_class.get(c['id'], []),
                               key=lambda m: (m['day_of_week'], m['start_time'])),
        })
    out.sort(key=lambda r: (r['name'] or '').lower())
    return out


def get_student(org_id: str, student_id: str) -> Optional[Dict[str, Any]]:
    """A single student in the roster shape (for opening the student modal elsewhere)."""
    if not student_in_org(student_id, org_id):
        return None
    return next((r for r in get_roster(org_id) if r['student_id'] == student_id), None)


ASSIGNABLE_ROLES = ('student', 'parent', 'advisor', 'org_admin', 'observer')


def update_user_role(org_id: str, user_id: str, role: str = None,
                     roles: List[str] = None) -> Dict[str, Any]:
    """Change a user's org role(s) (org_managed users). Sets org_role + org_roles.

    Accepts a single `role` (legacy) or a `roles` list — a person can be several
    things at once (e.g. a teacher who is also a parent). The first role in the
    list is primary (drives org_role / get_effective_role).
    Returns {'error': ...} on a bad role / cross-org user.
    """
    role_list = [r for r in (roles if roles is not None else [role]) if r]
    if not role_list:
        return {'error': 'Pick at least one role'}
    seen = set()
    role_list = [r for r in role_list if not (r in seen or seen.add(r))]
    for r in role_list:
        if r not in ASSIGNABLE_ROLES:
            return {'error': f'Invalid role: {r}'}
    row = (
        _admin().table('users').select('id, role, organization_id')
        .eq('id', user_id).limit(1).execute()
    ).data
    if not row or row[0].get('organization_id') != org_id:
        return {'error': 'User not found'}
    payload = {'org_role': role_list[0], 'org_roles': role_list}
    # Org users are 'org_managed' at the platform level; keep that invariant.
    if row[0].get('role') != 'superadmin':
        payload['role'] = 'org_managed'
    _admin().table('users').update(payload).eq('id', user_id).execute()
    return {'role': role_list[0], 'roles': role_list}


def get_org_user(org_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Any org user in the modal shape. Students get the full roster shape (with
    enrollment/family); non-students (parents/advisors/admins) get a lean profile.
    `student_id` is the user id (kept for the shared modal component)."""
    from utils.roles import get_effective_role
    row = (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, email, username, date_of_birth, '
                'role, org_role, org_roles, organization_id')
        .eq('id', user_id).limit(1).execute()
    ).data
    if not row or row[0].get('organization_id') != org_id:
        return None
    u = row[0]
    if is_student(u):
        s = get_student(org_id, user_id)
        if s:
            s['role'] = 'student'
            return s
    hh = _household_by_user(org_id).get(user_id) or {}
    return {
        'student_id': u['id'],
        'name': _full_name(u),
        'is_student': False,
        'role': get_effective_role(u),
        'first_name': u.get('first_name'),
        'last_name': u.get('last_name'),
        'date_of_birth': u.get('date_of_birth'),
        'email': u.get('email'),
        'username': u.get('username'),
        'household_id': hh.get('household_id'),
        'household_name': hh.get('household_name'),
    }


def household_registration(org_id: str, household_id: str) -> Optional[Dict[str, Any]]:
    """The latest iCreate registration submitted by any guardian in this household
    (answers, signed paperwork, kids, fee) — surfaced on the Family detail modal.
    Returns None for orgs/households without one."""
    members = (
        _admin().table('household_members')
        .select('user_id, is_primary_guardian, relationship')
        .eq('household_id', household_id)
        .execute()
    ).data or []
    guardian_ids = [m['user_id'] for m in members
                    if m.get('is_primary_guardian') or m.get('relationship') in ('guardian', 'parent')]
    if not guardian_ids:
        return None
    rows = (
        _admin().table('icreate_registrations')
        .select('id, parent_user_id, status, kids, paperwork, answers, emergency_contacts, '
                'fee_cents, fee_recorded_at, scheduling_emailed_at, created_at, completed_at')
        .eq('organization_id', org_id)
        .in_('parent_user_id', guardian_ids)
        .order('created_at', desc=True)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


# ── Org messaging identity ────────────────────────────────────────────────────
# SIS family/student messages are sent from a per-org "school account" so the
# recipient sees the school's name and logo — not the individual staff member,
# and never the "Optio Support" alias that fronts superadmin senders.

def org_messaging_email(org_id: str) -> str:
    """Deterministic placeholder email that marks the org's school account."""
    return f"school-{org_id}@optio-internal-placeholder.local"


def _org_messaging_sender(org_id: str) -> Optional[str]:
    """User id of the org's school account, created on first use. org_role is
    org_admin so DM permissions allow messaging anyone in the org AND let
    recipients reply. The account can't log in (placeholder email, no password).
    Returns None on failure so callers can fall back to the staff sender."""
    admin = _admin()
    email = org_messaging_email(org_id)
    row = (admin.table('users').select('id').eq('email', email).limit(1).execute()).data
    if row:
        return row[0]['id']

    org_rows = (admin.table('organizations').select('name, branding_config')
                .eq('id', org_id).limit(1).execute()).data
    org = org_rows[0] if org_rows else {}
    name = org.get('name') or 'School'
    logo = (org.get('branding_config') or {}).get('logo_url')
    try:
        auth_resp = admin.auth.admin.create_user({
            'email': email,
            'email_confirm': False,
            'user_metadata': {'display_name': name, 'org_messaging_account': True},
            'app_metadata': {'provider': 'org_messaging', 'providers': ['org_messaging']},
        })
        uid = auth_resp.user.id
        admin.table('users').insert({
            'id': uid, 'email': email, 'display_name': name,
            'first_name': name, 'last_name': '',
            'avatar_url': logo,
            'organization_id': org_id, 'role': 'org_managed', 'org_role': 'org_admin',
        }).execute()
        return uid
    except Exception as e:
        logger.error(f"org messaging account create failed for org {str(org_id)[:8]}: {e}")
        return None


def message_household_guardians(org_id: str, household_id: str, sender_id: str,
                               subject: str, body: str) -> Dict[str, Any]:
    """Send a platform message to every guardian in a household (best-effort per
    guardian), from the org's school account (falls back to the staff sender)."""
    from services.direct_message_service import DirectMessageService
    members = (
        _admin().table('household_members').select('user_id, relationship')
        .eq('household_id', household_id).execute()
    ).data or []
    guardian_ids = [m['user_id'] for m in members if m.get('relationship') in ('guardian', 'other')]
    content = f"{subject}\n\n{body}" if subject else body
    sender = _org_messaging_sender(org_id) or sender_id
    svc = DirectMessageService()
    sent = 0
    for gid in guardian_ids:
        try:
            svc.send_message(sender, gid, content)
            sent += 1
        except Exception as e:
            logger.info(f"family message to guardian {str(gid)[:8]} skipped: {e}")
    return {'sent': sent, 'guardians': len(guardian_ids)}


def message_student(org_id: str, student_id: str, sender_id: str, subject: str, body: str) -> Dict[str, Any]:
    """Send a message to the student through the platform messaging (direct messages)
    system, from the org's school account (falls back to the staff caller).
    Raises ValueError if the sender lacks permission."""
    from services.direct_message_service import DirectMessageService
    content = f"{subject}\n\n{body}" if subject else body
    sender = _org_messaging_sender(org_id) or sender_id
    msg = DirectMessageService().send_message(sender, student_id, content)
    return {'conversation_id': msg.get('conversation_id')}


def households_with_members(org_id: str) -> List[Dict[str, Any]]:
    from repositories.household_repository import HouseholdRepository
    repo = HouseholdRepository(client=_admin())
    households = repo.list_for_org(org_id)
    if not households:
        return []
    members = repo.members_for_households([h['id'] for h in households])

    # Hydrate member names in one pass.
    user_ids = list({m['user_id'] for m in members})
    users = {}
    if user_ids:
        rows = (
            _admin().table('users')
            .select('id, first_name, last_name, display_name, email, username, date_of_birth')
            .in_('id', user_ids)
            .execute()
        ).data or []
        users = {u['id']: u for u in rows}

    enrollments = _enrollments_by_student(org_id)
    by_household: Dict[str, List[Dict[str, Any]]] = {}
    for m in members:
        u = users.get(m['user_id'], {})
        entry = {
            'user_id': m['user_id'],
            'name': _full_name(u) if u else 'Unknown',
            'email': u.get('email') if u else None,
            'relationship': m.get('relationship'),
            'is_primary_guardian': m.get('is_primary_guardian'),
        }
        if m.get('relationship') == 'student':
            enr = enrollments.get(m['user_id']) or {}
            entry['status'] = enr.get('status') or 'unassigned'
            entry['grade_level'] = enr.get('grade_level')
            # Carried only for duplicate detection; stripped before returning.
            entry['first_name'] = u.get('first_name') if u else None
            entry['last_name'] = u.get('last_name') if u else None
            entry['date_of_birth'] = u.get('date_of_birth') if u else None
        by_household.setdefault(m['household_id'], []).append(entry)
    for h in households:
        h['members'] = by_household.get(h['id'], [])
        h['primary_contact_user_id'] = h.get('primary_contact_user_id')
        _mark_duplicate_members(h['members'])
        for m in h['members']:
            for k in ('first_name', 'last_name', 'date_of_birth'):
                m.pop(k, None)
    return households
