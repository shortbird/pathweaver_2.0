"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses QuestAIService exclusively (service layer pattern)
- No direct database calls - all operations delegated to service
- Lazy service initialization for memory efficiency
- Service layer is the preferred pattern over direct repository usage

Quest AI API endpoints.
Provides AI-powered quest generation and enhancement capabilities.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth, require_admin
from utils.validation.sanitizers import sanitize_search_input, sanitize_integer
from utils.ai_access import require_ai_access
import json

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('quest_ai', __name__, url_prefix='/api/quest-ai')

# Lazy loading for AI service to save memory
_quest_ai_service = None

def get_quest_ai_service():
    """Get quest AI service with lazy initialization"""
    global _quest_ai_service
    if _quest_ai_service is None:
        from services.quest_ai_service import QuestAIService
        _quest_ai_service = QuestAIService()
    return _quest_ai_service

@bp.route('/generate', methods=['POST'])
@require_admin
def generate_quest_from_topic(user_id: str):
    """
    Generate a complete quest structure from a topic using AI.
    Submits to review queue instead of creating directly.
    Admin only endpoint for quest creation assistance.
    """
    try:
        import time
        from services.ai_quest_review_service import AIQuestReviewService

        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400

        # Validate required fields
        topic = sanitize_search_input(data.get('topic', ''), max_length=200)
        if not topic:
            return jsonify({
                'success': False,
                'error': 'Topic is required'
            }), 400

        # Optional fields with validation
        learning_objectives = sanitize_search_input(data.get('learning_objectives', ''), max_length=500)

        # Get AI service with lazy initialization
        ai_service = get_quest_ai_service()

        # Track generation time
        start_time = time.time()

        # Generate quest
        result = ai_service.generate_quest_from_topic(
            topic=topic,
            learning_objectives=learning_objectives if learning_objectives else None
        )

        generation_time_ms = int((time.time() - start_time) * 1000)

        if not result['success']:
            return jsonify({
                'success': False,
                'error': result['error']
            }), 500

        quest_data = result['quest']

        # Validate quest quality with AI
        quality_result = ai_service.validate_quest_quality(quest_data)
        ai_feedback = quality_result.get('feedback', {}) if quality_result['success'] else {}
        quality_score = ai_feedback.get('quality_score', 5.0)

        # Submit to review queue
        review_result = AIQuestReviewService.submit_for_review(
            quest_data=quest_data,
            quality_score=quality_score,
            ai_feedback=ai_feedback,
            generation_source='manual',
            generation_metrics={
                'model_name': ai_service.model_name,
                'time_to_generate_ms': generation_time_ms,
                'prompt_version': ai_service.get_prompt_version()
            }
        )

        if review_result['success']:
            return jsonify({
                'success': True,
                'review_queue_id': review_result['review_queue_id'],
                'quest': quest_data,
                'quality_score': quality_score,
                'ai_feedback': ai_feedback,
                'message': f'Quest generated and submitted for review. Quality score: {quality_score}/10'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': f'Quest generated but failed to submit for review: {review_result.get("error")}'
            }), 500

    except Exception as e:
        logger.error(f"Error generating quest: {str(e)}")
        import traceback
        return jsonify({
            'success': False,
            'error': 'Failed to generate quest'
        }), 500

@bp.route('/enhance', methods=['POST'])
@require_admin
def enhance_quest_description(user_id: str):
    """
    Enhance an existing quest description using AI.
    Admin only endpoint for quest improvement.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        title = sanitize_search_input(data.get('title', ''), max_length=200)
        current_description = sanitize_search_input(data.get('description', ''), max_length=1000)
        
        if not title:
            return jsonify({
                'success': False,
                'error': 'Quest title is required'
            }), 400
        
        if not current_description:
            return jsonify({
                'success': False,
                'error': 'Current description is required'
            }), 400
        
        # Get AI service with lazy initialization
        ai_service = get_quest_ai_service()
        
        # Enhance description
        result = ai_service.enhance_quest_description(title, current_description)
        
        if result['success']:
            return jsonify({
                'success': True,
                'enhanced_description': result['enhanced_description'],
                'original_description': current_description
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result['error']
            }), 500
            
    except Exception as e:
        logger.error(f"Error enhancing description: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to enhance description'
        }), 500

@bp.route('/suggest-tasks', methods=['POST'])
@require_admin
def suggest_tasks_for_quest(user_id: str):
    """
    Generate specific tasks for a quest using AI.
    Admin only endpoint for task generation assistance.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        title = sanitize_search_input(data.get('title', ''), max_length=200)
        description = sanitize_search_input(data.get('description', ''), max_length=1000)
        
        if not title:
            return jsonify({
                'success': False,
                'error': 'Quest title is required'
            }), 400
        
        if not description:
            return jsonify({
                'success': False,
                'error': 'Quest description is required'
            }), 400
        
        # Optional task count with validation
        target_task_count = sanitize_integer(data.get('target_task_count', 4), default=4, min_val=3, max_val=6)
        
        # Get AI service with lazy initialization
        ai_service = get_quest_ai_service()
        
        # Generate tasks
        result = ai_service.suggest_tasks_for_quest(title, description, target_task_count)
        
        if result['success']:
            return jsonify({
                'success': True,
                'tasks': result['tasks'],
                'count': len(result['tasks'])
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result['error']
            }), 500
            
    except Exception as e:
        logger.error(f"Error generating tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to generate tasks'
        }), 500

@bp.route('/validate', methods=['POST'])
@require_admin
def validate_quest_quality(user_id: str):
    """
    Analyze quest data and provide quality feedback using AI.
    Admin only endpoint for quest validation.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate that we have quest data
        quest_data = data.get('quest_data')
        if not quest_data:
            return jsonify({
                'success': False,
                'error': 'Quest data is required'
            }), 400
        
        # Get AI service with lazy initialization
        ai_service = get_quest_ai_service()
        
        # Validate quest
        result = ai_service.validate_quest_quality(quest_data)
        
        if result['success']:
            return jsonify({
                'success': True,
                'feedback': result['feedback']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result['error'],
                'feedback': result.get('feedback', {})
            }), 500
            
    except Exception as e:
        logger.error(f"Error validating quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to validate quest'
        }), 500

@bp.route('/enhance-student-idea', methods=['POST'])
@require_auth
def enhance_student_quest_idea(user_id: str):
    """
    Enhance a student's quest idea submission with AI suggestions.
    Available to all authenticated users.
    """
    try:
        # Check AI access (user-level for dependents, org-level for all)
        access_denied = require_ai_access(user_id)
        if access_denied:
            return access_denied

        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        title = sanitize_search_input(data.get('title', ''), max_length=200)
        description = sanitize_search_input(data.get('description', ''), max_length=1000)
        
        if not title:
            return jsonify({
                'success': False,
                'error': 'Quest title is required'
            }), 400
        
        if not description:
            return jsonify({
                'success': False,
                'error': 'Quest description is required'
            }), 400
        
        # Get AI service with lazy initialization
        ai_service = get_quest_ai_service()
        
        # First enhance the description
        enhanced_desc_result = ai_service.enhance_quest_description(title, description)
        
        # Then generate suggested tasks
        tasks_result = ai_service.suggest_tasks_for_quest(
            title, 
            enhanced_desc_result.get('enhanced_description', description),
            target_task_count=4
        )
        
        return jsonify({
            'success': True,
            'suggestions': {
                'enhanced_title': title,  # Keep original title for student ideas
                'enhanced_description': enhanced_desc_result.get('enhanced_description', description),
                'suggested_tasks': tasks_result.get('tasks', []),
                'original_description': description
            }
        }), 200
            
    except Exception as e:
        logger.error(f"Error enhancing student idea: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to enhance quest idea'
        }), 500

@bp.route('/health', methods=['GET'])
def health_check():
    """
    Check if AI service is available and configured correctly.
    Public endpoint for service monitoring.
    """
    try:
        # Try to initialize the AI service
        ai_service = QuestAIService()
        
        return jsonify({
            'success': True,
            'status': 'healthy',
            'ai_service': 'available',
            'model': ai_service.model_name
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'status': 'unhealthy',
            'error': str(e),
            'ai_service': 'unavailable'
        }), 503