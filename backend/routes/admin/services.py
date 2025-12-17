"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- Direct database calls for 'services' table CRUD operations
- Inquiry management functionality
- Could create ServicesRepository with methods:
  - get_all_services()
  - get_service_by_id(service_id)
  - create_service(service_data)
  - update_service(service_id, service_data)
  - delete_service(service_id)
  - manage_service_inquiries()
- Simple admin CRUD suitable for repository abstraction

Admin API routes for service management
Handles CRUD operations for services and inquiry management
Requires admin authentication
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from middleware.error_handler import AppError, ValidationError, NotFoundError
from utils.auth.decorators import require_admin
import logging

logger = logging.getLogger(__name__)

admin_services_bp = Blueprint('admin_services', __name__)


@admin_services_bp.route('/api/admin/services', methods=['GET'])
@require_admin
def get_all_services(user_id):
    """
    Get all services (including inactive)
    Admin only
    """
    try:
        supabase = get_supabase_admin_client()

        result = supabase.table('services')\
            .select('*')\
            .order('sort_order')\
            .execute()

        services = result.data if result.data else []

        return jsonify({
            'success': True,
            'services': services
        }), 200

    except Exception as e:
        logger.error(f"Error fetching services: {str(e)}")
        raise AppError('Failed to fetch services', 500)


@admin_services_bp.route('/api/admin/services', methods=['POST'])
@require_admin
def create_service(user_id):
    """
    Create a new service
    Admin only
    """
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['name', 'description', 'category', 'price', 'price_type']
        for field in required_fields:
            if field not in data:
                raise ValidationError(f'Missing required field: {field}')

        # Validate price_type
        valid_price_types = ['one-time', 'monthly', 'per-credit', 'per-session']
        if data['price_type'] not in valid_price_types:
            raise ValidationError(f'Invalid price_type. Must be one of: {", ".join(valid_price_types)}')

        supabase = get_supabase_admin_client()

        # Create service
        service_data = {
            'name': data['name'].strip(),
            'description': data['description'].strip(),
            'category': data['category'].strip(),
            'price': float(data['price']),
            'price_display': data.get('price_display', '').strip(),
            'price_type': data['price_type'],
            'features': data.get('features', []),
            'is_active': data.get('is_active', True),
            'sort_order': data.get('sort_order', 0)
        }

        result = supabase.table('services')\
            .insert(service_data)\
            .execute()

        if not result.data:
            raise AppError('Failed to create service', 500)

        return jsonify({
            'success': True,
            'message': 'Service created successfully',
            'service': result.data[0]
        }), 201

    except AppError:
        raise
    except Exception as e:
        logger.error(f"Error creating service: {str(e)}")
        raise AppError('Failed to create service', 500)


@admin_services_bp.route('/api/admin/services/<service_id>', methods=['PUT'])
@require_admin
def update_service(user_id, service_id):
    """
    Update an existing service
    Admin only
    """
    try:
        data = request.get_json()
        supabase = get_supabase_admin_client()

        # Verify service exists
        existing = supabase.table('services')\
            .select('id')\
            .eq('id', service_id)\
            .execute()

        if not existing.data:
            raise AppError('Service not found', 404)

        # Build update data
        update_data = {}
        allowed_fields = ['name', 'description', 'category', 'price', 'price_display', 'price_type', 'features', 'is_active', 'sort_order']

        for field in allowed_fields:
            if field in data:
                if field == 'price':
                    update_data[field] = float(data[field])
                elif field in ['name', 'description', 'category', 'price_display']:
                    update_data[field] = data[field].strip()
                else:
                    update_data[field] = data[field]

        # Validate price_type if provided
        if 'price_type' in update_data:
            valid_price_types = ['one-time', 'monthly', 'per-credit', 'per-session']
            if update_data['price_type'] not in valid_price_types:
                raise ValidationError(f'Invalid price_type. Must be one of: {", ".join(valid_price_types)}')

        if not update_data:
            raise ValidationError('No valid fields to update')

        # Update service
        result = supabase.table('services')\
            .update(update_data)\
            .eq('id', service_id)\
            .execute()

        if not result.data:
            raise AppError('Failed to update service', 500)

        return jsonify({
            'success': True,
            'message': 'Service updated successfully',
            'service': result.data[0]
        }), 200

    except AppError:
        raise
    except Exception as e:
        logger.error(f"Error updating service: {str(e)}")
        raise AppError('Failed to update service', 500)


@admin_services_bp.route('/api/admin/services/<service_id>', methods=['DELETE'])
@require_admin
def delete_service(user_id, service_id):
    """
    Soft delete a service (set is_active to false)
    Admin only
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify service exists
        existing = supabase.table('services')\
            .select('id')\
            .eq('id', service_id)\
            .execute()

        if not existing.data:
            raise AppError('Service not found', 404)

        # Soft delete by setting is_active to false
        result = supabase.table('services')\
            .update({'is_active': False})\
            .eq('id', service_id)\
            .execute()

        if not result.data:
            raise AppError('Failed to delete service', 500)

        return jsonify({
            'success': True,
            'message': 'Service deleted successfully'
        }), 200

    except AppError:
        raise
    except Exception as e:
        logger.error(f"Error deleting service: {str(e)}")
        raise AppError('Failed to delete service', 500)


@admin_services_bp.route('/api/admin/service-inquiries', methods=['GET'])
@require_admin
def get_service_inquiries(user_id):
    """
    Get all service inquiries with optional filtering
    Admin only
    """
    try:
        supabase = get_supabase_admin_client()

        # Get query parameters for filtering
        status_filter = request.args.get('status')
        service_id_filter = request.args.get('service_id')

        # Build query
        query = supabase.table('service_inquiries')\
            .select('*, service:services(name)')

        if status_filter:
            query = query.eq('status', status_filter)

        if service_id_filter:
            query = query.eq('service_id', service_id_filter)

        result = query.order('created_at', desc=True).execute()

        inquiries = result.data if result.data else []

        return jsonify({
            'success': True,
            'inquiries': inquiries
        }), 200

    except Exception as e:
        logger.error(f"Error fetching inquiries: {str(e)}")
        raise AppError('Failed to fetch inquiries', 500)


@admin_services_bp.route('/api/admin/service-inquiries/<inquiry_id>', methods=['PUT'])
@require_admin
def update_inquiry_status(user_id, inquiry_id):
    """
    Update service inquiry status
    Admin only
    """
    try:
        data = request.get_json()

        if 'status' not in data:
            raise ValidationError('Missing status field')

        valid_statuses = ['pending', 'contacted', 'completed']
        if data['status'] not in valid_statuses:
            raise ValidationError(f'Invalid status. Must be one of: {", ".join(valid_statuses)}')

        supabase = get_supabase_admin_client()

        # Verify inquiry exists
        existing = supabase.table('service_inquiries')\
            .select('id')\
            .eq('id', inquiry_id)\
            .execute()

        if not existing.data:
            raise AppError('Inquiry not found', 404)

        # Update status
        result = supabase.table('service_inquiries')\
            .update({'status': data['status']})\
            .eq('id', inquiry_id)\
            .execute()

        if not result.data:
            raise AppError('Failed to update inquiry', 500)

        return jsonify({
            'success': True,
            'message': 'Inquiry status updated successfully',
            'inquiry': result.data[0]
        }), 200

    except AppError:
        raise
    except Exception as e:
        logger.error(f"Error updating inquiry: {str(e)}")
        raise AppError('Failed to update inquiry', 500)
