"""
Interest Tracks Routes
======================

API endpoints for managing Interest Tracks - organizational containers
for grouping related learning moments.

Endpoints:
- POST   /api/interest-tracks              Create track
- GET    /api/interest-tracks              List user's tracks
- GET    /api/interest-tracks/<id>         Get track with moments
- GET    /api/interest-tracks/<id>/stats   Get track statistics
- PUT    /api/interest-tracks/<id>         Update track
- DELETE /api/interest-tracks/<id>         Delete track
- POST   /api/interest-tracks/<id>/suggest Suggest track for moment (AI)
- GET    /api/interest-tracks/<id>/evolve/preview  AI preview of quest structure
- POST   /api/interest-tracks/<id>/evolve  Evolve track into a quest
- GET    /api/interest-tracks/suggestions  AI-detect potential new tracks
- GET    /api/learning-events/unassigned   Get unassigned moments
- POST   /api/learning-events/<id>/assign-track  Assign moment to track
- GET    /api/topics/unified               Get combined tracks + active quests as topics
- POST   /api/learning-events/<id>/assign-topic  Assign moment to track or quest
- GET    /api/quests/<id>/moments          Get learning moments for a quest
- POST   /api/learning-events/<id>/convert-to-task  Convert quest moment to task
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.interest_tracks_service import InterestTracksService
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

interest_tracks_bp = Blueprint('interest_tracks', __name__)


@interest_tracks_bp.route('/api/interest-tracks', methods=['POST'])
@require_auth
def create_track(user_id):
    """Create a new interest track."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        name = data.get('name')
        if not name or not name.strip():
            return jsonify({'error': 'Track name is required'}), 400

        description = data.get('description')
        color = data.get('color')
        icon = data.get('icon')
        moment_ids = data.get('moment_ids', [])  # Optional list of moment IDs to assign

        # Validate color format if provided
        if color and not (color.startswith('#') and len(color) in [4, 7]):
            return jsonify({'error': 'Color must be a valid hex code (e.g., #fff or #ffffff)'}), 400

        logger.info(f"Creating track with moment_ids: {moment_ids}")

        result = InterestTracksService.create_track(
            user_id=user_id,
            name=name.strip(),
            description=description.strip() if description else None,
            color=color,
            icon=icon
        )

        if result['success']:
            track = result['track']
            assigned_count = 0

            # If moment_ids provided, bulk assign them to the new track
            logger.info(f"Checking moment_ids: {moment_ids}, length: {len(moment_ids) if moment_ids else 0}")
            if moment_ids and len(moment_ids) > 0:
                assign_result = InterestTracksService.bulk_assign_moments_to_track(
                    user_id=user_id,
                    track_id=track['id'],
                    moment_ids=moment_ids
                )
                if assign_result['success']:
                    assigned_count = assign_result.get('assigned_count', 0)
                    # Update track with new moment count
                    track['moment_count'] = assigned_count

            return jsonify({
                'success': True,
                'track': track,
                'assigned_count': assigned_count,
                'message': f'Topic created with {assigned_count} moments!' if assigned_count > 0 else 'Topic created!'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to create track')
            }), 500

    except Exception as e:
        logger.error(f"Error in create_track: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/interest-tracks', methods=['GET'])
@require_auth
def get_tracks(user_id):
    """Get all interest tracks for the authenticated user."""
    try:
        result = InterestTracksService.get_user_tracks(user_id=user_id)

        if result['success']:
            return jsonify({
                'success': True,
                'tracks': result['tracks']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch tracks'),
                'tracks': []
            }), 500

    except Exception as e:
        logger.error(f"Error in get_tracks: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/interest-tracks/<track_id>', methods=['GET'])
@require_auth
def get_track(user_id, track_id):
    """Get a specific track with its moments."""
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        if limit < 1 or limit > 100:
            return jsonify({'error': 'Limit must be between 1 and 100'}), 400

        result = InterestTracksService.get_track_with_moments(
            user_id=user_id,
            track_id=track_id,
            limit=limit,
            offset=offset
        )

        if result['success']:
            return jsonify({
                'success': True,
                'track': result['track']
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch track')
            }), status_code

    except Exception as e:
        logger.error(f"Error in get_track: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/interest-tracks/<track_id>/stats', methods=['GET'])
@require_auth
def get_track_stats(user_id, track_id):
    """Get statistics for a track."""
    try:
        result = InterestTracksService.get_track_stats(
            user_id=user_id,
            track_id=track_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'stats': result['stats']
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch track stats')
            }), status_code

    except Exception as e:
        logger.error(f"Error in get_track_stats: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/interest-tracks/<track_id>', methods=['PUT'])
@require_auth
def update_track(user_id, track_id):
    """Update an interest track."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        name = data.get('name')
        description = data.get('description')
        color = data.get('color')
        icon = data.get('icon')

        # Validate color format if provided
        if color and not (color.startswith('#') and len(color) in [4, 7]):
            return jsonify({'error': 'Color must be a valid hex code'}), 400

        result = InterestTracksService.update_track(
            user_id=user_id,
            track_id=track_id,
            name=name.strip() if name else None,
            description=description.strip() if description else None,
            color=color,
            icon=icon
        )

        if result['success']:
            return jsonify({
                'success': True,
                'track': result['track'],
                'message': 'Track updated!'
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to update track')
            }), status_code

    except Exception as e:
        logger.error(f"Error in update_track: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/interest-tracks/<track_id>', methods=['DELETE'])
@require_auth
def delete_track(user_id, track_id):
    """Delete an interest track. Moments become unassigned."""
    try:
        result = InterestTracksService.delete_track(
            user_id=user_id,
            track_id=track_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'message': result.get('message', 'Track deleted')
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to delete track')
            }), 500

    except Exception as e:
        logger.error(f"Error in delete_track: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/interest-tracks/<track_id>/suggest', methods=['POST'])
@require_auth
def suggest_track_for_moment(user_id, track_id):
    """AI suggest whether a moment belongs to this track."""
    try:
        from services.learning_ai_service import LearningAIService

        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        if not description:
            return jsonify({'error': 'Moment description is required'}), 400

        ai_service = LearningAIService()
        result = ai_service.suggest_track_for_moment(
            description=description,
            user_id=user_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'suggestion': result
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate suggestion')
            }), 500

    except Exception as e:
        logger.error(f"Error in suggest_track_for_moment: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/interest-tracks/suggestions', methods=['GET'])
@require_auth
def detect_emerging_tracks(user_id):
    """AI detect potential new tracks from unassigned moments."""
    try:
        from services.learning_ai_service import LearningAIService

        ai_service = LearningAIService()
        result = ai_service.detect_emerging_tracks(user_id=user_id)

        if result['success']:
            return jsonify({
                'success': True,
                'suggested_tracks': result.get('suggested_tracks', []),
                'message': result.get('message', '')
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to detect emerging tracks')
            }), 500

    except Exception as e:
        logger.error(f"Error in detect_emerging_tracks: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/learning-events/unassigned', methods=['GET'])
@require_auth
def get_unassigned_moments(user_id):
    """Get learning moments not assigned to any track."""
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        if limit < 1 or limit > 100:
            return jsonify({'error': 'Limit must be between 1 and 100'}), 400

        result = InterestTracksService.get_unassigned_moments(
            user_id=user_id,
            limit=limit,
            offset=offset
        )

        if result['success']:
            return jsonify({
                'success': True,
                'moments': result['moments']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch unassigned moments'),
                'moments': []
            }), 500

    except Exception as e:
        logger.error(f"Error in get_unassigned_moments: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/learning-events/<moment_id>/assign-track', methods=['POST'])
@require_auth
def assign_moment_to_track(user_id, moment_id):
    """Assign a learning moment to a track."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        track_id = data.get('track_id')  # Can be None to unassign

        result = InterestTracksService.assign_moment_to_track(
            user_id=user_id,
            moment_id=moment_id,
            track_id=track_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'moment': result.get('moment'),
                'message': 'Moment assigned to track' if track_id else 'Moment unassigned from track'
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to assign moment')
            }), status_code

    except Exception as e:
        logger.error(f"Error in assign_moment_to_track: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/interest-tracks/<track_id>/evolve/preview', methods=['GET'])
@require_auth
def preview_evolved_quest(user_id, track_id):
    """Generate AI-powered preview of quest structure from track moments."""
    try:
        result = InterestTracksService.preview_evolved_quest(
            user_id=user_id,
            track_id=track_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'preview': result['preview'],
                'moment_count': result['moment_count'],
                'track_name': result['track_name']
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 400
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate preview')
            }), status_code

    except Exception as e:
        logger.error(f"Error in preview_evolved_quest: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/interest-tracks/<track_id>/evolve', methods=['POST'])
@require_auth
def evolve_track_to_quest(user_id, track_id):
    """Convert an interest track into a private quest using AI-generated structure."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        title = data.get('title')
        if not title or not title.strip():
            return jsonify({'error': 'Quest title is required'}), 400

        description = data.get('description')
        tasks = data.get('tasks')  # Optional: AI-generated or user-edited tasks

        result = InterestTracksService.evolve_to_quest(
            user_id=user_id,
            track_id=track_id,
            title=title.strip(),
            description=description.strip() if description else None,
            tasks=tasks
        )

        if result['success']:
            return jsonify({
                'success': True,
                'quest': result['quest'],
                'quest_id': result['quest_id'],
                'tasks_created': result['tasks_created'],
                'message': result['message']
            }), 201
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 400
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to evolve track')
            }), status_code

    except Exception as e:
        logger.error(f"Error in evolve_track_to_quest: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/topics/unified', methods=['GET'])
@require_auth
def get_unified_topics(user_id):
    """Get combined list of interest tracks and active quests as topics."""
    try:
        result = InterestTracksService.get_unified_topics(user_id=user_id)

        if result['success']:
            return jsonify({
                'success': True,
                'topics': result['topics'],
                'course_topics': result.get('course_topics', []),
                'quest_count': result.get('quest_count', 0),
                'course_count': result.get('course_count', 0),
                'track_count': result.get('track_count', 0)
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch topics'),
                'topics': [],
                'course_topics': []
            }), 500

    except Exception as e:
        logger.error(f"Error in get_unified_topics: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/learning-events/<moment_id>/assign-topic', methods=['POST'])
@require_auth
def assign_moment_to_topic(user_id, moment_id):
    """Add or remove a topic assignment for a learning moment."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        topic_type = data.get('type')  # 'track' or 'quest'
        topic_id = data.get('topic_id')  # Can be None to unassign all of this type
        action = data.get('action', 'add')  # 'add' or 'remove'

        # Validate topic_type if topic_id is provided
        if topic_id and topic_type not in ['track', 'quest']:
            return jsonify({'error': 'Type must be "track" or "quest"'}), 400

        if action not in ['add', 'remove']:
            return jsonify({'error': 'Action must be "add" or "remove"'}), 400

        result = InterestTracksService.assign_moment_to_topic(
            user_id=user_id,
            moment_id=moment_id,
            topic_type=topic_type or 'track',
            topic_id=topic_id,
            action=action
        )

        if result['success']:
            return jsonify({
                'success': True,
                'moment': result.get('moment'),
                'message': 'Moment assigned successfully' if topic_id else 'Moment unassigned'
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 400
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to assign moment')
            }), status_code

    except Exception as e:
        logger.error(f"Error in assign_moment_to_topic: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/quests/<quest_id>/moments', methods=['GET'])
@require_auth
def get_quest_moments(user_id, quest_id):
    """Get learning moments assigned to a specific quest."""
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        if limit < 1 or limit > 100:
            return jsonify({'error': 'Limit must be between 1 and 100'}), 400

        result = InterestTracksService.get_quest_moments(
            user_id=user_id,
            quest_id=quest_id,
            limit=limit,
            offset=offset
        )

        if result['success']:
            return jsonify({
                'success': True,
                'quest': result['quest'],
                'user_quest_id': result['user_quest_id'],
                'moments': result['moments'],
                'moment_count': result['moment_count']
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch quest moments')
            }), status_code

    except Exception as e:
        logger.error(f"Error in get_quest_moments: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@interest_tracks_bp.route('/api/learning-events/<moment_id>/convert-to-task', methods=['POST'])
@require_auth
def convert_moment_to_task(user_id, moment_id):
    """Convert a quest-assigned learning moment into a task on that quest."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        title = data.get('title')
        pillar = data.get('pillar', 'stem')
        xp_value = data.get('xp_value', 100)

        # Validate pillar
        valid_pillars = ['art', 'stem', 'wellness', 'communication', 'civics']
        if pillar not in valid_pillars:
            return jsonify({'error': f'Pillar must be one of: {", ".join(valid_pillars)}'}), 400

        # Validate xp_value
        if not isinstance(xp_value, int) or xp_value < 10 or xp_value > 500:
            return jsonify({'error': 'XP value must be between 10 and 500'}), 400

        result = InterestTracksService.convert_moment_to_task(
            user_id=user_id,
            moment_id=moment_id,
            title=title.strip() if title else None,
            pillar=pillar,
            xp_value=xp_value
        )

        if result['success']:
            return jsonify({
                'success': True,
                'task': result['task'],
                'message': result['message']
            }), 201
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 400
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to convert moment')
            }), status_code

    except Exception as e:
        logger.error(f"Error in convert_moment_to_task: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
