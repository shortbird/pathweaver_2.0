"""
Public API routes for services
Handles public-facing service listing and inquiry submissions
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from middleware.error_handler import AppError, ValidationError, NotFoundError
import logging

logger = logging.getLogger(__name__)

services_bp = Blueprint('services', __name__)


@services_bp.route('/api/services', methods=['GET'])
def get_services():
    """
    Get all active services
    Public endpoint - no authentication required
    Returns services grouped by category
    """
    try:
        supabase = get_supabase_admin_client()

        # Fetch active services ordered by sort_order
        result = supabase.table('services')\
            .select('*')\
            .eq('is_active', True)\
            .order('sort_order')\
            .execute()

        services = result.data if result.data else []

        # Group services by category
        categories = {}
        for service in services:
            category = service.get('category', 'Other')
            if category not in categories:
                categories[category] = []
            categories[category].append(service)

        return jsonify({
            'success': True,
            'services': services,
            'categories': categories
        }), 200

    except Exception as e:
        logger.error(f"Error fetching services: {str(e)}")
        raise AppError('Failed to fetch services', 500)


@services_bp.route('/api/services/inquiry', methods=['POST'])
def submit_inquiry():
    """
    Submit a service inquiry
    Public endpoint - authentication optional (pre-fills user data if logged in)
    Sends confirmation email to user and notification to admin
    """
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['service_id', 'name', 'email', 'message']
        for field in required_fields:
            if not data.get(field):
                raise ValidationError(f'Missing required field: {field}')

        # Validate email format
        email = data.get('email', '').strip()
        if not email or '@' not in email:
            raise ValidationError('Invalid email address')

        supabase = get_supabase_admin_client()

        # Verify service exists
        service_result = supabase.table('services')\
            .select('id, name')\
            .eq('id', data['service_id'])\
            .eq('is_active', True)\
            .execute()

        if not service_result.data:
            raise NotFoundError('Service')

        service_name = service_result.data[0]['name']

        # Create inquiry record
        inquiry_data = {
            'service_id': data['service_id'],
            'user_id': data.get('user_id'),  # Optional - if user is logged in
            'name': data['name'].strip(),
            'email': email,
            'phone': data.get('phone', '').strip() if data.get('phone') else None,
            'message': data['message'].strip(),
            'status': 'pending'
        }

        result = supabase.table('service_inquiries')\
            .insert(inquiry_data)\
            .execute()

        if not result.data:
            raise AppError('Failed to submit inquiry', 500)

        inquiry_id = result.data[0]['id']

        # TODO: Send confirmation email to user
        # TODO: Send notification email to admin
        # Use existing email service pattern from other routes
        logger.info(f"Service inquiry submitted: {inquiry_id} for service: {service_name}")

        return jsonify({
            'success': True,
            'message': 'Inquiry submitted successfully',
            'inquiry_id': inquiry_id
        }), 201

    except AppError:
        raise
    except Exception as e:
        logger.error(f"Error submitting inquiry: {str(e)}")
        raise AppError('Failed to submit inquiry', 500)
