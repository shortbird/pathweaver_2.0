"""
School Enrollment Repository - a student's standing at one school.

`school_enrollments` is one row per (organization, student): enrolled,
withdrawn, graduated. The People list and the dashboards already read the
status to decide who is "no longer here"; this is the read for code that needs
to ask before writing it again (sis_person_service.withdraw_household).
"""

from typing import Any, Dict, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows


class SchoolEnrollmentRepository(BaseRepository):
    table_name = 'school_enrollments'

    def find_for_student(self, organization_id: str, student_user_id: str) -> Optional[Dict[str, Any]]:
        rows = (
            self.client.table(self.table_name)
            .select('id, status, updated_at')
            .eq('organization_id', organization_id)
            .eq('student_user_id', student_user_id)
            .limit(1)
            .execute()
        ).data or []
        return rows[0] if rows else None

    def statuses_for_org(self, organization_id: str) -> Dict[str, str]:
        """{student_user_id: status} for every enrollment row at the school.

        Paged: this decides who the org admin's People list shows as
        withdrawn, and a truncated read would quietly put those students back.
        """
        rows = fetch_all_rows(lambda: (
            self.client.table(self.table_name)
            .select('student_user_id, status')
            .eq('organization_id', organization_id)
        ))
        return {r['student_user_id']: r.get('status') for r in rows if r.get('student_user_id')}
