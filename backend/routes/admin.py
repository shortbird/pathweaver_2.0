from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth_utils import require_admin
from datetime import datetime

bp = Blueprint('admin', __name__)

@bp.route('/quests', methods=['POST'])
@require_admin
def create_quest(user_id):
    data = request.json
    supabase = get_supabase_admin_client()
    
    try:
        quest_data = {
            'title': data['title'],
            'description': data['description'],
            'evidence_requirements': data['evidence_requirements'],
            'created_by': user_id,
            'created_at': datetime.utcnow().isoformat()
        }
        
        quest_response = supabase.table('quests').insert(quest_data).execute()
        quest_id = quest_response.data[0]['id']
        
        if 'xp_awards' in data:
            for award in data['xp_awards']:
                supabase.table('quest_xp_awards').insert({
                    'quest_id': quest_id,
                    'subject': award['subject'],
                    'xp_amount': award['xp_amount']
                }).execute()
        
        return jsonify({'quest_id': quest_id}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/quests/<quest_id>', methods=['PUT'])
@require_admin
def update_quest(quest_id, user_id):
    data = request.json
    supabase = get_supabase_admin_client()
    
    try:
        allowed_fields = ['title', 'description', 'evidence_requirements']
        update_data = {k: v for k, v in data.items() if k in allowed_fields}
        
        if update_data:
            supabase.table('quests').update(update_data).eq('id', quest_id).execute()
        
        if 'xp_awards' in data:
            supabase.table('quest_xp_awards').delete().eq('quest_id', quest_id).execute()
            
            for award in data['xp_awards']:
                supabase.table('quest_xp_awards').insert({
                    'quest_id': quest_id,
                    'subject': award['subject'],
                    'xp_amount': award['xp_amount']
                }).execute()
        
        return jsonify({'message': 'Quest updated successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/quests/<quest_id>', methods=['DELETE'])
@require_admin
def delete_quest(quest_id, user_id):
    supabase = get_supabase_admin_client()
    
    try:
        supabase.table('quest_xp_awards').delete().eq('quest_id', quest_id).execute()
        supabase.table('quests').delete().eq('id', quest_id).execute()
        
        return jsonify({'message': 'Quest deleted successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/submissions/pending', methods=['GET'])
@require_admin
def get_pending_submissions(user_id):
    supabase = get_supabase_admin_client()
    
    try:
        submissions = supabase.table('submissions').select('*, user_quests(*, users(*), quests(*)), submission_evidence(*)').is_('educator_id', None).execute()
        
        return jsonify(submissions.data), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/submissions/<submission_id>/review', methods=['POST'])
@require_admin
def review_submission(submission_id, user_id):
    data = request.json
    action = data.get('action')
    feedback = data.get('feedback', '')
    
    if action not in ['approve', 'request_changes']:
        return jsonify({'error': 'Invalid action'}), 400
    
    supabase = get_supabase_admin_client()
    
    try:
        submission = supabase.table('submissions').select('*, user_quests(*)').eq('id', submission_id).single().execute()
        
        if not submission.data:
            return jsonify({'error': 'Submission not found'}), 404
        
        supabase.table('submissions').update({
            'educator_id': user_id,
            'feedback': feedback
        }).eq('id', submission_id).execute()
        
        new_status = 'completed' if action == 'approve' else 'needs_changes'
        
        update_data = {'status': new_status}
        if action == 'approve':
            update_data['completed_at'] = datetime.utcnow().isoformat()
        
        supabase.table('user_quests').update(update_data).eq('id', submission.data['user_quest_id']).execute()
        
        if action == 'approve':
            user_quest = submission.data['user_quests']
            supabase.table('activity_log').insert({
                'user_id': user_quest['user_id'],
                'event_type': 'quest_completed',
                'event_details': {'quest_id': user_quest['quest_id']}
            }).execute()
        
        return jsonify({'message': f'Submission {action}d successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/users', methods=['GET'])
@require_admin
def get_all_users(user_id):
    supabase = get_supabase_admin_client()
    
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        search = request.args.get('search', '')
        
        query = supabase.table('users').select('*')
        
        if search:
            query = query.or_(f"username.ilike.%{search}%,first_name.ilike.%{search}%,last_name.ilike.%{search}%")
        
        start = (page - 1) * per_page
        end = start + per_page - 1
        
        response = query.range(start, end).execute()
        
        return jsonify({
            'users': response.data,
            'page': page,
            'per_page': per_page
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/analytics', methods=['GET'])
@require_admin
def get_analytics(user_id):
    supabase = get_supabase_admin_client()
    
    try:
        total_users = supabase.table('users').select('count').execute()
        active_users = supabase.rpc('get_monthly_active_users').execute()
        
        subscription_breakdown = supabase.table('users').select('subscription_tier').execute()
        tier_counts = {'explorer': 0, 'creator': 0, 'visionary': 0}
        for user in subscription_breakdown.data:
            tier_counts[user['subscription_tier']] += 1
        
        quests_completed = supabase.table('user_quests').select('count').eq('status', 'completed').execute()
        
        return jsonify({
            'total_users': len(total_users.data) if total_users.data else 0,
            'monthly_active_users': active_users.data if active_users.data else 0,
            'subscription_breakdown': tier_counts,
            'total_quests_completed': len(quests_completed.data) if quests_completed.data else 0
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400