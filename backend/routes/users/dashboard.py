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


@dashboard_bp.route('/dashboard', methods=['GET'])
@require_auth
def get_dashboard(user_id):
    """Get user dashboard data including active quests and XP stats"""
    # Use user client with RLS enforcement
    supabase = get_user_client()

    try:
        # Fetch user data
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()

        if not user.data:
            raise NotFoundError('User', user_id)

        # Get active quests
        active_quests = get_active_quests(supabase, user_id)

        # Calculate XP stats (needed for ConstellationPage and other features)
        total_xp, skill_breakdown = calculate_user_xp(supabase, user_id)

        print(f"=== DASHBOARD XP DEBUG for user {user_id} ===")
        print(f"Total XP: {total_xp}")
        print(f"Skill breakdown: {skill_breakdown}")
        print("=======================================")

        # Get user level info
        level_info = get_user_level(total_xp)

        # Format skill data for frontend
        skill_data = format_skill_data(skill_breakdown)

        # Build simplified dashboard response
        dashboard_data = {
            'user': user.data,
            'stats': {
                'total_xp': total_xp,
                'level': level_info
            },
            'xp_by_category': skill_breakdown,
            'skill_xp_data': skill_data,
            'active_quests': active_quests
        }

        print(f"=== DASHBOARD RESPONSE DEBUG ===")
        print(f"Total XP being sent: {total_xp}")
        print(f"XP by category: {skill_breakdown}")
        print(f"Active quests: {len(active_quests)}")
        print(f"================================")

        return jsonify(dashboard_data), 200

    except NotFoundError:
        raise
    except Exception as e:
        print(f"Dashboard error: {str(e)}")
        return jsonify({'error': 'Failed to load dashboard'}), 500


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

