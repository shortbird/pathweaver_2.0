"""
Organization Connections Routes

Handles advisor-student and parent-student connections scoped to an organization.
Accessible to org_admin users for their own organization.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_org_admin
from utils.roles import get_effective_role
from datetime import datetime
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('org_connections', __name__, url_prefix='/api/admin/organizations')


@bp.route('/<org_id>/advisors', methods=['GET'])
@require_org_admin
def get_org_advisors(current_user_id, current_org_id, is_superadmin, org_id):
    """Get list of advisors and org_admins in the organization with their assigned student counts"""
    supabase = get_supabase_admin_client()

    try:
        # Get all users with advisor or org_admin role in this organization
        # Note: Org users have role='org_managed' with actual role in org_role
        advisors = supabase.table('users')\
            .select('id, display_name, first_name, last_name, email, role, org_role, created_at')\
            .eq('organization_id', org_id)\
            .in_('org_role', ['advisor', 'org_admin'])\
            .order('display_name')\
            .execute()

        # Get all active assignments for students in this org
        org_students = supabase.table('users')\
            .select('id')\
            .eq('organization_id', org_id)\
            .eq('org_role', 'student')\
            .execute()

        org_student_ids = [s['id'] for s in org_students.data]

        if org_student_ids:
            all_assignments = supabase.table('advisor_student_assignments')\
                .select('advisor_id')\
                .eq('is_active', True)\
                .in_('student_id', org_student_ids)\
                .execute()
        else:
            all_assignments = type('obj', (object,), {'data': []})()

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
                # Map org_role to role for frontend compatibility
                'role': advisor.get('org_role', advisor.get('role')),
                'assigned_students_count': assignment_counts.get(advisor['id'], 0)
            })

        return jsonify({
            'success': True,
            'advisors': advisor_list,
            'total': len(advisor_list)
        })

    except Exception as e:
        logger.error(f"Error in get_org_advisors: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to retrieve advisors'}), 500


@bp.route('/<org_id>/advisors/<advisor_id>/students', methods=['GET'])
@require_org_admin
def get_org_advisor_students(current_user_id, current_org_id, is_superadmin, org_id, advisor_id):
    """Get list of students assigned to a specific advisor (scoped to org)"""
    supabase = get_supabase_admin_client()

    try:
        # Verify advisor exists and belongs to this org
        advisor = supabase.table('users')\
            .select('id, display_name, role, organization_id')\
            .eq('id', advisor_id)\
            .single()\
            .execute()

        if not advisor.data:
            return jsonify({'success': False, 'error': 'Advisor not found'}), 404

        if advisor.data.get('organization_id') != org_id and not is_superadmin:
            return jsonify({'success': False, 'error': 'Advisor not in this organization'}), 403

        # Get org students (org users have role='org_managed', actual role in org_role)
        org_students = supabase.table('users')\
            .select('id')\
            .eq('organization_id', org_id)\
            .eq('org_role', 'student')\
            .execute()

        org_student_ids = [s['id'] for s in org_students.data]

        if not org_student_ids:
            return jsonify({
                'success': True,
                'advisor': advisor.data,
                'students': [],
                'total': 0
            })

        # Get assigned students with assignment details (only org students)
        assignments = supabase.table('advisor_student_assignments')\
            .select('id, student_id, assigned_at, assigned_by, is_active')\
            .eq('advisor_id', advisor_id)\
            .eq('is_active', True)\
            .in_('student_id', org_student_ids)\
            .execute()

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

        students_map = {student['id']: student for student in students_result.data}

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

    except Exception as e:
        logger.error(f"Error in get_org_advisor_students: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to retrieve assigned students'}), 500


@bp.route('/<org_id>/advisors/<advisor_id>/students', methods=['POST'])
@require_org_admin
def assign_org_student_to_advisor(current_user_id, current_org_id, is_superadmin, org_id, advisor_id):
    """Assign a student to an advisor (both must be in the org)"""
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        if not data.get('student_id'):
            return jsonify({'success': False, 'error': 'student_id is required'}), 400

        student_id = data['student_id']

        # Verify advisor belongs to org
        advisor = supabase.table('users')\
            .select('id, role, org_role, organization_id')\
            .eq('id', advisor_id)\
            .single()\
            .execute()

        if not advisor.data:
            return jsonify({'success': False, 'error': 'Advisor not found'}), 404

        if advisor.data.get('organization_id') != org_id and not is_superadmin:
            return jsonify({'success': False, 'error': 'Advisor not in this organization'}), 403

        effective_advisor_role = get_effective_role(advisor.data)
        if effective_advisor_role not in ['advisor', 'org_admin', 'superadmin']:
            return jsonify({'success': False, 'error': 'User is not an advisor or admin'}), 400

        # Verify student belongs to org
        student = supabase.table('users')\
            .select('id, role, org_role, organization_id')\
            .eq('id', student_id)\
            .single()\
            .execute()

        if not student.data:
            return jsonify({'success': False, 'error': 'Student not found'}), 404

        if student.data.get('organization_id') != org_id:
            return jsonify({'success': False, 'error': 'Student not in this organization'}), 403

        effective_student_role = get_effective_role(student.data)
        if effective_student_role != 'student':
            return jsonify({'success': False, 'error': 'User is not a student'}), 400

        # Check if assignment already exists
        existing = supabase.table('advisor_student_assignments')\
            .select('id, is_active')\
            .eq('advisor_id', advisor_id)\
            .eq('student_id', student_id)\
            .execute()

        if existing.data and len(existing.data) > 0:
            if not existing.data[0].get('is_active'):
                supabase.table('advisor_student_assignments')\
                    .update({
                        'is_active': True,
                        'assigned_at': datetime.utcnow().isoformat(),
                        'assigned_by': current_user_id
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
            'assigned_by': current_user_id,
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
        logger.error(f"Error in assign_org_student_to_advisor: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to assign student'}), 500


@bp.route('/<org_id>/advisors/<advisor_id>/students/<student_id>', methods=['DELETE'])
@require_org_admin
def unassign_org_student_from_advisor(current_user_id, current_org_id, is_superadmin, org_id, advisor_id, student_id):
    """Remove a student assignment from an advisor"""
    supabase = get_supabase_admin_client()

    try:
        # Verify student belongs to org
        student = supabase.table('users')\
            .select('id, organization_id')\
            .eq('id', student_id)\
            .single()\
            .execute()

        if not student.data or (student.data.get('organization_id') != org_id and not is_superadmin):
            return jsonify({'success': False, 'error': 'Student not in this organization'}), 403

        # Find the assignment
        assignment = supabase.table('advisor_student_assignments')\
            .select('id')\
            .eq('advisor_id', advisor_id)\
            .eq('student_id', student_id)\
            .eq('is_active', True)\
            .execute()

        if not assignment.data or len(assignment.data) == 0:
            return jsonify({'success': False, 'error': 'Assignment not found'}), 404

        # Deactivate the assignment
        supabase.table('advisor_student_assignments')\
            .update({'is_active': False})\
            .eq('id', assignment.data[0]['id'])\
            .execute()

        return jsonify({
            'success': True,
            'message': 'Student unassigned from advisor successfully'
        })

    except Exception as e:
        logger.error(f"Error in unassign_org_student_from_advisor: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to unassign student'}), 500


@bp.route('/<org_id>/students/unassigned', methods=['GET'])
@require_org_admin
def get_org_unassigned_students(current_user_id, current_org_id, is_superadmin, org_id):
    """Get list of students in the org who are not assigned to any advisor"""
    supabase = get_supabase_admin_client()

    try:
        # Get all students in this org (org users have role='org_managed', actual role in org_role)
        all_students = supabase.table('users')\
            .select('id, display_name, first_name, last_name, email')\
            .eq('organization_id', org_id)\
            .eq('org_role', 'student')\
            .order('display_name')\
            .execute()

        student_ids = [s['id'] for s in all_students.data]

        if not student_ids:
            return jsonify({
                'success': True,
                'students': [],
                'total': 0
            })

        # Get all active assignments for these students
        assignments = supabase.table('advisor_student_assignments')\
            .select('student_id')\
            .eq('is_active', True)\
            .in_('student_id', student_ids)\
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
        logger.error(f"Error in get_org_unassigned_students: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to retrieve unassigned students'}), 500


@bp.route('/<org_id>/parent-connections/links', methods=['GET'])
@require_org_admin
def get_org_parent_links(current_user_id, current_org_id, is_superadmin, org_id):
    """Get all parent-student connections for students in this organization"""
    supabase = get_supabase_admin_client()

    try:
        # Get all students in this org (org users have role='org_managed', actual role in org_role)
        org_students = supabase.table('users')\
            .select('id')\
            .eq('organization_id', org_id)\
            .eq('org_role', 'student')\
            .execute()

        student_ids = [s['id'] for s in org_students.data]

        if not student_ids:
            return jsonify({
                'success': True,
                'links': [],
                'total': 0
            })

        # Get parent-student links for these students using correct schema
        links = supabase.table('parent_student_links').select('''
            id,
            parent_user_id,
            student_user_id,
            verified_by_admin_id,
            verified_at,
            admin_notes,
            created_at,
            parent:users!parent_student_links_parent_user_id_fkey(
                id,
                first_name,
                last_name,
                email
            ),
            student:users!parent_student_links_student_user_id_fkey(
                id,
                first_name,
                last_name,
                email
            )
        ''')\
            .in_('student_user_id', student_ids)\
            .order('created_at', desc=True)\
            .execute()

        return jsonify({
            'success': True,
            'links': links.data,
            'total': len(links.data)
        })

    except Exception as e:
        logger.error(f"Error in get_org_parent_links: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to retrieve parent-student links'}), 500


@bp.route('/<org_id>/parent-connections/links/<link_id>', methods=['DELETE'])
@require_org_admin
def disconnect_org_parent_link(current_user_id, current_org_id, is_superadmin, org_id, link_id):
    """Disconnect a parent-student link"""
    supabase = get_supabase_admin_client()

    try:
        # Verify the link exists and student is in this org
        link = supabase.table('parent_student_links')\
            .select('id, student_user_id')\
            .eq('id', link_id)\
            .single()\
            .execute()

        if not link.data:
            return jsonify({'success': False, 'error': 'Link not found'}), 404

        student = supabase.table('users')\
            .select('organization_id')\
            .eq('id', link.data['student_user_id'])\
            .single()\
            .execute()

        if not student.data or (student.data.get('organization_id') != org_id and not is_superadmin):
            return jsonify({'success': False, 'error': 'Student not in this organization'}), 403

        # Delete the link
        supabase.table('parent_student_links')\
            .delete()\
            .eq('id', link_id)\
            .execute()

        return jsonify({
            'success': True,
            'message': 'Parent-student link disconnected'
        })

    except Exception as e:
        logger.error(f"Error in disconnect_org_parent_link: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to disconnect link'}), 500


@bp.route('/<org_id>/parent-connections/manual-link', methods=['POST'])
@require_org_admin
def create_org_manual_parent_link(current_user_id, current_org_id, is_superadmin, org_id):
    """Create a manual parent-student connection"""
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        parent_user_id = data.get('parent_user_id')
        student_user_id = data.get('student_user_id')
        admin_notes = data.get('admin_notes', '')

        if not parent_user_id or not student_user_id:
            return jsonify({'success': False, 'error': 'parent_user_id and student_user_id are required'}), 400

        # Verify student is in this org
        student = supabase.table('users')\
            .select('id, organization_id, role, org_role')\
            .eq('id', student_user_id)\
            .single()\
            .execute()

        if not student.data:
            return jsonify({'success': False, 'error': 'Student not found'}), 404

        if student.data.get('organization_id') != org_id and not is_superadmin:
            return jsonify({'success': False, 'error': 'Student not in this organization'}), 403

        effective_student_role = get_effective_role(student.data)
        if effective_student_role != 'student':
            return jsonify({'success': False, 'error': 'User is not a student'}), 400

        # Verify parent exists and has parent role
        parent = supabase.table('users')\
            .select('id, role, org_role')\
            .eq('id', parent_user_id)\
            .single()\
            .execute()

        if not parent.data:
            return jsonify({'success': False, 'error': 'Parent not found'}), 404

        effective_parent_role = get_effective_role(parent.data)
        if effective_parent_role != 'parent':
            return jsonify({'success': False, 'error': 'User is not a parent'}), 400

        # Check if link already exists
        existing = supabase.table('parent_student_links')\
            .select('id')\
            .eq('parent_user_id', parent_user_id)\
            .eq('student_user_id', student_user_id)\
            .execute()

        if existing.data and len(existing.data) > 0:
            return jsonify({'success': False, 'error': 'Connection already exists'}), 409

        # Create verified link using RPC function
        link_response = supabase.rpc('create_verified_parent_link', {
            'p_parent_id': parent_user_id,
            'p_student_id': student_user_id,
            'p_admin_id': current_user_id,
            'p_notes': admin_notes
        }).execute()

        logger.info(f"Org admin {current_user_id} created link between parent {parent_user_id} and student {student_user_id}")

        return jsonify({
            'success': True,
            'message': 'Parent-student connection created',
            'link_id': link_response.data
        })

    except Exception as e:
        logger.error(f"Error in create_org_manual_parent_link: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to create connection'}), 500


