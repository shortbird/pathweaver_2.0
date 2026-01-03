"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Primarily uses StudentAIAssistantService (service layer pattern)
- Only 2 direct database calls to fetch quest data for similarity comparison (lines 164-180)
- Simple queries acceptable; service layer is preferred pattern over repository
- AI functionality properly abstracted in service layer

Student AI Assistance Routes

Provides API endpoints for AI-powered student assistance:
- Quest idea improvements
- Similar quest discovery
- Idea validation
- Task recommendations

All endpoints require authentication but are available to all student tier levels.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from utils.ai_access import require_ai_access
from services.student_ai_assistant_service import StudentAIAssistantService
from database import get_supabase_admin_client
from repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

student_ai_bp = Blueprint('student_ai', __name__)


@student_ai_bp.route('/suggest-improvements', methods=['POST'])
@require_auth
def suggest_improvements(user_id):
    """
    Get AI suggestions to improve a quest idea.

    Request body:
    {
        "title": "Quest title",
        "description": "Quest description",
        "user_context": {  // optional
            "age": 14,
            "interests": ["science", "coding"]
        }
    }

    Returns:
    {
        "success": true,
        "suggestions": {
            "overall_assessment": "...",
            "strengths": [...],
            "improvements": {...},
            "pillar_recommendations": [...],
            "xp_recommendation": {...},
            "philosophy_alignment": {...},
            "engagement_score": 85,
            "missing_elements": [...]
        }
    }
    """
    try:
        # Check AI access (user-level for dependents, org-level for all)
        access_denied = require_ai_access(user_id)
        if access_denied:
            return access_denied

        data = request.get_json()

        if not data or 'title' not in data or 'description' not in data:
            return jsonify({
                "success": False,
                "error": "Missing required fields: title and description"
            }), 400

        title = data.get('title', '').strip()
        description = data.get('description', '').strip()
        user_context = data.get('user_context')

        if not title or not description:
            return jsonify({
                "success": False,
                "error": "Title and description cannot be empty"
            }), 400

        # Initialize AI assistant service
        assistant = StudentAIAssistantService()

        # Get suggestions
        result = assistant.suggest_quest_improvements(
            title=title,
            description=description,
            user_context=user_context
        )

        if not result.get('success'):
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error getting AI suggestions: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to get AI suggestions",
            "details": str(e)
        }), 500


@student_ai_bp.route('/similar-quests', methods=['POST'])
@require_auth
def find_similar_quests(user_id):
    """
    Find similar existing quests for inspiration.

    Request body:
    {
        "title": "Quest title",
        "description": "Quest description",
        "limit": 3  // optional, default 3
    }

    Returns:
    {
        "success": true,
        "recommendations": {
            "similar_quests": [
                {
                    "quest_id": "...",
                    "title": "...",
                    "similarity_score": 85,
                    "why_similar": "...",
                    "inspiration_points": "..."
                }
            ],
            "unique_aspects": "..."
        }
    }
    """
    try:
        # Check AI access (user-level for dependents, org-level for all)
        access_denied = require_ai_access(user_id)
        if access_denied:
            return access_denied

        data = request.get_json()

        if not data or 'title' not in data or 'description' not in data:
            return jsonify({
                "success": False,
                "error": "Missing required fields: title and description"
            }), 400

        title = data.get('title', '').strip()
        description = data.get('description', '').strip()
        limit = data.get('limit', 3)

        if not title or not description:
            return jsonify({
                "success": False,
                "error": "Title and description cannot be empty"
            }), 400

        # Get active quests from database
        supabase = get_supabase_admin_client()
        response = supabase.table('quests')\
            .select('id, title, description, pillar')\
            .eq('is_active', True)\
            .limit(100)\
            .execute()

        existing_quests = response.data if response.data else []

        # Get total XP for each quest (from quest_tasks)
        for quest in existing_quests:
            tasks_response = supabase.table('quest_tasks')\
                .select('xp_amount')\
                .eq('quest_id', quest['id'])\
                .execute()

            total_xp = sum(task.get('xp_amount', 0) for task in (tasks_response.data or []))
            quest['total_xp'] = total_xp

        # Initialize AI assistant service
        assistant = StudentAIAssistantService()

        # Find similar quests
        result = assistant.generate_similar_examples(
            title=title,
            description=description,
            existing_quests=existing_quests,
            limit=limit
        )

        if not result.get('success'):
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error finding similar quests: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to find similar quests",
            "details": str(e)
        }), 500


@student_ai_bp.route('/validate-idea', methods=['POST'])
@require_auth
def validate_idea(user_id):
    """
    Validate if a quest idea is ready for submission.

    Request body:
    {
        "title": "Quest title",
        "description": "Quest description",
        "suggested_tasks": ["Task 1", "Task 2"]  // optional
    }

    Returns:
    {
        "success": true,
        "validation": {
            "is_ready": true,
            "overall_score": 85,
            "validation_results": {
                "clarity": {"score": 90, "feedback": "..."},
                "feasibility": {"score": 85, "feedback": "..."},
                ...
            },
            "required_improvements": [],
            "optional_improvements": [...],
            "encouragement": "..."
        }
    }
    """
    try:
        # Check AI access (user-level for dependents, org-level for all)
        access_denied = require_ai_access(user_id)
        if access_denied:
            return access_denied

        data = request.get_json()

        if not data or 'title' not in data or 'description' not in data:
            return jsonify({
                "success": False,
                "error": "Missing required fields: title and description"
            }), 400

        title = data.get('title', '').strip()
        description = data.get('description', '').strip()
        suggested_tasks = data.get('suggested_tasks')

        if not title or not description:
            return jsonify({
                "success": False,
                "error": "Title and description cannot be empty"
            }), 400

        # Initialize AI assistant service
        assistant = StudentAIAssistantService()

        # Validate quest idea
        result = assistant.validate_quest_idea(
            title=title,
            description=description,
            suggested_tasks=suggested_tasks
        )

        if not result.get('success'):
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error validating quest idea: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to validate quest idea",
            "details": str(e)
        }), 500


@student_ai_bp.route('/recommend-tasks', methods=['POST'])
@require_auth
def recommend_tasks(user_id):
    """
    Get AI-recommended tasks for a quest idea.

    Request body:
    {
        "title": "Quest title",
        "description": "Quest description",
        "num_tasks": 3  // optional, default 3
    }

    Returns:
    {
        "success": true,
        "task_recommendations": {
            "tasks": [
                {
                    "title": "...",
                    "description": "...",
                    "pillar": "...",
                    "estimated_xp": 100,
                    "estimated_time": "...",
                    "evidence_suggestion": "..."
                }
            ]
        }
    }
    """
    try:
        # Check AI access (user-level for dependents, org-level for all)
        access_denied = require_ai_access(user_id)
        if access_denied:
            return access_denied

        data = request.get_json()

        if not data or 'title' not in data or 'description' not in data:
            return jsonify({
                "success": False,
                "error": "Missing required fields: title and description"
            }), 400

        title = data.get('title', '').strip()
        description = data.get('description', '').strip()
        num_tasks = data.get('num_tasks', 3)

        if not title or not description:
            return jsonify({
                "success": False,
                "error": "Title and description cannot be empty"
            }), 400

        if num_tasks < 1 or num_tasks > 10:
            return jsonify({
                "success": False,
                "error": "num_tasks must be between 1 and 10"
            }), 400

        # Initialize AI assistant service
        assistant = StudentAIAssistantService()

        # Get task recommendations
        result = assistant.recommend_tasks(
            title=title,
            description=description,
            num_tasks=num_tasks
        )

        if not result.get('success'):
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error recommending tasks: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to recommend tasks",
            "details": str(e)
        }), 500
