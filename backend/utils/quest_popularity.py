"""
"Featured first" quest ordering for the discovery page.

The order is HAND-CURATED, not computed. The 20 quests below were selected by
reviewing the full platform catalog (2026-08-10) to most effectively
illustrate the possibilities of Optio quests — deliberately wide variety, one
strong flagship per domain, all public and illustrated. Everything else lists
after them, newest first.

To change the featured set, edit FEATURED_QUEST_IDS — order here is display
order. Keep entries public, active, platform-wide (organization_id NULL).

Lives in utils so the repository layer (QuestRepository.get_quests_for_user)
and the routes' anonymous listing path can share it without violating the
import-layer rule (routes -> services -> repositories -> utils).
"""

from typing import Any, Callable, Dict, List, Tuple

from utils.db_fetch import fetch_all_rows

# Display order. Adjacent quests are chosen to contrast, so the top of the
# discovery page reads as "you can do ANY of this here".
FEATURED_QUEST_IDS = [
    '37f52b88-54e5-4ed8-b180-823db7b529d2',  # Launch Your YouTube Channel
    '3f649e64-0df9-4557-91a6-ab17a6631a84',  # Start a Business
    '07e6c4c0-4826-4c5f-a52f-53ddfce1a7bb',  # Master a Musical Instrument
    '0df4af31-0e6e-4350-8cae-3a13976235f3',  # Build a Hobbit Hole
    '4f6012c7-d948-4643-9a69-79f3448b6030',  # Become a Citizen Scientist
    '3eb820a6-9a0a-4b2b-a70f-38ad3174b7df',  # Run a Marathon
    '2029ae9f-c09d-420a-9ebd-c3ea497fefa8',  # Film a Stop-Motion Animation Video
    '7ee90f07-759d-4558-9622-806828bfa67b',  # Design and Launch a Board Game
    '46096c91-67fa-43fe-8f4d-aabbc688e038',  # Design a Community Garden
    '39e24f1f-485d-4790-b24d-184c951c7cd9',  # Design and Build a Drone
    'f4f974a1-18d8-4d9d-9353-0a494d5709d8',  # Master Wilderness Living Skills
    '647f260e-e608-4918-b56a-f42531f01dc0',  # Design and Stage a Play
    '9d8438c7-4286-4692-b1dc-eda66376eaa5',  # Develop a Digital Tool
    'd5b5ba23-3026-4a74-b524-e84eebec6d16',  # Create a Family Recipe Book
    '628062e9-6536-45d9-97b2-6b5c4c70eebf',  # Craft a Personal Narrative
    'a66cb9ed-b8ba-43d7-95b7-b8974c95cccf',  # Become CPR Certified
    '2fdfa67d-15ed-4451-ae10-3525febf00ad',  # Experience Tokyo
    '3fa6d56c-3de6-421b-820c-360a5b70dacb',  # Participate in a Dungeons & Dragons Campaign
    '8c8bfe7c-3e9d-4e55-8e8c-be5409c02144',  # Solve a Real-World Problem
    '36716262-00d1-48a2-992c-24d393661d59',  # Craft a Digital Escape Room
]

_FEATURED_RANK = {qid: i for i, qid in enumerate(FEATURED_QUEST_IDS)}


def paginate_quests_by_popularity(
    build_query: Callable[[str], Any],
    page: int,
    per_page: int
) -> Tuple[List[Dict], int]:
    """
    Return one page of quests with the curated featured set first (in curated
    order), then everything else newest-first.

    Ranks ALL matching quest ids (cheap id-only read, paged via fetch_all_rows
    so it cannot be silently truncated), then fetches full rows only for the
    requested page. Filters/search still apply: a featured quest that doesn't
    match the caller's query simply isn't in the id set.

    Args:
        build_query: Called with a select-columns string; must return a
            FRESH filtered supabase query builder each time (no ordering
            or range applied).
        page: 1-indexed page number.
        per_page: Page size.

    Returns:
        Tuple of (quest rows for the page, total matching count).
    """
    id_rows = fetch_all_rows(lambda: build_query('id, created_at'))

    # Newest first, then a stable sort pulls the featured set (in curated
    # order) to the front without disturbing the date order of the rest.
    id_rows.sort(key=lambda r: r.get('created_at') or '', reverse=True)
    id_rows.sort(key=lambda r: _FEATURED_RANK.get(r['id'], len(FEATURED_QUEST_IDS)))

    total = len(id_rows)
    start = max(page - 1, 0) * per_page
    page_ids = [r['id'] for r in id_rows[start:start + per_page]]
    if not page_ids:
        return [], total

    response = build_query('*').in_('id', page_ids).execute()
    by_id = {row['id']: row for row in (response.data or [])}
    # Restore the curated order (.in_() does not preserve it).
    return [by_id[qid] for qid in page_ids if qid in by_id], total
