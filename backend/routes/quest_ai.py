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

@bp.route('/approach-examples/<quest_id>', methods=['GET'])
def get_approach_examples(quest_id: str):
    """
    Get or generate approach examples for a quest.

    These are AI-generated diverse approach examples showing different ways to tackle the quest.
    Examples are cached in the database to avoid repeated API calls.

    Public endpoint - no authentication required (quest data is public).
    """
    try:
        from database import get_supabase_admin_client

        # Validate quest_id format
        if not quest_id or len(quest_id) < 32:
            return jsonify({
                'success': False,
                'error': 'Invalid quest ID'
            }), 400

        # Get quest data
        supabase = get_supabase_admin_client()
        quest_result = supabase.table('quests').select(
            'id, title, big_idea, description, approach_examples'
        ).eq('id', quest_id).single().execute()

        if not quest_result.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404

        quest = quest_result.data

        # Check if we already have cached examples
        if quest.get('approach_examples'):
            cached = quest['approach_examples']
            # Handle both formats: direct list or wrapped in dict
            approaches = cached if isinstance(cached, list) else cached.get('approaches', [])
            if approaches:
                return jsonify({
                    'success': True,
                    'approaches': approaches,
                    'from_cache': True
                }), 200

        # Generate new examples using AI service
        ai_service = get_quest_ai_service()

        quest_description = quest.get('big_idea') or quest.get('description') or ''
        result = ai_service.generate_approach_examples(
            quest_id=quest_id,
            quest_title=quest.get('title', 'Untitled Quest'),
            quest_description=quest_description
        )

        if result['success']:
            return jsonify({
                'success': True,
                'approaches': result['approaches'],
                'from_cache': result.get('from_cache', False)
            }), 200
        else:
            # Return empty array on failure (graceful degradation)
            logger.warning(f"Failed to generate approach examples: {result.get('error')}")
            return jsonify({
                'success': True,
                'approaches': [],
                'error': 'Generation failed - section hidden'
            }), 200

    except Exception as e:
        logger.error(f"Error getting approach examples: {str(e)}")
        # Return empty array on error (graceful degradation per spec)
        return jsonify({
            'success': True,
            'approaches': [],
            'error': 'Internal error - section hidden'
        }), 200


@bp.route('/accept-approach/<quest_id>', methods=['POST'])
@require_auth
def accept_approach(user_id: str, quest_id: str):
    """
    Accept a starter path approach and enroll in the quest with those tasks.

    Creates enrollment and adds the approach's tasks to the student's quest.
    """
    try:
        from database import get_supabase_admin_client
        import uuid

        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400

        approach_index = data.get('approach_index')
        if approach_index is None:
            return jsonify({
                'success': False,
                'error': 'approach_index is required'
            }), 400

        supabase = get_supabase_admin_client()

        # Get quest with approach examples
        quest_result = supabase.table('quests').select(
            'id, title, approach_examples'
        ).eq('id', quest_id).single().execute()

        if not quest_result.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404

        quest = quest_result.data
        approaches = quest.get('approach_examples', [])

        # Handle "start from scratch" (approach_index = -1)
        start_from_scratch = approach_index == -1

        if not start_from_scratch:
            if not approaches or approach_index >= len(approaches):
                return jsonify({
                    'success': False,
                    'error': 'Invalid approach index'
                }), 400

            selected_approach = approaches[approach_index]
            tasks = selected_approach.get('tasks', [])

            if not tasks:
                return jsonify({
                    'success': False,
                    'error': 'Selected approach has no tasks'
                }), 400
        else:
            selected_approach = {'label': 'From Scratch'}
            tasks = []

        # Check if user already has an active enrollment
        existing = supabase.table('user_quests').select('id').eq(
            'user_id', user_id
        ).eq('quest_id', quest_id).eq('is_active', True).execute()

        if existing.data:
            return jsonify({
                'success': False,
                'error': 'Already enrolled in this quest'
            }), 400

        # Create enrollment
        enrollment_id = str(uuid.uuid4())
        enrollment_result = supabase.table('user_quests').insert({
            'id': enrollment_id,
            'user_id': user_id,
            'quest_id': quest_id,
            'is_active': True,
            'personalization_completed': True
        }).execute()

        if not enrollment_result.data:
            raise Exception('Failed to create enrollment')

        # Create tasks from the approach
        task_records = []
        for i, task in enumerate(tasks):
            task_records.append({
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'quest_id': quest_id,
                'user_quest_id': enrollment_id,
                'title': task['title'],
                'description': task.get('description', ''),
                'pillar': task.get('pillar', 'stem'),
                'xp_value': task.get('xp_value', 100),
                'order_index': i,
                'approval_status': 'approved'
            })

        if task_records:
            supabase.table('user_quest_tasks').insert(task_records).execute()

        logger.info(f"User {user_id[:8]} enrolled in quest {quest_id[:8]} with approach '{selected_approach.get('label')}'")

        return jsonify({
            'success': True,
            'enrollment_id': enrollment_id,
            'approach_label': selected_approach.get('label'),
            'tasks_created': len(task_records)
        }), 200

    except Exception as e:
        logger.error(f"Error accepting approach: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to enroll with selected approach'
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