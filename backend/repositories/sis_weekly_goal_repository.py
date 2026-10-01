"""Data access for sis_weekly_goals: one student's goals for one school week.

Authorization is the caller's: staff reads and writes are gated by
@require_role(STAFF_ROLES) plus the resolved org on routes/sis/weekly_goals.py,
and a family read by @require_relationship_to. Nothing here decides who may ask.
"""

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)


class SisWeeklyGoalRepository(BaseRepository):
    table_name = 'sis_weekly_goals'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: a coach writes another person's (a
            # student's) row, and a parent reads their child's; neither is the
            # caller's own scope under RLS. The route gate decides; this reads
            # and writes only the rows it is handed ids for.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    def for_week(self, org_id: str, week_start: str) -> List[Dict[str, Any]]:
        """Every student's row for one week. Bounded by the org's roster, but
        paged anyway: the roster is not bounded by anything we control."""
        return fetch_all_rows(lambda: (
            self.client.table(self.table_name).select('*')
            .eq('organization_id', org_id)
            .eq('week_start', week_start)
        ))

    def for_students_weeks(self, org_id: str, student_ids: Iterable[str],
                           week_starts: Iterable[str]) -> List[Dict[str, Any]]:
        ids = list(student_ids)
        weeks = list(week_starts)
        if not ids or not weeks:
            return []
        return fetch_all_rows(lambda: (
            self.client.table(self.table_name).select('*')
            .eq('organization_id', org_id)
            .in_('student_user_id', ids)
            .in_('week_start', weeks)
        ))

    def history(self, student_id: str, limit: int = 52) -> List[Dict[str, Any]]:
        """One student's weeks, newest first. A school year is under 52 weeks."""
        return (self.client.table(self.table_name).select('*')
                .eq('student_user_id', student_id)
                .order('week_start', desc=True)
                .limit(limit)
                .execute()).data or []

    def get(self, org_id: str, student_id: str, week_start: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('*')
                .eq('organization_id', org_id)
                .eq('student_user_id', student_id)
                .eq('week_start', week_start)
                .limit(1).execute()).data
        return rows[0] if rows else None

    def upsert(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        rows = (self.client.table(self.table_name)
                .upsert(payload, on_conflict='organization_id,student_user_id,week_start')
                .execute()).data
        return rows[0] if rows else payload

    # -- what a week is read against ----------------------------------------

    def org_row(self, org_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('organizations')
                .select('id, name, feature_flags').eq('id', org_id).limit(1)
                .execute()).data
        return rows[0] if rows else None

    def user_row(self, user_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('users')
                .select('id, first_name, last_name, display_name, preferred_name, username, '
                        'email, organization_id, role, org_role, org_roles')
                .eq('id', user_id).limit(1).execute()).data
        return rows[0] if rows else None

    def annual_goal_rows(self, org_id: str, student_ids: List[str]) -> List[Dict[str, Any]]:
        """The students' sis_student_goals rows (one per school year)."""
        if not student_ids:
            return []
        return (self.client.table('sis_student_goals')
                .select('student_user_id, school_year, subjects')
                .eq('organization_id', org_id)
                .in_('student_user_id', student_ids)
                .execute()).data or []

    def annual_goal_for_year(self, org_id: str, student_id: str,
                             school_year: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('sis_student_goals').select('*')
                .eq('organization_id', org_id)
                .eq('student_user_id', student_id)
                .eq('school_year', school_year)
                .limit(1).execute()).data
        return rows[0] if rows else None

    def write_annual_goal(self, existing_id: Optional[str],
                          payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update the row `existing_id`, or insert `payload` as a new one. The
        coach's year goals (routes/sis/goals.staff_save_year_goals) are the
        only caller; the parent flow in that module keeps its own writes."""
        table = self.client.table('sis_student_goals')
        query = table.update(payload).eq('id', existing_id) if existing_id else table.insert(payload)
        rows = query.execute().data
        return rows[0] if rows else None
