"""routes.parent.engagement.quest_rhythm: one child's rhythm on one quest,
with the last seven days for a mini heat map. The family dashboard shows
this on each quest instead of a progress bar (2026-09-15)."""

from datetime import date
from unittest.mock import MagicMock

from routes.parent.engagement import quest_rhythm


def _supabase(rows):
    client = MagicMock()
    client.rpc.return_value.execute.return_value.data = rows
    return client


def test_a_steady_week_reads_as_in_flow_with_the_days_lit():
    today = date(2026, 9, 15)
    rows = [
        {'activity_date': '2026-09-14', 'activity_count': 2},
        {'activity_date': '2026-09-12', 'activity_count': 1},
        {'activity_date': '2026-09-10', 'activity_count': 5},
        {'activity_date': '2026-09-08', 'activity_count': 1},
    ]
    client = _supabase(rows)
    out = quest_rhythm(client, 'kid', 'quest', today)

    assert out['state'] == 'in_flow'
    assert out['state_display']
    assert [d['date'] for d in out['last_7_days']] == [
        '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15',
    ]
    assert [d['intensity'] for d in out['last_7_days']] == [0, 4, 0, 1, 0, 2, 0]
    assert out['active_days_last_week'] == 4

    # Four weeks back, scoped to the quest -- the rhythm rules look no further.
    args = client.rpc.call_args[0][1]
    assert args == {'p_user_id': 'kid', 'p_quest_id': 'quest', 'p_since': '2026-08-18'}


def test_no_activity_is_ready_to_begin_with_a_dark_week():
    out = quest_rhythm(_supabase([]), 'kid', 'quest', date(2026, 9, 15))
    assert out['state'] == 'ready_to_begin'
    assert [d['intensity'] for d in out['last_7_days']] == [0] * 7
    assert out['active_days_last_week'] == 0
