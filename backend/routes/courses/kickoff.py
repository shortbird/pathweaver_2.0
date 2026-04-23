"""
Courses Module - Kickoff Attendance

Endpoints for the class creator / teacher of record / superadmin to list
enrolled students and mark each one as having attended the kickoff video call.
Kickoff attendance is a prerequisite for completing the class and earning credit.
"""

from datetime import datetime
from flask import request, jsonify
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client
from utils.session_manager import session_manager
from utils.logger import get_logger
from utils.roles import get_effective_role
from routes.courses import can_manage_course

logger = get_logger(__name__)


def register_routes(bp):
    """Register kickoff attendance routes on the courses blueprint."""

    @bp.route('/<course_id>/kickoff/attendance', methods=['GET'])
    @require_auth
    def get_kickoff_attendance(user_id, course_id: str):
        """Return the roster of enrolled students with their kickoff attendance state."""
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()

            course_result = client.table('courses').select(
                'id, created_by, teacher_of_record_id, kickoff_at'
            ).eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Class not found'}), 404
            course = course_result.data[0]

            user_result = client.table('users').select('role, org_role').eq('id', user_id).execute()
            user_data = {**(user_result.data[0] if user_result.data else {}), 'id': user_id}
            is_teacher = course.get('teacher_of_record_id') == user_id

            if not (can_manage_course(user_data, course) or is_teacher):
                return jsonify({'error': 'Not authorized to view this roster'}), 403

            enrollments = client.table('course_enrollments').select(
                'id, user_id, kickoff_attended, kickoff_attended_at, enrolled_at, '
                'users(id, email, display_name, first_name, last_name, parental_consent_email)'
            ).eq('course_id', course_id).order('enrolled_at').execute()

            roster = []
            for e in (enrollments.data or []):
                u = e.get('users') or {}
                student_name = (
                    u.get('display_name')
                    or f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
                    or u.get('email')
                )
                roster.append({
                    'enrollment_id': e['id'],
                    'user_id': e['user_id'],
                    'student_name': student_name,
                    'student_email': u.get('email'),
                    'parent_email': u.get('parental_consent_email'),
                    'kickoff_attended': e.get('kickoff_attended', False),
                    'kickoff_attended_at': e.get('kickoff_attended_at'),
                    'enrolled_at': e.get('enrolled_at'),
                })

            return jsonify({
                'success': True,
                'kickoff_at': course.get('kickoff_at'),
                'roster': roster,
            }), 200

        except Exception as e:
            logger.error(f"Error loading kickoff attendance for {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500


    @bp.route('/<course_id>/kickoff/attend', methods=['POST'])
    @require_auth
    def mark_kickoff_attended(user_id, course_id: str):
        """
        Mark a single enrollment as having attended the kickoff.

        Body:
            enrollment_id: course_enrollments.id to mark
            attended: bool (defaults to True)
        """
        try:
            user_id = session_manager.get_effective_user_id()
            client = get_supabase_admin_client()

            data = request.get_json(silent=True) or {}
            enrollment_id = data.get('enrollment_id')
            attended = data.get('attended', True)

            if not enrollment_id:
                return jsonify({'error': 'enrollment_id is required'}), 400

            # Confirm the enrollment belongs to this course, and check caller permissions
            enrollment = client.table('course_enrollments').select(
                'id, course_id'
            ).eq('id', enrollment_id).eq('course_id', course_id).execute()
            if not enrollment.data:
                return jsonify({'error': 'Enrollment not found for this class'}), 404

            course_result = client.table('courses').select(
                'created_by, teacher_of_record_id'
            ).eq('id', course_id).execute()
            if not course_result.data:
                return jsonify({'error': 'Class not found'}), 404
            course = course_result.data[0]

            user_result = client.table('users').select('role, org_role').eq('id', user_id).execute()
            user_data = {**(user_result.data[0] if user_result.data else {}), 'id': user_id}
            is_teacher = course.get('teacher_of_record_id') == user_id

            if not (can_manage_course(user_data, course) or is_teacher):
                return jsonify({'error': 'Not authorized to update this roster'}), 403

            update = {
                'kickoff_attended': bool(attended),
                'kickoff_attended_at': datetime.utcnow().isoformat() if attended else None,
            }
            client.table('course_enrollments').update(update).eq('id', enrollment_id).execute()

            logger.info(f"Kickoff attendance updated: enrollment={enrollment_id} attended={attended}")
            return jsonify({'success': True}), 200

        except Exception as e:
            logger.error(f"Error updating kickoff attendance for {course_id}: {str(e)}")
            return jsonify({'error': str(e)}), 500
