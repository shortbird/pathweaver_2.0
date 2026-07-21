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

from utils.roles import get_effective_role


def caller_org_and_role(admin_client, caller_id: str) -> Tuple[Optional[str], Optional[str], bool]:
    """Return (effective_role, organization_id, is_superadmin) for the caller.

    effective_role resolves org_managed -> org_role. is_superadmin is True only
    for a platform superadmin. On any lookup failure returns (None, None, False)
    so callers fail closed.
    """
    try:
        res = (admin_client.table('users')
               .select('role, org_role, org_roles, organization_id, is_org_admin')
               .eq('id', caller_id).limit(1).execute())
        u = (res.data or [None])[0]
    except Exception:
        u = None
    if not u:
        return None, None, False
    is_super = u.get('role') == 'superadmin'
    return get_effective_role(u), u.get('organization_id'), is_super


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

    Superadmin: always. Org staff: only when the course's org matches theirs.
    A global course (org_id NULL) is superadmin-only. Missing course -> denied.
    """
    exists, org_id = course_org(admin_client, course_id)
    if not exists:
        return False
    return caller_can_access_org(admin_client, caller_id, org_id)
