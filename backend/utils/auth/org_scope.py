"""
Org-scoping helpers for admin/staff routes that use the RLS-bypassing admin
client and therefore must enforce tenant isolation manually.

These exist because most admin routes authenticate + authorize by ROLE only,
then read/write with the service-role client. Without an explicit
"target belongs to caller's org" check, an org_admin/advisor can act on another
org's users (cross-tenant IDOR). Use these to add that missing check.

All lookups use the caller-provided admin client (no new client created), and
never use `.single()` (which raises on 0/2+ rows) — they degrade to "deny".
"""

from typing import Optional, Tuple

from utils.roles import get_effective_role, get_effective_roles


def _caller_row(admin_client, caller_id: str) -> Optional[dict]:
    """The caller's role columns, or None on a missing row or a failed lookup."""
    try:
        res = (admin_client.table('users')
               .select('role, org_role, org_roles, organization_id, is_org_admin')
               .eq('id', caller_id).limit(1).execute())
        return (res.data or [None])[0]
    except Exception:
        return None


def caller_org_and_role(admin_client, caller_id: str) -> Tuple[Optional[str], Optional[str], bool]:
    """Return (effective_role, organization_id, is_superadmin) for the caller.

    effective_role resolves org_managed -> org_role. is_superadmin is True only
    for a platform superadmin. On any lookup failure returns (None, None, False)
    so callers fail closed.
    """
    u = _caller_row(admin_client, caller_id)
    if not u:
        return None, None, False
    is_super = u.get('role') == 'superadmin'
    return get_effective_role(u), u.get('organization_id'), is_super


def caller_roles_and_org(admin_client, caller_id: str) -> Tuple[set, Optional[str], bool]:
    """Return (every effective role, organization_id, is_superadmin).

    caller_org_and_role answers with the PRIMARY role, which is the wrong
    question for "is this person staff": at a microschool the parent who also
    teaches carries org_roles ['parent', 'advisor'], and reading the first one
    would refuse them at every staff door. Same lookup, the whole set.
    """
    u = _caller_row(admin_client, caller_id)
    if not u:
        return set(), None, False
    return set(get_effective_roles(u)), u.get('organization_id'), u.get('role') == 'superadmin'


def user_org(admin_client, target_user_id: str) -> Optional[str]:
    """Return the organization_id for a user, or None (missing/failed lookup)."""
    if not target_user_id:
        return None
    try:
        res = (admin_client.table('users')
               .select('organization_id')
               .eq('id', target_user_id).limit(1).execute())
        row = (res.data or [None])[0]
    except Exception:
        row = None
    return (row or {}).get('organization_id')


def caller_can_access_user(admin_client, caller_id: str, target_user_id: str) -> bool:
    """Whether `caller_id` may act on `target_user_id` under org scoping.

    Superadmin: always. Otherwise the caller must have an organization and the
    target must be in that SAME organization. A caller with no org, or a target
    in a different (or NULL) org, is denied.
    """
    _role, caller_org, is_super = caller_org_and_role(admin_client, caller_id)
    if is_super:
        return True
    if not caller_org:
        return False
    return user_org(admin_client, target_user_id) == caller_org


def caller_can_access_org(admin_client, caller_id: str, target_org_id: Optional[str]) -> bool:
    """Whether `caller_id` may act on resources belonging to `target_org_id`.

    Superadmin: always. Otherwise the caller's org must equal target_org_id.
    A NULL target_org (global/platform content) is only accessible to superadmin.
    """
    _role, caller_org, is_super = caller_org_and_role(admin_client, caller_id)
    if is_super:
        return True
    if not caller_org or not target_org_id:
        return False
    return caller_org == target_org_id


def course_org(admin_client, course_id: str) -> Tuple[bool, Optional[str]]:
    """Return (exists, organization_id) for a course. exists=False when missing."""
    if not course_id:
        return False, None
    try:
        res = (admin_client.table('courses')
               .select('organization_id')
               .eq('id', course_id).limit(1).execute())
        row = (res.data or [None])[0]
    except Exception:
        row = None
    if row is None:
        return False, None
    return True, row.get('organization_id')


def caller_can_access_course(admin_client, caller_id: str, course_id: str) -> bool:
    """Whether `caller_id` may act on a course (and its projects/lessons/tasks).

    Superadmin: always. The course's CREATOR: always — a platform advisor
    (organization_id NULL) creating a course via Course Builder produces a
    NULL-org draft, and without this escape hatch they were denied on the very
    next request and the draft was orphaned. Org staff: only when the course's
    org matches theirs. Other NULL-org courses stay superadmin-only. Missing
    course -> denied.
    """
    if not course_id:
        return False
    try:
        res = (admin_client.table('courses')
               .select('organization_id, created_by')
               .eq('id', course_id).limit(1).execute())
        row = (res.data or [None])[0]
    except Exception:
        row = None
    if row is None:
        return False
    if caller_id and row.get('created_by') == caller_id:
        return True
    return caller_can_access_org(admin_client, caller_id, row.get('organization_id'))
