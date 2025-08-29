"""User dashboard routes"""

from flask import Blueprint, jsonify
from database import get_user_client
from utils.auth.decorators import require_auth
from middleware.error_handler import NotFoundError
from .helpers import calculate_user_xp, get_user_level, format_skill_data, SKILL_CATEGORIES

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/dashboard', methods=['GET'])
@require_auth
def get_dashboard(user_id):
    """Get user dashboard data including active quests, recent completions, and XP stats"""
    # Use user client with RLS enforcement
    supabase = get_user_client()
    
    try:
        # Fetch user data
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        
        if not user.data:
            raise NotFoundError('User', user_id)
        
        # Get active quests
        active_quests = get_active_quests(supabase, user_id)
        
        # Get recent completions
        recent_completions = get_recent_completions(supabase, user_id)
        
        # Calculate XP stats
        total_xp, skill_breakdown = calculate_user_xp(supabase, user_id)
        
        print(f"=== DASHBOARD XP DEBUG for user {user_id} ===")
        print(f"Total XP: {total_xp}")
        print(f"Skill breakdown: {skill_breakdown}")
        print("=======================================")
        
        # Get user level info
        level_info = get_user_level(total_xp)
        
        # Format skill data for frontend
        skill_data = format_skill_data(skill_breakdown)
        
        # Calculate completion stats
        completion_stats = get_completion_stats(supabase, user_id)
        
        # Get task completion count
        tasks_completed = get_tasks_completed_count(supabase, user_id)
        
        # Build dashboard response
        dashboard_data = {
            'user': user.data,
            'stats': {
                'total_xp': total_xp,
                'level': level_info,
                'quests_completed': completion_stats['completed'],
                'quests_in_progress': len(active_quests),
                'tasks_completed': tasks_completed,
                'streak': completion_stats.get('streak', 0)
            },
            'xp_by_category': skill_breakdown,
            'skill_xp_data': skill_data,
            'active_quests': active_quests,
            'recent_completions': recent_completions
        }
        
        return jsonify(dashboard_data), 200
        
    except NotFoundError:
        raise
    except Exception as e:
        print(f"Dashboard error: {str(e)}")
        return jsonify({'error': 'Failed to load dashboard'}), 500

def get_tasks_completed_count(supabase, user_id: str) -> int:
    """Get total number of tasks completed by user"""
    try:
        result = supabase.table('user_quest_tasks')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .execute()
        return result.count if result.count else 0
    except Exception as e:
        print(f"Error fetching task completion count: {str(e)}")
        return 0

def get_active_quests(supabase, user_id: str) -> list:
    """Get user's active quests with details"""
    print(f"Fetching active quests for user {user_id}")
    
    try:
        # Simple query that should work with current schema
        # Get active enrollments with quest details and tasks
        active_quests = supabase.table('user_quests')\
            .select('*, quests(*, quest_tasks(*))')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .execute()
        
        print(f"Active quests query result: {len(active_quests.data) if active_quests.data else 0} quests found")
        
        if active_quests.data:
            # Filter out any completed quests (belt and suspenders approach)
            active_only = [q for q in active_quests.data if q.get('completed_at') is None]
            
            # Log the status of each quest for debugging
            for quest in active_only:
                quest_info = quest.get('quests', {})
                print(f"  - Enrollment ID: {quest.get('id')}, Quest: {quest_info.get('title', 'Unknown')}, Completed: {quest.get('completed_at')}")
            
            return active_only
        
    except Exception as e:
        print(f"Error fetching active quests: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        
        # Try simpler query without nested relations
        try:
            active_quests = supabase.table('user_quests')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('is_active', True)\
                .execute()
            
            if active_quests.data:
                # Filter out completed
                active_only = [q for q in active_quests.data if q.get('completed_at') is None]
                
                # Manually fetch quest details for each
                for enrollment in active_only:
                    try:
                        quest = supabase.table('quests')\
                            .select('*')\
                            .eq('id', enrollment['quest_id'])\
                            .single()\
                            .execute()
                        enrollment['quests'] = quest.data if quest.data else {}
                    except:
                        enrollment['quests'] = {}
                
                return active_only
                
        except Exception as fallback_error:
            print(f"Fallback query also failed: {str(fallback_error)}")
    
    return []

def get_recent_completions(supabase, user_id: str, limit: int = 5) -> list:
    """Get user's recent quest completions"""
    try:
        # Simple query that works with current schema
        completions = supabase.table('user_quests')\
            .select('*, quests(*, quest_tasks(*))')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .limit(limit)\
            .execute()
        
        if completions.data:
            return completions.data
            
    except Exception as e:
        print(f"Error in first completions query: {str(e)}")
        
        # Fallback to simpler query
        try:
            completions = supabase.table('user_quests')\
                .select('*, quests(*)')\
                .eq('user_id', user_id)\
                .not_.is_('completed_at', 'null')\
                .order('completed_at', desc=True)\
                .limit(limit)\
                .execute()
            
            if completions.data:
                return completions.data
                
        except Exception as fallback_error:
            print(f"Error fetching recent completions: {str(fallback_error)}")
    
    return []

def get_completion_stats(supabase, user_id: str) -> dict:
    """Get user's completion statistics"""
    try:
        # Count total completed quests (V3 uses completed_at field)
        completed = supabase.table('user_quests')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .execute()
        
        completed_count = completed.count if completed else 0
        
        # Fallback to status field if needed
        if completed_count == 0:
            try:
                completed = supabase.table('user_quests')\
                    .select('id', count='exact')\
                    .eq('user_id', user_id)\
                    .eq('status', 'completed')\
                    .execute()
                completed_count = completed.count if completed else 0
            except:
                pass
        
        # Calculate streak (simplified - days with completions)
        # This is a basic implementation - can be enhanced
        streak = calculate_streak(supabase, user_id)
        
        return {
            'completed': completed_count,
            'streak': streak
        }
    except Exception as e:
        print(f"Error getting completion stats: {str(e)}")
        return {'completed': 0, 'streak': 0}

def calculate_streak(supabase, user_id: str) -> int:
    """Calculate user's completion streak (simplified version)"""
    # This is a simplified streak calculation
    # In production, you'd want to track daily activity properly
    try:
        recent = supabase.table('user_quests')\
            .select('completed_at')\
            .eq('user_id', user_id)\
            .eq('status', 'completed')\
            .order('completed_at', desc=True)\
            .limit(30)\
            .execute()
        
        if not recent.data:
            return 0
        
        # Simple streak: count consecutive days with completions
        # This is a basic implementation - enhance as needed
        return min(len(recent.data), 7)  # Cap at 7 for now
        
    except:
        return 0

def extract_xp_rewards(quest: dict) -> dict:
    """Extract XP rewards from quest data"""
    xp_rewards = {}
    
    # Try to get skill-based XP
    if 'quest_skill_xp' in quest and quest['quest_skill_xp']:
        for award in quest['quest_skill_xp']:
            category = award.get('skill_category')
            amount = award.get('xp_amount', 0)
            if category:
                xp_rewards[category] = xp_rewards.get(category, 0) + amount
    
    # Fallback to subject-based XP
    elif 'quest_xp_awards' in quest and quest['quest_xp_awards']:
        from .helpers import SUBJECT_TO_SKILL_MAP
        for award in quest['quest_xp_awards']:
            subject = award.get('subject')
            amount = award.get('xp_amount', 0)
            if subject:
                skill_cat = SUBJECT_TO_SKILL_MAP.get(subject, 'thinking_skills')
                xp_rewards[skill_cat] = xp_rewards.get(skill_cat, 0) + amount
    
    # If no XP data, use default based on difficulty
    if not xp_rewards:
        difficulty = quest.get('difficulty', 'beginner')
        default_xp = {'beginner': 10, 'intermediate': 25, 'advanced': 50}
        xp_rewards['general'] = default_xp.get(difficulty, 10)
    
    return xp_rewards