"""Story candidates: feed items bookmarked in the app for a future story.

One row per feed item (`target_type` + `target_id`, the feed_highlights
shape). The mobile feed writes them, the web Stories page reads them back as
the queue to review, and the publish route moves a row to `started` when a
story is drafted from it. Column names match
supabase/migrations/20260915160000_story_candidates.sql.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository

TARGET_TYPES = ('task_completed', 'learning_moment')
STATUSES = ('open', 'dismissed', 'started')

COLUMNS = (
    'id, target_type, target_id, student_user_id, note, status, story_id, flagged_by, '
    'created_at, updated_at, resolved_at'
)


class StoryCandidateRepository(BaseRepository):
    table_name = 'story_candidates'

    def __init__(self, client: Any = None):
        # admin client justified: service-role-only table by design (a
        # superadmin's private notes to self); every caller is a superadmin
        # route or the feed, which annotates items only for a superadmin.
        super().__init__(user_id=None, client=client)

    # ── reads ────────────────────────────────────────────────────────────────

    def get(self, candidate_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select(COLUMNS).eq(
            'id', candidate_id).limit(1).execute().data
        return rows[0] if rows else None

    def get_by_target(self, target_type: str, target_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select(COLUMNS).eq(
            'target_type', target_type).eq('target_id', target_id).limit(1).execute().data
        return rows[0] if rows else None

    def list_by_status(self, status: str = 'open', limit: int = 200) -> List[Dict[str, Any]]:
        return self.client.table(self.table_name).select(COLUMNS).eq(
            'status', status).order('created_at', desc=True).limit(limit).execute().data or []

    def open_target_ids(self, target_type: str, target_ids: List[str]) -> set:
        """Which of these feed items are bookmarked -- one read per feed page."""
        if not target_ids:
            return set()
        rows = self.client.table(self.table_name).select('target_id').eq(
            'target_type', target_type).eq('status', 'open').in_(
            'target_id', target_ids).execute().data or []
        return {r['target_id'] for r in rows}

    # ── writes ───────────────────────────────────────────────────────────────

    def flag(self, target_type: str, target_id: str, *, student_user_id: Optional[str],
             flagged_by: str, note: Optional[str] = None) -> Dict[str, Any]:
        """Bookmark a feed item. A dismissed or started row is reopened so a
        second flag never trips the unique key."""
        existing = self.get_by_target(target_type, target_id)
        if existing:
            changes: Dict[str, Any] = {'status': 'open', 'resolved_at': None, 'story_id': None,
                                       'flagged_by': flagged_by}
            if note is not None:
                changes['note'] = note
            rows = self.client.table(self.table_name).update(changes).eq(
                'id', existing['id']).execute().data
            return rows[0] if rows else {**existing, **changes}
        rows = self.client.table(self.table_name).insert({
            'target_type': target_type,
            'target_id': target_id,
            'student_user_id': student_user_id,
            'flagged_by': flagged_by,
            'note': note,
        }).execute().data
        return rows[0]

    def resolve(self, candidate_id: str, status: str,
                story_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Close a row: `dismissed`, or `started` with the story it became."""
        changes = {
            'status': status,
            'resolved_at': datetime.now(timezone.utc).isoformat(),
            'story_id': story_id,
        }
        rows = self.client.table(self.table_name).update(changes).eq(
            'id', candidate_id).execute().data
        return rows[0] if rows else None

    def unflag(self, target_type: str, target_id: str) -> bool:
        """The app's toggle going off: the bookmark is simply removed."""
        rows = self.client.table(self.table_name).delete().eq(
            'target_type', target_type).eq('target_id', target_id).execute().data
        return bool(rows)
