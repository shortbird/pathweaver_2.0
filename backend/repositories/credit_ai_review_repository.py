"""Data access for `credit_ai_reviews` -- the AI credit reviewer's working notes.

Every query against that table lives here. The queue LOGIC -- what a claim means,
when abandoned work is retried, how many attempts a review gets -- lives one layer
up in services/credit_ai_review/store.py, because that is policy rather than
storage and it is the part worth reading.

Two of these methods are conditional writes and must stay that way:

``claim`` filters on ``status='queued'``. PostgREST answers the loser of that race
with zero rows, which is the entire mechanism preventing the thread a submission
started and the cron sweep arriving seconds later from both reviewing the same
work and paying for it twice.

``finish`` filters on ``claim_token``. A worker killed mid-review by a deploy can
come back long enough to overwrite an answer a later worker already stored, and
the later one is the answer that was actually reviewed.

The client is always the service role: the table has no other RLS policy, on
purpose, because these are superadmin-only notes about a minor's schoolwork.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)

#: The columns the dashboard reads. Deliberately not `*`: `claim_token` is
#: internal bookkeeping and has no business in an API payload.
SUMMARY_COLUMNS = (
    'id, round_id, completion_id, status, skip_reason, review, model, '
    'prompt_version, error, attempts, reviewed_at, requested_by, '
    'accepted_feedback, accepted_xp, created_at'
)

ROUND_COLUMNS = (
    'id, round_id, completion_id, status, skip_reason, review, model, '
    'error, reviewed_at'
)


class CreditAIReviewRepository(BaseRepository):
    table_name = 'credit_ai_reviews'

    def __init__(self, client: Any = None):
        # admin client justified: this table is service-role only by design (no
        # student, parent or org_admin policy exists for it), and its callers are
        # a cron tick, a background thread, and superadmin-gated routes.
        super().__init__(user_id=None, client=client)

    # ── reads ────────────────────────────────────────────────────────────────

    def get(self, review_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select('*').eq(
            'id', review_id).limit(1).execute().data
        return rows[0] if rows else None

    def get_by_round(self, round_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select('*').eq(
            'round_id', round_id).limit(1).execute().data
        return rows[0] if rows else None

    def queued_ids(self, limit: int) -> List[str]:
        """The oldest queued reviews. A read, not a claim."""
        if limit <= 0:
            return []
        rows = self.client.table(self.table_name).select('id').eq(
            'status', 'queued').order('created_at').limit(limit).execute().data or []
        return [row['id'] for row in rows if row.get('id')]

    def running_since_before(self, cutoff: str, limit: int = 50) -> List[Dict[str, Any]]:
        return self.client.table(self.table_name).select('id, attempts').eq(
            'status', 'running').lt('started_at', cutoff).limit(limit).execute().data or []

    def for_completions(self, completion_ids: List[str]) -> List[Dict[str, Any]]:
        if not completion_ids:
            return []
        return self.client.table(self.table_name).select(SUMMARY_COLUMNS).in_(
            'completion_id', completion_ids).order('created_at').execute().data or []

    def for_rounds(self, round_ids: List[str]) -> List[Dict[str, Any]]:
        if not round_ids:
            return []
        return self.client.table(self.table_name).select(ROUND_COLUMNS).in_(
            'round_id', round_ids).execute().data or []

    def existing_round_ids(self, round_ids: List[str]) -> List[str]:
        if not round_ids:
            return []
        rows = self.client.table(self.table_name).select('round_id').in_(
            'round_id', round_ids).execute().data or []
        return [row['round_id'] for row in rows if row.get('round_id')]

    def all_verdicts(self) -> List[Dict[str, Any]]:
        """Every review, paged.

        Paged rather than read in one shot: this gets a row per review round
        across the whole platform, so it outgrows PostgREST's silent 1000-row cap
        the way enrollment counts did (utils/db_fetch). A truncated read here
        would quietly drop submissions out of a filter and look like it working.
        """
        from utils.db_fetch import fetch_all_rows

        return fetch_all_rows(
            lambda: self.client.table(self.table_name).select(
                'id, completion_id, status, review, created_at'),
            order_by='id')

    # ── writes ───────────────────────────────────────────────────────────────

    def create(self, row: Dict[str, Any]) -> Dict[str, Any]:
        inserted = self.client.table(self.table_name).insert(row).execute().data
        return inserted[0] if inserted else dict(row)

    def patch(self, review_id: str, changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Unconditional update by id.

        Named `patch` rather than `update` on purpose: BaseRepository.update has
        a different signature, and shadowing it with an incompatible one is the
        kind of thing that works until somebody calls the base version.
        """
        rows = self.client.table(self.table_name).update(changes).eq(
            'id', review_id).execute().data
        return rows[0] if rows else None

    def claim(self, review_id: str, token: str, started_at: str) -> bool:
        """Take a queued review. False means somebody else got there first.

        The `status='queued'` filter is the whole mechanism -- see the module
        docstring. Do not "simplify" it into an unconditional update.
        """
        rows = self.client.table(self.table_name).update({
            'status': 'running',
            'claim_token': token,
            'started_at': started_at,
        }).eq('id', review_id).eq('status', 'queued').execute().data
        return bool(rows)

    def finish(self, review_id: str, token: str, update: Dict[str, Any]) -> bool:
        """Write a result, but only while this worker still holds the claim."""
        rows = self.client.table(self.table_name).update(update).eq(
            'id', review_id).eq('claim_token', token).execute().data
        return bool(rows)

    def release_if_running(self, review_id: str, update: Dict[str, Any]) -> None:
        """Move a row out of 'running'. Used by the abandoned-work sweep."""
        self.client.table(self.table_name).update(update).eq(
            'id', review_id).eq('status', 'running').execute()

    def set_outcome_for_round(self, round_id: str, update: Dict[str, Any]) -> None:
        self.client.table(self.table_name).update(update).eq(
            'round_id', round_id).execute()
