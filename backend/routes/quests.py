from flask import Blueprint, request, jsonify
from database import get_supabase_client
from utils.auth_utils import require_auth
from datetime import datetime

bp = Blueprint('quests', __name__)

@bp.route('', methods=['GET'])
def get_quests():
    supabase = get_supabase_client()
    
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        search = request.args.get('search', '')
        subject = request.args.get('subject', '')
        
        query = supabase.table('quests').select('*, quest_xp_awards(*)')
        
        if search:
            query = query.ilike('title', f'%{search}%')
        
        if subject:
            query = query.eq('quest_xp_awards.subject', subject)
        
        start = (page - 1) * per_page
        end = start + per_page - 1
        
        response = query.range(start, end).execute()
        
        return jsonify({
            'quests': response.data,
            'page': page,
            'per_page': per_page
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/<quest_id>', methods=['GET'])
def get_quest(quest_id):
    supabase = get_supabase_client()
    
    try:
        response = supabase.table('quests').select('*, quest_xp_awards(*)').eq('id', quest_id).single().execute()
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 404

@bp.route('/<quest_id>/start', methods=['POST'])
@require_auth
def start_quest(user_id, quest_id):
    supabase = get_supabase_client()
    
    try:
        existing = supabase.table('user_quests').select('*').eq('user_id', user_id).eq('quest_id', quest_id).execute()
        
        if existing.data:
            return jsonify({'error': 'Quest already started'}), 400
        
        user_quest = {
            'user_id': user_id,
            'quest_id': quest_id,
            'status': 'in_progress',
            'started_at': datetime.utcnow().isoformat()
        }
        
        response = supabase.table('user_quests').insert(user_quest).execute()
        
        supabase.table('activity_log').insert({
            'user_id': user_id,
            'event_type': 'quest_started',
            'event_details': {'quest_id': quest_id}
        }).execute()
        
        return jsonify(response.data[0]), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/<quest_id>/submit', methods=['POST'])
@require_auth
def submit_quest(user_id, quest_id):
    supabase = get_supabase_client()
    data = request.json
    
    try:
        user_quest = supabase.table('user_quests').select('*').eq('user_id', user_id).eq('quest_id', quest_id).eq('status', 'in_progress').single().execute()
        
        if not user_quest.data:
            return jsonify({'error': 'Quest not in progress'}), 400
        
        submission = {
            'user_quest_id': user_quest.data['id'],
            'submitted_at': datetime.utcnow().isoformat()
        }
        
        submission_response = supabase.table('submissions').insert(submission).execute()
        submission_id = submission_response.data[0]['id']
        
        if 'evidence_files' in data:
            for file_url in data['evidence_files']:
                supabase.table('submission_evidence').insert({
                    'submission_id': submission_id,
                    'file_url': file_url
                }).execute()
        
        if 'evidence_text' in data:
            supabase.table('submission_evidence').insert({
                'submission_id': submission_id,
                'text_content': data['evidence_text']
            }).execute()
        
        supabase.table('user_quests').update({
            'status': 'pending_review'
        }).eq('id', user_quest.data['id']).execute()
        
        supabase.table('activity_log').insert({
            'user_id': user_id,
            'event_type': 'quest_submitted',
            'event_details': {'quest_id': quest_id, 'submission_id': submission_id}
        }).execute()
        
        return jsonify({'submission_id': submission_id}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/user/<target_user_id>/quests', methods=['GET'])
@require_auth
def get_user_quests(user_id, target_user_id):
    if target_user_id != user_id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    supabase = get_supabase_client()
    
    try:
        response = supabase.table('user_quests').select('*, quests(*, quest_xp_awards(*))').eq('user_id', target_user_id).execute()
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400