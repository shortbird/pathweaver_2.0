"""Archiving, restoring and deleting an organization.

Removing an org is two separate operations, not one, because they carry
completely different risk:

**Archive** is the everyday one and it is reversible. The org drops out of every
list and picker (`is_active` already gates `get_all_active`, `get_by_slug` and
the public join-by-slug route), and its members are converted to ordinary
platform accounts -- `organization_id = NULL`, their `org_role` promoted to a
direct `role`. They keep every row they own: XP, quests, task completions,
evidence, journal entries. Nothing about a learner's work is org-owned.

**Delete** is permanent and is deliberately hard to reach. 77 tables carry an FK
to `organizations(id)`, a mix of ON DELETE CASCADE and ON DELETE SET NULL, so a
DELETE on an org that still owns content destroys announcements, class
materials, discussion posts, SIS records and more with no undo. So a delete
requires all three of:

    1. the org is already archived (so members are already detached),
    2. `organization_content_summary` reports nothing left pointing at it,
    3. the caller retypes the org name exactly.

Which means in practice you can delete a test org, and you cannot delete a
school that ever ran a class until somebody clears it out on purpose. That is
the intended asymmetry, not a gap.

The role mapping on detach matches `POST /<org_id>/users/remove`, which has done
this same conversion for single users for a long time: an `org_role` that is
also a platform role carries over, and anything else (`org_admin`,
`campus_coordinator`) lands on `student`. Least privilege -- a school
administrator must not silently become a platform advisor with reach into other
people's students. The response reports the mapping so a superadmin can promote
the handful of staff accounts back by hand.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)

# The four roles a user can hold with organization_id = NULL. `org_admin` and
# `campus_coordinator` are org-only by design (CLAUDE.md: campus_coordinator is
# in OrgRole and deliberately NOT in UserRole).
PLATFORM_ROLES = ('student', 'parent', 'advisor', 'observer')

FALLBACK_PLATFORM_ROLE = 'student'


class OrganizationLifecycleError(ValueError):
    """A lifecycle transition the caller asked for isn't allowed."""


class OrganizationNotFound(OrganizationLifecycleError):
    pass


class OrganizationNotEmpty(OrganizationLifecycleError):
    """Delete refused: rows still reference this organization."""

    def __init__(self, blockers: List[Dict[str, Any]]):
        self.blockers = blockers
        total = sum(b['rows'] for b in blockers)
        super().__init__(
            f"{total} record(s) across {len(blockers)} table(s) still belong to "
            "this organization."
        )


def platform_role_for(org_role: Optional[str]) -> str:
    """The platform role a departing member lands on."""
    return org_role if org_role in PLATFORM_ROLES else FALLBACK_PLATFORM_ROLE


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_org(client, org_id: str) -> Dict[str, Any]:
    res = (client.table('organizations')
           .select('id, name, slug, is_active, archived_at, archived_by')
           .eq('id', org_id).limit(1).execute())
    rows = res.data or []
    if not rows:
        raise OrganizationNotFound('Organization not found')
    return rows[0]


def audit_entry(admin_id: str, org: Dict[str, Any], action_type: str,
                changes: Dict[str, Any]) -> Dict[str, Any]:
    """The admin_audit_logs row for one lifecycle action.

    Its own function so the column names are covered by a test. This table has
    `user_id` / `changes` -- NOT the admin_id/metadata pair that
    AdminAuditRepository.log_action writes, and not the action/entity_type
    columns other admin routes use. Every insert here is wrapped in try/except
    (an audit failure must not undo a completed archive), so a wrong column name
    would fail silently and stay wrong.

    `organization_id` is FK'd ON DELETE SET NULL, so after a delete this row
    survives with a null org pointer -- which is why the id and name are also
    copied into `changes`, where nothing can clear them.
    """
    return {
        'user_id': admin_id,
        'organization_id': org['id'],
        'action_type': action_type,
        'resource_type': 'organization',
        'resource_id': org['id'],
        'changes': {
            'organization_name': org.get('name'),
            'organization_slug': org.get('slug'),
            **changes,
        },
    }


def _write_audit(client, entry: Dict[str, Any]) -> None:
    try:
        client.table('admin_audit_logs').insert(entry).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"organization_lifecycle: audit insert failed: {e}")


def detach_members(client, org_id: str) -> Dict[str, Any]:
    """Convert every member of the org into a platform user.

    Paged: an org's member count grows with the org, so a plain select would be
    silently truncated at the PostgREST row cap and quietly leave the tail of a
    large school still pointing at an archived org (CLAUDE.md rule 10).

    Updates are grouped by resulting role, so this is at most four writes
    regardless of headcount. `is_org_admin` is deliberately not written -- the
    sync_is_org_admin trigger derives it from role/org_role/org_roles, and
    writing it by hand is what let demoted admins keep admin access before the
    trigger existed.
    """
    members = fetch_all_rows(lambda: (
        client.table('users')
        .select('id, role, org_role')
        .eq('organization_id', org_id)
    ))

    by_role: Dict[str, List[str]] = {}
    skipped_superadmins = 0

    for m in members:
        # A superadmin is a platform user by definition and must never be
        # demoted through an org operation -- the same guard the per-user
        # remove endpoint applies.
        if m.get('role') == 'superadmin':
            skipped_superadmins += 1
            continue
        by_role.setdefault(platform_role_for(m.get('org_role')), []).append(m['id'])

    for role, user_ids in by_role.items():
        for chunk in (user_ids[i:i + 200] for i in range(0, len(user_ids), 200)):
            (client.table('users')
             .update({
                 'organization_id': None,
                 'role': role,
                 'org_role': None,
                 'org_roles': None,
             })
             # Org filter is defense-in-depth against a concurrent move.
             .eq('organization_id', org_id)
             .in_('id', chunk)
             .execute())

    converted = sum(len(v) for v in by_role.values())
    logger.info(
        f"organization_lifecycle: detached {converted} member(s) from org {org_id} "
        f"({ {r: len(v) for r, v in by_role.items()} })"
    )

    return {
        'converted': converted,
        'by_role': {r: len(v) for r, v in by_role.items()},
        'skipped_superadmins': skipped_superadmins,
    }


def archive_organization(client, org_id: str, admin_id: str) -> Dict[str, Any]:
    """Retire an org: detach its members, then hide it. Reversible."""
    org = _get_org(client, org_id)
    if not org.get('is_active'):
        raise OrganizationLifecycleError('Organization is already archived')

    detached = detach_members(client, org_id)

    updated = (client.table('organizations')
               .update({
                   'is_active': False,
                   'archived_at': _now(),
                   'archived_by': admin_id,
               })
               .eq('id', org_id)
               .execute())

    _write_audit(client, audit_entry(admin_id, org, 'archive_organization', detached))

    return {
        'organization': (updated.data or [None])[0],
        'members_converted': detached['converted'],
        'members_by_role': detached['by_role'],
    }


def restore_organization(client, org_id: str, admin_id: str) -> Dict[str, Any]:
    """Bring an archived org back.

    Members are NOT re-attached: they are ordinary platform accounts now, and
    silently pulling live accounts back under an org's administration isn't
    something a restore should do behind the user's back. Re-add them from the
    People tab.
    """
    org = _get_org(client, org_id)
    if org.get('is_active'):
        raise OrganizationLifecycleError('Organization is not archived')

    updated = (client.table('organizations')
               .update({'is_active': True, 'archived_at': None, 'archived_by': None})
               .eq('id', org_id)
               .execute())

    _write_audit(client, audit_entry(admin_id, org, 'restore_organization', {}))

    return {'organization': (updated.data or [None])[0]}


def content_summary(client, org_id: str) -> List[Dict[str, Any]]:
    """Every table still holding rows for this org, biggest first."""
    res = client.rpc('organization_content_summary', {'p_org_id': org_id}).execute()
    rows = res.data or []
    summary = [{'table': r['rel_name'], 'rows': r['row_count']} for r in rows]
    return sorted(summary, key=lambda r: (-r['rows'], r['table']))


def deletion_preview(client, org_id: str) -> Dict[str, Any]:
    """What a superadmin needs to see before the delete button means anything."""
    org = _get_org(client, org_id)
    blockers = content_summary(client, org_id)
    reasons = []
    if org.get('is_active'):
        reasons.append('Archive the organization first.')
    if blockers:
        reasons.append('Records still reference this organization.')

    return {
        'organization': org,
        'blockers': blockers,
        'can_delete': not reasons,
        'reasons': reasons,
    }


def delete_organization(client, org_id: str, admin_id: str,
                        confirm_name: Optional[str]) -> Dict[str, Any]:
    """Permanently delete an empty, archived organization.

    The three preconditions are re-checked here rather than trusted from the
    preview call: the preview is a separate request and the org can change
    between the two.
    """
    org = _get_org(client, org_id)

    if org.get('is_active'):
        raise OrganizationLifecycleError(
            'Archive the organization before deleting it.'
        )

    if (confirm_name or '').strip() != (org.get('name') or '').strip():
        raise OrganizationLifecycleError(
            'Type the organization name exactly to confirm deletion.'
        )

    blockers = content_summary(client, org_id)
    if blockers:
        raise OrganizationNotEmpty(blockers)

    # Audit BEFORE the delete: the FK is ON DELETE SET NULL, so writing it after
    # would still work but the row would race the cascade. The name and id are
    # copied into `changes` so the record survives the null-out.
    _write_audit(client, audit_entry(admin_id, org, 'delete_organization', {
        'archived_at': org.get('archived_at'),
    }))

    # Credentials scoped to the org go with it. Excluded from the blocker count
    # for exactly this reason -- a stored Stripe key should never be the thing
    # standing between a superadmin and deleting a dead org.
    try:
        client.table('organization_secrets').delete().eq('organization_id', org_id).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"organization_lifecycle: secret purge failed for {org_id}: {e}")

    client.table('organizations').delete().eq('id', org_id).execute()

    logger.info(f"organization_lifecycle: deleted org {org_id} ({org.get('slug')}) by {admin_id}")

    return {'deleted': True, 'organization_id': org_id, 'name': org.get('name')}
