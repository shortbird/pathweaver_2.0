"""
School Enrollment Repository - a student's standing at one school.

`school_enrollments` is one row per (organization, student): enrolled,
withdrawn, graduated. The People list and the dashboards already read the
status to decide who is "no longer here"; this is the read for code that needs
to ask before writing it again (sis_person_service.withdraw_household).
"""

from typing import Any, Dict, Optional

from repositories.base_repository import BaseRepository


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
