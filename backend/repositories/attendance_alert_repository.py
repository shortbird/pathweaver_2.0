"""Data access for closing a 'not accounted for' attendance alert by itself
(ticket 05ccd3b9): the alert, the student's absent marks that day, and the
guardian reports that might explain them.

Every read is bounded by one student on one date (or one short reported span),
so the PostgREST row cap cannot bite. Authorization is the caller's: a teacher
saving roll or a guardian filing a report has already passed their route's
gate; nothing here decides who may ask.
"""

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository


class AttendanceAlertRepository(BaseRepository):
    table_name = 'sis_attendance_alerts'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: the alert, the roll and the guardian
            # reports are school records about a student, written by a teacher
            # or a parent on that student's behalf; none is the caller's own
            # scope under RLS.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    def open_unaccounted(self, org_id: str, student_id: str,
                         on_date: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('id')
                .eq('organization_id', org_id).eq('student_user_id', student_id)
                .eq('date', on_date).eq('alert_type', 'unaccounted').eq('status', 'open')
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def open_unaccounted_dates(self, org_id: str, student_id: str,
                               dates: Iterable[str]) -> List[str]:
        dates = list(dates)
        if not dates:
            return []
        rows = (self.client.table(self.table_name).select('date')
                .eq('organization_id', org_id).eq('student_user_id', student_id)
                .eq('alert_type', 'unaccounted').eq('status', 'open')
                .in_('date', dates).execute()).data or []
        return sorted({r['date'] for r in rows if r.get('date')})

    def absent_class_ids(self, org_id: str, student_id: str, on_date: str) -> set:
        rows = (self.client.table('sis_attendance').select('class_id, status')
                .eq('organization_id', org_id).eq('student_user_id', student_id)
                .eq('date', on_date).eq('status', 'absent').execute()).data or []
        return {r.get('class_id') for r in rows if r.get('status', 'absent') == 'absent'}

    def reported_class_ids(self, org_id: str, student_id: str, on_date: str) -> set:
        """Classes a guardian reported out that day. None in the set is a
        whole-day report."""
        rows = (self.client.table('student_planned_absences').select('class_id')
                .eq('organization_id', org_id).eq('student_user_id', student_id)
                .eq('absence_date', on_date).eq('status', 'active').execute()).data or []
        return {r.get('class_id') for r in rows}

    def close_open(self, alert_id: str, fields: Dict[str, Any]) -> bool:
        """Close the alert only while it is still open, so one a coordinator
        already resolved is never overwritten."""
        closed = (self.client.table(self.table_name).update(fields)
                  .eq('id', alert_id).eq('status', 'open').execute()).data
        return bool(closed)
