"""
Learning Events Routes
API endpoints for spontaneous learning moment capture
"""
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.learning_events_service import LearningEventsService
from middleware.csrf_protection import csrf_protect
import logging

logger = logging.getLogger(__name__)

learning_events_bp = Blueprint('learning_events', __name__)


@learning_events_bp.route('/api/learning-events', methods=['POST'])
@csrf_protect
@require_auth
def create_learning_event(user_id):
    """Create a new learning event"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        if not description or not description.strip():
            return jsonify({'error': 'Description is required'}), 400

        title = data.get('title')
        pillars = data.get('pillars', [])

        # Validate pillars if provided
        valid_pillars = [
            'arts_creativity',
            'stem_logic',
            'life_wellness',
            'language_communication',
            'society_culture'
        ]

        if pillars and not isinstance(pillars, list):
            return jsonify({'error': 'Pillars must be an array'}), 400

        if pillars:
            invalid_pillars = [p for p in pillars if p not in valid_pillars]
            if invalid_pillars:
                return jsonify({
                    'error': f'Invalid pillars: {", ".join(invalid_pillars)}'
                }), 400

        result = LearningEventsService.create_learning_event(
            user_id=user_id,
            description=description,
            title=title,
            pillars=pillars
        )

        if result['success']:
            return jsonify({
                'success': True,
                'event': result['event'],
                'message': 'Learning moment captured!'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to create learning event')
            }), 500

    except Exception as e:
        logger.error(f"Error in create_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events', methods=['GET'])
@require_auth
def get_learning_events(user_id):
    """Get all learning events for the authenticated user"""
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        # Validate pagination parameters
        if limit < 1 or limit > 100:
            return jsonify({'error': 'Limit must be between 1 and 100'}), 400
        if offset < 0:
            return jsonify({'error': 'Offset must be non-negative'}), 400

        result = LearningEventsService.get_user_learning_events(
            user_id=user_id,
            limit=limit,
            offset=offset
        )

        if result['success']:
            return jsonify({
                'success': True,
                'events': result['events']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch learning events'),
                'events': []
            }), 500

    except Exception as e:
        logger.error(f"Error in get_learning_events: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>', methods=['GET'])
@require_auth
def get_learning_event(user_id, event_id):
    """Get a specific learning event with evidence"""
    try:
        result = LearningEventsService.get_learning_event_with_evidence(
            user_id=user_id,
            event_id=event_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'event': result['event']
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch learning event')
            }), status_code

    except Exception as e:
        logger.error(f"Error in get_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>', methods=['PUT'])
@csrf_protect
@require_auth
def update_learning_event(user_id, event_id):
    """Update a learning event"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        title = data.get('title')
        pillars = data.get('pillars')

        # Validate pillars if provided
        if pillars is not None:
            if not isinstance(pillars, list):
                return jsonify({'error': 'Pillars must be an array'}), 400

            valid_pillars = [
                'arts_creativity',
                'stem_logic',
                'life_wellness',
                'language_communication',
                'society_culture'
            ]
            invalid_pillars = [p for p in pillars if p not in valid_pillars]
            if invalid_pillars:
                return jsonify({
                    'error': f'Invalid pillars: {", ".join(invalid_pillars)}'
                }), 400

        result = LearningEventsService.update_learning_event(
            user_id=user_id,
            event_id=event_id,
            description=description,
            title=title,
            pillars=pillars
        )

        if result['success']:
            return jsonify({
                'success': True,
                'event': result['event'],
                'message': 'Learning moment updated!'
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to update learning event')
            }), status_code

    except Exception as e:
        logger.error(f"Error in update_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>', methods=['DELETE'])
@csrf_protect
@require_auth
def delete_learning_event(user_id, event_id):
    """Delete a learning event"""
    try:
        result = LearningEventsService.delete_learning_event(
            user_id=user_id,
            event_id=event_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'message': result.get('message', 'Learning moment deleted')
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to delete learning event')
            }), 500

    except Exception as e:
        logger.error(f"Error in delete_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>/evidence', methods=['POST'])
@csrf_protect
@require_auth
def save_evidence_blocks(user_id, event_id):
    """Save or update evidence blocks for a learning event"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        blocks = data.get('blocks', [])

        if not isinstance(blocks, list):
            return jsonify({'error': 'Blocks must be an array'}), 400

        # Validate block types
        valid_block_types = ['text', 'image', 'video', 'link', 'document']
        for block in blocks:
            block_type = block.get('block_type') or block.get('type')
            if not block_type:
                return jsonify({'error': 'Each block must have a block_type or type'}), 400
            if block_type not in valid_block_types:
                return jsonify({'error': f'Invalid block type: {block_type}'}), 400
            # Normalize to block_type
            if 'type' in block and 'block_type' not in block:
                block['block_type'] = block.pop('type')

        result = LearningEventsService.save_evidence_blocks(
            user_id=user_id,
            event_id=event_id,
            blocks=blocks
        )

        if result['success']:
            return jsonify({
                'success': True,
                'blocks': result['blocks'],
                'message': 'Evidence saved successfully'
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to save evidence blocks')
            }), status_code

    except Exception as e:
        logger.error(f"Error in save_evidence_blocks: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/users/<target_user_id>/learning-events/public', methods=['GET'])
def get_public_learning_events(target_user_id):
    """Get learning events for public diploma view (no auth required)"""
    try:
        limit = request.args.get('limit', 50, type=int)

        # Validate limit
        if limit < 1 or limit > 100:
            return jsonify({'error': 'Limit must be between 1 and 100'}), 400

        result = LearningEventsService.get_public_learning_events(
            user_id=target_user_id,
            limit=limit
        )

        if result['success']:
            return jsonify({
                'success': True,
                'events': result['events']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch learning events'),
                'events': []
            }), 500

    except Exception as e:
        logger.error(f"Error in get_public_learning_events: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
