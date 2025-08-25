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
        
        # Calculate total XP
        total_xp = 0
        try:
            # Try skill-based XP first
            skill_xp = supabase.table('user_skill_xp')\
                .select('total_xp')\
                .eq('user_id', user_id)\
                .execute()
            
            if skill_xp.data:
                for record in skill_xp.data:
                    total_xp += record.get('total_xp', 0)
        except Exception:
            # Fallback: calculate from completed quests
            completed_quests_with_xp = supabase.table('user_quests')\
                .select('*, quests(*, quest_skill_xp(*), quest_xp_awards(*))')\
                .eq('user_id', user_id)\
                .eq('status', 'completed')\
                .execute()
            
            if completed_quests_with_xp.data:
                for quest_record in completed_quests_with_xp.data:
                    quest = quest_record.get('quests', {})
                    # Try skill XP
                    if quest.get('quest_skill_xp'):
                        for award in quest['quest_skill_xp']:
                            total_xp += award.get('xp_amount', 0)
                    # Fallback to subject XP
                    elif quest.get('quest_xp_awards'):
                        for award in quest['quest_xp_awards']:
                            total_xp += award.get('xp_amount', 0)
        
        # Get completed quests count
        completed_quests = supabase.table('user_quests')\
            .select('*', count='exact')\
            .eq('user_id', user_id)\
            .eq('status', 'completed')\
            .execute()
        completed_count = completed_quests.count if hasattr(completed_quests, 'count') else len(completed_quests.data)
        
        return jsonify({
            'user': user.data,
            'total_xp': total_xp,
            'completed_quests': completed_count
        }), 200
        
    except Exception as e:
        print(f"Profile error: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/profile', methods=['PUT'])
@require_auth
def update_profile(user_id):
    data = request.json
    supabase = get_supabase_client()
    
    allowed_fields = ['first_name', 'last_name']
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
        
        # Get active quests with their details
        try:
            active_quests = supabase.table('user_quests')\
                .select('*, quests(*, quest_skill_xp(*), quest_xp_awards(*))')\
                .eq('user_id', user_id)\
                .eq('status', 'in_progress')\
                .execute()
        except Exception:
            # Fallback without skill XP
            active_quests = supabase.table('user_quests')\
                .select('*, quests(*)')\
                .eq('user_id', user_id)\
                .eq('status', 'in_progress')\
                .execute()
        
        # Get recent completions
        try:
            recent_completions = supabase.table('user_quests')\
                .select('*, quests(*, quest_skill_xp(*), quest_xp_awards(*))')\
                .eq('user_id', user_id)\
                .eq('status', 'completed')\
                .order('completed_at', desc=True)\
                .limit(5)\
                .execute()
        except Exception:
            # Fallback without skill XP
            recent_completions = supabase.table('user_quests')\
                .select('*, quests(*)')\
                .eq('user_id', user_id)\
                .eq('status', 'completed')\
                .order('completed_at', desc=True)\
                .limit(5)\
                .execute()
        
        # Calculate XP by skill category or subject
        xp_by_category = {}
        try:
            # Try skill-based XP first
            skill_xp = supabase.table('user_skill_xp')\
                .select('skill_category, total_xp')\
                .eq('user_id', user_id)\
                .execute()
            
            if skill_xp.data:
                for record in skill_xp.data:
                    xp_by_category[record['skill_category']] = record['total_xp']
        except Exception:
            # Fallback to calculating from completed quests
            if recent_completions.data:
                for quest_record in recent_completions.data:
                    quest = quest_record.get('quests', {})
                    # Try skill XP
                    if quest.get('quest_skill_xp'):
                        for award in quest['quest_skill_xp']:
                            category = award['skill_category']
                            if category not in xp_by_category:
                                xp_by_category[category] = 0
                            xp_by_category[category] += award['xp_amount']
                    # Fallback to subject XP
                    elif quest.get('quest_xp_awards'):
                        for award in quest['quest_xp_awards']:
                            subject = award['subject']
                            if subject not in xp_by_category:
                                xp_by_category[subject] = 0
                            xp_by_category[subject] += award['xp_amount']
        
        # Get friend count
        friend_count = 0
        try:
            friends = supabase.table('friendships')\
                .select('*')\
                .or_(f'requester_id.eq.{user_id},addressee_id.eq.{user_id}')\
                .eq('status', 'accepted')\
                .execute()
            friend_count = len(friends.data) if friends.data else 0
        except Exception:
            # If friendships table doesn't exist, just return 0
            pass
        
        return jsonify({
            'user': user.data,
            'active_quests': active_quests.data if active_quests.data else [],
            'recent_completions': recent_completions.data if recent_completions.data else [],
            'xp_by_subject': list(xp_by_category.items()) if xp_by_category else [],
            'friend_count': friend_count
        }), 200
        
    except Exception as e:
        print(f"Dashboard error: {str(e)}")
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