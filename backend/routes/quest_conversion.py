"""
Quest Conversion Routes
=======================

API endpoints for "graduating" learning moments into formal Quests.

Endpoints:
- POST /api/quest-conversions/preview      Generate Quest preview from moments
- POST /api/quest-conversions/create       Create Quest from preview
- GET  /api/quest-conversions              List user's conversions
- GET  /api/quest-conversions/<id>         Get conversion details
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.quest_conversion_service import QuestConversionService
from services.quest_generation_ai_service import QuestGenerationAIService
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

quest_conversion_bp = Blueprint('quest_conversion', __name__)


@quest_conversion_bp.route('/api/quest-conversions/preview', methods=['POST'])
@require_auth
def generate_quest_preview(user_id):
    """Generate a Quest preview from learning moments."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        moment_ids = data.get('moment_ids')
        track_id = data.get('track_id')

        if not moment_ids and not track_id:
            return jsonify({
                'error': 'Either moment_ids or track_id is required'
            }), 400

        result = QuestConversionService.generate_quest_preview(
            user_id=user_id,
            moment_ids=moment_ids,
            track_id=track_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'preview': result['preview']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate preview')
            }), 500

    except Exception as e:
        logger.error(f"Error in generate_quest_preview: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@quest_conversion_bp.route('/api/quest-conversions/create', methods=['POST'])
@require_auth
def create_quest_from_moments(user_id):
    """Create a Quest from a preview structure."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        preview = data.get('preview')
        if not preview:
            return jsonify({'error': 'Preview is required'}), 400

        title = data.get('title')
        description = data.get('description')

        result = QuestConversionService.create_quest_from_moments(
            user_id=user_id,
            preview=preview,
            title=title,
            description=description
        )

        if result['success']:
            return jsonify({
                'success': True,
                'quest': result['quest'],
                'conversion': result['conversion'],
                'xp_awarded': result['xp_awarded'],
                'tasks_created': result['tasks_created'],
                'message': f'Quest created! You earned {result["xp_awarded"]} XP.'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to create quest')
            }), 500

    except Exception as e:
        logger.error(f"Error in create_quest_from_moments: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@quest_conversion_bp.route('/api/quest-conversions', methods=['GET'])
@require_auth
def get_user_conversions(user_id):
    """Get all quest conversions for the authenticated user."""
    try:
        result = QuestConversionService.get_user_conversions(user_id=user_id)

        if result['success']:
            return jsonify({
                'success': True,
                'conversions': result['conversions']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch conversions'),
                'conversions': []
            }), 500

    except Exception as e:
        logger.error(f"Error in get_user_conversions: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@quest_conversion_bp.route('/api/quest-conversions/<conversion_id>', methods=['GET'])
@require_auth
def get_conversion_details(user_id, conversion_id):
    """Get details of a specific conversion."""
    try:
        result = QuestConversionService.get_conversion_details(
            user_id=user_id,
            conversion_id=conversion_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'conversion': result['conversion']
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch conversion')
            }), status_code

    except Exception as e:
        logger.error(f"Error in get_conversion_details: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@quest_conversion_bp.route('/api/quest-conversions/estimate-xp', methods=['POST'])
@require_auth
def estimate_xp(user_id):
    """Estimate XP that would be awarded for moments."""
    try:
        from database import get_supabase_admin_client

        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        moment_ids = data.get('moment_ids')
        track_id = data.get('track_id')

        if not moment_ids and not track_id:
            return jsonify({
                'error': 'Either moment_ids or track_id is required'
            }), 400

        supabase = get_supabase_admin_client()

        # Get moments
        if track_id:
            response = supabase.table('learning_events') \
                .select('*') \
                .eq('track_id', track_id) \
                .eq('user_id', user_id) \
                .execute()
        else:
            response = supabase.table('learning_events') \
                .select('*') \
                .in_('id', moment_ids) \
                .eq('user_id', user_id) \
                .execute()

        moments = response.data or []

        result = QuestConversionService.calculate_retroactive_xp(moments)

        if result['success']:
            return jsonify({
                'success': True,
                'estimate': {
                    'estimated_xp': result['estimated_xp'],
                    'original_xp': result['original_xp'],
                    'multiplier': result['multiplier'],
                    'moment_count': len(moments)
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to estimate XP')
            }), 500

    except Exception as e:
        logger.error(f"Error in estimate_xp: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@quest_conversion_bp.route('/api/quest-conversions/suggest-improvements', methods=['POST'])
@require_auth
def suggest_improvements(user_id):
    """Get AI suggestions for missing areas in the learning."""
    try:
        from database import get_supabase_admin_client

        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        moment_ids = data.get('moment_ids')
        track_id = data.get('track_id')

        supabase = get_supabase_admin_client()

        # Get moments
        if track_id:
            response = supabase.table('learning_events') \
                .select('*') \
                .eq('track_id', track_id) \
                .eq('user_id', user_id) \
                .execute()
        elif moment_ids:
            response = supabase.table('learning_events') \
                .select('*') \
                .in_('id', moment_ids) \
                .eq('user_id', user_id) \
                .execute()
        else:
            return jsonify({
                'error': 'Either moment_ids or track_id is required'
            }), 400

        moments = response.data or []

        if not moments:
            return jsonify({
                'success': True,
                'suggestions': {
                    'missing_areas': [],
                    'overall_assessment': 'No moments to analyze'
                }
            }), 200

        ai_service = QuestGenerationAIService()
        result = ai_service.suggest_missing_areas(moments)

        if result['success']:
            return jsonify({
                'success': True,
                'suggestions': result
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate suggestions')
            }), 500

    except Exception as e:
        logger.error(f"Error in suggest_improvements: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
