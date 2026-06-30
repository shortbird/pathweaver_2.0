"""
Attendance Repository - Data access for class attendance (iCreate SIS)

Backs the "teacher marks absences" model:
- one row per (class, student, meeting_date) in class_attendance
- helpers to read prior statuses (for present -> absent transition detection)
- helpers the reminder job needs: classes meeting now, active advisors, whether
  attendance was already taken, and whether a reminder was already sent
- recipient lookups: org admins for a class's org (parents come from
  NotificationService.get_parents_for_student)
"""

from typing import Dict, Any, List, Optional
from datetime import date

from repositories.base_repository import BaseRepository
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

VALID_STATUSES = ('present', 'absent', 'excused')


class AttendanceRepository(BaseRepository):
    """Repository for class attendance data access."""

    table_name = 'class_attendance'

    def __init__(self, user_id: Optional[str] = None):
        super().__init__(user_id)
        self._admin_client = None

    @property
    def admin_client(self):
        """Admin client for operations that bypass RLS (authz enforced in service/route layer)."""
        if self._admin_client is None:
            # admin client justified: attendance writes are gated by can_manage_class in the
            # service/route layer; needs RLS bypass for cross-tenant superadmin + notification fan-out
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    # ===== Reads =====

    def get_meeting_attendance(self, class_id: str, meeting_date: str) -> List[Dict[str, Any]]:
        """All attendance rows for a class on a given meeting date."""
        response = self.admin_client.table(self.table_name)\
            .select('*')\
            .eq('class_id', class_id)\
            .eq('meeting_date', meeting_date)\
            .execute()
        return response.data if response.data else []

    def get_status_map(self, class_id: str, meeting_date: str) -> Dict[str, str]:
        """Map of student_id -> current status for a class meeting (for transition detection)."""
        rows = self.get_meeting_attendance(class_id, meeting_date)
        return {r['student_id']: r['status'] for r in rows}

    def attendance_taken(self, class_id: str, meeting_date: str) -> bool:
        """True if any attendance has been recorded for this class on this date."""
        response = self.admin_client.table(self.table_name)\
            .select('id')\
            .eq('class_id', class_id)\
            .eq('meeting_date', meeting_date)\
            .limit(1)\
            .execute()
        return bool(response.data)

    # ===== Writes =====

    def upsert_status(
        self,
        class_id: str,
        student_id: str,
        organization_id: str,
        meeting_date: str,
        status: str,
        marked_by: str,
    ) -> Dict[str, Any]:
        """Insert or update a single student's status for a meeting."""
        data = {
            'class_id': class_id,
            'student_id': student_id,
            'organization_id': organization_id,
            'meeting_date': meeting_date,
            'status': status,
            'marked_by': marked_by,
            'marked_at': 'now()',
        }
        response = self.admin_client.table(self.table_name)\
            .upsert(data, on_conflict='class_id,student_id,meeting_date')\
            .execute()
        if not response.data:
            raise Exception("Failed to upsert attendance status")
        return response.data[0]

    # ===== Recipient lookups =====

    def get_org_admin_ids(self, organization_id: str) -> List[str]:
        """Active org admins for an organization (org_managed users with org_role='org_admin')."""
        response = self.admin_client.table('users')\
            .select('id, role, org_role')\
            .eq('organization_id', organization_id)\
            .execute()
        admins = []
        for u in (response.data or []):
            if u.get('org_role') == 'org_admin' or u.get('role') == 'org_admin':
                admins.append(u['id'])
        return admins

    def get_active_advisor_ids(self, class_id: str) -> List[str]:
        """User IDs of active advisors (teachers) for a class."""
        response = self.admin_client.table('class_advisors')\
            .select('advisor_id')\
            .eq('class_id', class_id)\
            .eq('is_active', True)\
            .execute()
        return [r['advisor_id'] for r in (response.data or [])]

    def get_student(self, student_id: str) -> Optional[Dict[str, Any]]:
        """Minimal student record for building notification copy."""
        response = self.admin_client.table('users')\
            .select('id, display_name, first_name, last_name')\
            .eq('id', student_id)\
            .limit(1)\
            .execute()
        return response.data[0] if response.data else None

    def get_class(self, class_id: str) -> Optional[Dict[str, Any]]:
        """Minimal class record for building notification copy / org scoping."""
        response = self.admin_client.table('org_classes')\
            .select('id, name, organization_id, status')\
            .eq('id', class_id)\
            .limit(1)\
            .execute()
        return response.data[0] if response.data else None

    # ===== Reminder job support =====

    def find_classes_meeting(
        self,
        day_code: str,
        start_time_from: str,
        start_time_to: str,
    ) -> List[Dict[str, Any]]:
        """
        Active classes whose schedule includes `day_code` and whose start_time falls in
        the half-open window [start_time_from, start_time_to). Times are zero-padded
        'HH:MM:SS' strings, so lexical comparison matches chronological order.
        """
        response = self.admin_client.table('org_classes')\
            .select('id, name, organization_id, start_time, days_of_week, status')\
            .eq('status', 'active')\
            .contains('days_of_week', [day_code])\
            .gte('start_time', start_time_from)\
            .lt('start_time', start_time_to)\
            .execute()
        return response.data if response.data else []

    def reminder_already_sent(self, advisor_id: str, class_id: str, meeting_date: str) -> bool:
        """
        True if an attendance_reminder notification was already created for this
        advisor + class + meeting_date (idempotency guard for the recurring cron).
        """
        response = self.admin_client.table('notifications')\
            .select('id')\
            .eq('user_id', advisor_id)\
            .eq('type', 'attendance_reminder')\
            .contains('metadata', {'class_id': class_id, 'meeting_date': meeting_date})\
            .limit(1)\
            .execute()
        return bool(response.data)
