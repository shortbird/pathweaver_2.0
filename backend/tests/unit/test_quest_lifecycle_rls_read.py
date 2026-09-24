"""The one backend read of public.quests on an RLS-bound client that a
narrower SELECT policy can hide a row from.

supabase/migrations/20260924150000_quests_select_mirrors_backend_rule.sql
replaced "Quests are viewable by everyone" with a policy that mirrors the
direct-link rule. QuestLifecycleService.get_quest (POST /api/quests/<id>/pickup)
reads on the caller's client, and single() turned a hidden row into PGRST116 --
a 500 where a missing quest gets a 404.
"""

from unittest.mock import MagicMock

import pytest

STRANGER = '20000000-0000-4000-8000-000000000002'
QUEST = 'c0000000-0000-4000-8000-00000000000c'


@pytest.mark.unit
def test_a_quest_hidden_by_rls_is_a_404_on_pickup_not_a_500():
    """The quests SELECT policy (20260924150000) hides quests the caller has no
    claim on; get_quest must read that as "no such quest", which single() did
    not (PGRST116 raised)."""
    from services.quest_lifecycle_service import QuestLifecycleService

    user_client = MagicMock()
    chain = user_client.table.return_value.select.return_value.eq.return_value
    chain.limit.return_value.execute.return_value = MagicMock(data=[])
    chain.single.return_value.execute.side_effect = AssertionError('single() on an RLS read')
    service = QuestLifecycleService(user_client=user_client, admin_client=MagicMock())
    assert service.get_quest(QUEST) is None
    assert service.pickup_quest(STRANGER, QUEST) == {'error': 'Quest not found', 'status': 404}
