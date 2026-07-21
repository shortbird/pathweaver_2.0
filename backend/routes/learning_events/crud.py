"""Learning event CRUD + quick create + AI suggestions."""
from flask import request, jsonify
from utils.auth.decorators import require_auth
from middleware.error_handler import AuthorizationError
from services.learning_events_service import LearningEventsService

from utils.logger import get_logger

logger = get_logger(__name__)

VALID_PILLARS = ('art', 'stem', 'wellness', 'communication', 'civics')


def _validate_topics(topics):
    """Return (ok, error_message). Caller passes through if ok."""
    if topics is None:
        return True, None
    if not isinstance(topics, list):
        return False, 'topics must be an array'
    for t in topics:
        if not isinstance(t, dict) or 'type' not in t or 'id' not in t:
            return False, 'Each topic must have type and id'
        if t['type'] not in ('topic', 'quest'):
            return False, 'Topic type must be "topic" or "quest"'
    return True, None


from routes.learning_events import learning_events_bp

# Flat XP awarded per learning moment to a dependent child.
DEPENDENT_MOMENT_XP = 25


def _award_dependent_moment_xp(event):
    """Award a flat 25 XP per learning moment to a DEPENDENT child (is_dependent).

    Young, parent-managed kids (under 13) do fewer formal quests, so logging a
    learning moment should still earn recognition. No-op for non-dependent users.
    Best-effort: a failure here never blocks moment creation.
    """
    try:
        owner_id = event.get('user_id') if isinstance(event, dict) else None
        if not owner_id:
            return
        from database import get_supabase_admin_client
        # admin client justified: server-side XP award keyed on the moment owner;
        # ownership was already authorized by the calling route.
        supabase = get_supabase_admin_client()
        u = supabase.table('users').select('is_dependent').eq('id', owner_id).execute()
        if not (u.data and u.data[0].get('is_dependent')):
            return
        pillars = event.get('pillars') or []
        pillar = pillars[0] if pillars else 'stem'
        from services.xp_service import XPService
        XPService().award_xp(owner_id, pillar, DEPENDENT_MOMENT_XP, source='learning_moment')
        logger.info(f"Awarded {DEPENDENT_MOMENT_XP} XP ({pillar}) to dependent {owner_id[:8]} for a learning moment")
    except Exception as e:
        logger.warning(f"Dependent moment XP award skipped: {e}")


@learning_events_bp.route('/api/learning-events', methods=['POST'])
@require_auth
def create_learning_event(user_id):
    """Create a new learning event."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        if not description or not description.strip():
            return jsonify({'error': 'Description is required'}), 400

        title = data.get('title')
        pillars = data.get('pillars', [])

        if pillars and not isinstance(pillars, list):
            return jsonify({'error': 'Pillars must be an array'}), 400

        if pillars:
            invalid_pillars = [p for p in pillars if p not in VALID_PILLARS]
            if invalid_pillars:
                return jsonify({
                    'error': f'Invalid pillars: {", ".join(invalid_pillars)}'
                }), 400

        topics = data.get('topics')
        ok, err = _validate_topics(topics)
        if not ok:
            return jsonify({'error': err}), 400

        parent_moment_id = data.get('parent_moment_id')
        source_type = data.get('source_type', 'realtime')
        estimated_duration_minutes = data.get('estimated_duration_minutes')
        ai_generated_title = data.get('ai_generated_title')
        ai_suggested_pillars = data.get('ai_suggested_pillars')
        event_date = data.get('event_date')

        if source_type not in ['realtime', 'retroactive']:
            return jsonify({'error': 'source_type must be "realtime" or "retroactive"'}), 400

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
            topics=topics,
            parent_moment_id=parent_moment_id,
            source_type=source_type,
            estimated_duration_minutes=estimated_duration_minutes,
            ai_generated_title=ai_generated_title,
            ai_suggested_pillars=ai_suggested_pillars,
            event_date=event_date
        )

        if result['success']:
            _award_dependent_moment_xp(result['event'])
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
    """Create a quick learning moment with minimal fields."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        if not description or not description.strip():
            return jsonify({'error': 'Description is required'}), 400

        # Optional short title (bug #13/#14: capture flow needs a title field,
        # esp. for moments promoted to tasks). Normalized to None when blank.
        title = data.get('title')
        title = title.strip() if isinstance(title, str) and title.strip() else None

        topics = data.get('topics')
        ok, err = _validate_topics(topics)
        if not ok:
            return jsonify({'error': err}), 400

        parent_moment_id = data.get('parent_moment_id')
        event_date = data.get('event_date')

        # Parent/guardian capturing for a child: the app's parent capture flow
        # sends student_id. Own the moment under the CHILD (attributed to the
        # caller) instead of the caller's own account. Authorization mirrors
        # POST /api/parent/children/<id>/learning-moments. Without this branch
        # the moment silently landed on the parent's account as 'realtime'.
        student_id = data.get('student_id')
        if student_id and student_id != user_id:
            from database import get_supabase_admin_client
            from routes.parent.dashboard_overview import verify_parent_access
            # admin client justified: cross-user write (moment owned by child) gated by verify_parent_access(parent -> child)
            supabase = get_supabase_admin_client()
            verify_parent_access(supabase, user_id, student_id, allow_observer=False)  # IDOR-H5: write; raises if not a guardian
            event_data = {
                'user_id': student_id,
                'captured_by_user_id': user_id,
                'description': description.strip(),
                'title': title,
                'source_type': 'parent_captured',
                'pillars': [],
            }
            if event_date:
                event_data['event_date'] = event_date
            resp = supabase.table('learning_events').insert(event_data).execute()
            if not resp.data:
                return jsonify({'success': False, 'error': 'Failed to capture moment'}), 500
            _award_dependent_moment_xp(resp.data[0])
            return jsonify({'success': True, 'event': resp.data[0], 'message': 'Moment captured!'}), 201

        result = LearningEventsService.create_quick_moment(
            user_id=user_id,
            description=description.strip(),
            title=title,
            topics=topics,
            parent_moment_id=parent_moment_id,
            event_date=event_date
        )

        if result['success']:
            _award_dependent_moment_xp(result['event'])
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

    except AuthorizationError as e:
        return jsonify({'error': str(e) or 'Not authorized to capture for this child'}), 403
    except Exception as e:
        logger.error(f"Error in create_quick_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/ai-suggestions', methods=['POST'])
@require_auth
def get_ai_suggestions(user_id):
    """Get AI-generated title and pillar suggestions from description."""
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
    """Get all learning events for the authenticated user."""
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

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
    """Get a specific learning event with evidence."""
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
    """Update a learning event."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        title = data.get('title')
        pillars = data.get('pillars')
        topics = data.get('topics')
        event_date = data.get('event_date')

        if pillars is not None:
            if not isinstance(pillars, list):
                return jsonify({'error': 'Pillars must be an array'}), 400
            invalid_pillars = [p for p in pillars if p not in VALID_PILLARS]
            if invalid_pillars:
                return jsonify({
                    'error': f'Invalid pillars: {", ".join(invalid_pillars)}'
                }), 400

        ok, err = _validate_topics(topics)
        if not ok:
            return jsonify({'error': err}), 400

        result = LearningEventsService.update_learning_event(
            user_id=user_id,
            event_id=event_id,
            description=description,
            title=title,
            pillars=pillars,
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
    """Delete a learning event."""
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
