"""Data access for `stories` -- the case studies published to www.

The table is also the generation queue, the same way credit_ai_reviews is:

    generating --claim--> (worker) --+--> published   (mode auto, no blockers)
                                     +--> review      (mode review, or blockers)
                                     +--> failed
    generating, stale --sweep--> generating again (attempts + 1), or failed

Two writes are conditional and must stay that way. ``claim_generating`` filters
on ``claim_token IS NULL`` so the request thread and the cron sweep cannot both
draft the same story and pay for two multimodal calls. ``finish`` filters on the
token so a worker that died and came back cannot overwrite a newer result.

The client is always the service role: the table has no other policy, on
purpose. Stories carry the student's id and private evidence pointers, and the
only public reader is the endpoint that projects an allowlist.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository

#: Everything the admin editor reads. `claim_token` is deliberately absent.
ADMIN_COLUMNS = (
    'id, slug, status, source_type, source_id, student_user_id, consent_id, tier, '
    'mode, title, dek, body, student_label, setting, grade_band, activity_slug, '
    'activity_label, receipt, subject, subject_split, xp_awarded, credit_fraction, '
    'hero_asset_id, og_image_url, author_name, author_title, ai_draft, safety, '
    'blockers, concerns, published_at, unpublished_at, error, attempts, started_at, '
    'created_by, updated_by, created_at, updated_at'
)

#: What the public projection needs. No student id, no source id, no AI notes.
PUBLIC_COLUMNS = (
    'id, slug, status, source_type, tier, title, dek, body, student_label, setting, '
    'grade_band, activity_slug, activity_label, receipt, subject, subject_split, '
    'xp_awarded, credit_fraction, hero_asset_id, og_image_url, author_name, '
    'author_title, published_at, updated_at'
)

LIST_COLUMNS = (
    'id, slug, status, source_type, source_id, student_user_id, tier, mode, title, '
    'subject, activity_slug, published_at, unpublished_at, blockers, error, '
    'created_at, updated_at'
)


class StoryRepository(BaseRepository):
    table_name = 'stories'

    def __init__(self, client: Any = None):
        # admin client justified: service-role-only table by design; callers
        # are superadmin routes, a background drafting thread, the cron sweep
        # and the unauthenticated public endpoint, which projects an allowlist.
        super().__init__(user_id=None, client=client)

    # ── reads ────────────────────────────────────────────────────────────────

    def get(self, story_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select(ADMIN_COLUMNS).eq(
            'id', story_id).limit(1).execute().data
        return rows[0] if rows else None

    def get_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select(PUBLIC_COLUMNS).eq(
            'slug', slug).limit(1).execute().data
        return rows[0] if rows else None

    def get_by_source(self, source_type: str, source_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select(LIST_COLUMNS).eq(
            'source_type', source_type).eq('source_id', source_id).limit(1).execute().data
        return rows[0] if rows else None

    def list_all(self, limit: int = 200) -> List[Dict[str, Any]]:
        return self.client.table(self.table_name).select(LIST_COLUMNS).order(
            'created_at', desc=True).limit(limit).execute().data or []

    def list_for_student(self, student_id: str,
                         statuses: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        query = self.client.table(self.table_name).select(ADMIN_COLUMNS).eq(
            'student_user_id', student_id)
        if statuses:
            query = query.in_('status', list(statuses))
        return query.execute().data or []

    def list_published(self) -> List[Dict[str, Any]]:
        """Every published story, paged past PostgREST's silent 1000-row cap.

        The static site reads this once per build; a truncated list would drop
        the oldest stories off the site with nothing saying so.
        """
        from utils.db_fetch import fetch_all_rows

        rows = fetch_all_rows(
            lambda: self.client.table(self.table_name).select(PUBLIC_COLUMNS).eq(
                'status', 'published'),
            order_by='id')
        return sorted(rows, key=lambda r: r.get('published_at') or '', reverse=True)

    def list_previewable(self) -> List[Dict[str, Any]]:
        """Published plus review, for a LOCAL preview of the static site only.

        The public route refuses the preview flag in production; this exists
        so a story can be seen as a page before anyone presses Publish.
        """
        rows = self.client.table(self.table_name).select(PUBLIC_COLUMNS).in_(
            'status', ['published', 'review']).order('updated_at', desc=True).limit(200).execute().data or []
        return rows

    def slug_exists(self, slug: str) -> bool:
        rows = self.client.table(self.table_name).select('id').eq(
            'slug', slug).limit(1).execute().data
        return bool(rows)

    def generating_since_before(self, cutoff: str, limit: int = 50) -> List[Dict[str, Any]]:
        return self.client.table(self.table_name).select('id, attempts').eq(
            'status', 'generating').lt('started_at', cutoff).limit(limit).execute().data or []

    def unclaimed_generating_ids(self, limit: int = 20) -> List[str]:
        """Rows queued but never claimed: the request thread that should have
        run them found no slot, or the process was recycled first."""
        rows = self.client.table(self.table_name).select('id').eq(
            'status', 'generating').is_('claim_token', 'null').order(
            'created_at').limit(limit).execute().data or []
        return [r['id'] for r in rows if r.get('id')]

    def max_updated_at_published(self) -> Optional[str]:
        rows = self.client.table(self.table_name).select('updated_at').eq(
            'status', 'published').order('updated_at', desc=True).limit(1).execute().data
        return rows[0].get('updated_at') if rows else None

    # ── writes ───────────────────────────────────────────────────────────────

    def create(self, row: Dict[str, Any]) -> Dict[str, Any]:
        inserted = self.client.table(self.table_name).insert(row).execute().data
        return inserted[0] if inserted else dict(row)

    def patch(self, story_id: str, changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Unconditional update by id. Named patch, not update: BaseRepository
        has an update with a different signature."""
        rows = self.client.table(self.table_name).update(changes).eq(
            'id', story_id).execute().data
        return rows[0] if rows else None

    def claim_generating(self, story_id: str, token: str, started_at: str) -> bool:
        """Take an unclaimed generating row. False means somebody else has it.

        The two filters ARE the mechanism. Do not simplify them away.
        """
        rows = self.client.table(self.table_name).update({
            'claim_token': token,
            'started_at': started_at,
        }).eq('id', story_id).eq('status', 'generating').is_(
            'claim_token', 'null').execute().data
        return bool(rows)

    def finish(self, story_id: str, token: str, update: Dict[str, Any]) -> bool:
        """Write a result, but only while this worker still holds the claim."""
        rows = self.client.table(self.table_name).update(update).eq(
            'id', story_id).eq('claim_token', token).execute().data
        return bool(rows)

    def release_if_generating(self, story_id: str, update: Dict[str, Any]) -> None:
        """Move a row out of a stale claim. Used by the abandoned-work sweep."""
        self.client.table(self.table_name).update(update).eq(
            'id', story_id).eq('status', 'generating').execute()
