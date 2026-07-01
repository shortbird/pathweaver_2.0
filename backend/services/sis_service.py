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


def _org_students(org_id: str) -> List[Dict[str, Any]]:
    resp = (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, email, username, '
                'role, org_role, org_roles, total_xp, last_active, created_at, date_of_birth')
        .eq('organization_id', org_id)
        .execute()
    )
    return [u for u in (resp.data or []) if is_student(u)]


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


def get_roster(org_id: str) -> List[Dict[str, Any]]:
    students = _org_students(org_id)
    enrollments = _enrollments_by_student(org_id)
    households = _household_by_user(org_id)
    roster = []
    for s in students:
        enr = enrollments.get(s['id'])
        hh = households.get(s['id'])
        roster.append({
            'student_id': s['id'],
            'name': _full_name(s),
            'first_name': s.get('first_name'),
            'last_name': s.get('last_name'),
            'date_of_birth': s.get('date_of_birth'),
            'email': s.get('email'),
            'username': s.get('username'),
            'total_xp': s.get('total_xp'),
            'last_active': s.get('last_active'),
            'enrollment_status': (enr or {}).get('status') or 'unassigned',
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
    }
    resp = _admin().table('emergency_contacts').insert(payload).execute()
    return resp.data[0] if resp.data else None


def delete_emergency_contact(contact_id: str) -> None:
    _admin().table('emergency_contacts').delete().eq('id', contact_id).execute()


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
                'role, org_role, org_roles, last_active, created_at')
        .eq('organization_id', org_id)
        .execute()
    )
    out = []
    for u in (resp.data or []):
        roles = _user_org_roles(u)
        staff_roles = [r for r in STAFF_ORG_ROLES if r in roles]
        if not staff_roles:
            continue
        out.append({
            'id': u['id'],
            'name': _full_name(u),
            'email': u.get('email'),
            'roles': staff_roles,
            'role_labels': [_STAFF_ROLE_LABEL.get(r, r) for r in staff_roles],
            'last_active': u.get('last_active'),
        })
    # Org admins first, then advisors; alphabetical within.
    out.sort(key=lambda r: ('org_admin' not in r['roles'], r['name'].lower()))
    return out


def student_in_org(student_id: str, org_id: str) -> bool:
    row = (
        _admin().table('users').select('id, organization_id')
        .eq('id', student_id).limit(1).execute()
    ).data
    return bool(row and row[0].get('organization_id') == org_id)


_PROFILE_FIELDS = ('first_name', 'last_name', 'email', 'date_of_birth')


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
        })
    out.sort(key=lambda r: (r['name'] or '').lower())
    return out


def message_student(student_id: str, sender_id: str, subject: str, body: str) -> Dict[str, Any]:
    """Send a message to the student through the platform messaging (direct messages)
    system, from the staff caller. Raises ValueError if the sender lacks permission."""
    from services.direct_message_service import DirectMessageService
    content = f"{subject}\n\n{body}" if subject else body
    msg = DirectMessageService().send_message(sender_id, student_id, content)
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
            .select('id, first_name, last_name, display_name, email, username')
            .in_('id', user_ids)
            .execute()
        ).data or []
        users = {u['id']: u for u in rows}

    by_household: Dict[str, List[Dict[str, Any]]] = {}
    for m in members:
        u = users.get(m['user_id'], {})
        by_household.setdefault(m['household_id'], []).append({
            'user_id': m['user_id'],
            'name': _full_name(u) if u else 'Unknown',
            'email': u.get('email') if u else None,
            'relationship': m.get('relationship'),
            'is_primary_guardian': m.get('is_primary_guardian'),
        })
    for h in households:
        h['members'] = by_household.get(h['id'], [])
    return households
