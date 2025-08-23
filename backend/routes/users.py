from flask import Blueprint, request, jsonify
from database import get_supabase_client
from utils.auth_utils import require_auth
from datetime import datetime

bp = Blueprint('users', __name__)

@bp.route('/profile', methods=['GET'])
@require_auth
def get_profile(user_id):
    supabase = get_supabase_client()
    
    try:
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        
        total_xp = supabase.rpc('get_user_total_xp', {'p_user_id': user_id}).execute()
        
        completed_quests = supabase.table('user_quests').select('count').eq('user_id', user_id).eq('status', 'completed').execute()
        
        return jsonify({
            'user': user.data,
            'total_xp': total_xp.data if total_xp.data else 0,
            'completed_quests': len(completed_quests.data) if completed_quests.data else 0
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/profile', methods=['PUT'])
@require_auth
def update_profile(user_id):
    data = request.json
    supabase = get_supabase_client()
    
    allowed_fields = ['first_name', 'last_name', 'username']
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400
    
    try:
        response = supabase.table('users').update(update_data).eq('id', user_id).execute()
        return jsonify(response.data[0]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/dashboard', methods=['GET'])
@require_auth
def get_dashboard(user_id):
    supabase = get_supabase_client()
    
    try:
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        
        active_quests = supabase.table('user_quests').select('*, quests(*)').eq('user_id', user_id).eq('status', 'in_progress').execute()
        
        recent_completions = supabase.table('user_quests').select('*, quests(*)').eq('user_id', user_id).eq('status', 'completed').order('completed_at', desc=True).limit(5).execute()
        
        xp_by_subject = supabase.rpc('get_user_xp_by_subject', {'p_user_id': user_id}).execute()
        
        friends = supabase.table('friendships').select('*').or_(f'requester_id.eq.{user_id},addressee_id.eq.{user_id}').eq('status', 'accepted').execute()
        
        return jsonify({
            'user': user.data,
            'active_quests': active_quests.data,
            'recent_completions': recent_completions.data,
            'xp_by_subject': xp_by_subject.data if xp_by_subject.data else [],
            'friend_count': len(friends.data) if friends.data else 0
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/transcript', methods=['GET'])
@require_auth
def get_transcript(user_id):
    supabase = get_supabase_client()
    
    user = supabase.table('users').select('*').eq('id', user_id).single().execute()
    
    if user.data['subscription_tier'] not in ['creator', 'visionary']:
        return jsonify({'error': 'Transcript feature requires Creator or Visionary subscription'}), 403
    
    try:
        completed_quests = supabase.table('user_quests').select('*, quests(*, quest_xp_awards(*))').eq('user_id', user_id).eq('status', 'completed').order('completed_at').execute()
        
        transcript_data = {
            'student': {
                'name': f"{user.data['first_name']} {user.data['last_name']}",
                'username': user.data['username'],
                'id': user_id
            },
            'generated_at': datetime.utcnow().isoformat(),
            'completed_quests': completed_quests.data,
            'total_xp_by_subject': {}
        }
        
        for quest in completed_quests.data:
            for award in quest['quests']['quest_xp_awards']:
                subject = award['subject']
                xp = award['xp_amount']
                
                if subject not in transcript_data['total_xp_by_subject']:
                    transcript_data['total_xp_by_subject'][subject] = 0
                transcript_data['total_xp_by_subject'][subject] += xp
        
        supabase.table('activity_log').insert({
            'user_id': user_id,
            'event_type': 'transcript_downloaded',
            'event_details': {}
        }).execute()
        
        return jsonify(transcript_data), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400