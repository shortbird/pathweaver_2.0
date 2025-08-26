from flask import Blueprint, jsonify, request, current_app
from flask_cors import cross_origin
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.generator_service import GeneratorService
from services.grader_service import GraderService
from services.expander_service import ExpanderService
from services.validator_service import ValidatorService

ai_orchestrator_bp = Blueprint('ai_orchestrator', __name__)

@ai_orchestrator_bp.route('/api/ai/run-cycle', methods=['POST'])
@cross_origin()
def run_ai_cycle():
    """Secure endpoint for cron job to trigger AI generation and grading cycle"""
    auth_header = request.headers.get('Authorization')
    secret_key = os.environ.get('CRON_SECRET')
    
    if not auth_header or auth_header != f'Bearer {secret_key}':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        results = {
            'generation': None,
            'grading': [],
            'expansion': [],
            'validation': []
        }
        
        # Run quest generation
        generator = GeneratorService()
        generated_quest = generator.run_generation_cycle()
        if generated_quest:
            results['generation'] = {
                'success': True,
                'quest_id': generated_quest['id'],
                'quest_title': generated_quest['title']
            }
        
        # Run grading on all generated quests
        grader = GraderService()
        grading_results = grader.run_grading_cycle()
        results['grading'] = grading_results
        
        # Process any pending quest ideas
        expander = ExpanderService()
        expansion_results = expander.process_pending_ideas()
        results['expansion'] = [{'id': q['id'], 'title': q['title']} for q in expansion_results]
        
        # Process pending submissions
        validator = ValidatorService()
        validation_results = validator.process_pending_submissions()
        results['validation'] = validation_results
        
        return jsonify({
            'message': 'AI cycle completed successfully',
            'results': results
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@ai_orchestrator_bp.route('/api/ai/seed', methods=['GET', 'POST'])
@cross_origin()
def manage_ai_seed():
    """Endpoint for admins to get or update the AI seed prompt"""
    # TODO: Add proper admin authentication check
    
    if request.method == 'GET':
        try:
            from supabase import create_client
            supabase = create_client(
                os.environ.get('SUPABASE_URL'),
                os.environ.get('SUPABASE_SERVICE_KEY')
            )
            
            response = supabase.table('ai_seeds').select('*').eq('prompt_name', 'primary_seed').single().execute()
            
            if response.data:
                return jsonify({
                    'prompt_text': response.data['prompt_text'],
                    'updated_at': response.data['updated_at']
                }), 200
            else:
                return jsonify({'error': 'Seed prompt not found'}), 404
                
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            prompt_text = data.get('prompt_text')
            
            if not prompt_text:
                return jsonify({'error': 'prompt_text is required'}), 400
            
            from supabase import create_client
            from datetime import datetime
            
            supabase = create_client(
                os.environ.get('SUPABASE_URL'),
                os.environ.get('SUPABASE_SERVICE_KEY')
            )
            
            response = supabase.table('ai_seeds').update({
                'prompt_text': prompt_text,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('prompt_name', 'primary_seed').execute()
            
            return jsonify({'message': 'Seed prompt updated successfully'}), 200
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500