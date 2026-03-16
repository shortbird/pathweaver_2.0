"""
Yeti API Routes - Virtual companion management endpoints.

All endpoints require authentication. Students manage their own pet.
Superadmin has access to all endpoints.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_role
from services.yeti_service import YetiService
from services.base_service import ValidationError
from repositories.base_repository import NotFoundError, DatabaseError
from utils.logger import get_logger

logger = get_logger(__name__)

yeti_bp = Blueprint('yeti', __name__)


# ──────────────────────────────────────────
# Pet Management
# ──────────────────────────────────────────

@yeti_bp.route('/api/yeti/my-pet', methods=['GET', 'OPTIONS'])
@require_role('student', 'superadmin')
def get_my_pet(user_id):
    """Get current user's Yeti pet with stat decay applied."""
    try:
        service = YetiService()
        pet = service.get_pet(user_id)

        if not pet:
            return jsonify({'error': 'No Yeti pet found', 'message': 'Create one first via POST /api/yeti/my-pet'}), 404

        return jsonify({'success': True, 'pet': pet}), 200

    except Exception as e:
        logger.error(f"Error getting pet for user {user_id[:8]}: {e}")
        return jsonify({'error': 'Failed to get pet', 'message': str(e)}), 500


@yeti_bp.route('/api/yeti/my-pet', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def create_my_pet(user_id):
    """Create a new Yeti pet (first time only)."""
    try:
        data = request.get_json()
        if not data or 'name' not in data:
            return jsonify({'error': 'Missing required field: name'}), 400

        service = YetiService()
        pet = service.create_pet(user_id, data['name'])

        return jsonify({'success': True, 'pet': pet}), 201

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating pet for user {user_id[:8]}: {e}")
        return jsonify({'error': 'Failed to create pet', 'message': str(e)}), 500


@yeti_bp.route('/api/yeti/my-pet/name', methods=['PUT', 'OPTIONS'])
@require_role('student', 'superadmin')
def rename_my_pet(user_id):
    """Rename Yeti pet."""
    try:
        data = request.get_json()
        if not data or 'name' not in data:
            return jsonify({'error': 'Missing required field: name'}), 400

        service = YetiService()
        pet = service.rename_pet(user_id, data['name'])

        return jsonify({'success': True, 'pet': pet}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error renaming pet for user {user_id[:8]}: {e}")
        return jsonify({'error': 'Failed to rename pet', 'message': str(e)}), 500


# ──────────────────────────────────────────
# Feeding & Play
# ──────────────────────────────────────────

@yeti_bp.route('/api/yeti/my-pet/feed', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def feed_my_pet(user_id):
    """Feed pet with item from inventory."""
    try:
        data = request.get_json()
        if not data or 'item_id' not in data:
            return jsonify({'error': 'Missing required field: item_id'}), 400

        service = YetiService()
        pet = service.feed_pet(user_id, data['item_id'])

        return jsonify({'success': True, 'pet': pet}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error feeding pet for user {user_id[:8]}: {e}")
        return jsonify({'error': 'Failed to feed pet', 'message': str(e)}), 500


@yeti_bp.route('/api/yeti/my-pet/play', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def play_with_my_pet(user_id):
    """Play with pet to boost happiness."""
    try:
        service = YetiService()
        pet = service.play_with_pet(user_id)

        return jsonify({'success': True, 'pet': pet}), 200

    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error playing with pet for user {user_id[:8]}: {e}")
        return jsonify({'error': 'Failed to play with pet', 'message': str(e)}), 500


# ──────────────────────────────────────────
# Shop & Purchases
# ──────────────────────────────────────────

@yeti_bp.route('/api/yeti/shop', methods=['GET', 'OPTIONS'])
@require_role('student', 'superadmin')
def get_shop(user_id):
    """Browse shop item catalog."""
    try:
        category = request.args.get('category')
        service = YetiService()
        items = service.get_shop(category=category)

        return jsonify({'success': True, 'items': items}), 200

    except Exception as e:
        logger.error(f"Error getting shop: {e}")
        return jsonify({'error': 'Failed to get shop', 'message': str(e)}), 500


@yeti_bp.route('/api/yeti/shop/buy', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def buy_item(user_id):
    """Purchase item with Spendable XP."""
    try:
        data = request.get_json()
        if not data or 'item_id' not in data:
            return jsonify({'error': 'Missing required field: item_id'}), 400

        service = YetiService()
        result = service.purchase_item(user_id, data['item_id'])

        return jsonify({'success': True, 'inventory_entry': result}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error purchasing item for user {user_id[:8]}: {e}")
        return jsonify({'error': 'Failed to purchase item', 'message': str(e)}), 500


# ──────────────────────────────────────────
# Inventory & Balance
# ──────────────────────────────────────────

@yeti_bp.route('/api/yeti/inventory', methods=['GET', 'OPTIONS'])
@require_role('student', 'superadmin')
def get_inventory(user_id):
    """View owned items."""
    try:
        service = YetiService()
        inventory = service.get_inventory(user_id)

        return jsonify({'success': True, 'inventory': inventory}), 200

    except Exception as e:
        logger.error(f"Error getting inventory for user {user_id[:8]}: {e}")
        return jsonify({'error': 'Failed to get inventory', 'message': str(e)}), 500


@yeti_bp.route('/api/yeti/my-pet/balance', methods=['GET', 'OPTIONS'])
@require_role('student', 'superadmin')
def get_balance(user_id):
    """Get Spendable XP balance."""
    try:
        service = YetiService()
        balance = service.get_balance(user_id)

        return jsonify({'success': True, 'spendable_xp': balance}), 200

    except Exception as e:
        logger.error(f"Error getting balance for user {user_id[:8]}: {e}")
        return jsonify({'error': 'Failed to get balance', 'message': str(e)}), 500


# ──────────────────────────────────────────
# Accessories
# ──────────────────────────────────────────

@yeti_bp.route('/api/yeti/my-pet/equip', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def equip_accessory(user_id):
    """Equip an accessory on the Yeti."""
    try:
        data = request.get_json()
        if not data or 'item_id' not in data:
            return jsonify({'error': 'Missing required field: item_id'}), 400

        service = YetiService()
        pet = service.equip_accessory(user_id, data['item_id'])

        return jsonify({'success': True, 'pet': pet}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error equipping accessory for user {user_id[:8]}: {e}")
        return jsonify({'error': 'Failed to equip accessory', 'message': str(e)}), 500


@yeti_bp.route('/api/yeti/my-pet/unequip', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def unequip_accessory(user_id):
    """Remove an accessory from the Yeti."""
    try:
        data = request.get_json()
        if not data or 'item_id' not in data:
            return jsonify({'error': 'Missing required field: item_id'}), 400

        service = YetiService()
        pet = service.unequip_accessory(user_id, data['item_id'])

        return jsonify({'success': True, 'pet': pet}), 200

    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error unequipping accessory for user {user_id[:8]}: {e}")
        return jsonify({'error': 'Failed to unequip accessory', 'message': str(e)}), 500
