"""Family groups: a school's own named cohorts of families.

The first one is "OpenEd" at Optio Academy: the 53 families who came from
Hearthwood Academy on 2026-10-02. The office picks them out on the People page,
and /admin/crm/lists emails them as a group.

A group is a label on the HOUSEHOLD, because the family is what gets billed
and emailed: parents and students inherit it from the family they are in. A
group says nothing about money. Who pays is households.funding_source (OpenEd
pays for these families too, which is 'opened' there); keeping the two apart
means a family can leave OpenEd's funding and still be filed with the cohort,
or the reverse, without either fact lying.

Every function takes the org id the route already checked; nothing here
decides who may call it.
"""
from typing import Any, Dict, Iterable, List

from repositories.family_group_repository import FamilyGroupRepository
from utils.logger import get_logger

logger = get_logger(__name__)

MAX_NAME = 60


class GroupError(ValueError):
    """A refusal the route returns as a 400 (or 404 when not found)."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


# admin client justified: family_groups tables are service-role only; the SIS
#   route's ADMIN_ROLES + org check (or require_superadmin) is the authorization
from utils.admin_client import admin_client as _admin


def _repo() -> FamilyGroupRepository:
    return FamilyGroupRepository(client=_admin())


def clean_name(name: Any) -> str:
    text = ' '.join(str(name or '').split())
    if not text:
        raise GroupError('A group needs a name')
    return text[:MAX_NAME]


def list_groups(org_id: str) -> List[Dict[str, Any]]:
    """The school's groups, each with how many families are in it."""
    repo = _repo()
    groups = repo.for_org(org_id)
    counts: Dict[str, int] = {}
    for m in repo.memberships([g['id'] for g in groups]):
        counts[m['group_id']] = counts.get(m['group_id'], 0) + 1
    return [{'id': g['id'], 'name': g['name'], 'family_count': counts.get(g['id'], 0)} for g in groups]


def _owned(org_id: str, group_id: str) -> Dict[str, Any]:
    group = _repo().get(group_id)
    if not group or group.get('organization_id') != org_id:
        raise GroupError('Group not found', 404)
    return group


def _name_taken(org_id: str, name: str, except_id: str = '') -> bool:
    return any(g['name'].lower() == name.lower() and g['id'] != except_id
               for g in _repo().for_org(org_id))


def create_group(org_id: str, name: Any, user_id: str) -> Dict[str, Any]:
    name = clean_name(name)
    if _name_taken(org_id, name):
        raise GroupError(f'There is already a group called {name}')
    row = _repo().insert({'organization_id': org_id, 'name': name, 'created_by': user_id})
    return {'id': row['id'], 'name': row['name'], 'family_count': 0}


def rename_group(org_id: str, group_id: str, name: Any) -> Dict[str, Any]:
    _owned(org_id, group_id)
    name = clean_name(name)
    if _name_taken(org_id, name, except_id=group_id):
        raise GroupError(f'There is already a group called {name}')
    _repo().rename(group_id, name)
    return {'id': group_id, 'name': name}


def delete_group(org_id: str, group_id: str) -> None:
    """The families stay; only the label goes (memberships cascade)."""
    _owned(org_id, group_id)
    _repo().remove(group_id)


def set_household_groups(org_id: str, household_id: str, group_ids: Iterable[str],
                         user_id: str) -> List[Dict[str, Any]]:
    """Make this family's groups exactly `group_ids`. The caller has checked
    that the household is in `org_id`; every group must be too."""
    wanted = list(dict.fromkeys(g for g in group_ids if isinstance(g, str) and g))
    repo = _repo()
    groups = {g['id']: g for g in repo.for_org(org_id)}
    unknown = [g for g in wanted if g not in groups]
    if unknown:
        raise GroupError('Group not found', 404)
    current = set(repo.household_group_ids(household_id))
    repo.drop(household_id, [g for g in current if g not in wanted])
    repo.add([{'household_id': household_id, 'group_id': g, 'added_by': user_id}
              for g in wanted if g not in current])
    return [{'id': g, 'name': groups[g]['name']} for g in wanted]


def groups_by_household(org_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """{household_id: [{id, name}, ...]} for every family in a group."""
    repo = _repo()
    groups = {g['id']: g for g in repo.for_org(org_id)}
    out: Dict[str, List[Dict[str, Any]]] = {}
    for m in repo.memberships(list(groups)):
        g = groups[m['group_id']]
        out.setdefault(m['household_id'], []).append({'id': g['id'], 'name': g['name']})
    for v in out.values():
        v.sort(key=lambda g: g['name'].lower())
    return out


def attach_to_households(org_id: str, households: List[Dict[str, Any]]) -> None:
    """Put `groups` on each household row of the Families list."""
    try:
        by_household = groups_by_household(org_id)
    except Exception as e:  # noqa: BLE001 -- the list still works without labels
        logger.warning(f'family groups unavailable for {org_id}: {e}')
        by_household = {}
    for h in households:
        h['groups'] = by_household.get(h['id'], [])


def attach_to_roster(org_id: str, roster: List[Dict[str, Any]]) -> None:
    """Put `household_groups` (names) on each People row that is in a family."""
    try:
        by_household = groups_by_household(org_id)
    except Exception as e:  # noqa: BLE001 -- the roster still works without labels
        logger.warning(f'family groups unavailable for {org_id}: {e}')
        by_household = {}
    for r in roster:
        r['household_groups'] = [g['name'] for g in by_household.get(r.get('household_id') or '', [])]
