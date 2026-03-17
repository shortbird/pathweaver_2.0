"""
Buddy Companion API Routes - Virtual pet companion for students.

Students can create, feed, and interact with their buddy. The buddy's
vitality and bond values are calculated client-side and persisted here.
"""

from datetime import date
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_role
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

buddy_bp = Blueprint('buddy', __name__)


@buddy_bp.route('/api/buddy', methods=['GET', 'OPTIONS'])
@require_role('student', 'superadmin')
def get_buddy(user_id):
    """Get the current user's buddy record."""
    try:
        supabase = get_supabase_admin_client()
        result = supabase.table('buddies').select('*').eq('user_id', user_id).execute()

        if not result.data:
            return jsonify({'buddy': None}), 200

        return jsonify({'buddy': result.data[0]}), 200

    except Exception as e:
        logger.error(f"Error getting buddy for user {user_id}: {e}")
        return jsonify({'error': 'Failed to get buddy'}), 500


@buddy_bp.route('/api/buddy', methods=['POST'])
@require_role('student', 'superadmin')
def create_buddy(user_id):
    """Create a new buddy for the current user."""
    try:
        data = request.get_json()
        if not data or not data.get('name'):
            return jsonify({'error': 'Name is required'}), 400

        name = data['name'].strip()[:30]
        if not name:
            return jsonify({'error': 'Name cannot be empty'}), 400

        supabase = get_supabase_admin_client()

        # Check if buddy already exists
        existing = supabase.table('buddies').select('id').eq('user_id', user_id).execute()
        if existing.data:
            return jsonify({'error': 'You already have a buddy'}), 409

        result = supabase.table('buddies').insert({
            'user_id': user_id,
            'name': name,
            'vitality': 1.0,
            'bond': 0.0,
            'stage': 0,
            'highest_stage': 0,
            'wallet': 50,
        }).execute()

        logger.info(f"Buddy created for user {user_id}: {name}")
        return jsonify({'buddy': result.data[0]}), 201

    except Exception as e:
        logger.error(f"Error creating buddy for user {user_id}: {e}")
        return jsonify({'error': 'Failed to create buddy'}), 500


@buddy_bp.route('/api/buddy', methods=['PUT'])
@require_role('student', 'superadmin')
def update_buddy(user_id):
    """Update buddy state (vitality, bond, stage, etc.)."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        allowed_fields = {
            'vitality', 'bond', 'stage', 'highest_stage',
            'last_interaction', 'food_journal', 'equipped', 'name', 'wallet',
            'total_xp_fed', 'xp_fed_today', 'last_fed_date',
        }
        updates = {k: v for k, v in data.items() if k in allowed_fields}

        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400

        # Clamp numeric values
        if 'vitality' in updates:
            updates['vitality'] = max(0.0, min(1.0, float(updates['vitality'])))
        if 'bond' in updates:
            updates['bond'] = max(0.0, min(1.0, float(updates['bond'])))
        if 'stage' in updates:
            updates['stage'] = max(0, min(6, int(updates['stage'])))

        supabase = get_supabase_admin_client()
        result = supabase.table('buddies').update(updates).eq('user_id', user_id).execute()

        if not result.data:
            return jsonify({'error': 'Buddy not found'}), 404

        return jsonify({'buddy': result.data[0]}), 200

    except Exception as e:
        logger.error(f"Error updating buddy for user {user_id}: {e}")
        return jsonify({'error': 'Failed to update buddy'}), 500


@buddy_bp.route('/api/buddy/feed', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def feed_buddy(user_id):
    """Feed the buddy - deducts XP from wallet, updates vitality/bond."""
    try:
        data = request.get_json()
        if not data or 'food_id' not in data or 'xp_cost' not in data:
            return jsonify({'error': 'food_id and xp_cost are required'}), 400

        xp_cost = int(data['xp_cost'])
        food_id = str(data['food_id'])

        if xp_cost <= 0:
            return jsonify({'error': 'xp_cost must be positive'}), 400

        supabase = get_supabase_admin_client()

        # Get current buddy
        buddy_result = supabase.table('buddies').select('*').eq('user_id', user_id).execute()
        if not buddy_result.data:
            return jsonify({'error': 'Buddy not found'}), 404

        buddy = buddy_result.data[0]

        if buddy['wallet'] < xp_cost:
            return jsonify({'error': 'Not enough XP'}), 400

        # Build update
        updates = {
            'wallet': buddy['wallet'] - xp_cost,
            'vitality': max(0.0, min(1.0, float(data.get('new_vitality', buddy['vitality'])))),
            'bond': max(0.0, min(1.0, float(data.get('new_bond', buddy['bond'])))),
            'total_xp_fed': int(data.get('new_total_xp_fed', (buddy.get('total_xp_fed') or 0) + xp_cost)),
            'xp_fed_today': int(data.get('new_xp_fed_today', (buddy.get('xp_fed_today') or 0) + xp_cost)),
            'last_fed_date': date.today().isoformat(),
            'last_interaction': data.get('last_interaction', 'now()'),
        }

        # Add to food journal if first taste
        journal = list(buddy.get('food_journal') or [])
        if food_id not in journal:
            journal.append(food_id)
            updates['food_journal'] = journal

        result = supabase.table('buddies').update(updates).eq('user_id', user_id).execute()

        logger.info(f"Buddy fed for user {user_id}: {food_id} (-{xp_cost} XP)")
        return jsonify({'buddy': result.data[0]}), 200

    except Exception as e:
        logger.error(f"Error feeding buddy for user {user_id}: {e}")
        return jsonify({'error': 'Failed to feed buddy'}), 500


@buddy_bp.route('/api/buddy/tap', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def tap_buddy(user_id):
    """Record a tap interaction - updates bond."""
    try:
        data = request.get_json() or {}

        supabase = get_supabase_admin_client()

        updates = {
            'bond': max(0.0, min(1.0, float(data.get('new_bond', 0)))),
            'last_interaction': data.get('last_interaction', 'now()'),
        }

        result = supabase.table('buddies').update(updates).eq('user_id', user_id).execute()

        if not result.data:
            return jsonify({'error': 'Buddy not found'}), 404

        return jsonify({'buddy': result.data[0]}), 200

    except Exception as e:
        logger.error(f"Error tapping buddy for user {user_id}: {e}")
        return jsonify({'error': 'Failed to record tap'}), 500
