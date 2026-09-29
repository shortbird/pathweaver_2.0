"""
Credit review XP examples - the worked cases the AI credit reviewer sizes XP by.

Each row is one decision an Optio reviewer wants the AI to match: a short
description of the work, the XP it is worth, and optionally the subjects it
earns credit in. The 'active' rows go into every review prompt
(services/credit_ai_review/calibration.py), so tuning the AI is an edit here
rather than a deploy. 'suggested' rows were saved by an approval that disagreed
with the AI (calibration_capture.py) and wait for a person; 'paused' rows are
kept but not sent.

credit_review_xp_examples is service-role only (RLS on, no policies), so this
runs on the admin client; every caller is behind require_role('superadmin') or
is the superadmin approve path.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)

COLUMNS = ('id, work, xp, subjects, note, status, ai_xp, ai_subjects, completion_id, '
           'created_by, created_at, updated_at')
STATUSES = ('suggested', 'active', 'paused')


class CreditReviewXpExampleRepository(BaseRepository):
    table_name = 'credit_review_xp_examples'
    id_column = 'id'

    def list_all(self) -> List[Dict[str, Any]]:
        """Every example, newest first. A hand-curated list: it stays far below
        the row cap, and the popup shows all of it."""
        rows = (self.client.table(self.table_name).select(COLUMNS)
                .order('created_at', desc=True)
                .limit(500).execute()).data
        return rows or []

    def list_active(self, limit: int) -> List[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('work, xp, subjects, note')
                .eq('status', 'active')
                .order('created_at', desc=True)
                .limit(limit).execute()).data
        return rows or []

    def exists_for_completion(self, completion_id: str) -> bool:
        rows = (self.client.table(self.table_name).select('id')
                .eq('completion_id', completion_id).limit(1).execute()).data
        return bool(rows)

    def add(self, *, work: str, xp: int, created_by: Optional[str],
            note: Optional[str] = None, subjects: Optional[Dict[str, int]] = None,
            completion_id: Optional[str] = None, status: str = 'active',
            ai_xp: Optional[int] = None,
            ai_subjects: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
        rows = (self.client.table(self.table_name).insert({
            'work': work,
            'xp': xp,
            'subjects': subjects or None,
            'note': note,
            'status': status,
            'ai_xp': ai_xp,
            'ai_subjects': ai_subjects or None,
            'completion_id': completion_id,
            'created_by': created_by,
        }).execute()).data
        return rows[0]

    def edit(self, example_id: str, changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        changes = {**changes, 'updated_at': datetime.now(timezone.utc).isoformat()}
        rows = (self.client.table(self.table_name).update(changes)
                .eq('id', example_id).execute()).data
        return rows[0] if rows else None

    def remove(self, example_id: str) -> bool:
        rows = (self.client.table(self.table_name).delete()
                .eq('id', example_id).execute()).data
        return bool(rows)
