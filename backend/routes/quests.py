from flask import Blueprint, request, jsonify
from database import get_supabase_client, get_authenticated_supabase_client
from utils.auth_utils import require_auth
from datetime import datetime

bp = Blueprint('quests', __name__)

@bp.route('', methods=['GET'])
def get_quests():
    # Use admin client to bypass RLS for public quest listing
    from database import get_supabase_admin_client
    supabase = get_supabase_admin_client()
    
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        search = request.args.get('search', '')
        skill_category = request.args.get('skill_category', '')
        difficulty = request.args.get('difficulty', '')
        effort_level = request.args.get('effort_level', '')
        core_skill = request.args.get('core_skill', '')
        min_hours = request.args.get('min_hours', type=int)
        max_hours = request.args.get('max_hours', type=int)
        adult_supervision = request.args.get('adult_supervision', '')
        
        # Try with new skill-based system first
        try:
            query = supabase.table('quests').select('*, quest_skill_xp(*)')
            
            if search:
                # Search in title, description, and core_skills
                query = query.or_(f'title.ilike.%{search}%,description.ilike.%{search}%')
            
            if skill_category:
                # Filter quests that have XP in the specified skill category
                filtered_quests = supabase.table('quest_skill_xp').select('quest_id').eq('skill_category', skill_category).execute()
                quest_ids = [item['quest_id'] for item in filtered_quests.data]
                if quest_ids:
                    query = query.in_('id', quest_ids)
                else:
                    # No quests match this skill category
                    return jsonify({'quests': [], 'page': page, 'per_page': per_page}), 200
            
            if difficulty:
                query = query.eq('difficulty_level', difficulty)
            
            if effort_level:
                query = query.eq('effort_level', effort_level)
            
            if core_skill:
                # Filter by core_skills array containing the skill
                query = query.contains('core_skills', [core_skill])
            
            if min_hours is not None:
                query = query.gte('estimated_hours', min_hours)
            
            if max_hours is not None:
                query = query.lte('estimated_hours', max_hours)
            
            if adult_supervision == 'true':
                query = query.eq('requires_adult_supervision', True)
            elif adult_supervision == 'false':
                query = query.eq('requires_adult_supervision', False)
            
            start = (page - 1) * per_page
            end = start + per_page - 1
            
            response = query.range(start, end).execute()
            
        except Exception as skill_error:
            # Fall back to old subject-based system if skill tables don't exist
            print(f"Skill-based query failed, falling back to subject-based: {skill_error}")
            
            query = supabase.table('quests').select('*, quest_xp_awards(*)')
            
            if search:
                query = query.ilike('title', f'%{search}%')
            
            # Note: advanced filtering won't work with the old system
            
            start = (page - 1) * per_page
            end = start + per_page - 1
            
            response = query.range(start, end).execute()
        
        return jsonify({
            'quests': response.data,
            'page': page,
            'per_page': per_page
        }), 200
        
    except Exception as e:
        print(f"Error fetching quests: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/filter-options', methods=['GET'])
def get_filter_options():
    supabase = get_supabase_client()
    
    try:
        # Get all unique core skills from quests
        quests_response = supabase.table('quests').select('core_skills').execute()
        
        all_skills = set()
        for quest in quests_response.data:
            if quest.get('core_skills'):
                all_skills.update(quest['core_skills'])
        
        return jsonify({
            'skill_categories': [
                {'value': 'reading_writing', 'label': 'Reading & Writing'},
                {'value': 'thinking_skills', 'label': 'Thinking Skills'},
                {'value': 'personal_growth', 'label': 'Personal Growth'},
                {'value': 'life_skills', 'label': 'Life Skills'},
                {'value': 'making_creating', 'label': 'Making & Creating'},
                {'value': 'world_understanding', 'label': 'World Understanding'}
            ],
            'difficulty_levels': [
                {'value': 'beginner', 'label': 'Beginner'},
                {'value': 'intermediate', 'label': 'Intermediate'},
                {'value': 'advanced', 'label': 'Advanced'}
            ],
            'effort_levels': [
                {'value': 'light', 'label': 'Light'},
                {'value': 'moderate', 'label': 'Moderate'},
                {'value': 'intensive', 'label': 'Intensive'}
            ],
            'core_skills': sorted(list(all_skills))
        }), 200
        
    except Exception as e:
        print(f"Error fetching filter options: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/<quest_id>', methods=['GET'])
def get_quest(quest_id):
    # Use admin client to bypass RLS for public quest viewing
    from database import get_supabase_admin_client
    supabase = get_supabase_admin_client()
    
    try:
        # Try with new skill-based system first
        try:
            response = supabase.table('quests').select('*, quest_skill_xp(*)').eq('id', quest_id).single().execute()
        except Exception:
            # Fall back to old subject-based system
            response = supabase.table('quests').select('*, quest_xp_awards(*)').eq('id', quest_id).single().execute()
        
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 404

@bp.route('/<quest_id>/start', methods=['POST'])
@require_auth
def start_quest(user_id, quest_id):
    supabase = get_authenticated_supabase_client()
    
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
    supabase = get_authenticated_supabase_client()
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
    
    supabase = get_authenticated_supabase_client()
    
    try:
        # Try with new skill-based system first
        try:
            response = supabase.table('user_quests').select('*, quests(*, quest_skill_xp(*))').eq('user_id', target_user_id).execute()
        except Exception:
            # Fall back to old subject-based system
            response = supabase.table('user_quests').select('*, quests(*, quest_xp_awards(*))').eq('user_id', target_user_id).execute()
        
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400