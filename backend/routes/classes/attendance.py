"""
Class Attendance Routes (iCreate SIS)

Endpoints for a teacher (class advisor) or org admin to view a meeting roster and
mark absences. There is no student check-in/check-out — attendance is teacher-marked.

Marking a student absent notifies their parent(s); changing a student from present
to absent additionally notifies the org admin(s) (handled in AttendanceService).
"""

from datetime import datetime, timezone

from flask import request, jsonify
from . import bp
from services.class_service import ClassService
from services.attendance_service import AttendanceService
from services.base_service import ValidationError
from utils.auth.decorators import require_role
from utils.roles import get_effective_role
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


def get_user_info(user_id: str):
    """Get effective role + organization for the requesting user."""
    # admin client justified: classes module helper; attendance is gated by can_manage_class below
    supabase = get_supabase_admin_client()
    user = supabase.table('users').select('role, org_role, organization_id').eq('id', user_id).execute()
    if not user.data:
        return None, None
    user_data = user.data[0]
    return get_effective_role(user_data), user_data.get('organization_id')


def _today_iso():
    return datetime.now(timezone.utc).date().isoformat()


@bp.route('/organizations/<org_id>/classes/<class_id>/attendance', methods=['GET'])
@require_role('org_admin', 'advisor', 'superadmin')
def get_attendance(user_id, org_id, class_id):
    """
    Get the roster + recorded attendance for a class meeting.

    Query params:
      - date: meeting date (YYYY-MM-DD). Defaults to today (UTC).

    Returns:
    {
      "success": true,
      "attendance": {
        "meeting_date": "2026-06-30",
        "recorded": false,
        "students": [{"student_id": "...", "student": {...}, "status": null|"present"|"absent"|"excused"}]
      }
    }
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        service = ClassService()
        if not service.can_access_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        meeting_date = (request.args.get('date') or '').strip() or _today_iso()

        attendance = AttendanceService().get_meeting_roster(class_id, meeting_date)
        return jsonify({'success': True, 'attendance': attendance})

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error getting attendance: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to get attendance'}), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/attendance', methods=['POST'])
@require_role('org_admin', 'advisor', 'superadmin')
def mark_attendance(user_id, org_id, class_id):
    """
    Mark attendance for a class meeting.

    Request body:
    {
      "meeting_date": "2026-06-30",            // optional, defaults to today (UTC)
      "records": [                              // full roster (or just the changes)
        {"student_id": "...", "status": "present"},
        {"student_id": "...", "status": "absent"}
      ]
    }

    Returns a summary including how many parents / org admins were notified.
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        class_service = ClassService()
        if not class_service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        data = request.get_json() or {}
        records = data.get('records')
        if not isinstance(records, list) or not records:
            return jsonify({'success': False, 'error': 'records is required'}), 400

        meeting_date = (data.get('meeting_date') or '').strip() or _today_iso()

        # Use the class's own org so attendance rows are scoped correctly even for superadmin.
        cls = class_service.get_class(class_id)
        class_org_id = cls.get('organization_id') or org_id

        summary = AttendanceService().mark_attendance(
            class_id=class_id,
            organization_id=class_org_id,
            meeting_date=meeting_date,
            records=records,
            marked_by=user_id,
        )

        return jsonify({
            'success': True,
            'meeting_date': meeting_date,
            'summary': summary,
        }), 200

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error marking attendance: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to mark attendance'}), 500
