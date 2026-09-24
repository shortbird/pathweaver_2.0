"""
SIS Class Session Repository - one roll call per class per day.

`sis_class_sessions` (2026-09-24, P7) records who took a class's roll first,
who saved it last, and whether someone other than the assigned teacher covered
the class. sis_class_session_service is the one writer; this module only knows
the table.

Every method here is org-scoped by its caller or by an explicit
organization_id filter; the service passes the admin client because the SIS
tables are backend-only under RLS.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows

ON_CONFLICT = 'class_id,date,meeting_id'


class SisClassSessionRepository(BaseRepository):
    table_name = 'sis_class_sessions'

    def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('*')
                .eq('id', session_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def for_class_date(self, class_id: str, on_date: str) -> Optional[Dict[str, Any]]:
        """The class's session on this date. A class meets at most once a day
        today, so the first row is the row; ordered so that stays stable if a
        class ever gets two."""
        rows = (self.client.table(self.table_name).select('*')
                .eq('class_id', class_id).eq('date', on_date)
                .order('created_at').limit(1).execute()).data or []
        return rows[0] if rows else None

    def insert_if_absent(self, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Insert unless (class_id, date, meeting_id) exists. Returns the new
        row, or None when a concurrent save got there first -- the caller then
        re-reads and treats it as an existing session, which is how "the first
        saver is kept" survives two teachers pressing Save at once."""
        rows = (self.client.table(self.table_name)
                .upsert(row, on_conflict=ON_CONFLICT, ignore_duplicates=True)
                .execute()).data or []
        return rows[0] if rows else None

    def patch(self, session_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).update(fields)
                .eq('id', session_id).execute()).data or []
        return rows[0] if rows else None

    def claim_first_taker(self, session_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Set taken_by on a session that has none yet (a planned-substitute
        row). The IS NULL filter makes it a compare-and-set: a second saver
        racing the first updates nothing and gets None back."""
        rows = (self.client.table(self.table_name).update(fields)
                .eq('id', session_id).is_('taken_by', 'null').execute()).data or []
        return rows[0] if rows else None

    def for_org_date(self, organization_id: str, on_date: str) -> List[Dict[str, Any]]:
        """One org's sessions for one day. Bounded by the classes meeting that
        day (a few hundred at the largest school), so one page is enough."""
        return (self.client.table(self.table_name).select('*')
                .eq('organization_id', organization_id).eq('date', on_date)
                .execute()).data or []

    def flagged(self, organization_id: str) -> List[Dict[str, Any]]:
        """Every open flag for the org, oldest day first. Paged: flags pile up
        when nobody works them, and a truncated list would hide the oldest."""
        rows = fetch_all_rows(lambda: (
            self.client.table(self.table_name).select('*')
            .eq('organization_id', organization_id).eq('sub_status', 'flagged')))
        return sorted(rows, key=lambda r: str(r.get('date') or ''))

    def in_range(self, organization_id: str, date_from: str, date_to: str) -> List[Dict[str, Any]]:
        """Sessions between two dates inclusive -- a pay period is thousands of
        rows at a large school, so this pages."""
        rows = fetch_all_rows(lambda: (
            self.client.table(self.table_name).select('*')
            .eq('organization_id', organization_id)
            .gte('date', date_from).lte('date', date_to)))
        return sorted(rows, key=lambda r: str(r.get('date') or ''))

    def covering_class_ids(self, user_id: str, organization_id: str, on_date: str) -> List[str]:
        """Classes this person was marked ahead of time to cover on this date.
        Only planned rows (planned_by set) grant access: a flag raised by a
        save means the saver already had access some other way."""
        rows = (self.client.table(self.table_name).select('class_id')
                .eq('organization_id', organization_id).eq('substitute_id', user_id)
                .eq('date', on_date).not_.is_('planned_by', 'null')
                .execute()).data or []
        return [r['class_id'] for r in rows if r.get('class_id')]

    def planned_for_date(self, organization_id: str, on_date: str) -> List[Dict[str, Any]]:
        """Planned substitutes for one day: [{class_id, substitute_id}]."""
        return (self.client.table(self.table_name).select('class_id, substitute_id')
                .eq('organization_id', organization_id).eq('date', on_date)
                .not_.is_('planned_by', 'null').not_.is_('substitute_id', 'null')
                .execute()).data or []

    # ── The class-side reads the session record is judged against ────────────
    # They live here, not in the service, because no other repository answers
    # them in the shape a session needs: org_classes by a set of ids with the
    # assigned teachers, and "which classes have attendance on this date".

    def classes_by_ids(self, class_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """class_id -> {id, name, primary_instructor_id, assistant_instructor_ids}."""
        ids = sorted({c for c in class_ids if c})
        out: Dict[str, Dict[str, Any]] = {}
        for i in range(0, len(ids), 100):
            for c in (self.client.table('org_classes')
                      .select('id, name, primary_instructor_id, assistant_instructor_ids')
                      .in_('id', ids[i:i + 100]).execute()).data or []:
                out[c['id']] = c
        return out

    def attendance_class_ids(self, organization_id: str, on_date: str) -> List[str]:
        """Classes with any attendance row on this date -- the truth about
        whether a roll was taken, whether or not a session exists for it.
        Paged: one row per student per class, thousands on a busy day."""
        rows = fetch_all_rows(lambda: (
            self.client.table('sis_attendance').select('id, class_id')
            .eq('organization_id', organization_id).eq('date', on_date)))
        return list({r['class_id'] for r in rows if r.get('class_id')})
