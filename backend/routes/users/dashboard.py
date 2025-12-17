"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- Multiple direct database calls for dashboard data aggregation
- Uses helper functions from users/helpers.py for XP calculations
- Could create DashboardRepository with methods:
  - get_user_subject_xp(user_id)
  - get_dashboard_summary(user_id)
  - get_user_progress_stats(user_id)
- Complex aggregation queries suitable for repository abstraction

User dashboard routes
"""

from flask import Blueprint, jsonify
from datetime import datetime, timezone
from database import get_supabase_admin_client
from backend.repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_auth
from middleware.error_handler import NotFoundError
from .helpers import calculate_user_xp, get_user_level, format_skill_data, SKILL_CATEGORIES

from utils.logger import get_logger

logger = get_logger(__name__)

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/subject-xp', methods=['GET'])
@require_auth
def get_user_subject_xp(user_id):
    """Get user's XP by school subject for diploma credits"""
    # Use admin client - user authentication enforced by @require_auth
    supabase = get_supabase_admin_client()

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
        logger.error(f"Error fetching subject XP: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch subject XP',
            'subject_xp': []
        }), 500


@dashboard_bp.route('/dashboard', methods=['GET'])
@require_auth
def get_dashboard(user_id):
    """Get user dashboard data including active quests and XP stats"""
    # Use admin client - user authentication enforced by @require_auth
    supabase = get_supabase_admin_client()

    try:
        # Fetch user data
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()

        if not user.data:
            raise NotFoundError('User', user_id)

        # Get active quests
        active_quests = get_active_quests(supabase, user_id)

        # Get completed quests count and recent completions
        # IMPORTANT: A quest is truly completed only if is_active=False AND completed_at is set
        # (Active quests may have completed_at from previous completion, but they're not "completed" anymore)
        completed_quests_response = supabase.table('user_quests')\
            .select('id, quest_id, completed_at, quests(id, title, description, image_url, header_image_url)', count='exact')\
            .eq('user_id', user_id)\
            .eq('is_active', False)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .limit(5)\
            .execute()

        completed_quests_count = completed_quests_response.count or 0
        recent_completed_quests = completed_quests_response.data or []

        # Calculate XP stats (needed for ConstellationPage and other features)
        total_xp, skill_breakdown = calculate_user_xp(supabase, user_id)

        # Get user level info
        level_info = get_user_level(total_xp)

        # Format skill data for frontend
        skill_data = format_skill_data(skill_breakdown)

        # Build simplified dashboard response
        dashboard_data = {
            'user': user.data,
            'stats': {
                'total_xp': total_xp,
                'level': level_info,
                'completed_quests_count': completed_quests_count
            },
            'xp_by_category': skill_breakdown,
            'skill_xp_data': skill_data,
            'active_quests': active_quests,
            'recent_completed_quests': recent_completed_quests
        }

        return jsonify(dashboard_data), 200

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Dashboard error: {str(e)}")
        return jsonify({'error': 'Failed to load dashboard'}), 500


def get_active_quests(supabase, user_id: str) -> list:
    """Get user's active quests with details"""
    try:
        # Get active enrollments with quest details
        # IMPORTANT: Only filter by is_active=True, NOT completed_at
        # Restarted quests have both is_active=True AND a completed_at timestamp from previous completion
        # If is_active=True, the quest is active regardless of completed_at value
        active_quests = supabase.table('user_quests')\
            .select('*, quests(*)')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .execute()

        if active_quests.data:
            # Filter out "stale" completed quests that were never properly ended
            # A quest is truly active if:
            # 1. is_active=True AND completed_at IS NULL (in progress)
            # 2. is_active=True AND completed_at IS NOT NULL AND last_picked_up_at > completed_at (explicit restart)
            #
            # To detect restarts: check if last_picked_up_at is AFTER completed_at
            # This allows restarts at any time (not just within 24 hours)
            from datetime import datetime, timezone

            active_only = []
            for quest in active_quests.data:
                completed_at = quest.get('completed_at')
                last_picked_up_at = quest.get('last_picked_up_at')

                # If no completed_at, it's truly active
                if not completed_at:
                    active_only.append(quest)
                    continue

                # If completed_at is set, check if this is a legitimate restart
                # by comparing last_picked_up_at with completed_at
                try:
                    completed_dt = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))

                    # If last_picked_up_at exists and is after completed_at, it's a valid restart
                    if last_picked_up_at:
                        picked_up_dt = datetime.fromisoformat(last_picked_up_at.replace('Z', '+00:00'))
                        if picked_up_dt > completed_dt:
                            # Legitimate restart - user explicitly restarted after completion
                            active_only.append(quest)
                            continue

                    # If we get here, it's a stale completion (completed but never properly ended)
                    logger.info(f"Filtering out stale completed quest {quest.get('id')[:8]} (completed_at set but no restart)")

                except (ValueError, AttributeError) as e:
                    # If date parsing fails, include it to be safe
                    logger.warning(f"Could not parse timestamps for quest {quest.get('id')}: {e}")
                    active_only.append(quest)

            # Debug: Log filtering results
            filtered_count = len(active_quests.data) - len(active_only)
            if filtered_count > 0:
                logger.info(f"Filtered out {filtered_count} stale completed quest(s) from active list")

            # Process each quest to add calculated fields
            for enrollment in active_only:
                enrollment_id = enrollment.get('id')

                # Get user's personalized tasks for this enrollment
                user_tasks = supabase.table('user_quest_tasks')\
                    .select('*')\
                    .eq('user_quest_id', enrollment_id)\
                    .eq('approval_status', 'approved')\
                    .order('order_index')\
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
                quest_info = enrollment.get('quests', {})
                quest_info['total_xp'] = total_xp
                quest_info['task_count'] = task_count
                quest_info['pillar_breakdown'] = pillar_breakdown

                # Get completed tasks for progress and marking tasks as complete
                try:
                    if task_count > 0:
                        task_ids = [t['id'] for t in tasks]
                        completed_tasks_response = supabase.table('quest_task_completions')\
                            .select('user_quest_task_id')\
                            .eq('user_id', user_id)\
                            .in_('user_quest_task_id', task_ids)\
                            .execute()

                        completed_task_ids = {t['user_quest_task_id'] for t in (completed_tasks_response.data or [])}
                        enrollment['completed_tasks'] = len(completed_task_ids)

                        # Mark each task as completed or not for frontend
                        for task in tasks:
                            task['is_completed'] = task['id'] in completed_task_ids
                    else:
                        enrollment['completed_tasks'] = 0

                    # Add enriched tasks to quest data for frontend
                    quest_info['quest_tasks'] = tasks
                except Exception as e:
                    logger.error(f"Error getting completed tasks: {str(e)}")
                    enrollment['completed_tasks'] = 0
                    quest_info['quest_tasks'] = []
            
            return active_only
        
    except Exception as e:
        logger.error(f"Error fetching active quests: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        
        # Try simpler query without nested relations
        try:
            active_quests = supabase.table('user_quests')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('is_active', True)\
                .execute()

            if active_quests.data:
                # Apply same filtering logic as primary query
                from datetime import datetime, timezone

                active_only = []
                for quest in active_quests.data:
                    completed_at = quest.get('completed_at')
                    last_picked_up_at = quest.get('last_picked_up_at')

                    if not completed_at:
                        active_only.append(quest)
                        continue

                    try:
                        completed_dt = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))

                        if last_picked_up_at:
                            picked_up_dt = datetime.fromisoformat(last_picked_up_at.replace('Z', '+00:00'))
                            if picked_up_dt > completed_dt:
                                active_only.append(quest)
                                continue

                        logger.info(f"Fallback: Filtering out stale completed quest {quest.get('id')[:8]} (completed_at set but no restart)")

                    except (ValueError, AttributeError) as e:
                        logger.warning(f"Fallback: Could not parse timestamps for quest {quest.get('id')}: {e}")
                        active_only.append(quest)

                filtered_count = len(active_quests.data) - len(active_only)
                if filtered_count > 0:
                    logger.info(f"Fallback: Filtered out {filtered_count} stale completed quest(s) from active list")
                
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
                            .order('order_index')\
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

                        # Get completed tasks count and mark completion status
                        try:
                            if task_count > 0:
                                task_ids = [t['id'] for t in tasks]
                                completed_tasks_response = supabase.table('quest_task_completions')\
                                    .select('user_quest_task_id')\
                                    .eq('user_id', user_id)\
                                    .in_('user_quest_task_id', task_ids)\
                                    .execute()

                                completed_task_ids = {t['user_quest_task_id'] for t in (completed_tasks_response.data or [])}
                                enrollment['completed_tasks'] = len(completed_task_ids)

                                # Mark each task as completed or not for frontend
                                for task in tasks:
                                    task['is_completed'] = task['id'] in completed_task_ids
                            else:
                                enrollment['completed_tasks'] = 0

                            # Add enriched tasks to quest data for frontend
                            quest_info['quest_tasks'] = tasks
                        except Exception as e:
                            logger.error(f"Error getting completed tasks fallback: {str(e)}")
                            enrollment['completed_tasks'] = 0
                            quest_info['quest_tasks'] = []
                    except:
                        enrollment['quests'] = {}
                
                return active_only
                
        except Exception as fallback_error:
            logger.error(f"Fallback query also failed: {str(fallback_error)}")
    
    return []

