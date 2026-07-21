"""
SIS learning-day selections — a UFA private school student's third
instructional day when their schedule has fewer than 3 campus days.

The learning day is a recorded CHOICE, not an enrollable class (decision
2026-07-21): either "Quest Learning Day" or the "Elementary At-Home Academic
Learning Day". It counts toward UFA's 3 instructional days but NOT toward the
5 in-person blocks. `answers` is reserved for the Elementary At-Home options
form (document pending from iCreate).

Admin (service_role) client — the table is RLS-locked to backend-only;
authorization happens in the callers (guardian relationship in
sis_parent_service, staff role on the /api/sis routes).
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

TABLE = 'sis_learning_day_selections'
CHOICES = ('quest_learning_day', 'elementary_at_home')
CHOICE_LABELS = {
    'quest_learning_day': 'Quest Learning Day',
    'elementary_at_home': 'Elementary At-Home Academic Learning Day',
}


def _admin():
    return get_supabase_admin_client()


def get_selection(org_id: str, student_user_id: str) -> Optional[Dict[str, Any]]:
    """The student's saved learning-day choice, or None when unset."""
    rows = (
        _admin().table(TABLE).select('choice, answers, updated_at')
        .eq('organization_id', org_id).eq('student_user_id', student_user_id)
        .limit(1).execute()
    ).data or []
    return rows[0] if rows else None


def set_selection(org_id: str, student_user_id: str, choice: Optional[str],
                  selected_by: str) -> Dict[str, Any]:
    """Save (or clear, with choice=None) the student's learning-day choice.
    One row per student per org (upsert)."""
    if choice in (None, ''):
        _admin().table(TABLE).delete() \
            .eq('organization_id', org_id).eq('student_user_id', student_user_id).execute()
        return {'choice': None}
    if choice not in CHOICES:
        return {'error': 'Invalid learning-day choice'}
    now = datetime.now(timezone.utc).isoformat()
    row = (
        _admin().table(TABLE).upsert({
            'organization_id': org_id,
            'student_user_id': student_user_id,
            'choice': choice,
            'selected_by': selected_by,
            'updated_at': now,
        }, on_conflict='organization_id,student_user_id').execute()
    ).data[0]
    return {'selection': row}
