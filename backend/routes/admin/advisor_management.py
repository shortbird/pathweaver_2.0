"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- Direct database calls for advisor-student assignment operations
- Could create AdvisorManagementRepository with methods:
  - get_all_advisors()
  - get_advisor_students(advisor_id)
  - assign_student_to_advisor(student_id, advisor_id, admin_id)
  - remove_student_from_advisor(assignment_id, admin_id)
  - get_unassigned_students()
- Simple admin CRUD suitable for repository abstraction

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
    """Get list of all advisors and admins with their assigned student counts"""
    supabase = get_supabase_admin_client()

    try:
        # Get all users with advisor or admin role
        advisors = supabase.table('users')\
            .select('id, display_name, first_name, last_name, email, role, created_at')\
            .in_('role', ['advisor', 'admin', 'superadmin'])\
            .order('display_name')\
            .execute()

        # Get all active assignments in a single query
        all_assignments = supabase.table('advisor_student_assignments')\
            .select('advisor_id')\
            .eq('is_active', True)\
            .execute()

        # Build a count map for efficient lookup
        assignment_counts = {}
        for assignment in all_assignments.data:
            advisor_id = assignment['advisor_id']
            assignment_counts[advisor_id] = assignment_counts.get(advisor_id, 0) + 1

        # Build advisor list with counts
        advisor_list = []
        for advisor in advisors.data:
            advisor_list.append({
                **advisor,
                'assigned_students_count': assignment_counts.get(advisor['id'], 0)
            })

        return jsonify({
            'success': True,
            'advisors': advisor_list,
            'total': len(advisor_list)
        })

    except AttributeError as e:
        logger.error(f"Database response missing expected attributes in get_all_advisors: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Invalid database response format'
        }), 500
    except KeyError as e:
        logger.error(f"Missing required field in get_all_advisors: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Missing required data field'
        }), 500
    except (ConnectionError, TimeoutError) as e:
        logger.error(f"Database connection error in get_all_advisors: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Database connection failed'
        }), 503
    except Exception as e:
        logger.error(f"Unexpected error in get_all_advisors: {str(e)}", exc_info=True)
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
        # Verify advisor exists and has advisor or admin role
        advisor = supabase.table('users')\
            .select('id, display_name, role')\
            .eq('id', advisor_id)\
            .single()\
            .execute()

        if not advisor.data:
            return jsonify({'success': False, 'error': 'Advisor not found'}), 404

        if advisor.data.get('role') not in ['advisor', 'admin', 'superadmin']:
            return jsonify({'success': False, 'error': 'User is not an advisor or admin'}), 400

        # Get assigned students with assignment details in a single query
        assignments = supabase.table('advisor_student_assignments')\
            .select('id, student_id, assigned_at, assigned_by, is_active')\
            .eq('advisor_id', advisor_id)\
            .eq('is_active', True)\
            .execute()

        # Get all student IDs
        student_ids = [assignment['student_id'] for assignment in assignments.data]

        if not student_ids:
            return jsonify({
                'success': True,
                'advisor': advisor.data,
                'students': [],
                'total': 0
            })

        # Get all students in a single query
        students_result = supabase.table('users')\
            .select('id, display_name, first_name, last_name, email')\
            .in_('id', student_ids)\
            .execute()

        # Create a lookup map for students
        students_map = {student['id']: student for student in students_result.data}

        # Build the final list with assignment details
        students = []
        for assignment in assignments.data:
            student = students_map.get(assignment['student_id'])
            if student:
                students.append({
                    'assignment_id': assignment['id'],
                    'assigned_at': assignment['assigned_at'],
                    **student
                })

        return jsonify({
            'success': True,
            'advisor': advisor.data,
            'students': students,
            'total': len(students)
        })

    except AttributeError as e:
        logger.error(f"Database response missing expected attributes in get_advisor_students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Invalid database response format'
        }), 500
    except KeyError as e:
        logger.error(f"Missing required field in get_advisor_students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Missing required data field'
        }), 500
    except (ConnectionError, TimeoutError) as e:
        logger.error(f"Database connection error in get_advisor_students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Database connection failed'
        }), 503
    except Exception as e:
        logger.error(f"Unexpected error in get_advisor_students: {str(e)}", exc_info=True)
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

        # Verify advisor exists and has advisor or admin role
        advisor = supabase.table('users')\
            .select('id, role')\
            .eq('id', advisor_id)\
            .single()\
            .execute()

        if not advisor.data:
            return jsonify({'success': False, 'error': 'Advisor not found'}), 404

        if advisor.data.get('role') not in ['advisor', 'admin', 'superadmin']:
            return jsonify({'success': False, 'error': 'User is not an advisor or admin'}), 400

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

    except ValueError as e:
        logger.error(f"Invalid JSON in assign_student_to_advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Invalid request format'
        }), 400
    except KeyError as e:
        logger.error(f"Missing required field in assign_student_to_advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Missing required field'
        }), 400
    except AttributeError as e:
        logger.error(f"Database response missing expected attributes in assign_student_to_advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Invalid database response format'
        }), 500
    except (ConnectionError, TimeoutError) as e:
        logger.error(f"Database connection error in assign_student_to_advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Database connection failed'
        }), 503
    except Exception as e:
        logger.error(f"Unexpected error in assign_student_to_advisor: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to assign student'
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

    except AttributeError as e:
        logger.error(f"Database response missing expected attributes in unassign_student_from_advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Invalid database response format'
        }), 500
    except KeyError as e:
        logger.error(f"Missing required field in unassign_student_from_advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Missing required data field'
        }), 500
    except (ConnectionError, TimeoutError) as e:
        logger.error(f"Database connection error in unassign_student_from_advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Database connection failed'
        }), 503
    except Exception as e:
        logger.error(f"Unexpected error in unassign_student_from_advisor: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to unassign student'
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

    except AttributeError as e:
        logger.error(f"Database response missing expected attributes in get_unassigned_students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Invalid database response format'
        }), 500
    except KeyError as e:
        logger.error(f"Missing required field in get_unassigned_students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Missing required data field'
        }), 500
    except (ConnectionError, TimeoutError) as e:
        logger.error(f"Database connection error in get_unassigned_students: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Database connection failed'
        }), 503
    except Exception as e:
        logger.error(f"Unexpected error in get_unassigned_students: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve unassigned students'
        }), 500
