"""
Admin Advisor Management Routes
================================

Handles advisor-student assignment operations.
Only accessible to admin users.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_advisor_management', __name__, url_prefix='/api/admin')


@bp.route('/advisors', methods=['GET'])
@require_admin
def get_all_advisors(user_id):
    """Get list of all advisors with their assigned student counts"""
    supabase = get_supabase_admin_client()

    try:
        # Get all users with advisor role
        advisors = supabase.table('users')\
            .select('id, display_name, first_name, last_name, email, created_at')\
            .eq('role', 'advisor')\
            .order('display_name')\
            .execute()

        # For each advisor, get count of assigned students
        advisor_list = []
        for advisor in advisors.data:
            # Count active assignments
            assignments = supabase.table('advisor_student_assignments')\
                .select('id', count='exact')\
                .eq('advisor_id', advisor['id'])\
                .eq('is_active', True)\
                .execute()

            advisor_list.append({
                **advisor,
                'assigned_students_count': assignments.count or 0
            })

        return jsonify({
            'success': True,
            'advisors': advisor_list,
            'total': len(advisor_list)
        })

    except Exception as e:
        logger.error(f"Error getting advisors: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve advisors'
        }), 500


@bp.route('/advisors/<advisor_id>/students', methods=['GET'])
@require_admin
def get_advisor_students(user_id, advisor_id):
    """Get list of students assigned to a specific advisor"""
    supabase = get_supabase_admin_client()

    try:
        # Verify advisor exists and has advisor role
        advisor = supabase.table('users')\
            .select('id, display_name, role')\
            .eq('id', advisor_id)\
            .single()\
            .execute()

        if not advisor.data:
            return jsonify({'success': False, 'error': 'Advisor not found'}), 404

        if advisor.data.get('role') != 'advisor':
            return jsonify({'success': False, 'error': 'User is not an advisor'}), 400

        # Get assigned students with assignment details
        assignments = supabase.table('advisor_student_assignments')\
            .select('id, student_id, assigned_at, assigned_by, is_active')\
            .eq('advisor_id', advisor_id)\
            .eq('is_active', True)\
            .execute()

        # Get student details for each assignment
        students = []
        for assignment in assignments.data:
            student = supabase.table('users')\
                .select('id, display_name, first_name, last_name, email')\
                .eq('id', assignment['student_id'])\
                .single()\
                .execute()

            if student.data:
                students.append({
                    'assignment_id': assignment['id'],
                    'assigned_at': assignment['assigned_at'],
                    **student.data
                })

        return jsonify({
            'success': True,
            'advisor': advisor.data,
            'students': students,
            'total': len(students)
        })

    except Exception as e:
        logger.error(f"Error getting advisor students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve assigned students'
        }), 500


@bp.route('/advisors/<advisor_id>/students', methods=['POST'])
@require_admin
def assign_student_to_advisor(user_id, advisor_id):
    """
    Assign a student to an advisor.

    Request body:
    {
        "student_id": "uuid"
    }
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        if not data.get('student_id'):
            return jsonify({'success': False, 'error': 'student_id is required'}), 400

        student_id = data['student_id']

        # Verify advisor exists and has advisor role
        advisor = supabase.table('users')\
            .select('id, role')\
            .eq('id', advisor_id)\
            .single()\
            .execute()

        if not advisor.data:
            return jsonify({'success': False, 'error': 'Advisor not found'}), 404

        if advisor.data.get('role') != 'advisor':
            return jsonify({'success': False, 'error': 'User is not an advisor'}), 400

        # Verify student exists and has student role
        student = supabase.table('users')\
            .select('id, role')\
            .eq('id', student_id)\
            .single()\
            .execute()

        if not student.data:
            return jsonify({'success': False, 'error': 'Student not found'}), 404

        if student.data.get('role') != 'student':
            return jsonify({'success': False, 'error': 'User is not a student'}), 400

        # Check if assignment already exists
        existing = supabase.table('advisor_student_assignments')\
            .select('id, is_active')\
            .eq('advisor_id', advisor_id)\
            .eq('student_id', student_id)\
            .execute()

        if existing.data and len(existing.data) > 0:
            # If assignment exists but is inactive, reactivate it
            if not existing.data[0].get('is_active'):
                supabase.table('advisor_student_assignments')\
                    .update({
                        'is_active': True,
                        'assigned_at': datetime.utcnow().isoformat(),
                        'assigned_by': user_id
                    })\
                    .eq('id', existing.data[0]['id'])\
                    .execute()

                return jsonify({
                    'success': True,
                    'message': 'Student assignment reactivated'
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Student is already assigned to this advisor'
                }), 409

        # Create new assignment
        assignment_data = {
            'advisor_id': advisor_id,
            'student_id': student_id,
            'assigned_by': user_id,
            'assigned_at': datetime.utcnow().isoformat(),
            'is_active': True
        }

        result = supabase.table('advisor_student_assignments')\
            .insert(assignment_data)\
            .execute()

        return jsonify({
            'success': True,
            'message': 'Student assigned to advisor successfully',
            'assignment': result.data[0] if result.data else None
        })

    except Exception as e:
        logger.error(f"Error assigning student to advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to assign student: {str(e)}'
        }), 500


@bp.route('/advisors/<advisor_id>/students/<student_id>', methods=['DELETE'])
@require_admin
def unassign_student_from_advisor(user_id, advisor_id, student_id):
    """Remove a student assignment from an advisor"""
    supabase = get_supabase_admin_client()

    try:
        # Find the assignment
        assignment = supabase.table('advisor_student_assignments')\
            .select('id')\
            .eq('advisor_id', advisor_id)\
            .eq('student_id', student_id)\
            .eq('is_active', True)\
            .execute()

        if not assignment.data or len(assignment.data) == 0:
            return jsonify({
                'success': False,
                'error': 'Assignment not found'
            }), 404

        # Deactivate the assignment (soft delete)
        supabase.table('advisor_student_assignments')\
            .update({'is_active': False})\
            .eq('id', assignment.data[0]['id'])\
            .execute()

        return jsonify({
            'success': True,
            'message': 'Student unassigned from advisor successfully'
        })

    except Exception as e:
        logger.error(f"Error unassigning student from advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to unassign student: {str(e)}'
        }), 500


@bp.route('/students/unassigned', methods=['GET'])
@require_admin
def get_unassigned_students(user_id):
    """
    Get list of students who are not assigned to any advisor.
    Useful for admin UI when assigning students.
    """
    supabase = get_supabase_admin_client()

    try:
        # Get all students
        all_students = supabase.table('users')\
            .select('id, display_name, first_name, last_name, email')\
            .eq('role', 'student')\
            .order('display_name')\
            .execute()

        # Get all active assignments
        assignments = supabase.table('advisor_student_assignments')\
            .select('student_id')\
            .eq('is_active', True)\
            .execute()

        assigned_student_ids = {a['student_id'] for a in assignments.data}

        # Filter to only unassigned students
        unassigned_students = [
            student for student in all_students.data
            if student['id'] not in assigned_student_ids
        ]

        return jsonify({
            'success': True,
            'students': unassigned_students,
            'total': len(unassigned_students)
        })

    except Exception as e:
        logger.error(f"Error getting unassigned students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve unassigned students'
        }), 500
