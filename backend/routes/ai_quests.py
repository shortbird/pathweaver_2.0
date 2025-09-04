"""
AI Quest Generation API Routes
Endpoints for AI-powered quest generation and similarity checking
"""

from flask import Blueprint, request, jsonify
from supabase import create_client, Client
import os
import asyncio
from datetime import datetime
from typing import Dict, List
from utils.auth.decorators import require_auth
from utils.auth.token_utils import verify_token

# Import services
from services.ai_quest_generator import AIQuestGenerator
from services.quest_concept_matcher import QuestConceptMatcher
from utils.quest_validation import QuestValidator

# Initialize services
ai_generator = None
concept_matcher = None
validator = None

# Initialize Supabase client
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
supabase: Client = create_client(supabase_url, supabase_key)

# Create blueprint
ai_quests_bp = Blueprint('ai_quests', __name__)

def init_services():
    """Initialize AI services (lazy loading)"""
    global ai_generator, concept_matcher, validator
    
    if not ai_generator:
        try:
            ai_generator = AIQuestGenerator()
        except Exception as e:
            print(f"Failed to initialize AI generator: {e}")
    
    if not concept_matcher:
        concept_matcher = QuestConceptMatcher()
    
    if not validator:
        validator = QuestValidator()

@ai_quests_bp.route('/ai/generate-quest', methods=['POST'])
@require_auth
async def generate_quest(user_id):
    """Generate a new quest using AI"""
    
    try:
        # Check user role (only admins can generate quests)
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        
        if not user_response.data or user_response.data.get('role') != 'admin':
            return jsonify({'error': 'Unauthorized. Admin access required'}), 403
        
        # Initialize services if needed
        init_services()
        
        if not ai_generator:
            return jsonify({'error': 'AI service not available'}), 503
        
        # Get request data
        data = request.json
        generation_mode = data.get('mode', 'topic')  # topic, skill, difficulty, custom
        parameters = data.get('parameters', {})
        
        # Validate input
        valid_modes = ['topic', 'skill', 'difficulty', 'custom']
        if generation_mode not in valid_modes:
            return jsonify({'error': f'Invalid generation mode. Must be one of: {valid_modes}'}), 400
        
        # Generate quest
        result = await ai_generator.generate_quest(
            generation_mode=generation_mode,
            parameters=parameters,
            user_context={'user_id': user_id}
        )
        
        if not result['success']:
            return jsonify({
                'error': 'Failed to generate quest',
                'message': result.get('message', 'Unknown error')
            }), 500
        
        generated_quest = result['quest']
        
        # Validate the generated quest
        validation_result = validator.validate_quest(generated_quest)
        
        # Check similarity with existing quests
        existing_quests = supabase.table('quests').select('*').eq('is_active', True).execute()
        similarity_result = await concept_matcher.check_quest_similarity(
            generated_quest,
            existing_quests.data if existing_quests.data else []
        )
        
        # Prepare response
        response_data = {
            'success': True,
            'quest': generated_quest,
            'validation': validation_result,
            'similarity': similarity_result,
            'requires_review': (
                not validation_result['is_valid'] or 
                similarity_result['exceeds_threshold']
            )
        }
        
        # Add warnings if needed
        if similarity_result['exceeds_threshold']:
            response_data['warning'] = 'Similar quest detected'
            response_data['similar_quest'] = similarity_result['most_similar']
        
        return jsonify(response_data), 200
        
    except Exception as e:
        print(f"Error generating quest: {e}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500

@ai_quests_bp.route('/ai/check-similarity', methods=['POST'])
@require_auth
async def check_similarity(user_id):
    """Check similarity between a quest and existing quests"""
    
    try:
        # Initialize services
        init_services()
        
        if not concept_matcher:
            return jsonify({'error': 'Similarity service not available'}), 503
        
        # Get quest data
        quest_data = request.json.get('quest')
        if not quest_data:
            return jsonify({'error': 'Quest data required'}), 400
        
        # Get existing quests
        existing_quests = supabase.table('quests').select('*').eq('is_active', True).execute()
        
        # Check similarity
        similarity_result = await concept_matcher.check_quest_similarity(
            quest_data,
            existing_quests.data if existing_quests.data else [],
            threshold=request.json.get('threshold', 0.7)
        )
        
        return jsonify({
            'success': True,
            'similarity': similarity_result
        }), 200
        
    except Exception as e:
        print(f"Error checking similarity: {e}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500

@ai_quests_bp.route('/ai/generation-options', methods=['GET'])
@require_auth
def get_generation_options(user_id):
    """Get available generation options and templates"""
    
    try:
        # Check user role
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        
        if not user_response.data or user_response.data.get('role') not in ['admin', 'advisor']:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Initialize services
        init_services()
        
        if not ai_generator:
            return jsonify({'error': 'AI service not available'}), 503
        
        # Get templates
        templates = ai_generator.generate_quest_templates()
        
        # Get generation modes
        modes = [
            {
                'id': 'topic',
                'name': 'Topic-Based',
                'description': 'Generate a quest about a specific topic',
                'parameters': ['topic', 'age_group', 'pillars']
            },
            {
                'id': 'skill',
                'name': 'Skill-Focused',
                'description': 'Generate a quest that develops specific skills',
                'parameters': ['skills', 'pillars', 'difficulty']
            },
            {
                'id': 'difficulty',
                'name': 'Difficulty-Targeted',
                'description': 'Generate a quest for a specific difficulty level',
                'parameters': ['difficulty', 'subject']
            },
            {
                'id': 'custom',
                'name': 'Custom Requirements',
                'description': 'Generate a quest with custom requirements',
                'parameters': ['requirements']
            }
        ]
        
        # Get available pillars
        pillars = [
            "STEM & Logic",
            "Life & Wellness",
            "Language & Communication",
            "Society & Culture",
            "Arts & Creativity"
        ]
        
        # Get difficulty levels
        difficulty_levels = ['beginner', 'intermediate', 'advanced']
        
        return jsonify({
            'success': True,
            'templates': templates,
            'modes': modes,
            'pillars': pillars,
            'difficulty_levels': difficulty_levels
        }), 200
        
    except Exception as e:
        print(f"Error getting generation options: {e}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500

@ai_quests_bp.route('/ai/enhance-submission', methods=['POST'])
@require_auth
async def enhance_submission(user_id):
    """Enhance a student's quest submission with AI"""
    
    try:
        # Get submission data
        submission_data = request.json.get('submission')
        if not submission_data:
            return jsonify({'error': 'Submission data required'}), 400
        
        # Initialize services
        init_services()
        
        if not ai_generator:
            return jsonify({'error': 'AI service not available'}), 503
        
        # Enhance the submission
        result = await ai_generator.enhance_submission(submission_data)
        
        if not result['success']:
            return jsonify({
                'error': 'Failed to enhance submission',
                'message': result.get('message', 'Unknown error')
            }), 500
        
        enhanced_quest = result['quest']
        
        # Validate the enhanced quest
        validation_result = validator.validate_quest(enhanced_quest)
        
        # Check similarity
        existing_quests = supabase.table('quests').select('*').eq('is_active', True).execute()
        similarity_result = await concept_matcher.check_quest_similarity(
            enhanced_quest,
            existing_quests.data if existing_quests.data else []
        )
        
        return jsonify({
            'success': True,
            'enhanced_quest': enhanced_quest,
            'original': result['original'],
            'validation': validation_result,
            'similarity': similarity_result
        }), 200
        
    except Exception as e:
        print(f"Error enhancing submission: {e}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500

@ai_quests_bp.route('/ai/batch-generate', methods=['POST'])
@require_auth
async def batch_generate(user_id):
    """Generate multiple quests in batch"""
    
    try:
        # Check admin role
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        
        if not user_response.data or user_response.data.get('role') != 'admin':
            return jsonify({'error': 'Unauthorized. Admin access required'}), 403
        
        # Initialize services
        init_services()
        
        if not ai_generator:
            return jsonify({'error': 'AI service not available'}), 503
        
        # Get batch parameters
        data = request.json
        count = min(data.get('count', 1), 10)  # Limit to 10 quests
        mode = data.get('mode', 'topic')
        base_params = data.get('base_parameters', {})
        variations = data.get('variations', [])
        
        # Generate quests
        quests = await ai_generator.generate_batch(
            count=count,
            mode=mode,
            base_params=base_params,
            variations=variations
        )
        
        # Validate all quests
        validation_results = validator.validate_batch(quests)
        
        # Check similarities
        existing_quests = supabase.table('quests').select('*').eq('is_active', True).execute()
        existing_data = existing_quests.data if existing_quests.data else []
        
        similarity_results = []
        for quest in quests:
            similarity = await concept_matcher.check_quest_similarity(quest, existing_data)
            similarity_results.append(similarity)
        
        # Build concept index for the batch
        batch_index = await concept_matcher.build_concept_index(quests)
        
        return jsonify({
            'success': True,
            'quests': quests,
            'validations': validation_results,
            'similarities': similarity_results,
            'batch_summary': {
                'total_generated': len(quests),
                'valid_quests': sum(1 for v in validation_results if v['is_valid']),
                'unique_quests': sum(1 for s in similarity_results if not s['exceeds_threshold']),
                'concept_index': {
                    'total_concepts': len(batch_index['concepts']),
                    'unique_activities': len(batch_index['by_activity']),
                    'unique_topics': len(batch_index['by_topic']),
                    'unique_skills': len(batch_index['by_skill'])
                }
            }
        }), 200
        
    except Exception as e:
        print(f"Error in batch generation: {e}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500

@ai_quests_bp.route('/ai/save-generated-quest', methods=['POST'])
@require_auth
def save_generated_quest(user_id):
    """Save an AI-generated quest to the database"""
    
    try:
        # Check admin role
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        
        if not user_response.data or user_response.data.get('role') != 'admin':
            return jsonify({'error': 'Unauthorized. Admin access required'}), 403
        
        # Get quest data
        quest_data = request.json.get('quest')
        if not quest_data:
            return jsonify({'error': 'Quest data required'}), 400
        
        # Extract tasks from quest data
        tasks = quest_data.pop('tasks', [])
        
        # Prepare quest for database
        quest_data['created_by'] = user_id
        quest_data['created_at'] = datetime.utcnow().isoformat()
        quest_data['is_v3'] = True
        quest_data['source'] = quest_data.get('source', 'ai_generated')
        quest_data['is_active'] = request.json.get('publish', False)
        
        # Insert quest
        quest_response = supabase.table('quests').insert(quest_data).execute()
        
        if not quest_response.data:
            return jsonify({'error': 'Failed to save quest'}), 500
        
        quest_id = quest_response.data[0]['id']
        
        # Insert tasks
        for i, task in enumerate(tasks):
            task['quest_id'] = quest_id
            task['order_index'] = task.get('order_index', i)
            task['is_required'] = task.get('is_required', True)
            
            task_response = supabase.table('quest_tasks').insert(task).execute()
            
            if not task_response.data:
                # Rollback quest if task insertion fails
                supabase.table('quests').delete().eq('id', quest_id).execute()
                return jsonify({'error': 'Failed to save quest tasks'}), 500
        
        return jsonify({
            'success': True,
            'quest_id': quest_id,
            'message': 'Quest saved successfully'
        }), 201
        
    except Exception as e:
        print(f"Error saving quest: {e}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500

@ai_quests_bp.route('/ai/validate-quest', methods=['POST'])
@require_auth
def validate_quest(user_id):
    """Validate a quest without saving it"""
    
    try:
        # Initialize validator
        init_services()
        
        if not validator:
            return jsonify({'error': 'Validation service not available'}), 503
        
        # Get quest data
        quest_data = request.json.get('quest')
        if not quest_data:
            return jsonify({'error': 'Quest data required'}), 400
        
        # Validate quest
        validation_result = validator.validate_quest(quest_data)
        
        return jsonify({
            'success': True,
            'validation': validation_result
        }), 200
        
    except Exception as e:
        print(f"Error validating quest: {e}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500

@ai_quests_bp.route('/ai/related-quests', methods=['POST'])
@require_auth
async def find_related_quests(user_id):
    """Find quests related to a given quest"""
    
    try:
        # Initialize services
        init_services()
        
        if not concept_matcher:
            return jsonify({'error': 'Concept matching service not available'}), 503
        
        # Get quest data
        quest_data = request.json.get('quest')
        if not quest_data:
            return jsonify({'error': 'Quest data required'}), 400
        
        limit = request.json.get('limit', 10)
        
        # Get all quests
        quests_response = supabase.table('quests').select('*').eq('is_active', True).execute()
        all_quests = quests_response.data if quests_response.data else []
        
        # Build concept index
        index = await concept_matcher.build_concept_index(all_quests)
        
        # Find related quests
        related = concept_matcher.find_related_quests(quest_data, index, limit)
        
        # Get quest details for related quests
        related_quests = []
        for quest_id, score in related:
            quest = next((q for q in all_quests if q['id'] == quest_id), None)
            if quest:
                related_quests.append({
                    'quest': quest,
                    'relevance_score': score
                })
        
        return jsonify({
            'success': True,
            'related_quests': related_quests
        }), 200
        
    except Exception as e:
        print(f"Error finding related quests: {e}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500