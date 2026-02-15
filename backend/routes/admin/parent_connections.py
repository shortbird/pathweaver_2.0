"""
Admin routes for managing parent-student connections.
Handles connection request approval, rejection, and manual linking.

REPOSITORY MIGRATION: COMPLETE
- Uses ParentRepository exclusively for all data operations
- Uses UserRepository for user verification
"""
from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import ParentRepository, UserRepository
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError, NotFoundError, AuthorizationError

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_parent_connections', __name__, url_prefix='/api/admin/parent-connections')


def _verify_admin(user_id: str) -> None:
    """Verify user has admin access. Raises AuthorizationError if not."""
    user_repo = UserRepository()
    user = user_repo.find_by_id(user_id)
    if not user or user.get('role') != 'superadmin':
        raise AuthorizationError("Admin access required")


@bp.route('/requests', methods=['GET'])
@require_auth
def get_connection_requests(user_id):
    """
    Admin gets list of all parent connection requests.
    Supports filtering by status, parent_id, student_id, and date range.
    """
    try:
        _verify_admin(user_id)

        supabase = get_supabase_admin_client()
        parent_repo = ParentRepository(client=supabase)

        # Get filter parameters
        filters = {
            'status': request.args.get('status'),
            'parent_id': request.args.get('parent_id'),
            'start_date': request.args.get('start_date'),
            'end_date': request.args.get('end_date')
        }
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))

        result = parent_repo.get_all_connection_requests(
            filters=filters,
            page=page,
            limit=limit
        )

        return jsonify(result), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting connection requests: {str(e)}")
        return jsonify({'error': 'Failed to get connection requests'}), 500


@bp.route('/requests/<request_id>/approve', methods=['POST'])
@require_auth
def approve_connection_request(user_id, request_id):
    """
    Admin approves a parent connection request.
    Creates parent_student_links record and updates request status.
    """
    try:
        _verify_admin(user_id)

        data = request.get_json()
        admin_notes = data.get('admin_notes', '').strip()

        supabase = get_supabase_admin_client()
        parent_repo = ParentRepository(client=supabase)

        # Get connection request
        conn_request = parent_repo.get_connection_request(request_id)
        if not conn_request:
            raise NotFoundError("Connection request not found")

        # Check if already processed
        if conn_request['status'] != 'pending':
            return jsonify({'error': 'This request has already been processed'}), 400

        # Check if student was auto-matched
        if not conn_request['matched_student_id']:
            return jsonify({'error': 'No student matched for this request. Student must create account first.'}), 400

        # Check if link already exists
        if parent_repo.link_exists(conn_request['parent_user_id'], conn_request['matched_student_id']):
            return jsonify({'error': 'Connection already exists between this parent and student'}), 400

        # Approve the request using repository
        link_id = parent_repo.approve_connection_request(request_id, user_id, admin_notes)

        logger.info(f"Admin {user_id} approved connection request {request_id}")

        return jsonify({
            'message': 'Connection request approved successfully',
            'link_id': link_id
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error approving connection request: {str(e)}")
        return jsonify({'error': 'Failed to approve connection request'}), 500


@bp.route('/requests/<request_id>/reject', methods=['POST'])
@require_auth
def reject_connection_request(user_id, request_id):
    """
    Admin rejects a parent connection request.
    Updates request status with rejection reason.
    """
    try:
        _verify_admin(user_id)

        data = request.get_json()
        admin_notes = data.get('admin_notes', '').strip()

        if not admin_notes:
            raise ValidationError("Admin notes are required when rejecting a request")

        supabase = get_supabase_admin_client()
        parent_repo = ParentRepository(client=supabase)

        # Reject the request using repository
        parent_repo.reject_connection_request(request_id, user_id, admin_notes)

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
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error rejecting connection request: {str(e)}")
        return jsonify({'error': 'Failed to reject connection request'}), 500


@bp.route('/links', methods=['GET'])
@require_auth
def get_active_links(user_id):
    """
    Admin gets list of all active parent-student connections.
    Supports filtering by parent_id, student_id, admin_verified status.
    """
    try:
        _verify_admin(user_id)

        supabase = get_supabase_admin_client()
        parent_repo = ParentRepository(client=supabase)

        # Get filter parameters
        admin_verified = request.args.get('admin_verified')
        filters = {
            'parent_id': request.args.get('parent_id'),
            'student_id': request.args.get('student_id'),
            'admin_verified': admin_verified.lower() == 'true' if admin_verified else None
        }
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))

        result = parent_repo.get_all_active_links(
            filters=filters,
            page=page,
            limit=limit
        )

        return jsonify(result), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting active links: {str(e)}")
        return jsonify({'error': 'Failed to get active links'}), 500


@bp.route('/links/<link_id>', methods=['DELETE'])
@require_auth
def disconnect_link(user_id, link_id):
    """
    Admin disconnects a parent-student link.
    Hard delete from parent_student_links table.
    """
    try:
        _verify_admin(user_id)

        supabase = get_supabase_admin_client()
        parent_repo = ParentRepository(client=supabase)

        # Delete the link using repository
        parent_repo.delete_link(link_id, user_id)

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
        return jsonify({'error': 'Failed to disconnect link'}), 500


@bp.route('/manual-link', methods=['POST'])
@require_auth
def create_manual_link(user_id):
    """
    Admin manually creates a parent-student connection.
    Bypasses the normal request/approval workflow.
    """
    try:
        _verify_admin(user_id)

        data = request.get_json()
        parent_user_id = data.get('parent_user_id')
        student_user_id = data.get('student_user_id')
        admin_notes = data.get('admin_notes', '').strip()

        if not parent_user_id or not student_user_id:
            raise ValidationError("Both parent_user_id and student_user_id are required")

        supabase = get_supabase_admin_client()
        parent_repo = ParentRepository(client=supabase)

        # Verify parent user exists and has parent role
        parent_user = parent_repo.verify_user_role(parent_user_id, 'parent')
        if not parent_user:
            raise ValidationError("Parent user not found or is not a parent account")

        # Verify student user exists and has student role
        student_user = parent_repo.verify_user_role(student_user_id, 'student')
        if not student_user:
            raise ValidationError("Student user not found or is not a student account")

        # Create manual link using repository
        link_id = parent_repo.create_manual_link(parent_user_id, student_user_id, user_id, admin_notes)

        logger.info(f"Admin {user_id} manually created link between parent {parent_user_id} and student {student_user_id}")

        return jsonify({
            'message': 'Manual connection created successfully',
            'link_id': link_id
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating manual link: {str(e)}")
        return jsonify({'error': 'Failed to create manual link'}), 500
