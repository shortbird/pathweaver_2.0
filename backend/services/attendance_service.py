"""
Attendance Service - Business logic for class attendance (iCreate SIS)

Model: there is NO student check-in/check-out. A teacher (class advisor) marks the
roster for a meeting; everyone defaults to present and the teacher flags absences.

Notification rules:
  * When a student becomes 'absent', their parent(s) are notified.
  * When a student who was 'present' is later changed to 'absent', the parent(s)
    AND the org admin(s) are notified (the change is flagged as a correction).
  * Re-marking an already-absent student does nothing.

The start-of-class reminder (send_attendance_reminders) is driven by the recurring
cron job and pings each class's advisors to mark absences when the class begins.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

from services.base_service import BaseService, ValidationError
from repositories.attendance_repository import AttendanceRepository, VALID_STATUSES
from repositories.class_repository import ClassRepository
from utils.logger import get_logger

logger = get_logger(__name__)

_DAY_CODES = ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')


class AttendanceService(BaseService):
    """Business logic for marking attendance and sending absence/reminder notifications."""

    def __init__(self):
        super().__init__()
        self.attendance_repo = AttendanceRepository()
        self.class_repo = ClassRepository()
        # Lazily created so unit tests can inject a mock without building a Supabase client.
        self.notification_service = None

    def _notifier(self):
        if self.notification_service is None:
            from services.notification_service import NotificationService
            self.notification_service = NotificationService()
        return self.notification_service

    # ===== Marking =====

    def mark_attendance(
        self,
        class_id: str,
        organization_id: str,
        meeting_date: str,
        records: List[Dict[str, Any]],
        marked_by: str,
    ) -> Dict[str, Any]:
        """
        Record attendance for a class meeting.

        Args:
            records: list of {student_id, status} where status in present/absent/excused.
                     Typically the full roster; only the students included are written.

        Returns a summary with per-status counts and how many parents / org admins
        were notified.
        """
        self.validate_required(
            class_id=class_id,
            organization_id=organization_id,
            meeting_date=meeting_date,
            marked_by=marked_by,
        )
        if not records:
            raise ValidationError("No attendance records provided")

        # Validate up front so a bad row doesn't leave a half-written roster.
        for rec in records:
            student_id = rec.get('student_id')
            if not student_id:
                raise ValidationError("Each attendance record requires a student_id")
            self.validate_one_of('status', rec.get('status'), list(VALID_STATUSES))

        prior = self.attendance_repo.get_status_map(class_id, meeting_date)

        summary = {
            'present': 0, 'absent': 0, 'excused': 0,
            'parents_notified': 0, 'org_admins_notified': 0,
        }
        became_absent = []  # (student_id, changed_from_present)

        for rec in records:
            student_id = rec['student_id']
            status = rec['status']
            self.attendance_repo.upsert_status(
                class_id, student_id, organization_id, meeting_date, status, marked_by
            )
            summary[status] += 1

            if status == 'absent' and prior.get(student_id) != 'absent':
                became_absent.append((student_id, prior.get(student_id) == 'present'))

        for student_id, changed_from_present in became_absent:
            parents_notified, admins_notified = self._notify_absence(
                student_id, class_id, organization_id, meeting_date, changed_from_present
            )
            summary['parents_notified'] += parents_notified
            summary['org_admins_notified'] += admins_notified

        logger.info(
            f"Attendance marked for class {class_id} on {meeting_date}: "
            f"{summary['present']}P/{summary['absent']}A/{summary['excused']}E "
            f"({summary['parents_notified']} parents, {summary['org_admins_notified']} admins notified)"
        )
        return summary

    def _notify_absence(
        self,
        student_id: str,
        class_id: str,
        organization_id: str,
        meeting_date: str,
        changed_from_present: bool,
    ):
        """Notify parents (always) and, for present->absent changes, org admins."""
        notifier = self._notifier()

        student = self.attendance_repo.get_student(student_id) or {}
        student_name = (
            student.get('display_name')
            or f"{student.get('first_name', '')} {student.get('last_name', '')}".strip()
            or 'A student'
        )
        cls = self.attendance_repo.get_class(class_id) or {}
        class_name = cls.get('name') or 'class'

        parents_notified = 0
        for parent in (notifier.get_parents_for_student(student_id) or []):
            notifier.notify_student_absent(
                recipient_id=parent['id'],
                student_name=student_name,
                class_name=class_name,
                meeting_date=meeting_date,
                student_id=student_id,
                class_id=class_id,
                organization_id=organization_id,
                changed_from_present=changed_from_present,
            )
            parents_notified += 1

        admins_notified = 0
        if changed_from_present:
            for admin_id in self.attendance_repo.get_org_admin_ids(organization_id):
                notifier.notify_student_absent(
                    recipient_id=admin_id,
                    student_name=student_name,
                    class_name=class_name,
                    meeting_date=meeting_date,
                    student_id=student_id,
                    class_id=class_id,
                    organization_id=organization_id,
                    changed_from_present=True,
                )
                admins_notified += 1

        return parents_notified, admins_notified

    # ===== Roster (teacher view) =====

    def get_meeting_roster(self, class_id: str, meeting_date: str) -> Dict[str, Any]:
        """
        Enrolled (active) students plus their recorded status for a meeting date.
        `status` is None when not yet recorded — the UI defaults those to present.
        """
        self.validate_required(class_id=class_id, meeting_date=meeting_date)

        enrollments = self.class_repo.get_class_students(class_id, status='active')
        status_map = self.attendance_repo.get_status_map(class_id, meeting_date)

        students = []
        for enrollment in enrollments:
            user = enrollment.get('users') or {}
            student_id = user.get('id') or enrollment.get('student_id')
            students.append({
                'student_id': student_id,
                'student': {
                    'id': student_id,
                    'display_name': user.get('display_name'),
                    'first_name': user.get('first_name'),
                    'last_name': user.get('last_name'),
                    'email': user.get('email'),
                },
                'status': status_map.get(student_id),
            })

        return {
            'meeting_date': meeting_date,
            'recorded': self.attendance_repo.attendance_taken(class_id, meeting_date),
            'students': students,
        }

    # ===== Start-of-class reminders (cron) =====

    def send_attendance_reminders(self, now: datetime, window_minutes: int = 15) -> Dict[str, Any]:
        """
        Notify advisors of classes that start within [now, now+window) today and whose
        attendance hasn't been taken yet. Idempotent per advisor+class+date so the
        recurring cron doesn't double-ping.
        """
        day_code = _DAY_CODES[now.weekday()]
        meeting_date = now.date().isoformat()
        start_from = now.strftime('%H:%M:%S')
        start_to = (now + timedelta(minutes=window_minutes)).strftime('%H:%M:%S')

        classes = self.attendance_repo.find_classes_meeting(day_code, start_from, start_to)

        summary = {
            'meeting_date': meeting_date,
            'day': day_code,
            'window_minutes': window_minutes,
            'classes_matched': len(classes),
            'classes_notified': 0,
            'reminders_sent': 0,
            'skipped_taken': 0,
        }

        notifier = self._notifier()
        for cls in classes:
            class_id = cls['id']
            if self.attendance_repo.attendance_taken(class_id, meeting_date):
                summary['skipped_taken'] += 1
                continue

            notified = 0
            for advisor_id in self.attendance_repo.get_active_advisor_ids(class_id):
                if self.attendance_repo.reminder_already_sent(advisor_id, class_id, meeting_date):
                    continue
                notifier.notify_attendance_reminder(
                    advisor_id=advisor_id,
                    class_name=cls.get('name') or 'Your class',
                    class_id=class_id,
                    meeting_date=meeting_date,
                    organization_id=cls.get('organization_id'),
                )
                notified += 1

            summary['reminders_sent'] += notified
            if notified:
                summary['classes_notified'] += 1

        logger.info(
            f"Attendance reminders: {summary['reminders_sent']} sent across "
            f"{summary['classes_notified']}/{summary['classes_matched']} {day_code} classes"
        )
        return summary
