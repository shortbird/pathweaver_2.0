"""Reads behind a guardian's child list (/api/family/children).

The relationship itself is not decided here: utils.class_membership
.links_of_parent names the children and which of the three links each one
holds. This repository hydrates those ids -- the user rows and the count of
quests each child is on -- and nothing more, so the one child list stays a
composition of the one definition of parent plus two bounded reads.

Both reads are bounded by ONE family (a guardian's children, typically one to
four), never by an org, so neither can approach the 1,000-row PostgREST cap
that CLAUDE.md warns about. The quest tally is done in Python for the same
reason: a `count='exact'` per child would be one round trip per child for a
number that a single `in_` read over the family answers in one.
"""

from typing import Any, Dict, Iterable, List

from repositories.base_repository import BaseRepository

# Every field the family child list reports. Kept as one string so the route,
# the adapters and the tests agree on what a child row carries.
CHILD_FIELDS = (
    'id, first_name, last_name, display_name, preferred_name, username, email, '
    'avatar_url, date_of_birth, is_dependent, managed_by_parent_id, '
    'promotion_eligible_at, organization_id, total_xp, level, '
    'ai_features_enabled, ai_chatbot_enabled, ai_lesson_helper_enabled, '
    'ai_task_generation_enabled'
)


class FamilyRepository(BaseRepository):
    table_name = 'users'

    def children_rows(self, child_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """{child_id: user row} for these children, CHILD_FIELDS only."""
        ids = sorted({i for i in child_ids if i})
        if not ids:
            return {}
        rows: List[Dict[str, Any]] = (self.client.table('users').select(CHILD_FIELDS)
                                      .in_('id', ids).execute()).data or []
        return {r['id']: r for r in rows if r.get('id')}

    def active_quest_counts(self, child_ids: Iterable[str]) -> Dict[str, int]:
        """{child_id: number of quests with status 'active'} -- the figure the
        retired SQL function get_parent_dependents reported as
        active_quest_count. One read for the family; see module docstring."""
        ids = sorted({i for i in child_ids if i})
        if not ids:
            return {}
        rows: List[Dict[str, Any]] = (self.client.table('user_quests').select('user_id')
                                      .in_('user_id', ids).eq('status', 'active')
                                      .execute()).data or []
        counts: Dict[str, int] = {}
        for r in rows:
            uid = r.get('user_id')
            if uid:
                counts[uid] = counts.get(uid, 0) + 1
        return counts
