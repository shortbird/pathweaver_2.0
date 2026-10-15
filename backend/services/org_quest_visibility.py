"""
How much of the Optio quest library a school may use: one rule, every door.

organizations.quest_visibility_policy:

  all_optio     every live, public Optio-library quest (the default)
  curated       only the ones granted to the school (organization_quest_access)
  private_only  none; the school's own quests only

The rule used to live inline in the web org console's picker
(GET /api/organizations/<id>/available-quests) and nowhere else. The SIS assign
doors (the class page's assignable-quests and assign, the quest library's
curriculum and give-to-students writes) checked only "the school's own, or
public and global", so a private_only school could put any public Optio quest
in front of its students from the SIS (2026-10-15, found while moving the org
console's quest settings into the SIS). Every door now asks here.

`library_scope` answers for a list (what to add to a query), `may_assign` for
one quest (what to refuse).
"""

from typing import Any, Dict, List, Optional, Tuple

from repositories.org_quest_visibility_repository import OrgQuestVisibilityRepository

POLICIES = ('all_optio', 'curated', 'private_only')
DEFAULT_POLICY = 'all_optio'


def _repo(admin) -> OrgQuestVisibilityRepository:
    return OrgQuestVisibilityRepository(client=admin)


def org_quest_policy(admin, org_id: Optional[str]) -> str:
    """The school's policy. No school, or no value, reads as the default."""
    if not org_id:
        return DEFAULT_POLICY
    policy = _repo(admin).policy(org_id)
    return policy if policy in POLICIES else DEFAULT_POLICY


def library_scope(admin, org_id: Optional[str]) -> Tuple[str, Optional[List[str]]]:
    """(policy, ids) for the Optio library this school may use.

    ids is None for the whole library, a list (possibly empty) for only those
    quests. private_only is an empty list: nothing.
    """
    policy = org_quest_policy(admin, org_id)
    if policy == 'private_only':
        return policy, []
    if policy == 'curated' and org_id:
        return policy, _repo(admin).granted_quest_ids(org_id)
    return policy, None


def picker_library_quests(admin, org_id: Optional[str], *, search: Optional[str] = None,
                          limit: int = 40) -> List[Dict[str, Any]]:
    """The live public Optio quests this school may pick from, title-searched."""
    _policy, ids = library_scope(admin, org_id)
    if ids is not None and not ids:
        return []
    return _repo(admin).picker_quests(only_ids=ids, search=search, limit=limit)


def library_quest_allowed(admin, org_id: Optional[str], quest_id: str) -> bool:
    """May this school use this (already known to be global, public) quest?"""
    _policy, ids = library_scope(admin, org_id)
    return ids is None or quest_id in ids


def may_assign(admin, org_id: str, quest: Optional[Dict[str, Any]]) -> bool:
    """A live quest the school owns, or a live public Optio quest its policy lets in.

    `quest` carries id, organization_id, is_public and is_active. Never another
    school's quest, never a draft or a retired one.
    """
    if not quest or not quest.get('is_active'):
        return False
    if quest.get('organization_id') == org_id:
        return True
    if quest.get('organization_id') is None and quest.get('is_public'):
        return library_quest_allowed(admin, org_id, quest['id'])
    return False
