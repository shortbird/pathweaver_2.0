"""
Read every row a PostgREST query matches, past the per-response row cap.

Supabase caps a single Data API response at `db-max-rows` (1000 by default) and
does it **silently**: a truncated read is indistinguishable from a complete one —
no error, no flag, no partial-content signal the client surfaces. So any read
whose row count grows with the size of an organization can quietly come back
short, and anything computed from it is then wrong with no trace.

That is what broke the iCreate class list (feedback 2026-07-29): enrollment
counts were built by fetching every active `class_enrollments` row for the org in
one request and tallying them in Python. Once the school crossed the row cap the
tail was dropped, so displayed counts *fell* as more families enrolled — a class
whose rows all landed past the cut read `0/12` while its roster still listed
twelve students.

Use `fetch_all_rows()` for any bulk read that spans a whole organization. Reads
bounded by a single row's relations (one student's classes, one class's roster)
don't need it.

Paging correctness notes:
- `order_by` must be a **unique** column. LIMIT/OFFSET over an unordered (or
  non-uniquely-ordered) query can skip or repeat rows between pages, so the
  ordering is part of the correctness, not presentation.
- `page_size` must not exceed the server's `db-max-rows`, because a short page is
  what tells us we've reached the end. `PAGE_SIZE` matches Supabase's default of
  1000; if that setting is ever lowered for this project, lower this to match or
  reads start truncating again for exactly the reason documented above.
"""

from typing import Any, Callable, Dict, List

from utils.logger import get_logger

logger = get_logger(__name__)

# Matches Supabase's default db-max-rows. Requesting more than the server allows
# is harmless — the first response tells us the real ceiling.
PAGE_SIZE = 1000

# Backstop against an unbounded loop if a server ever returns full pages forever.
# 500 pages x 1000 rows is far beyond any legitimate org-scoped read.
MAX_PAGES = 500


def fetch_all_rows(build_query: Callable[[], Any], *, order_by: str = 'id',
                   page_size: int = PAGE_SIZE) -> List[Dict[str, Any]]:
    """Every row `build_query` matches, read in pages.

    Args:
        build_query: Called once per page; must return a FRESH supabase-py query
            builder (they are single-use once `.range()` is applied) with the
            filters applied but no ordering or range of its own.
        order_by: Unique column to page by (see the module note).
        page_size: Rows to ask for per request; must be <= the server's row cap.

    Returns:
        All matching rows, ordered by `order_by`.
    """
    rows: List[Dict[str, Any]] = []
    offset = 0

    for _ in range(MAX_PAGES):
        page = (
            build_query().order(order_by)
            .range(offset, offset + page_size - 1)
            .execute()
        ).data or []
        rows.extend(page)
        # Fewer rows than we asked for means there are no more to ask for. (A
        # full page when the data happens to end exactly on the boundary costs
        # one extra empty request, which is cheaper than guessing.)
        if len(page) < page_size:
            return rows
        offset += len(page)

    logger.error(
        f'fetch_all_rows hit the {MAX_PAGES}-page guard after {len(rows)} rows — '
        f'the result is truncated; check the query filters.'
    )
    return rows
