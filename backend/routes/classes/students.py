"""
Class Student Enrollment Routes

Endpoints for managing student enrollments in classes.
"""

from flask import request, jsonify
from . import bp
from services.class_service import ClassService
from utils.auth.decorators import require_role
from utils.roles import get_effective_role
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


def get_user_info(user_id: str):
    """Get user role and organization info"""
    supabase = get_supabase_admin_client()
    user = supabase.table('users').select('role, org_role, organization_id').eq('id', user_id).execute()
    if not user.data:
        return None, None
    user_data = user.data[0]
    effective_role = get_effective_role(user_data)
    return effective_role, user_data.get('organization_id')


@bp.route('/organizations/<org_id>/classes/<class_id>/students', methods=['GET'])
@require_role('org_admin', 'advisor', 'superadmin')
def get_class_students(user_id, org_id, class_id):
    """
    Get all students enrolled in a class with their progress.

    Query Parameters:
    - with_progress: If 'true', include XP progress info (default: true)

    Returns:
    {
        "success": true,
        "students": [
            {
                "student_id": "...",
                "student": {
                    "id": "...",
                    "display_name": "...",
                    "email": "...",
                    "total_xp": 500
                },
                "enrollment": {
                    "status": "active",
                    "enrolled_at": "...",
                    "completed_at": null
                },
                "progress": {
                    "earned_xp": 75,
                    "xp_threshold": 100,
                    "percentage": 75,
                    "is_complete": false
                }
            }
        ]
    }
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        service = ClassService()

        # Check access
        if not service.can_access_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        with_progress = request.args.get('with_progress', 'true').lower() == 'true'

        if with_progress:
            students = service.get_class_students_with_progress(class_id)
        else:
            students = service.get_class_students(class_id)

        return jsonify({
            'success': True,
            'students': students
        })

    except Exception as e:
        logger.error(f"Error getting class students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get students'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/students', methods=['POST'])
@require_role('org_admin', 'advisor', 'superadmin')
def enroll_students(user_id, org_id, class_id):
    """
    Enroll one or more students in a class.

    Request body:
    {
        "student_ids": ["user-uuid-1", "user-uuid-2"]
    }

    Returns:
    {
        "success": true,
        "enrollments": [...],
        "message": "Enrolled 2 students"
    }
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        service = ClassService()

        # Check management access
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        data = request.json or {}
        student_ids = data.get('student_ids', [])

        if not student_ids:
            return jsonify({'success': False, 'error': 'student_ids is required'}), 400

        if not isinstance(student_ids, list):
            student_ids = [student_ids]

        # Verify students exist and belong to the same org
        supabase = get_supabase_admin_client()
        cls = service.get_class(class_id)
        class_org_id = cls.get('organization_id')

        # Get students
        students = supabase.table('users')\
            .select('id, organization_id, role, org_role')\
            .in_('id', student_ids)\
            .execute()

        if not students.data:
            return jsonify({'success': False, 'error': 'No valid students found'}), 404

        valid_student_ids = []
        for student in students.data:
            student_effective_role = get_effective_role(student)
            # Only allow enrolling students (not advisors or admins)
            if student_effective_role not in ['student']:
                continue
            # For non-superadmins, verify student is in the same org as the class
            if effective_role != 'superadmin':
                if student.get('organization_id') != class_org_id:
                    continue
            valid_student_ids.append(student['id'])

        if not valid_student_ids:
            return jsonify({
                'success': False,
                'error': 'No valid students found. Students must be in the same organization as the class.'
            }), 400

        enrollments = service.enroll_students_bulk(class_id, valid_student_ids, user_id)

        return jsonify({
            'success': True,
            'enrollments': enrollments,
            'message': f'Enrolled {len(valid_student_ids)} students'
        }), 201

    except Exception as e:
        logger.error(f"Error enrolling students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to enroll students'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/students/<student_id>', methods=['DELETE'])
@require_role('org_admin', 'advisor', 'superadmin')
def withdraw_student(user_id, org_id, class_id, student_id):
    """
    Withdraw a student from a class.

    Returns:
    {
        "success": true,
        "message": "Student withdrawn successfully"
    }
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        service = ClassService()

        # Check management access
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        success = service.withdraw_student(class_id, student_id, user_id)

        if success:
            return jsonify({
                'success': True,
                'message': 'Student withdrawn successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Student not found in class'
            }), 404

    except Exception as e:
        logger.error(f"Error withdrawing student: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to withdraw student'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/students/<student_id>/progress', methods=['GET'])
@require_role('org_admin', 'advisor', 'superadmin')
def get_student_progress(user_id, org_id, class_id, student_id):
    """
    Get a specific student's progress in a class.

    Returns:
    {
        "success": true,
        "progress": {
            "earned_xp": 75,
            "xp_threshold": 100,
            "percentage": 75,
            "is_complete": false
        }
    }
    """
    try:
        effective_role, user_org_id = get_user_info(user_id)

        service = ClassService()

        # Check access
        if not service.can_access_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        progress = service.calculate_student_class_progress(class_id, student_id)

        return jsonify({
            'success': True,
            'progress': progress
        })

    except Exception as e:
        if 'not found' in str(e).lower():
            return jsonify({'success': False, 'error': 'Class or student not found'}), 404
        logger.error(f"Error getting student progress: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get progress'
        }), 500
