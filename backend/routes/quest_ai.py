"""
Quest AI API endpoints.
Provides AI-powered quest generation and enhancement capabilities.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth, require_admin
from services.quest_ai_service import QuestAIService
from utils.validation.sanitizers import sanitize_search_input, sanitize_integer
import json

bp = Blueprint('quest_ai', __name__, url_prefix='/api/v3/quest-ai')

@bp.route('/generate', methods=['POST'])
@require_admin
def generate_quest_from_topic(user_id: str):
    """
    Generate a complete quest structure from a topic using AI.
    Admin only endpoint for quest creation assistance.
    """
    try:
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
        age_level = sanitize_search_input(data.get('age_level', 'high school'), max_length=50)
        learning_objectives = sanitize_search_input(data.get('learning_objectives', ''), max_length=500)
        
        # Validate age level
        valid_age_levels = ['elementary', 'middle school', 'high school', 'college']
        if age_level not in valid_age_levels:
            age_level = 'high school'
        
        # Initialize AI service
        ai_service = QuestAIService()
        
        # Generate quest
        result = ai_service.generate_quest_from_topic(
            topic=topic,
            age_level=age_level,
            learning_objectives=learning_objectives if learning_objectives else None
        )
        
        if result['success']:
            return jsonify({
                'success': True,
                'quest': result['quest'],
                'message': f'Generated quest for topic: {topic}'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result['error']
            }), 500
            
    except Exception as e:
        print(f"Error generating quest: {str(e)}")
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
        
        # Initialize AI service
        ai_service = QuestAIService()
        
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
        print(f"Error enhancing description: {str(e)}")
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
        
        # Initialize AI service
        ai_service = QuestAIService()
        
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
        print(f"Error generating tasks: {str(e)}")
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
        
        # Initialize AI service
        ai_service = QuestAIService()
        
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
        print(f"Error validating quest: {str(e)}")
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
        
        # Initialize AI service
        ai_service = QuestAIService()
        
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
        print(f"Error enhancing student idea: {str(e)}")
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