"""
Admin Batch Quest Generation Routes

Provides endpoints for:
- Content gap analysis
- Batch quest generation
- Badge-aligned quest generation
- Batch status tracking
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth, require_admin
from services.batch_quest_generation_service import BatchQuestGenerationService
import logging

logger = logging.getLogger(__name__)

batch_generation_bp = Blueprint('batch_generation', __name__)


@batch_generation_bp.route('/content-gaps', methods=['GET'])
@require_auth
@require_admin
def analyze_content_gaps(user_id):
    """
    Analyze content gaps in the quest library.

    Returns:
    {
        "success": true,
        "total_quests": 150,
        "pillar_distribution": {...},
        "xp_level_distribution": {...},
        "gaps": {...},
        "badge_coverage": [...],
        "recommendations": [...]
    }
    """
    try:
        service = BatchQuestGenerationService()
        analysis = service.analyze_content_gaps()

        return jsonify(analysis), 200

    except Exception as e:
        logger.error(f"Error analyzing content gaps: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to analyze content gaps",
            "details": str(e)
        }), 500


@batch_generation_bp.route('/start', methods=['POST'])
@require_auth
@require_admin
def start_batch_generation(user_id):
    """
    Start a batch quest generation job.

    Request body:
    {
        "count": 5,
        "target_pillar": "stem_logic",  // optional
        "target_badge_id": "uuid",      // optional
        "difficulty_level": "beginner", // optional: beginner|intermediate|advanced
        "batch_id": "uuid"              // optional
    }

    Returns:
    {
        "success": true,
        "batch_id": "...",
        "total_requested": 5,
        "generated": [...],
        "failed": [...],
        "submitted_to_review": 5
    }
    """
    try:
        data = request.get_json()

        if not data or 'count' not in data:
            return jsonify({
                "success": False,
                "error": "Missing required field: count"
            }), 400

        count = data.get('count')
        target_pillar = data.get('target_pillar')
        target_badge_id = data.get('target_badge_id')
        difficulty_level = data.get('difficulty_level')
        batch_id = data.get('batch_id')

        if count < 1 or count > 20:
            return jsonify({
                "success": False,
                "error": "Batch size must be between 1 and 20"
            }), 400

        # Validate pillar if provided
        valid_pillars = ['life_wellness', 'language_communication', 'stem_logic', 'society_culture', 'arts_creativity']
        if target_pillar and target_pillar not in valid_pillars:
            return jsonify({
                "success": False,
                "error": f"Invalid pillar. Must be one of: {', '.join(valid_pillars)}"
            }), 400

        # Validate difficulty if provided
        valid_difficulties = ['beginner', 'intermediate', 'advanced']
        if difficulty_level and difficulty_level not in valid_difficulties:
            return jsonify({
                "success": False,
                "error": f"Invalid difficulty. Must be one of: {', '.join(valid_difficulties)}"
            }), 400

        service = BatchQuestGenerationService()
        result = service.generate_batch(
            count=count,
            target_pillar=target_pillar,
            target_badge_id=target_badge_id,
            difficulty_level=difficulty_level,
            batch_id=batch_id
        )

        return jsonify(result), 200 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Error starting batch generation: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to start batch generation",
            "details": str(e)
        }), 500


@batch_generation_bp.route('/status/<batch_id>', methods=['GET'])
@require_auth
@require_admin
def get_batch_status(user_id, batch_id):
    """
    Get the status of a batch generation job.

    Returns:
    {
        "success": true,
        "status": {
            "batch_id": "...",
            "total_generated": 5,
            "pending_review": 5,
            "approved": 0,
            "rejected": 0,
            "quests": [...]
        }
    }
    """
    try:
        service = BatchQuestGenerationService()
        result = service.get_batch_status(batch_id)

        return jsonify(result), 200 if result.get('success') else 404

    except Exception as e:
        logger.error(f"Error getting batch status: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to get batch status",
            "details": str(e)
        }), 500


@batch_generation_bp.route('/badge-aligned', methods=['POST'])
@require_auth
@require_admin
def generate_badge_aligned(user_id):
    """
    Generate quests specifically for a badge.

    Request body:
    {
        "badge_id": "uuid",
        "count": 5  // optional, default 5
    }

    Returns:
    {
        "success": true,
        "batch_id": "...",
        "generated": [...],
        "submitted_to_review": 5
    }
    """
    try:
        data = request.get_json()

        if not data or 'badge_id' not in data:
            return jsonify({
                "success": False,
                "error": "Missing required field: badge_id"
            }), 400

        badge_id = data.get('badge_id')
        count = data.get('count', 5)

        if count < 1 or count > 20:
            return jsonify({
                "success": False,
                "error": "Count must be between 1 and 20"
            }), 400

        service = BatchQuestGenerationService()
        result = service.generate_for_badge(badge_id, count)

        return jsonify(result), 200 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Error generating badge-aligned quests: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to generate badge-aligned quests",
            "details": str(e)
        }), 500
