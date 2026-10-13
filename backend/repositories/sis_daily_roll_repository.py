"""
SIS Daily Roll Repository - the whole-school daily attendance mark.

Ticket 0680d03c (Apogee Cache Valley): one roll a day for the whole school,
with arrival and pickup times. The rows live in sis_attendance with class_id
NULL (migration 20261013233000_sis_attendance_daily_roll.sql makes the unique
key NULLS NOT DISTINCT, so there is one daily row per student per date and the
upsert below conflicts on it). sis_attendance_service is the one writer; this
module only knows the queries.

Every method is scoped by an explicit organization_id filter, and every read
of a whole day pages, because one row per student grows with the school. The
service passes the admin client: the SIS tables are backend-only under RLS and
the route's role, module and setting gates are the authorization.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows

#: The sis_attendance unique key. class_id is NULL on every row written here.
ON_CONFLICT = 'class_id,student_user_id,date'
COLUMNS = ('id, student_user_id, status, note, arrived_at, departed_at, '
           'departed_by, recorded_by, updated_at')


class SisDailyRollRepository(BaseRepository):
    table_name = 'sis_attendance'

    def rows_for_day(self, organization_id: str, on_date: str) -> Dict[str, Dict[str, Any]]:
        """The day's daily-roll rows by student. Paged."""
        rows = fetch_all_rows(lambda: (
            self.client.table(self.table_name).select(COLUMNS)
            .eq('organization_id', organization_id).eq('date', on_date)
            .is_('class_id', 'null')
        ))
        return {r['student_user_id']: r for r in rows}

    def row(self, organization_id: str, on_date: str,
            student_user_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select(COLUMNS)
                .eq('organization_id', organization_id).eq('date', on_date)
                .is_('class_id', 'null').eq('student_user_id', student_user_id)
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def upsert(self, payloads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return (self.client.table(self.table_name)
                .upsert(payloads, on_conflict=ON_CONFLICT).execute()).data or []

    def update_row(self, row_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        updated = (self.client.table(self.table_name).update(fields)
                   .eq('id', row_id).execute()).data
        return updated[0] if updated else None

    def correct_status(self, organization_id: str, student_user_id: str, on_date: str,
                       fields: Dict[str, Any]) -> None:
        """An accountability alert's resolution correcting the daily mark."""
        (self.client.table(self.table_name).update(fields)
         .eq('organization_id', organization_id).is_('class_id', 'null')
         .eq('student_user_id', student_user_id).eq('date', on_date).execute())

    def whole_day_reports(self, organization_id: str, on_date: str) -> List[Dict[str, Any]]:
        """Active guardian reports for the whole day (class_id NULL). Paged."""
        return fetch_all_rows(lambda: (
            self.client.table('student_planned_absences').select('*')
            .eq('organization_id', organization_id).eq('absence_date', on_date)
            .eq('status', 'active').is_('class_id', 'null')
        ))
