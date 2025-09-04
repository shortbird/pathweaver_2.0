from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from functools import wraps
import jwt
import os
import sys
from datetime import datetime
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

quest_ideas_bp = Blueprint('quest_ideas', __name__)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        
        if auth_header:
            try:
                token = auth_header.split(' ')[1]
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            data = jwt.decode(token, os.environ.get('SECRET_KEY'), algorithms=['HS256'])
            current_user_id = data['user_id']
            return f(current_user_id, *args, **kwargs)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
    
    return decorated

@quest_ideas_bp.route('/quest-ideas', methods=['POST'])
@cross_origin()
@token_required
def submit_quest_idea(current_user_id):
    """Submit a new quest idea for review"""
    try:
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
        
        from supabase import create_client
        supabase = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        
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

@quest_ideas_bp.route('/quest-ideas', methods=['GET'])
@cross_origin()
@token_required
def get_user_quest_ideas(current_user_id):
    """Get all quest ideas submitted by the current user"""
    try:
        from supabase import create_client
        supabase = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        
        response = supabase.table('quest_ideas').select('*').eq('user_id', current_user_id).order('created_at', desc=True).execute()
        
        return jsonify({
            'quest_ideas': response.data if response.data else []
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@quest_ideas_bp.route('/quest-ideas/<idea_id>', methods=['GET'])
@cross_origin()
@token_required
def get_quest_idea_status(current_user_id, idea_id):
    """Get the status of a specific quest idea"""
    try:
        from supabase import create_client
        supabase = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        
        # Verify the idea belongs to the user
        response = supabase.table('quest_ideas').select('*').eq('id', idea_id).eq('user_id', current_user_id).single().execute()
        
        if response.data:
            # Quest ideas are now manually reviewed, no automatic expansion
            
            return jsonify(response.data), 200
        else:
            return jsonify({'error': 'Quest idea not found or access denied'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500