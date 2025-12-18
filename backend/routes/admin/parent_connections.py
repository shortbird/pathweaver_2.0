"""
REPOSITORY MIGRATION: PARTIALLY MIGRATED - Needs Completion
- Already imports ParentRepository (line 8)
- BUT: Direct database calls still used throughout
- Mixed pattern creates inconsistency
- Should use ParentRepository methods for all connection operations
- Parent linking logic exists but not fully utilized

Recommendation: Complete migration by using existing ParentRepository exclusively

Admin routes for managing parent-student connections.
Handles connection request approval, rejection, and manual linking.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from database import get_supabase_admin_client
from backend.repositories import ParentRepository
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError, NotFoundError, AuthorizationError
import uuid
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_parent_connections', __name__, url_prefix='/api/admin/parent-connections')


@bp.route('/requests', methods=['GET'])
@require_auth
def get_connection_requests(user_id):
    """
    Admin gets list of all parent connection requests.
    Supports filtering by status, parent_id, student_id, and date range.
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify admin role
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user_response.data or user_response.data.get('role') != 'admin':
            raise AuthorizationError("Admin access required")

        # Get filter parameters
        status = request.args.get('status')  # pending, approved, rejected
        parent_id = request.args.get('parent_id')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))

        # Build query
        query = supabase.table('parent_connection_requests').select('''
            id,
            parent_user_id,
            child_first_name,
            child_last_name,
            child_email,
            matched_student_id,
            status,
            admin_notes,
            reviewed_by_admin_id,
            reviewed_at,
            created_at,
            parent_user:users!parent_connection_requests_parent_user_id_fkey(
                id,
                first_name,
                last_name,
                email
            ),
            matched_student:users!parent_connection_requests_matched_student_id_fkey(
                id,
                first_name,
                last_name,
                email
            ),
            reviewed_by:users!parent_connection_requests_reviewed_by_admin_id_fkey(
                id,
                first_name,
                last_name
            )
        ''', count='exact')

        # Apply filters
        if status:
            query = query.eq('status', status)
        if parent_id:
            query = query.eq('parent_user_id', parent_id)
        if start_date:
            query = query.gte('created_at', start_date)
        if end_date:
            query = query.lte('created_at', end_date)

        # Apply pagination
        offset = (page - 1) * limit
        query = query.order('created_at', desc=True).range(offset, offset + limit - 1)

        response = query.execute()

        return jsonify({
            'requests': response.data,
            'total_count': response.count,
            'page': page,
            'limit': limit
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting connection requests: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to get connection requests'}), 500


@bp.route('/requests/<request_id>/approve', methods=['POST'])
@require_auth
def approve_connection_request(user_id, request_id):
    """
    Admin approves a parent connection request.
    Creates parent_student_links record and updates request status.
    """
    try:
        data = request.get_json()
        admin_notes = data.get('admin_notes', '').strip()

        supabase = get_supabase_admin_client()

        # Verify admin role
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user_response.data or user_response.data.get('role') != 'admin':
            raise AuthorizationError("Admin access required")

        # Get connection request
        request_response = supabase.table('parent_connection_requests').select('''
            id,
            parent_user_id,
            child_first_name,
            child_last_name,
            child_email,
            matched_student_id,
            status
        ''').eq('id', request_id).single().execute()

        if not request_response.data:
            raise NotFoundError("Connection request not found")

        conn_request = request_response.data

        # Check if already processed
        if conn_request['status'] != 'pending':
            return jsonify({'error': 'This request has already been processed'}), 400

        # Check if student was auto-matched
        if not conn_request['matched_student_id']:
            return jsonify({'error': 'No student matched for this request. Student must create account first.'}), 400

        # Check if link already exists
        existing_link = supabase.table('parent_student_links').select('id').eq(
            'parent_user_id', conn_request['parent_user_id']
        ).eq('student_user_id', conn_request['matched_student_id']).execute()

        if existing_link.data:
            return jsonify({'error': 'Connection already exists between this parent and student'}), 400

        # Create verified parent-student link using helper function
        link_response = supabase.rpc('create_verified_parent_link', {
            'p_parent_id': conn_request['parent_user_id'],
            'p_student_id': conn_request['matched_student_id'],
            'p_admin_id': user_id,
            'p_notes': admin_notes
        }).execute()

        # Update connection request status
        supabase.table('parent_connection_requests').update({
            'status': 'approved',
            'admin_notes': admin_notes,
            'reviewed_by_admin_id': user_id,
            'reviewed_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', request_id).execute()

        logger.info(f"Admin {user_id} approved connection request {request_id}")

        return jsonify({
            'message': 'Connection request approved successfully',
            'link_id': link_response.data
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error approving connection request: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to approve connection request'}), 500


@bp.route('/requests/<request_id>/reject', methods=['POST'])
@require_auth
def reject_connection_request(user_id, request_id):
    """
    Admin rejects a parent connection request.
    Updates request status with rejection reason.
    """
    try:
        data = request.get_json()
        admin_notes = data.get('admin_notes', '').strip()

        if not admin_notes:
            raise ValidationError("Admin notes are required when rejecting a request")

        supabase = get_supabase_admin_client()

        # Verify admin role
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user_response.data or user_response.data.get('role') != 'admin':
            raise AuthorizationError("Admin access required")

        # Get connection request
        request_response = supabase.table('parent_connection_requests').select(
            'id, status'
        ).eq('id', request_id).single().execute()

        if not request_response.data:
            raise NotFoundError("Connection request not found")

        conn_request = request_response.data

        # Check if already processed
        if conn_request['status'] != 'pending':
            return jsonify({'error': 'This request has already been processed'}), 400

        # Update connection request status
        supabase.table('parent_connection_requests').update({
            'status': 'rejected',
            'admin_notes': admin_notes,
            'reviewed_by_admin_id': user_id,
            'reviewed_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', request_id).execute()

        logger.info(f"Admin {user_id} rejected connection request {request_id}")

        return jsonify({
            'message': 'Connection request rejected'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error rejecting connection request: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to reject connection request'}), 500


@bp.route('/links', methods=['GET'])
@require_auth
def get_active_links(user_id):
    """
    Admin gets list of all active parent-student connections.
    Supports filtering by parent_id, student_id, admin_verified status.
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify admin role
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user_response.data or user_response.data.get('role') != 'admin':
            raise AuthorizationError("Admin access required")

        # Get filter parameters
        parent_id = request.args.get('parent_id')
        student_id = request.args.get('student_id')
        admin_verified = request.args.get('admin_verified')  # true/false
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))

        # Build query
        query = supabase.table('parent_student_links').select('''
            id,
            parent_user_id,
            student_user_id,
            admin_verified,
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
            ),
            verified_by:users!parent_student_links_verified_by_admin_id_fkey(
                id,
                first_name,
                last_name
            )
        ''', count='exact')

        # Apply filters
        if parent_id:
            query = query.eq('parent_user_id', parent_id)
        if student_id:
            query = query.eq('student_user_id', student_id)
        if admin_verified is not None:
            query = query.eq('admin_verified', admin_verified.lower() == 'true')

        # Apply pagination
        offset = (page - 1) * limit
        query = query.order('created_at', desc=True).range(offset, offset + limit - 1)

        response = query.execute()

        return jsonify({
            'links': response.data,
            'total_count': response.count,
            'page': page,
            'limit': limit
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting active links: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to get active links'}), 500


@bp.route('/links/<link_id>', methods=['DELETE'])
@require_auth
def disconnect_link(user_id, link_id):
    """
    Admin disconnects a parent-student link.
    Hard delete from parent_student_links table.
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify admin role
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user_response.data or user_response.data.get('role') != 'admin':
            raise AuthorizationError("Admin access required")

        # Get link to verify it exists
        link_response = supabase.table('parent_student_links').select('id').eq('id', link_id).execute()

        if not link_response.data:
            raise NotFoundError("Connection link not found")

        # Delete the link
        supabase.table('parent_student_links').delete().eq('id', link_id).execute()

        logger.info(f"Admin {user_id} disconnected parent link {link_id}")

        return jsonify({
            'message': 'Parent connection disconnected successfully'
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error disconnecting link: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to disconnect link'}), 500


@bp.route('/manual-link', methods=['POST'])
@require_auth
def create_manual_link(user_id):
    """
    Admin manually creates a parent-student connection.
    Bypasses the normal request/approval workflow.
    """
    try:
        data = request.get_json()
        parent_user_id = data.get('parent_user_id')
        student_user_id = data.get('student_user_id')
        admin_notes = data.get('admin_notes', '').strip()

        if not parent_user_id or not student_user_id:
            raise ValidationError("Both parent_user_id and student_user_id are required")

        supabase = get_supabase_admin_client()

        # Verify admin role
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user_response.data or user_response.data.get('role') != 'admin':
            raise AuthorizationError("Admin access required")

        # Verify parent user exists and has parent role
        parent_response = supabase.table('users').select('id, role').eq('id', parent_user_id).execute()
        if not parent_response.data:
            raise NotFoundError("Parent user not found")
        if parent_response.data[0].get('role') != 'parent':
            raise ValidationError("Specified user is not a parent account")

        # Verify student user exists and has student role
        student_response = supabase.table('users').select('id, role').eq('id', student_user_id).execute()
        if not student_response.data:
            raise NotFoundError("Student user not found")
        if student_response.data[0].get('role') != 'student':
            raise ValidationError("Specified user is not a student account")

        # Check if link already exists
        existing_link = supabase.table('parent_student_links').select('id').eq(
            'parent_user_id', parent_user_id
        ).eq('student_user_id', student_user_id).execute()

        if existing_link.data:
            return jsonify({'error': 'Connection already exists between this parent and student'}), 400

        # Create verified link using helper function
        link_response = supabase.rpc('create_verified_parent_link', {
            'p_parent_id': parent_user_id,
            'p_student_id': student_user_id,
            'p_admin_id': user_id,
            'p_notes': admin_notes
        }).execute()

        logger.info(f"Admin {user_id} manually created link between parent {parent_user_id} and student {student_user_id}")

        return jsonify({
            'message': 'Manual connection created successfully',
            'link_id': link_response.data
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error creating manual link: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to create manual link'}), 500
