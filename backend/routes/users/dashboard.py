"""User dashboard routes"""

from flask import Blueprint, jsonify
from datetime import datetime, timezone
from database import get_user_client
from utils.auth.decorators import require_auth
from middleware.error_handler import NotFoundError
from .helpers import calculate_user_xp, get_user_level, format_skill_data, SKILL_CATEGORIES

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/subject-xp', methods=['GET'])
@require_auth
def get_user_subject_xp(user_id):
    """Get user's XP by school subject for diploma credits"""
    supabase = get_user_client()

    try:
        # Fetch subject XP data
        response = supabase.table('user_subject_xp')\
            .select('school_subject, xp_amount')\
            .eq('user_id', user_id)\
            .execute()

        subject_xp = response.data or []

        return jsonify({
            'success': True,
            'subject_xp': subject_xp
        })

    except Exception as e:
        print(f"Error fetching subject XP: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch subject XP',
            'subject_xp': []
        }), 500

def get_recent_completions_combined(supabase, user_id: str, limit: int = 5) -> list:
    """Get combined list of recent task and quest completions."""
    try:
        tasks = get_recent_task_completions(supabase, user_id, limit)
        quests = get_recent_completions(supabase, user_id, limit)

        for task in tasks:
            task['type'] = 'task'
            task['title'] = task.get('task_description', 'Task Completed')
            task['xp'] = task.get('xp_awarded', 0)

        formatted_quests = []
        for quest_enrollment in quests:
            quest_details = quest_enrollment.get('quests', {})
            total_xp = sum(task.get('xp_amount', 0) for task in quest_details.get('quest_tasks', []))
            formatted_quests.append({
                'id': quest_enrollment.get('id'),
                'type': 'quest',
                'title': quest_details.get('title', 'Quest Completed'),
                'completed_at': quest_enrollment.get('completed_at'),
                'xp': total_xp
            })

        combined = tasks + formatted_quests
        
        # Sort by 'completed_at', handling potential naive and aware datetime objects
        combined.sort(key=lambda x: datetime.fromisoformat(x['completed_at'].replace('Z', '+00:00')) if isinstance(x.get('completed_at'), str) else datetime.now(timezone.utc), reverse=True)
        
        return combined[:limit]
    except Exception as e:
        print(f"Error in get_recent_completions_combined: {str(e)}")
        return []

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
        
        # Get combined recent completions (both tasks and quests) - limit to 5
        recent_completions = get_recent_completions_combined(supabase, user_id, limit=5)
        
        # Calculate XP stats
        total_xp, skill_breakdown = calculate_user_xp(supabase, user_id)

        print(f"=== DASHBOARD XP DEBUG for user {user_id} ===")
        print(f"Total XP: {total_xp}")
        print(f"Skill breakdown: {skill_breakdown}")
        print(f"Has any XP?: {any(xp > 0 for xp in skill_breakdown.values())}")
        print("=======================================")
        
        # Get user level info
        level_info = get_user_level(total_xp)
        
        # Format skill data for frontend
        skill_data = format_skill_data(skill_breakdown)
        
        # Calculate completion stats
        completion_stats = get_completion_stats(supabase, user_id)

        # Get task completion count
        tasks_completed = get_tasks_completed_count(supabase, user_id)

        # Get enhanced streak data
        streak_data = get_enhanced_streak_data(supabase, user_id)

        # Get additional stats
        additional_stats = get_additional_stats(supabase, user_id)

        # Build dashboard response
        dashboard_data = {
            'user': user.data,
            'stats': {
                'total_xp': total_xp,
                'level': level_info,
                'quests_completed': completion_stats['completed'],
                'quests_in_progress': len(active_quests),
                'tasks_completed': tasks_completed,
                'streak': completion_stats.get('streak', 0),
                # Enhanced streak data
                'task_streak_current': streak_data['task_streak']['current'],
                'task_streak_best': streak_data['task_streak']['best'],
                'login_streak_current': streak_data['login_streak']['current'],
                'login_streak_best': streak_data['login_streak']['best'],
                'weekly_active_days': streak_data['weekly_active_days'],
                # Additional stats
                'favorite_pillar': additional_stats['favorite_pillar'],
                'avg_xp_per_day': additional_stats['avg_xp_per_day'],
                'most_productive_day': additional_stats['most_productive_day']
            },
            'xp_by_category': skill_breakdown,
            'skill_xp_data': skill_data,
            'active_quests': active_quests,
            'recent_completions': recent_completions
        }
        
        print(f"=== DASHBOARD RESPONSE DEBUG ===")
        print(f"Total XP being sent: {total_xp}")
        print(f"XP by category: {skill_breakdown}")
        print(f"Stats object: {dashboard_data['stats']}")
        print(f"Tasks completed: {tasks_completed}")
        print(f"================================")
        
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
        # Get active enrollments with quest details
        active_quests = supabase.table('user_quests')\
            .select('*, quests(*)')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .execute()

        print(f"Active quests query result: {len(active_quests.data) if active_quests.data else 0} quests found")

        if active_quests.data:
            # Filter out any completed quests (belt and suspenders approach)
            active_only = [q for q in active_quests.data if q.get('completed_at') is None]

            # Process each quest to add calculated fields
            for enrollment in active_only:
                quest_info = enrollment.get('quests', {})
                enrollment_id = enrollment.get('id')
                print(f"  - Enrollment ID: {enrollment_id}, Quest: {quest_info.get('title', 'Unknown')}, Completed: {enrollment.get('completed_at')}")

                # Get user's personalized tasks for this enrollment
                user_tasks = supabase.table('user_quest_tasks')\
                    .select('*')\
                    .eq('user_quest_id', enrollment_id)\
                    .eq('approval_status', 'approved')\
                    .execute()

                tasks = user_tasks.data if user_tasks.data else []
                task_count = len(tasks)

                # Calculate total XP and pillar breakdown
                total_xp = 0
                pillar_breakdown = {}

                for task in tasks:
                    xp_amount = task.get('xp_value', 0)
                    pillar = task.get('pillar', 'creativity')
                    total_xp += xp_amount
                    if pillar not in pillar_breakdown:
                        pillar_breakdown[pillar] = 0
                    pillar_breakdown[pillar] += xp_amount

                # Add calculated fields to quest data
                quest_info['total_xp'] = total_xp
                quest_info['task_count'] = task_count
                quest_info['pillar_breakdown'] = pillar_breakdown

                # Get completed tasks count for progress
                try:
                    if task_count > 0:
                        task_ids = [t['id'] for t in tasks]
                        completed_tasks = supabase.table('quest_task_completions')\
                            .select('id', count='exact')\
                            .eq('user_id', user_id)\
                            .in_('user_quest_task_id', task_ids)\
                            .execute()
                        enrollment['completed_tasks'] = completed_tasks.count if hasattr(completed_tasks, 'count') else 0
                    else:
                        enrollment['completed_tasks'] = 0
                except Exception as e:
                    print(f"Error getting completed tasks: {str(e)}")
                    enrollment['completed_tasks'] = 0

                print(f"    Tasks: {enrollment['completed_tasks']}/{task_count}, Total XP: {total_xp}")
            
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
                        enrollment_id = enrollment.get('id')
                        quest = supabase.table('quests')\
                            .select('*')\
                            .eq('id', enrollment['quest_id'])\
                            .single()\
                            .execute()
                        enrollment['quests'] = quest.data if quest.data else {}

                        # Get user's personalized tasks for this enrollment
                        user_tasks = supabase.table('user_quest_tasks')\
                            .select('*')\
                            .eq('user_quest_id', enrollment_id)\
                            .eq('approval_status', 'approved')\
                            .execute()

                        tasks = user_tasks.data if user_tasks.data else []
                        task_count = len(tasks)

                        # Calculate fields for the fallback case too
                        quest_info = enrollment['quests']
                        total_xp = 0
                        pillar_breakdown = {}

                        for task in tasks:
                            xp_amount = task.get('xp_value', 0)
                            pillar = task.get('pillar', 'creativity')
                            total_xp += xp_amount
                            if pillar not in pillar_breakdown:
                                pillar_breakdown[pillar] = 0
                            pillar_breakdown[pillar] += xp_amount

                        quest_info['total_xp'] = total_xp
                        quest_info['task_count'] = task_count
                        quest_info['pillar_breakdown'] = pillar_breakdown

                        # Get completed tasks count
                        try:
                            if task_count > 0:
                                task_ids = [t['id'] for t in tasks]
                                completed_tasks = supabase.table('quest_task_completions')\
                                    .select('id', count='exact')\
                                    .eq('user_id', user_id)\
                                    .in_('user_quest_task_id', task_ids)\
                                    .execute()
                                enrollment['completed_tasks'] = completed_tasks.count if hasattr(completed_tasks, 'count') else 0
                            else:
                                enrollment['completed_tasks'] = 0
                        except Exception as e:
                            print(f"Error getting completed tasks fallback: {str(e)}")
                            enrollment['completed_tasks'] = 0
                    except:
                        enrollment['quests'] = {}
                
                return active_only
                
        except Exception as fallback_error:
            print(f"Fallback query also failed: {str(fallback_error)}")
    
    return []

def get_recent_task_completions(supabase, user_id: str, limit: int = 5) -> list:
    """Get user's recent task completions with detailed information"""
    try:
        # Get recent task completions with quest and task details
        completions = supabase.table('user_quest_tasks')\
            .select('*, quest_tasks(title, description, pillar, xp_amount), user_quests(quest_id, quests(title))')\
            .eq('user_id', user_id)\
            .order('completed_at', desc=True)\
            .limit(limit)\
            .execute()
        
        if completions.data:
            # Format the data for frontend
            formatted_completions = []
            for completion in completions.data:
                task_info = completion.get('quest_tasks', {})
                quest_info = completion.get('user_quests', {}).get('quests', {}) if completion.get('user_quests') else {}
                
                formatted_completions.append({
                    'id': completion.get('id'),
                    'task_description': task_info.get('title', 'Task completed'),
                    'description': task_info.get('description', ''),
                    'quest_title': quest_info.get('title', 'Unknown Quest'),
                    'xp_awarded': completion.get('xp_awarded', 0),
                    'pillar': task_info.get('pillar', 'general'),
                    'completed_at': completion.get('completed_at'),
                    'evidence_type': completion.get('evidence_type'),
                    'evidence_content': completion.get('evidence_content')
                })
            
            return formatted_completions
            
    except Exception as e:
        print(f"Error fetching recent task completions: {str(e)}")
        
        # Fallback: try simpler query
        try:
            completions = supabase.table('user_quest_tasks')\
                .select('*, quest_tasks(title, pillar, xp_amount)')\
                .eq('user_id', user_id)\
                .order('completed_at', desc=True)\
                .limit(limit)\
                .execute()
            
            if completions.data:
                formatted_completions = []
                for completion in completions.data:
                    task_info = completion.get('quest_tasks', {})
                    formatted_completions.append({
                        'id': completion.get('id'),
                        'task_description': task_info.get('title', 'Task completed'),
                        'quest_title': 'Quest',
                        'xp_awarded': completion.get('xp_awarded', 0),
                        'pillar': task_info.get('pillar', 'general'),
                        'completed_at': completion.get('completed_at')
                    })
                return formatted_completions
                
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
                    .not_.is_('completed_at', 'null')\
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
            .not_.is_('completed_at', 'null')\
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

def get_enhanced_streak_data(supabase, user_id: str) -> dict:
    """Get comprehensive streak and activity data"""
    try:
        from datetime import datetime, timedelta, timezone

        # Get task completion streaks
        task_completions = supabase.table('user_quest_tasks')\
            .select('completed_at')\
            .eq('user_id', user_id)\
            .order('completed_at', desc=True)\
            .limit(60)\
            .execute()

        # Get login streaks (based on quest/task activity as proxy)
        login_activity = supabase.table('user_quest_tasks')\
            .select('completed_at')\
            .eq('user_id', user_id)\
            .order('completed_at', desc=True)\
            .limit(30)\
            .execute()

        def calculate_consecutive_days(completions):
            if not completions:
                return {'current': 0, 'best': 0}

            # Convert to dates and get unique days
            dates = set()
            for completion in completions:
                try:
                    dt = datetime.fromisoformat(completion['completed_at'].replace('Z', '+00:00'))
                    dates.add(dt.date())
                except:
                    continue

            if not dates:
                return {'current': 0, 'best': 0}

            # Sort dates
            sorted_dates = sorted(dates, reverse=True)

            # Calculate current streak
            current_streak = 0
            yesterday = datetime.now(timezone.utc).date()

            for date in sorted_dates:
                if date == yesterday or (yesterday - date).days <= 1:
                    current_streak += 1
                    yesterday = date - timedelta(days=1)
                else:
                    break

            # Calculate best streak
            best_streak = 0
            temp_streak = 1

            for i in range(1, len(sorted_dates)):
                if (sorted_dates[i-1] - sorted_dates[i]).days == 1:
                    temp_streak += 1
                else:
                    best_streak = max(best_streak, temp_streak)
                    temp_streak = 1

            best_streak = max(best_streak, temp_streak)

            return {'current': current_streak, 'best': best_streak}

        task_streaks = calculate_consecutive_days(task_completions.data or [])
        login_streaks = calculate_consecutive_days(login_activity.data or [])

        return {
            'task_streak': task_streaks,
            'login_streak': login_streaks,
            'weekly_active_days': min(len(set(
                datetime.fromisoformat(c['completed_at'].replace('Z', '+00:00')).date()
                for c in (task_completions.data or [])[-7:]
                if c.get('completed_at')
            )), 7)
        }

    except Exception as e:
        print(f"Error calculating enhanced streaks: {e}")
        return {
            'task_streak': {'current': 0, 'best': 0},
            'login_streak': {'current': 0, 'best': 0},
            'weekly_active_days': 0
        }

def get_additional_stats(supabase, user_id: str) -> dict:
    """Get additional dashboard statistics"""
    try:
        from datetime import datetime, timedelta, timezone

        # Get favorite pillar (most XP earned)
        user_xp = supabase.table('user_skill_xp')\
            .select('pillar, xp_amount')\
            .eq('user_id', user_id)\
            .execute()

        favorite_pillar = 'None'
        if user_xp.data:
            max_xp = max(user_xp.data, key=lambda x: x['xp_amount'])
            favorite_pillar = max_xp['pillar'].replace('_', ' ').title()

        # Calculate average XP per day (last 30 days)
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        recent_tasks = supabase.table('user_quest_tasks')\
            .select('xp_awarded, completed_at')\
            .eq('user_id', user_id)\
            .gte('completed_at', thirty_days_ago)\
            .execute()

        total_recent_xp = sum(task.get('xp_awarded', 0) for task in (recent_tasks.data or []))
        avg_xp_per_day = round(total_recent_xp / 30, 1)

        # Get most productive day of week
        day_counts = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}  # Monday = 0
        for task in (recent_tasks.data or []):
            try:
                dt = datetime.fromisoformat(task['completed_at'].replace('Z', '+00:00'))
                day_counts[dt.weekday()] += 1
            except:
                continue

        most_productive_day = 'Not enough data'
        if any(count > 0 for count in day_counts.values()):
            day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
            best_day_index = max(day_counts, key=day_counts.get)
            most_productive_day = day_names[best_day_index]

        return {
            'favorite_pillar': favorite_pillar,
            'avg_xp_per_day': avg_xp_per_day,
            'most_productive_day': most_productive_day
        }

    except Exception as e:
        print(f"Error calculating additional stats: {e}")
        return {
            'favorite_pillar': 'None',
            'avg_xp_per_day': 0,
            'most_productive_day': 'Not enough data'
        }

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