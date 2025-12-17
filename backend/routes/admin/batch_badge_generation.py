"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses BatchBadgeGenerationService exclusively (service layer pattern)
- AI-driven batch badge creation workflow
- Service layer essential for complex AI orchestration
- No direct database calls - all delegated to service

Admin Batch Badge Generation Routes

Provides endpoints for:
- Batch badge generation
- Badge approval and creation
- Badge rejection
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_admin
from services.batch_badge_generation_service import BatchBadgeGenerationService
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

batch_badge_generation_bp = Blueprint('batch_badge_generation', __name__)


@batch_badge_generation_bp.route('/start', methods=['POST'])
@require_admin
def start_batch_badge_generation(user_id):
    """
    Start a batch badge generation job.

    Request body:
    {
        "count": 5,                          // Required: 1-10 badges
        "target_pillar": "stem_logic",       // Optional
        "complexity_level": "intermediate",  // Optional: beginner|intermediate|advanced
        "trending_topic": "Game Design",     // Optional
        "batch_id": "uuid"                   // Optional
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
        complexity_level = data.get('complexity_level')
        trending_topic = data.get('trending_topic')
        batch_id = data.get('batch_id')

        if count < 1 or count > 10:
            return jsonify({
                "success": False,
                "error": "Batch size must be between 1 and 10"
            }), 400

        # Validate pillar if provided
        valid_pillars = ['life_wellness', 'language_communication', 'stem_logic', 'society_culture', 'arts_creativity']
        if target_pillar and target_pillar not in valid_pillars:
            return jsonify({
                "success": False,
                "error": f"Invalid pillar. Must be one of: {', '.join(valid_pillars)}"
            }), 400

        # Validate complexity if provided
        valid_complexity = ['beginner', 'intermediate', 'advanced']
        if complexity_level and complexity_level not in valid_complexity:
            return jsonify({
                "success": False,
                "error": f"Invalid complexity. Must be one of: {', '.join(valid_complexity)}"
            }), 400

        service = BatchBadgeGenerationService()
        result = service.generate_batch(
            count=count,
            target_pillar=target_pillar,
            complexity_level=complexity_level,
            trending_topic=trending_topic,
            batch_id=batch_id
        )

        return jsonify(result), 200 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Error starting batch badge generation: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to start batch badge generation",
            "details": str(e)
        }), 500


@batch_badge_generation_bp.route('/status/<batch_id>', methods=['GET'])
@require_admin
def get_batch_badge_status(user_id, batch_id):
    """
    Get the status of a batch badge generation job.

    Returns:
    {
        "success": true,
        "batch_id": "...",
        "badges": [...]
    }
    """
    try:
        service = BatchBadgeGenerationService()
        result = service.get_batch_status(batch_id)

        return jsonify(result), 200 if result.get('success') else 404

    except Exception as e:
        logger.error(f"Error getting batch badge status: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to get batch badge status",
            "details": str(e)
        }), 500


@batch_badge_generation_bp.route('/approve', methods=['POST'])
@require_admin
def approve_and_create_badge(user_id):
    """
    Approve a generated badge and create it in the database.

    Request body:
    {
        "badge_data": {...},              // Badge data from generation
        "generate_image": true,           // Optional: generate Pexels image
        "generate_quests": false,         // Optional: generate initial quests
        "quest_count": 10                 // Optional: number of quests (default 10)
    }

    Returns:
    {
        "success": true,
        "badge": {...},
        "image_generated": true,
        "quests_generated": 10
    }
    """
    try:
        data = request.get_json()

        if not data or 'badge_data' not in data:
            return jsonify({
                "success": False,
                "error": "Missing required field: badge_data"
            }), 400

        badge_data = data.get('badge_data')
        generate_image = data.get('generate_image', False)
        generate_quests = data.get('generate_quests', False)
        quest_count = data.get('quest_count', 10)

        service = BatchBadgeGenerationService()
        result = service.create_badge_from_generation(
            badge_data=badge_data,
            generate_image=generate_image,
            generate_quests=generate_quests,
            quest_count=quest_count
        )

        return jsonify(result), 201 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Error approving badge: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to approve badge",
            "details": str(e)
        }), 500


@batch_badge_generation_bp.route('/reject', methods=['POST'])
@require_admin
def reject_badge(user_id):
    """
    Reject a generated badge (no action needed, just logs).

    Request body:
    {
        "temp_id": "...",
        "reason": "..."
    }

    Returns:
    {
        "success": true,
        "message": "Badge rejected"
    }
    """
    try:
        data = request.get_json()

        temp_id = data.get('temp_id')
        reason = data.get('reason', 'No reason provided')

        logger.info(f"Badge {temp_id} rejected by admin {user_id}. Reason: {reason}")

        return jsonify({
            "success": True,
            "message": "Badge rejected successfully"
        }), 200

    except Exception as e:
        logger.error(f"Error rejecting badge: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to reject badge",
            "details": str(e)
        }), 500
