"""Learning event CRUD + quick create + AI suggestions.

Split from routes/learning_events.py on 2026-04-14 (Q1).
"""

"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses LearningEventsService exclusively (service layer pattern)
- Only 1 direct database call for file upload verification (line 293-304, acceptable)
- Service layer properly encapsulates all CRUD operations
- File upload endpoint uses get_user_client for RLS enforcement (correct pattern)

Learning Events Routes
API endpoints for spontaneous learning moment capture
"""
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.learning_events_service import LearningEventsService
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)



from routes.learning_events import learning_events_bp



@learning_events_bp.route('/api/learning-events', methods=['POST'])
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
            'art',
            'stem',
            'wellness',
            'communication',
            'civics'
        ]

        if pillars and not isinstance(pillars, list):
            return jsonify({'error': 'Pillars must be an array'}), 400

        if pillars:
            invalid_pillars = [p for p in pillars if p not in valid_pillars]
            if invalid_pillars:
                return jsonify({
                    'error': f'Invalid pillars: {", ".join(invalid_pillars)}'
                }), 400

        # Topic assignment - new multi-topic API or legacy single fields
        topics = data.get('topics')  # New: [{type: 'topic'|'quest', id: uuid}, ...]
        track_id = data.get('track_id')  # Legacy
        quest_id = data.get('quest_id')  # Legacy

        # Validate topics if provided
        if topics is not None:
            if not isinstance(topics, list):
                return jsonify({'error': 'topics must be an array'}), 400
            for t in topics:
                if not isinstance(t, dict) or 'type' not in t or 'id' not in t:
                    return jsonify({'error': 'Each topic must have type and id'}), 400
                if t['type'] not in ('topic', 'quest'):
                    return jsonify({'error': 'Topic type must be "topic" or "quest"'}), 400

        parent_moment_id = data.get('parent_moment_id')
        source_type = data.get('source_type', 'realtime')
        estimated_duration_minutes = data.get('estimated_duration_minutes')
        ai_generated_title = data.get('ai_generated_title')
        ai_suggested_pillars = data.get('ai_suggested_pillars')
        event_date = data.get('event_date')

        # Validate source_type
        if source_type not in ['realtime', 'retroactive']:
            return jsonify({'error': 'source_type must be "realtime" or "retroactive"'}), 400

        # Validate estimated_duration_minutes if provided
        if estimated_duration_minutes is not None:
            try:
                estimated_duration_minutes = int(estimated_duration_minutes)
                if estimated_duration_minutes < 0:
                    return jsonify({'error': 'estimated_duration_minutes must be non-negative'}), 400
            except (TypeError, ValueError):
                return jsonify({'error': 'estimated_duration_minutes must be an integer'}), 400

        result = LearningEventsService.create_learning_event(
            user_id=user_id,
            description=description,
            title=title,
            pillars=pillars,
            track_id=track_id,
            quest_id=quest_id,
            topics=topics,
            parent_moment_id=parent_moment_id,
            source_type=source_type,
            estimated_duration_minutes=estimated_duration_minutes,
            ai_generated_title=ai_generated_title,
            ai_suggested_pillars=ai_suggested_pillars,
            event_date=event_date
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


@learning_events_bp.route('/api/learning-events/quick', methods=['POST'])
@require_auth
def create_quick_learning_event(user_id):
    """Create a quick learning moment with minimal fields"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        if not description or not description.strip():
            return jsonify({'error': 'Description is required'}), 400

        topics = data.get('topics')  # New multi-topic API
        track_id = data.get('track_id')  # Legacy
        quest_id = data.get('quest_id')  # Legacy
        parent_moment_id = data.get('parent_moment_id')
        event_date = data.get('event_date')

        result = LearningEventsService.create_quick_moment(
            user_id=user_id,
            description=description.strip(),
            track_id=track_id,
            quest_id=quest_id,
            topics=topics,
            parent_moment_id=parent_moment_id,
            event_date=event_date
        )

        if result['success']:
            return jsonify({
                'success': True,
                'event': result['event'],
                'message': 'Moment captured!'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to capture moment')
            }), 500

    except Exception as e:
        logger.error(f"Error in create_quick_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/ai-suggestions', methods=['POST'])
@require_auth
def get_ai_suggestions(user_id):
    """Get AI-generated title and pillar suggestions from description"""
    try:
        from services.learning_ai_service import LearningAIService

        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        if not description or not description.strip():
            return jsonify({'error': 'Description is required'}), 400

        ai_service = LearningAIService()
        result = ai_service.suggest_title_and_pillars(description.strip())

        if result['success']:
            return jsonify({
                'success': True,
                'suggestions': {
                    'title': result.get('title', ''),
                    'pillars': result.get('pillars', []),
                    'confidence': result.get('confidence', 0.5),
                    'reasoning': result.get('reasoning', '')
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate suggestions')
            }), 500

    except Exception as e:
        logger.error(f"Error in get_ai_suggestions: {str(e)}")
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
        topics = data.get('topics')  # New multi-topic API: [{type, id}, ...] or None
        track_id = data.get('track_id')  # Legacy: can be None to unassign, or omitted
        event_date = data.get('event_date')

        # Validate pillars if provided
        if pillars is not None:
            if not isinstance(pillars, list):
                return jsonify({'error': 'Pillars must be an array'}), 400

            valid_pillars = [
                'art',
                'stem',
                'wellness',
                'communication',
                'civics'
            ]
            invalid_pillars = [p for p in pillars if p not in valid_pillars]
            if invalid_pillars:
                return jsonify({
                    'error': f'Invalid pillars: {", ".join(invalid_pillars)}'
                }), 400

        # Validate topics if provided
        if topics is not None:
            if not isinstance(topics, list):
                return jsonify({'error': 'topics must be an array'}), 400
            for t in topics:
                if not isinstance(t, dict) or 'type' not in t or 'id' not in t:
                    return jsonify({'error': 'Each topic must have type and id'}), 400
                if t['type'] not in ('topic', 'quest'):
                    return jsonify({'error': 'Topic type must be "topic" or "quest"'}), 400

        result = LearningEventsService.update_learning_event(
            user_id=user_id,
            event_id=event_id,
            description=description,
            title=title,
            pillars=pillars,
            track_id=track_id,
            topics=topics,
            event_date=event_date
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

