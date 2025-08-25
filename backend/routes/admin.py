from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth_utils import require_admin
from datetime import datetime
import csv
import io

bp = Blueprint('admin', __name__)

def award_skill_xp(supabase, user_id, quest_id):
    """Award skill-based XP when a quest is completed"""
    try:
        # Get quest skill awards
        skill_awards = supabase.table('quest_skill_xp').select('*').eq('quest_id', quest_id).execute()
        
        for award in skill_awards.data:
            # Get current XP for this skill category
            current_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).eq('skill_category', award['skill_category']).execute()
            
            if current_xp.data:
                # Update existing XP
                new_total = current_xp.data[0]['total_xp'] + award['xp_amount']
                supabase.table('user_skill_xp').update({
                    'total_xp': new_total,
                    'last_updated': datetime.utcnow().isoformat()
                }).eq('user_id', user_id).eq('skill_category', award['skill_category']).execute()
            else:
                # Create new XP record
                supabase.table('user_skill_xp').insert({
                    'user_id': user_id,
                    'skill_category': award['skill_category'],
                    'total_xp': award['xp_amount']
                }).execute()
        
        # Track individual skills practiced
        quest = supabase.table('quests').select('core_skills').eq('id', quest_id).execute()
        if quest.data and quest.data[0].get('core_skills'):
            for skill in quest.data[0]['core_skills']:
                # Check if skill detail exists
                skill_detail = supabase.table('user_skill_details').select('*').eq('user_id', user_id).eq('skill_name', skill).execute()
                
                if skill_detail.data:
                    # Update existing skill detail
                    times_practiced = skill_detail.data[0]['times_practiced'] + 1
                    supabase.table('user_skill_details').update({
                        'times_practiced': times_practiced,
                        'last_practiced': datetime.utcnow().isoformat()
                    }).eq('user_id', user_id).eq('skill_name', skill).execute()
                else:
                    # Create new skill detail
                    supabase.table('user_skill_details').insert({
                        'user_id': user_id,
                        'skill_name': skill,
                        'times_practiced': 1,
                        'last_practiced': datetime.utcnow().isoformat()
                    }).execute()
        
        return True
    except Exception as e:
        print(f"Error awarding skill XP: {str(e)}")
        return False

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
def update_quest(user_id, quest_id):
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
def delete_quest(user_id, quest_id):
    supabase = get_supabase_admin_client()
    
    try:
        supabase.table('quest_xp_awards').delete().eq('quest_id', quest_id).execute()
        supabase.table('quests').delete().eq('id', quest_id).execute()
        
        return jsonify({'message': 'Quest deleted successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/quests/bulk-import', methods=['POST'])
@require_admin
def bulk_import_quests(user_id):
    supabase = get_supabase_admin_client()
    
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.endswith('.csv'):
            return jsonify({'error': 'File must be a CSV'}), 400
        
        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_reader = csv.DictReader(stream)
        
        imported_count = 0
        errors = []
        
        for row_num, row in enumerate(csv_reader, start=2):
            try:
                quest_data = {
                    'title': row['title'].strip(),
                    'description': row['description'].strip(),
                    'evidence_requirements': row['evidence_requirements'].strip(),
                    'created_by': user_id,
                    'created_at': datetime.utcnow().isoformat()
                }
                
                quest_response = supabase.table('quests').insert(quest_data).execute()
                quest_id = quest_response.data[0]['id']
                
                subjects = [s.strip() for s in row['subjects'].split(',')]
                xp_amounts = [int(x.strip()) for x in row['xp_amounts'].split(',')]
                
                if len(subjects) != len(xp_amounts):
                    errors.append(f"Row {row_num}: Mismatched subjects and XP amounts")
                    continue
                
                for subject, xp_amount in zip(subjects, xp_amounts):
                    supabase.table('quest_xp_awards').insert({
                        'quest_id': quest_id,
                        'subject': subject,
                        'xp_amount': xp_amount
                    }).execute()
                
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")
        
        response_data = {
            'imported': imported_count,
            'total': row_num - 1
        }
        
        if errors:
            response_data['errors'] = errors
        
        return jsonify(response_data), 200
        
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
def review_submission(user_id, submission_id):
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
            
            # Award skill-based XP
            award_skill_xp(supabase, user_quest['user_id'], user_quest['quest_id'])
            
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