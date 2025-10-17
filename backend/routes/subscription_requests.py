"""
Subscription Request Routes

Handles form-based subscription upgrade requests.
Replaces automated Stripe checkout with human-mediated communication.
"""

from flask import Blueprint, request, jsonify
from database import get_user_client
from utils.auth.decorators import require_auth
from services.email_service import email_service
import logging

logger = logging.getLogger(__name__)

bp = Blueprint('subscription_requests', __name__)


@bp.route('/api/subscription-requests/submit', methods=['POST'])
@require_auth
def submit_subscription_request(user_id):
    """
    Submit a subscription upgrade request

    Request body:
        - tier_requested: One of 'Explore', 'Accelerate', 'Achieve', 'Excel'
        - contact_preference: 'email' or 'phone'
        - phone_number: Required if contact_preference is 'phone'
        - message: Optional message from user

    Returns:
        - 201 with request details on success
        - 400 if validation fails
        - 500 if database or email fails
    """
    try:
        data = request.json

        # Validate required fields
        tier_requested = data.get('tier_requested')
        contact_preference = data.get('contact_preference')
        phone_number = (data.get('phone_number') or '').strip()
        message = (data.get('message') or '').strip()

        # Validation
        if not tier_requested:
            return jsonify({'error': 'Tier selection is required'}), 400

        if tier_requested not in ['Explore', 'Accelerate', 'Achieve', 'Excel']:
            return jsonify({'error': 'Invalid tier selected'}), 400

        if not contact_preference:
            return jsonify({'error': 'Contact preference is required'}), 400

        if contact_preference not in ['email', 'phone']:
            return jsonify({'error': 'Invalid contact preference'}), 400

        if contact_preference == 'phone' and not phone_number:
            return jsonify({'error': 'Phone number is required when phone contact is preferred'}), 400

        # Get user details from database
        supabase = get_user_client()
        user_response = supabase.table('users').select('*').eq('id', user_id).single().execute()

        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404

        user = user_response.data
        user_email = user.get('email')
        user_name = user.get('display_name') or user.get('first_name') or 'there'
        current_tier = user.get('subscription_tier', 'Explore')

        # Fetch tier display name from subscription_tiers table
        tier_response = supabase.table('subscription_tiers').select('display_name').eq('tier_key', tier_requested).single().execute()
        tier_display_name = tier_response.data.get('display_name') if tier_response.data else tier_requested

        # Don't allow requesting current tier
        if tier_requested == current_tier:
            return jsonify({'error': f'You are already on the {tier_display_name} tier'}), 400

        # Insert subscription request into database
        request_data = {
            'user_id': user_id,
            'tier_requested': tier_requested,
            'contact_preference': contact_preference,
            'phone_number': phone_number if phone_number else None,
            'message': message if message else None,
            'status': 'pending'
        }

        insert_response = supabase.table('subscription_requests').insert(request_data).execute()

        if not insert_response.data:
            logger.error(f"Failed to insert subscription request for user {user_id}")
            return jsonify({'error': 'Failed to create subscription request'}), 500

        created_request = insert_response.data[0]

        # Send confirmation email to user
        user_email_sent = email_service.send_subscription_request_confirmation(
            user_email=user_email,
            user_name=user_name,
            tier_requested=tier_requested,
            tier_display_name=tier_display_name,
            contact_preference=contact_preference,
            phone_number=phone_number
        )

        if not user_email_sent:
            logger.warning(f"Failed to send confirmation email to {user_email}")

        # Send notification email to admin
        admin_email_sent = email_service.send_subscription_request_admin_notification(
            user_name=user_name,
            user_email=user_email,
            user_id=user_id,
            tier_requested=tier_requested,
            tier_display_name=tier_display_name,
            current_tier=current_tier,
            contact_preference=contact_preference,
            phone_number=phone_number,
            message=message
        )

        if not admin_email_sent:
            logger.warning(f"Failed to send admin notification for subscription request {created_request['id']}")

        return jsonify({
            'success': True,
            'message': 'Subscription request submitted successfully',
            'request_id': created_request['id'],
            'emails_sent': {
                'user': user_email_sent,
                'admin': admin_email_sent
            }
        }), 201

    except Exception as e:
        logger.error(f"Error submitting subscription request: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to submit subscription request'}), 500


@bp.route('/api/subscription-requests/my-requests', methods=['GET'])
@require_auth
def get_user_requests(user_id):
    """Get all subscription requests for the current user"""
    try:
        supabase = get_user_client()

        response = supabase.table('subscription_requests')\
            .select('*')\
            .eq('user_id', user_id)\
            .order('created_at', desc=True)\
            .execute()

        return jsonify(response.data), 200

    except Exception as e:
        logger.error(f"Error fetching user subscription requests: {str(e)}")
        return jsonify({'error': 'Failed to fetch subscription requests'}), 500


@bp.route('/api/subscription-requests/admin/all', methods=['GET'])
@require_auth
def get_all_requests(user_id):
    """Get all subscription requests (admin only)"""
    try:
        # Verify admin role
        supabase = get_user_client()
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()

        if not user_response.data or user_response.data.get('role') != 'admin':
            return jsonify({'error': 'Admin access required'}), 403

        # Get filter parameters
        status = request.args.get('status', None)
        tier = request.args.get('tier', None)

        # Build query
        query = supabase.table('subscription_requests')\
            .select('*, users!subscription_requests_user_id_fkey(display_name, email, first_name, last_name)')

        if status:
            query = query.eq('status', status)
        if tier:
            query = query.eq('tier_requested', tier)

        response = query.order('created_at', desc=True).execute()

        return jsonify(response.data), 200

    except Exception as e:
        logger.error(f"Error fetching all subscription requests: {str(e)}")
        return jsonify({'error': 'Failed to fetch subscription requests'}), 500


@bp.route('/api/subscription-requests/admin/<request_id>/update-status', methods=['PUT'])
@require_auth
def update_request_status(user_id, request_id):
    """Update subscription request status (admin only)"""
    try:
        # Verify admin role
        supabase = get_user_client()
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()

        if not user_response.data or user_response.data.get('role') != 'admin':
            return jsonify({'error': 'Admin access required'}), 403

        data = request.json
        new_status = data.get('status')
        notes = data.get('notes', '')

        if not new_status:
            return jsonify({'error': 'Status is required'}), 400

        if new_status not in ['pending', 'in_progress', 'completed', 'cancelled']:
            return jsonify({'error': 'Invalid status'}), 400

        # Update the request
        update_data = {
            'status': new_status,
            'notes': notes
        }

        # Set processed_at and processed_by if status is completed or cancelled
        if new_status in ['completed', 'cancelled']:
            from datetime import datetime
            update_data['processed_at'] = datetime.utcnow().isoformat()
            update_data['processed_by'] = user_id

        response = supabase.table('subscription_requests')\
            .update(update_data)\
            .eq('id', request_id)\
            .execute()

        if not response.data:
            return jsonify({'error': 'Subscription request not found'}), 404

        return jsonify({
            'success': True,
            'message': 'Request status updated',
            'data': response.data[0]
        }), 200

    except Exception as e:
        logger.error(f"Error updating subscription request status: {str(e)}")
        return jsonify({'error': 'Failed to update request status'}), 500
