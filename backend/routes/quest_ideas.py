from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from datetime import datetime
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client
import os
import sys

from utils.logger import get_logger

logger = get_logger(__name__)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

quest_ideas_bp = Blueprint('quest_ideas', __name__, url_prefix='/api/quest-ideas')

@quest_ideas_bp.route('', methods=['POST'])
@cross_origin(supports_credentials=True)
@require_auth
def submit_quest_idea(current_user_id):
    """Submit a new quest idea for review - Phase 2: All users can suggest quests"""
    try:
        supabase = get_supabase_admin_client()

        # Phase 2 refactoring: Subscription tier checking removed
        # All authenticated users can now suggest quests

        data = request.get_json()
        title = data.get('title')
        description = data.get('description')
        
        if not title or not description:
            return jsonify({'error': 'Title and description are required'}), 400
        
        # Validate length
        if len(title) > 200:
            return jsonify({'error': 'Title must be less than 200 characters'}), 400
        if len(description) > 1000:
            return jsonify({'error': 'Description must be less than 1000 characters'}), 400
        
        # Save the idea to database
        idea_data = {
            'user_id': current_user_id,
            'title': title,
            'description': description,
            'status': 'pending_review',
            'created_at': datetime.utcnow().isoformat()
        }
        
        response = supabase.table('quest_ideas').insert(idea_data).execute()
        
        if response.data:
            idea_id = response.data[0]['id']
            
            return jsonify({
                'message': 'Your quest idea has been submitted for review!',
                'idea_id': idea_id
            }), 202
        else:
            return jsonify({'error': 'Failed to save quest idea'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@quest_ideas_bp.route('', methods=['GET'])
@cross_origin(supports_credentials=True)
@require_auth
def get_user_quest_ideas(current_user_id):
    """Get all quest ideas submitted by the current user"""
    try:
        supabase = get_supabase_admin_client()
        
        response = supabase.table('quest_ideas').select('*').eq('user_id', current_user_id).order('created_at', desc=True).execute()
        
        return jsonify({
            'quest_ideas': response.data if response.data else []
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@quest_ideas_bp.route('/<idea_id>', methods=['GET'])
@cross_origin(supports_credentials=True)
@require_auth
def get_quest_idea_status(current_user_id, idea_id):
    """Get the status of a specific quest idea"""
    try:
        supabase = get_supabase_admin_client()
        
        # Verify the idea belongs to the user
        response = supabase.table('quest_ideas').select('*').eq('id', idea_id).eq('user_id', current_user_id).single().execute()
        
        if response.data:
            # Quest ideas are now manually reviewed, no automatic expansion
            
            return jsonify(response.data), 200
        else:
            return jsonify({'error': 'Quest idea not found or access denied'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500