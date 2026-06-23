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
                'role, org_role, org_roles, total_xp, last_active, created_at')
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
