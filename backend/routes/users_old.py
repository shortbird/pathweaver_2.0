from flask import Blueprint, request, jsonify
from database import get_supabase_client, get_authenticated_supabase_client
from utils.auth_utils import require_auth
from datetime import datetime

bp = Blueprint('users', __name__)

@bp.route('/profile', methods=['GET'])
@require_auth
def get_profile(user_id):
    # Use authenticated client to respect RLS policies
    supabase = get_authenticated_supabase_client()
    
    try:
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        
        # Calculate total XP and get skill breakdown
        total_xp = 0
        skill_breakdown = {}
        
        try:
            # Get skill-based XP from user_skill_xp table
            skill_xp = supabase.table('user_skill_xp')\
                .select('skill_category, total_xp')\
                .eq('user_id', user_id)\
                .execute()
            
            if skill_xp.data:
                for record in skill_xp.data:
                    xp_amount = record.get('total_xp', 0)
                    total_xp += xp_amount
                    skill_breakdown[record['skill_category']] = xp_amount
        except Exception as e:
            print(f"Error getting skill XP: {str(e)}")
            
        # If no XP in user_skill_xp table, calculate from completed quests
        if total_xp == 0:
            try:
                completed_quests_with_xp = supabase.table('user_quests')\
                    .select('*, quests(id)')\
                    .eq('user_id', user_id)\
                    .eq('status', 'completed')\
                    .execute()
                
                if completed_quests_with_xp.data:
                    # Extract all quest IDs for batch querying
                    quest_ids = []
                    for quest_record in completed_quests_with_xp.data:
                        quest_id = quest_record.get('quests', {}).get('id')
                        if quest_id:
                            quest_ids.append(quest_id)
                    
                    if quest_ids:
                        # Batch query for skill XP awards
                        try:
                            skill_awards = supabase.table('quest_skill_xp').select('*').in_('quest_id', quest_ids).execute()
                            if skill_awards.data:
                                for award in skill_awards.data:
                                    total_xp += award.get('xp_amount', 0)
                                    cat = award['skill_category']
                                    skill_breakdown[cat] = skill_breakdown.get(cat, 0) + award['xp_amount']
                        except:
                            # Try old XP system with batch query
                            try:
                                subject_awards = supabase.table('quest_xp_awards').select('*').in_('quest_id', quest_ids).execute()
                                if subject_awards.data:
                                    for award in subject_awards.data:
                                        total_xp += award.get('xp_amount', 0)
                            except:
                                pass
            except Exception as e:
                print(f"Error calculating XP from quests: {str(e)}")
        
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
            'completed_quests': completed_count,
            'skill_breakdown': skill_breakdown
        }), 200
        
    except Exception as e:
        print(f"Profile error: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/profile', methods=['PUT'])
@require_auth
def update_profile(user_id):
    data = request.json
    # Use authenticated client to respect RLS policies
    supabase = get_authenticated_supabase_client()
    
    # Temporarily allow username for backward compatibility
    allowed_fields = ['first_name', 'last_name', 'username']
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400
    
    try:
        response = supabase.table('users').update(update_data).eq('id', user_id).execute()
        return jsonify(response.data[0]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/completed-quests', methods=['GET'])
@require_auth
def get_completed_quests(user_id):
    """Get list of completed quest IDs for the current user"""
    supabase = get_authenticated_supabase_client()
    
    try:
        completed = supabase.table('user_quests')\
            .select('quest_id')\
            .eq('user_id', user_id)\
            .eq('status', 'completed')\
            .execute()
        
        quest_ids = [q['quest_id'] for q in completed.data] if completed.data else []
        
        return jsonify({'completed_quest_ids': quest_ids}), 200
    except Exception as e:
        print(f"Error fetching completed quests: {str(e)}")
        return jsonify({'error': str(e)}), 400

@bp.route('/dashboard', methods=['GET'])
@require_auth
def get_dashboard(user_id):
    print(f"=== DASHBOARD ENDPOINT DEBUG ===")
    print(f"User ID: {user_id}")
    supabase = get_authenticated_supabase_client()
    
    try:
        print(f"Fetching user data for ID: {user_id}")
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        print(f"User data fetched successfully: {user.data if user.data else 'No data'}")
        
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
        
        # Calculate XP by skill category
        xp_by_category = {}
        skill_xp_data = []
        total_xp = 0
        
        # Initialize all skill categories with 0
        skill_categories = ['reading_writing', 'thinking_skills', 'personal_growth', 
                          'life_skills', 'making_creating', 'world_understanding']
        for cat in skill_categories:
            xp_by_category[cat] = 0
            
        try:
            # Get skill-based XP from user_skill_xp table
            skill_xp = supabase.table('user_skill_xp')\
                .select('skill_category, total_xp')\
                .eq('user_id', user_id)\
                .execute()
            
            if skill_xp.data:
                for record in skill_xp.data:
                    xp_by_category[record['skill_category']] = record['total_xp']
                    total_xp += record['total_xp']
                    skill_xp_data.append(record)
        except Exception as e:
            print(f"Error fetching skill XP: {str(e)}")
            
        # If no XP data exists, calculate from completed quests
        if total_xp == 0 and recent_completions.data:
            # Extract all quest IDs to batch query
            quest_ids = []
            for quest_record in recent_completions.data:
                quest = quest_record.get('quests', {})
                quest_id = quest.get('id')
                if quest_id:
                    quest_ids.append(quest_id)
            
            if quest_ids:
                # Batch query for skill XP awards
                try:
                    skill_awards = supabase.table('quest_skill_xp').select('*').in_('quest_id', quest_ids).execute()
                    if skill_awards.data:
                        for award in skill_awards.data:
                            category = award['skill_category']
                            amount = award['xp_amount']
                            xp_by_category[category] = xp_by_category.get(category, 0) + amount
                            total_xp += amount
                except:
                    pass
                
                # If still no XP, try old subject-based XP with batch query
                if total_xp == 0:
                    try:
                        subject_awards = supabase.table('quest_xp_awards').select('*').in_('quest_id', quest_ids).execute()
                        if subject_awards.data:
                            for award in subject_awards.data:
                                # Map subjects to skill categories for backward compatibility
                                subject = award['subject']
                                amount = award['xp_amount']
                                # Simple mapping - you may want to adjust this
                                if subject in ['language_arts']:
                                    xp_by_category['reading_writing'] = xp_by_category.get('reading_writing', 0) + amount
                                elif subject in ['math', 'science']:
                                    xp_by_category['thinking_skills'] = xp_by_category.get('thinking_skills', 0) + amount
                                elif subject in ['social_studies']:
                                    xp_by_category['world_understanding'] = xp_by_category.get('world_understanding', 0) + amount
                                else:
                                    xp_by_category['personal_growth'] = xp_by_category.get('personal_growth', 0) + amount
                                total_xp += amount
                    except:
                        pass
        
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
        
        # Get skill details (individual skills practiced)
        skill_details = []
        try:
            details = supabase.table('user_skill_details')\
                .select('skill_name, times_practiced, last_practiced')\
                .eq('user_id', user_id)\
                .execute()
            if details.data:
                skill_details = details.data
        except:
            pass
        
        # Get total completed quests count
        total_completed = 0
        try:
            completed_count = supabase.table('user_quests')\
                .select('id', count='exact')\
                .eq('user_id', user_id)\
                .eq('status', 'completed')\
                .execute()
            total_completed = completed_count.count if hasattr(completed_count, 'count') else len(completed_count.data)
        except:
            # Fallback to recent completions length if error
            total_completed = len(recent_completions.data) if recent_completions.data else 0
            
        return jsonify({
            'user': user.data,
            'active_quests': active_quests.data if active_quests.data else [],
            'recent_completions': recent_completions.data if recent_completions.data else [],
            'xp_by_subject': list(xp_by_category.items()),  # Keep for backward compatibility
            'xp_by_category': xp_by_category,
            'skill_xp': skill_xp_data,
            'total_xp': total_xp,
            'skill_details': skill_details,
            'friend_count': friend_count,
            'total_quests_completed': total_completed
        }), 200
        
    except Exception as e:
        import traceback
        print(f"Dashboard error: {str(e)}")
        print(f"Full traceback:")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 400

@bp.route('/transcript', methods=['GET'])
@require_auth
def get_transcript(user_id):
    supabase = get_authenticated_supabase_client()
    
    user = supabase.table('users').select('*').eq('id', user_id).single().execute()
    
    if user.data['subscription_tier'] not in ['creator', 'visionary']:
        return jsonify({'error': 'Transcript feature requires Creator or Visionary subscription'}), 403
    
    try:
        completed_quests = supabase.table('user_quests').select('*, quests(*, quest_xp_awards(*))').eq('user_id', user_id).eq('status', 'completed').order('completed_at').execute()
        
        transcript_data = {
            'student': {
                'name': f"{user.data['first_name']} {user.data['last_name']}",
                'id': user_id,
                # Include username if it exists for backward compatibility
                'username': user.data.get('username', '')
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