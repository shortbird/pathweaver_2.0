"""
Admin Tier Management Routes

Handles CRUD operations for subscription tiers configuration.
Allows admins to edit tier pricing, features, and display settings.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client, get_supabase_client
from utils.auth.decorators import require_admin
from utils.api_response import success_response, error_response
import json

bp = Blueprint('admin_tier_management', __name__, url_prefix='/api/v3/admin')

@bp.route('/tiers', methods=['GET'])
@require_admin
def get_all_tiers(user_id):
    """Get all subscription tiers (including inactive) for admin management"""
    supabase = get_supabase_admin_client()

    try:
        response = supabase.table('subscription_tiers')\
            .select('*')\
            .order('sort_order')\
            .execute()

        return success_response(response.data)

    except Exception as e:
        print(f"Error fetching tiers: {str(e)}")
        return error_response('Failed to fetch subscription tiers', 500)


@bp.route('/tiers/<tier_id>', methods=['GET'])
@require_admin
def get_tier(user_id, tier_id):
    """Get a specific tier by ID"""
    supabase = get_supabase_admin_client()

    try:
        response = supabase.table('subscription_tiers')\
            .select('*')\
            .eq('id', tier_id)\
            .single()\
            .execute()

        if not response.data:
            return error_response('Tier not found', 404)

        return success_response(response.data)

    except Exception as e:
        print(f"Error fetching tier: {str(e)}")
        return error_response('Failed to fetch tier', 500)


@bp.route('/tiers/<tier_id>', methods=['PUT'])
@require_admin
def update_tier(user_id, tier_id):
    """Update tier configuration"""
    supabase = get_supabase_admin_client()
    data = request.json

    try:
        # Validate and prepare update data
        update_data = {}

        # Allow updating these fields
        allowed_fields = [
            'display_name', 'price_monthly', 'price_yearly', 'description',
            'features', 'limitations', 'badge_text', 'badge_color',
            'sort_order', 'is_active'
        ]

        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]

        # Validate pricing
        if 'price_monthly' in update_data:
            price = float(update_data['price_monthly'])
            if price < 0:
                return error_response('Price cannot be negative', 400)

        if 'price_yearly' in update_data and update_data['price_yearly'] is not None:
            price = float(update_data['price_yearly'])
            if price < 0:
                return error_response('Price cannot be negative', 400)

        # Validate JSON fields
        if 'features' in update_data:
            if not isinstance(update_data['features'], list):
                return error_response('Features must be an array', 400)

        if 'limitations' in update_data:
            if not isinstance(update_data['limitations'], list):
                return error_response('Limitations must be an array', 400)

        # Update the tier
        response = supabase.table('subscription_tiers')\
            .update(update_data)\
            .eq('id', tier_id)\
            .execute()

        if not response.data:
            return error_response('Failed to update tier', 500)

        return success_response({
            'message': 'Tier updated successfully',
            'tier': response.data[0]
        })

    except ValueError as e:
        return error_response(f'Invalid data format: {str(e)}', 400)
    except Exception as e:
        print(f"Error updating tier: {str(e)}")
        return error_response('Failed to update tier', 500)


@bp.route('/tiers', methods=['POST'])
@require_admin
def create_tier(user_id):
    """Create a new subscription tier"""
    supabase = get_supabase_admin_client()
    data = request.json

    try:
        # Validate required fields
        required_fields = ['tier_key', 'display_name', 'price_monthly']
        for field in required_fields:
            if field not in data:
                return error_response(f'Missing required field: {field}', 400)

        # Validate tier_key is unique
        existing = supabase.table('subscription_tiers')\
            .select('id')\
            .eq('tier_key', data['tier_key'])\
            .execute()

        if existing.data:
            return error_response('Tier key already exists', 400)

        # Prepare tier data
        tier_data = {
            'tier_key': data['tier_key'],
            'display_name': data['display_name'],
            'price_monthly': float(data['price_monthly']),
            'price_yearly': float(data.get('price_yearly', 0)) if data.get('price_yearly') else None,
            'description': data.get('description', ''),
            'features': data.get('features', []),
            'limitations': data.get('limitations', []),
            'badge_text': data.get('badge_text'),
            'badge_color': data.get('badge_color'),
            'sort_order': int(data.get('sort_order', 0)),
            'is_active': data.get('is_active', True)
        }

        # Create the tier
        response = supabase.table('subscription_tiers')\
            .insert(tier_data)\
            .execute()

        if not response.data:
            return error_response('Failed to create tier', 500)

        return success_response({
            'message': 'Tier created successfully',
            'tier': response.data[0]
        }, 201)

    except ValueError as e:
        return error_response(f'Invalid data format: {str(e)}', 400)
    except Exception as e:
        print(f"Error creating tier: {str(e)}")
        return error_response('Failed to create tier', 500)
