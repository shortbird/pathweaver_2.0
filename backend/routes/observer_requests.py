"""
Observer Requests Routes
Handles student requests to add observers to their account

REPOSITORY MIGRATION: MIGRATION CANDIDATE
- Multiple direct database calls to 'observer_requests' table (5+ calls)
- Simple CRUD operations suitable for repository pattern
- Could create ObserverRequestRepository with methods:
  - create_request(user_id, observer_data)
  - get_user_requests(user_id)
  - get_all_requests() (admin only)
  - update_request_status(request_id, status, reviewed_by)
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from utils.auth.decorators import require_auth, require_admin
from database import get_authenticated_supabase_client, get_supabase_admin_client
import logging

logger = logging.getLogger(__name__)
observer_requests_bp = Blueprint('observer_requests', __name__)


@observer_requests_bp.route('/api/observer-requests', methods=['POST'])
@require_auth
def create_observer_request(user_id, user_role):
    """
    Create a new observer request
    Student submits request for admin review
    """
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['observer_name', 'observer_email', 'relationship']
        missing_fields = [field for field in required_fields if not data.get(field)]

        if missing_fields:
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {", ".join(missing_fields)}'
            }), 400

        # Validate email format
        observer_email = data['observer_email'].strip().lower()
        if '@' not in observer_email or '.' not in observer_email:
            return jsonify({
                'success': False,
                'error': 'Invalid email address'
            }), 400

        # Validate relationship
        valid_relationships = ['teacher', 'advisor', 'mentor', 'counselor', 'coach', 'other']
        if data['relationship'] not in valid_relationships:
            return jsonify({
                'success': False,
                'error': f'Invalid relationship. Must be one of: {", ".join(valid_relationships)}'
            }), 400

        # Admin client: Cross-user invitation creation (ADR-002, Rule 5)
        supabase = get_supabase_admin_client()

        # Check for duplicate pending requests
        existing = supabase.table('observer_requests').select('id').eq('user_id', user_id).eq('observer_email', observer_email).eq('status', 'pending').execute()

        if existing.data:
            return jsonify({
                'success': False,
                'error': 'You already have a pending request for this observer'
            }), 400

        # Create observer request
        request_data = {
            'user_id': user_id,
            'observer_name': data['observer_name'].strip(),
            'observer_email': observer_email,
            'relationship': data['relationship'],
            'message': data.get('message', '').strip() if data.get('message') else None,
            'status': 'pending',
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('observer_requests').insert(request_data).execute()

        if not result.data:
            logger.error("Failed to create observer request - no data returned")
            return jsonify({
                'success': False,
                'error': 'Failed to create observer request'
            }), 500

        logger.info(f"Observer request created: user_id={user_id}, observer_email={observer_email}")

        return jsonify({
            'success': True,
            'message': 'Observer request submitted for admin review',
            'request': result.data[0]
        }), 201

    except Exception as e:
        logger.error(f"Error creating observer request: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create observer request: {str(e)}'
        }), 500


@observer_requests_bp.route('/api/observer-requests', methods=['GET'])
@require_auth
def get_observer_requests(user_id, user_role):
    """
    Get observer requests for the authenticated user
    Students see their own requests, admins see all
    """
    try:
        supabase = get_authenticated_supabase_client()

        # Build query based on role
        query = supabase.table('observer_requests').select('*')

        # Students only see their own requests
        if user_role != 'superadmin':
            query = query.eq('user_id', user_id)

        # Order by most recent first
        query = query.order('created_at', desc=True)

        result = query.execute()

        return jsonify({
            'success': True,
            'requests': result.data
        }), 200

    except Exception as e:
        logger.error(f"Error fetching observer requests: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to fetch observer requests: {str(e)}'
        }), 500


@observer_requests_bp.route('/api/admin/observer-requests/<request_id>', methods=['PUT'])
@require_admin
def update_observer_request(user_id, user_role, request_id):
    """
    Update observer request status (admin only)
    Used to approve or reject requests
    """
    try:
        data = request.get_json()

        # Validate status
        if 'status' not in data:
            return jsonify({
                'success': False,
                'error': 'Status is required'
            }), 400

        if data['status'] not in ['approved', 'rejected']:
            return jsonify({
                'success': False,
                'error': 'Status must be "approved" or "rejected"'
            }), 400

        supabase = get_supabase_admin_client()

        # Update request
        update_data = {
            'status': data['status'],
            'reviewed_by': user_id,
            'reviewed_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('observer_requests').update(update_data).eq('id', request_id).execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Observer request not found'
            }), 404

        logger.info(f"Observer request {request_id} {data['status']} by admin {user_id}")

        return jsonify({
            'success': True,
            'message': f'Observer request {data["status"]}',
            'request': result.data[0]
        }), 200

    except Exception as e:
        logger.error(f"Error updating observer request: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update observer request: {str(e)}'
        }), 500


@observer_requests_bp.route('/api/admin/observer-requests', methods=['GET'])
@require_admin
def get_all_observer_requests(user_id, user_role):
    """
    Get all observer requests (admin only)
    Includes user information for display
    """
    try:
        supabase = get_supabase_admin_client()

        # Get requests with user information
        result = supabase.table('observer_requests').select(
            '*, user:users(id, first_name, last_name, email)'
        ).order('created_at', desc=True).execute()

        return jsonify({
            'success': True,
            'requests': result.data
        }), 200

    except Exception as e:
        logger.error(f"Error fetching all observer requests: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to fetch observer requests: {str(e)}'
        }), 500
