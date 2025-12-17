"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- 30+ direct database calls for parent-student linking operations
- Complex JOIN queries with nested select (users table)
- Could create ParentLinkingRepository with methods:
  - get_linked_children(parent_id)
  - get_parent_links(student_id)
  - create_admin_link(parent_id, student_id, admin_id)
  - delete_link(link_id, admin_id)
  - submit_connection_requests(parent_id, children_data)
  - get_pending_requests(student_id)
  - approve_connection(link_id, student_id)
  - reject_connection(link_id, student_id)
- Note: Already uses ParentRepository (imported but unused), needs integration

Parent-Student Linking API routes.
Admin-only workflow for connecting parents to students.
Once linked, connections are permanent.

NOTE: Admin client usage justified throughout this file for parent-student linking operations.
Managing parent-student relationships requires cross-user operations and elevated privileges.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from database import get_supabase_admin_client
from backend.repositories import ParentRepository
from utils.auth.decorators import require_auth, require_admin
from middleware.error_handler import ValidationError, NotFoundError, AuthorizationError
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('parent_linking', __name__, url_prefix='/api/parents')


# ============================================================================
# PARENT ENDPOINTS - View linked students
# ============================================================================

@bp.route('/my-children', methods=['GET'])
@require_auth
def get_linked_children(user_id):
    """
    Get list of students linked to this parent account.
    Returns student details and learning progress.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get all linked students (only approved links)
        links_response = supabase.table('parent_student_links').select('''
            id,
            student_user_id,
            created_at,
            users!parent_student_links_student_user_id_fkey(
                id,
                first_name,
                last_name,
                avatar_url,
                level,
                total_xp
            )
        ''').eq('parent_user_id', user_id).eq('status', 'approved').execute()

        if not links_response.data:
            return jsonify({'children': []}), 200

        # Build response from joined data
        children = []
        for link in links_response.data:
            student = link.get('users')
            if student:
                children.append({
                    'link_id': link['id'],
                    'student_id': link['student_user_id'],
                    'student_first_name': student.get('first_name'),
                    'student_last_name': student.get('last_name'),
                    'student_avatar_url': student.get('avatar_url'),
                    'student_level': student.get('level', 1),
                    'student_total_xp': student.get('total_xp', 0),
                    'linked_since': link['created_at']
                })

        return jsonify({'children': children}), 200

    except Exception as e:
        logger.error(f"Error getting linked children: {str(e)}")
        return jsonify({'error': 'Failed to fetch linked children'}), 500


@bp.route('/my-links', methods=['GET'])
@require_auth
def get_parent_links(user_id):
    """
    Student view: Get list of linked parents.
    Returns empty list if no parents linked.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get linked parents
        active_links_response = supabase.table('parent_student_links').select('''
            id,
            parent_user_id,
            created_at,
            users!parent_student_links_parent_user_id_fkey(
                id,
                first_name,
                last_name,
                email,
                avatar_url
            )
        ''').eq('student_user_id', user_id).execute()

        linked_parents = []
        if active_links_response.data:
            for link in active_links_response.data:
                parent = link.get('users')
                if parent:
                    linked_parents.append({
                        'link_id': link['id'],
                        'parent_id': link['parent_user_id'],
                        'parent_first_name': parent.get('first_name'),
                        'parent_last_name': parent.get('last_name'),
                        'parent_email': parent.get('email'),
                        'parent_avatar_url': parent.get('avatar_url'),
                        'linked_since': link['created_at']
                    })

        return jsonify({
            'linked_parents': linked_parents
        }), 200

    except Exception as e:
        logger.error(f"Error getting parent links: {str(e)}")
        return jsonify({'error': 'Failed to fetch parent links'}), 500


# ============================================================================
# ADMIN ENDPOINTS - Manage parent-student connections
# ============================================================================

@bp.route('/admin/link', methods=['POST'])
@require_admin
def admin_create_link(admin_id):
    """
    Admin creates a parent-student link.
    Links are permanent once created.

    Request body:
    {
        "parent_user_id": "uuid",
        "student_user_id": "uuid"
    }
    """
    try:
        data = request.get_json()
        parent_user_id = data.get('parent_user_id')
        student_user_id = data.get('student_user_id')

        if not parent_user_id or not student_user_id:
            raise ValidationError("Both parent_user_id and student_user_id are required")

        supabase = get_supabase_admin_client()

        # Verify parent exists and has parent role
        parent = supabase.table('users').select('id, role').eq('id', parent_user_id).execute()
        if not parent.data:
            raise NotFoundError("Parent user not found")
        if parent.data[0].get('role') != 'parent':
            raise ValidationError("User must have parent role")

        # Verify student exists and has student role
        student = supabase.table('users').select('id, role').eq('id', student_user_id).execute()
        if not student.data:
            raise NotFoundError("Student user not found")
        if student.data[0].get('role') != 'student':
            raise ValidationError("User must have student role")

        # Check if link already exists
        existing_link = supabase.table('parent_student_links').select('id').eq(
            'parent_user_id', parent_user_id
        ).eq('student_user_id', student_user_id).execute()

        if existing_link.data:
            return jsonify({'error': 'Link already exists'}), 400

        # Create link (permanent)
        link_data = {
            'parent_user_id': parent_user_id,
            'student_user_id': student_user_id,
            'admin_verified': True,
            'verified_by_admin_id': admin_id,
            'verified_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('parent_student_links').insert(link_data).execute()

        logger.info(f"Admin {admin_id} linked parent {parent_user_id} to student {student_user_id}")

        return jsonify({
            'message': 'Parent-student link created successfully',
            'link_id': result.data[0]['id']
        }), 201

    except (ValidationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating parent-student link: {str(e)}")
        return jsonify({'error': 'Failed to create link'}), 500


@bp.route('/admin/link/<link_id>', methods=['DELETE'])
@require_admin
def admin_delete_link(admin_id, link_id):
    """
    Admin deletes a parent-student link.
    This is the only way to remove a link.
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify link exists
        link = supabase.table('parent_student_links').select('id').eq('id', link_id).execute()
        if not link.data:
            raise NotFoundError("Link not found")

        # Delete link
        supabase.table('parent_student_links').delete().eq('id', link_id).execute()

        logger.info(f"Admin {admin_id} deleted parent-student link {link_id}")

        return jsonify({'message': 'Link deleted successfully'}), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error deleting parent-student link: {str(e)}")
        return jsonify({'error': 'Failed to delete link'}), 500


@bp.route('/admin/links', methods=['GET'])
@require_admin
def admin_list_links(admin_id):
    """
    Admin views all parent-student links.
    Supports filtering by parent or student.

    Query params:
    - parent_user_id: Filter by parent
    - student_user_id: Filter by student
    """
    try:
        supabase = get_supabase_admin_client()

        parent_filter = request.args.get('parent_user_id')
        student_filter = request.args.get('student_user_id')

        # Build query
        query = supabase.table('parent_student_links').select('''
            id,
            parent_user_id,
            student_user_id,
            created_at,
            admin_verified,
            verified_at,
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
        ''')

        if parent_filter:
            query = query.eq('parent_user_id', parent_filter)
        if student_filter:
            query = query.eq('student_user_id', student_filter)

        result = query.order('created_at', desc=True).execute()

        links = []
        for link in result.data:
            parent_data = link.get('parent', {})
            student_data = link.get('student', {})

            links.append({
                'link_id': link['id'],
                'parent': {
                    'id': link['parent_user_id'],
                    'first_name': parent_data.get('first_name'),
                    'last_name': parent_data.get('last_name'),
                    'email': parent_data.get('email')
                },
                'student': {
                    'id': link['student_user_id'],
                    'first_name': student_data.get('first_name'),
                    'last_name': student_data.get('last_name'),
                    'email': student_data.get('email')
                },
                'created_at': link['created_at'],
                'admin_verified': link.get('admin_verified', False),
                'verified_at': link.get('verified_at')
            })

        return jsonify({'links': links}), 200

    except Exception as e:
        logger.error(f"Error listing parent-student links: {str(e)}")
        return jsonify({'error': 'Failed to list links'}), 500


# ============================================================================
# PARENT-INITIATED CONNECTION REQUESTS (NEW)
# ============================================================================

@bp.route('/submit-connection-requests', methods=['POST'])
@require_auth
def submit_connection_requests(user_id):
    """
    Parent submits connection requests for one or more students (13+).
    Searches for existing student accounts by email and creates pending connections.

    Request body:
    {
        "children": [
            {
                "first_name": "Alex",
                "last_name": "Smith",
                "email": "alex@example.com"
            }
        ]
    }

    Returns:
    {
        "submitted_count": 1,
        "auto_matched_count": 1,
        "pending_approval_count": 0,
        "details": [...]
    }
    """
    try:
        data = request.get_json()
        if not data or 'children' not in data:
            raise ValidationError("Request must include 'children' array")

        children = data.get('children', [])
        if not isinstance(children, list) or len(children) == 0:
            raise ValidationError("At least one child must be provided")

        supabase = get_supabase_admin_client()

        # Verify requesting user is a parent
        parent = supabase.table('users').select('id, role, first_name, last_name, email').eq('id', user_id).execute()
        if not parent.data or parent.data[0].get('role') != 'parent':
            raise AuthorizationError("Only parent accounts can submit connection requests")

        parent_data = parent.data[0]
        results = []
        auto_matched = 0
        pending_approval = 0

        for child in children:
            first_name = child.get('first_name', '').strip()
            last_name = child.get('last_name', '').strip()
            email = child.get('email', '').strip().lower()

            if not first_name or not last_name or not email:
                results.append({
                    'email': email,
                    'status': 'error',
                    'message': 'Missing required fields'
                })
                continue

            # Search for existing student account by email
            student_search = supabase.table('users').select(
                'id, first_name, last_name, email, role, is_dependent, managed_by_parent_id'
            ).eq('email', email).execute()

            if not student_search.data or len(student_search.data) == 0:
                # No account found - parent should create dependent profile instead
                results.append({
                    'email': email,
                    'status': 'not_found',
                    'message': f'No student account found for {email}. If they are under 13, create a dependent profile instead.'
                })
                continue

            student = student_search.data[0]

            # Check if student is actually a dependent (shouldn't use this flow)
            if student.get('is_dependent'):
                results.append({
                    'email': email,
                    'status': 'error',
                    'message': 'This is a dependent profile. Dependent profiles cannot be connected via requests.'
                })
                continue

            # Check if student has student role
            if student.get('role') != 'student':
                results.append({
                    'email': email,
                    'status': 'error',
                    'message': f'{email} is not a student account (role: {student.get("role")})'
                })
                continue

            # Check if link already exists
            existing_link = supabase.table('parent_student_links').select('id, status').eq(
                'parent_user_id', user_id
            ).eq('student_user_id', student['id']).execute()

            if existing_link.data:
                link_status = existing_link.data[0].get('status')
                results.append({
                    'email': email,
                    'status': 'already_exists',
                    'message': f'Connection already exists (status: {link_status})'
                })
                continue

            # Admin will handle connection manually - just return success message
            pending_approval += 1

            results.append({
                'email': email,
                'student_name': f"{first_name} {last_name}",
                'status': 'pending_admin_review',
                'message': f'Request received. Please contact support@optioeducation.com with your name and the student\'s email to complete the connection.'
            })

        logger.info(f"Parent {user_id} submitted {len(children)} connection requests: {auto_matched} auto-matched, {pending_approval} pending approval")

        return jsonify({
            'success': True,
            'submitted_count': len(children),
            'auto_matched_count': auto_matched,
            'pending_approval_count': pending_approval,
            'details': results
        }), 200

    except (ValidationError, AuthorizationError) as e:
        logger.warning(f"Validation error submitting connection requests: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error submitting connection requests: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to submit connection requests'}), 500


# ============================================================================
# STUDENT ENDPOINTS - Approve/Reject Connection Requests
# ============================================================================

@bp.route('/pending-requests', methods=['GET'])
@require_auth
def get_pending_requests(user_id):
    """
    Student views pending parent connection requests.
    Returns list of parents requesting to link to this student's account.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get pending requests where this user is the student
        pending_response = supabase.table('parent_student_links').select('''
            id,
            parent_user_id,
            created_at,
            users!parent_student_links_parent_user_id_fkey(
                id,
                first_name,
                last_name,
                email,
                avatar_url
            )
        ''').eq('student_user_id', user_id).eq('status', 'pending_approval').execute()

        pending_requests = []
        if pending_response.data:
            for link in pending_response.data:
                parent = link.get('users')
                if parent:
                    pending_requests.append({
                        'link_id': link['id'],
                        'parent_id': link['parent_user_id'],
                        'parent_first_name': parent.get('first_name'),
                        'parent_last_name': parent.get('last_name'),
                        'parent_email': parent.get('email'),
                        'parent_avatar_url': parent.get('avatar_url'),
                        'requested_at': link['created_at']
                    })

        return jsonify({
            'success': True,
            'pending_requests': pending_requests,
            'count': len(pending_requests)
        }), 200

    except Exception as e:
        logger.error(f"Error getting pending requests: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to fetch pending requests'}), 500


@bp.route('/approve-request/<link_id>', methods=['POST'])
@require_auth
def approve_connection_request(user_id, link_id):
    """
    Student approves a parent connection request.
    Updates link status from 'pending_approval' to 'approved'.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get the link and verify it's pending and belongs to this student
        link_response = supabase.table('parent_student_links').select('''
            id, parent_user_id, student_user_id, status
        ''').eq('id', link_id).single().execute()

        if not link_response.data:
            raise NotFoundError("Connection request not found")

        link = link_response.data

        # Verify this student owns the request
        if link['student_user_id'] != user_id:
            raise AuthorizationError("You can only approve requests for your own account")

        # Verify status is pending
        if link['status'] != 'pending_approval':
            return jsonify({
                'success': False,
                'error': f'This request has already been {link["status"]}'
            }), 400

        # Update status to approved
        supabase.table('parent_student_links').update({
            'status': 'approved',
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', link_id).execute()

        logger.info(f"Student {user_id} approved parent connection request {link_id}")

        return jsonify({
            'success': True,
            'message': 'Parent connection approved successfully'
        }), 200

    except (NotFoundError, AuthorizationError) as e:
        logger.warning(f"Authorization error approving request: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error approving connection request: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to approve connection request'}), 500


@bp.route('/reject-request/<link_id>', methods=['POST'])
@require_auth
def reject_connection_request(user_id, link_id):
    """
    Student rejects a parent connection request.
    Updates link status from 'pending_approval' to 'rejected'.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get the link and verify it's pending and belongs to this student
        link_response = supabase.table('parent_student_links').select('''
            id, parent_user_id, student_user_id, status
        ''').eq('id', link_id).single().execute()

        if not link_response.data:
            raise NotFoundError("Connection request not found")

        link = link_response.data

        # Verify this student owns the request
        if link['student_user_id'] != user_id:
            raise AuthorizationError("You can only reject requests for your own account")

        # Verify status is pending
        if link['status'] != 'pending_approval':
            return jsonify({
                'success': False,
                'error': f'This request has already been {link["status"]}'
            }), 400

        # Update status to rejected
        supabase.table('parent_student_links').update({
            'status': 'rejected',
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', link_id).execute()

        logger.info(f"Student {user_id} rejected parent connection request {link_id}")

        return jsonify({
            'success': True,
            'message': 'Parent connection rejected'
        }), 200

    except (NotFoundError, AuthorizationError) as e:
        logger.warning(f"Authorization error rejecting request: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error rejecting connection request: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to reject connection request'}), 500
