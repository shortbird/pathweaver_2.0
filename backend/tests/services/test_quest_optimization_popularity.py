"""
Unit tests for the curated "featured first" quest ordering in
utils.quest_popularity.

The ordering contract: the hand-curated FEATURED_QUEST_IDS come first, in list
order, then everything else newest-first — paginated after the FULL id list is
ranked so the featured set surfaces on page 1 regardless of how many quests
match. Filters still apply (a featured quest absent from the filtered id set
simply doesn't appear).
"""

import pytest
from unittest.mock import Mock, patch

from utils.quest_popularity import FEATURED_QUEST_IDS, paginate_quests_by_popularity

FEAT_A = FEATURED_QUEST_IDS[0]   # curated rank 0
FEAT_B = FEATURED_QUEST_IDS[5]   # curated rank 5


def _id_rows():
    return [
        {'id': 'q-old', 'created_at': '2025-01-01T00:00:00+00:00'},
        {'id': 'q-new', 'created_at': '2026-06-01T00:00:00+00:00'},
        # Featured quests deliberately given unremarkable dates: curated rank
        # must beat recency.
        {'id': FEAT_B, 'created_at': '2025-03-01T00:00:00+00:00'},
        {'id': FEAT_A, 'created_at': '2024-02-01T00:00:00+00:00'},
    ]


@pytest.mark.unit
class TestPaginateQuestsByPopularity:

    def test_featured_first_in_curated_order_then_newest(self):
        full_rows = [{'id': r['id'], 'title': r['id']} for r in _id_rows()]
        build_query = Mock()
        build_query.return_value.in_.return_value.execute.return_value = Mock(data=full_rows)

        with patch('utils.quest_popularity.fetch_all_rows', return_value=_id_rows()):
            rows, total = paginate_quests_by_popularity(build_query, page=1, per_page=10)

        assert total == 4
        assert [r['id'] for r in rows] == [
            FEAT_A,    # curated rank 0, despite being the oldest quest
            FEAT_B,    # curated rank 5
            'q-new',   # unfeatured, newest
            'q-old',   # unfeatured, oldest
        ]

    def test_pagination_slices_after_global_ranking(self):
        page_rows = [{'id': 'q-new'}, {'id': 'q-old'}]
        build_query = Mock()
        build_query.return_value.in_.return_value.execute.return_value = Mock(data=page_rows)

        with patch('utils.quest_popularity.fetch_all_rows', return_value=_id_rows()):
            rows, total = paginate_quests_by_popularity(build_query, page=2, per_page=2)

        assert total == 4
        # Page 2 = the two unfeatured quests, newest first
        assert [r['id'] for r in rows] == ['q-new', 'q-old']
        # Only the page's ids are fetched in full
        fetched_ids = build_query.return_value.in_.call_args[0][1]
        assert fetched_ids == ['q-new', 'q-old']

    def test_filtered_out_featured_quests_simply_absent(self):
        # The filter (build_query) returned no featured ids at all.
        unfeatured_only = [r for r in _id_rows() if r['id'] not in (FEAT_A, FEAT_B)]
        full_rows = [{'id': r['id']} for r in unfeatured_only]
        build_query = Mock()
        build_query.return_value.in_.return_value.execute.return_value = Mock(data=full_rows)

        with patch('utils.quest_popularity.fetch_all_rows', return_value=unfeatured_only):
            rows, total = paginate_quests_by_popularity(build_query, page=1, per_page=10)

        assert total == 2
        assert [r['id'] for r in rows] == ['q-new', 'q-old']

    def test_empty_page_past_end(self):
        build_query = Mock()

        with patch('utils.quest_popularity.fetch_all_rows', return_value=_id_rows()):
            rows, total = paginate_quests_by_popularity(build_query, page=5, per_page=10)

        assert rows == []
        assert total == 4
        # No full-row fetch when the page is empty
        build_query.return_value.in_.assert_not_called()

    def test_curated_list_shape(self):
        # Guard against accidental edits: exactly 20 unique uuid-shaped ids.
        assert len(FEATURED_QUEST_IDS) == 20
        assert len(set(FEATURED_QUEST_IDS)) == 20
        assert all(len(qid) == 36 for qid in FEATURED_QUEST_IDS)
