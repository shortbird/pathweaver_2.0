"""
Parent Dashboard - Overview & Summary Stats.
Provides main dashboard view with learning rhythm, active quests, and weekly wins.
Part of parent/dashboard.py refactoring (Month 6 - Backend Optimization).
"""
from flask import Blueprint, jsonify
from datetime import date, timedelta
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import AuthorizationError, NotFoundError
from utils.pillar_utils import get_pillar_name
from utils.logger import get_logger
import logging

logger = get_logger(__name__)
logger = logging.getLogger(__name__)

bp = Blueprint('parent_dashboard_overview', __name__, url_prefix='/api/parent')


def verify_parent_access(supabase, parent_user_id, student_user_id):
    """
    Helper function to verify parent has active access to student.
    IMPORTANT: Accepts supabase client to avoid connection exhaustion.

    Special case: Admin users can view their own student data for demo purposes.
    Supports both dependent relationships (managed_by_parent_id) and linked students (parent_student_links).
    Optimized to ONE database query to prevent HTTP/2 stream exhaustion.
    """
    try:
        # Special case: Admin viewing their own data (self-link for demo)
        if parent_user_id == student_user_id:
            # Single query to verify admin role
            user_response = supabase.table('users').select('role').eq('id', parent_user_id).single().execute()
            if user_response.data and user_response.data.get('role') == 'admin':
                return True
            # If not admin, fall through to normal parent validation

        # OPTIMIZED: Single query with JOIN to get user role AND link status
        # This reduces 3 queries to 1, preventing HTTP/2 stream exhaustion
        user_response = supabase.table('users').select('''
            role,
            parent_student_links!parent_student_links_parent_user_id_fkey(
                id,
                student_user_id
            )
        ''').eq('id', parent_user_id).single().execute()

        if not user_response.data:
            raise AuthorizationError("User not found")

        user = user_response.data
        user_role = user.get('role')

        # Verify parent or admin role (admins have full parent privileges)
        if user_role not in ('parent', 'admin'):
            raise AuthorizationError("Only parent accounts can access this endpoint")

        # Check for link to this specific student (all links are permanent once created)
        links = user.get('parent_student_links', [])
        has_active_link = any(
            link.get('student_user_id') == student_user_id
            for link in links
        )

        if has_active_link:
            return True

        # If no link found, check if student is a dependent managed by this parent
        student_response = supabase.table('users').select('is_dependent, managed_by_parent_id').eq('id', student_user_id).single().execute()
        if student_response.data:
            is_dependent = student_response.data.get('is_dependent', False)
            managed_by = student_response.data.get('managed_by_parent_id')
            if is_dependent and managed_by == parent_user_id:
                return True

        # No access found
        raise AuthorizationError("You do not have access to this student's data")

    except AuthorizationError:
        raise
    except Exception as e:
        logger.error(f"Error in verify_parent_access: {str(e)}")
        raise AuthorizationError("Failed to verify parent access")


@bp.route('/dashboard/<student_id>', methods=['GET'])
@require_auth
def get_parent_dashboard(user_id, student_id):
    """
    Get main parent dashboard data including learning rhythm, active quests, and summary.
    Optimized to minimize database connections.
    """
    supabase = None
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get learning rhythm status
        rhythm_response = supabase.rpc('get_learning_rhythm_status', {
            'p_student_id': student_id
        }).execute()

        rhythm_data = rhythm_response.data[0] if rhythm_response.data else {
            'status': 'needs_support',
            'has_overdue_tasks': False,
            'has_recent_progress': False,
            'last_activity_date': None,
            'overdue_task_count': 0
        }

        # Get student basic info
        student_response = supabase.table('users').select('''
            id, first_name, last_name, avatar_url, level, total_xp, streak_days
        ''').eq('id', student_id).execute()

        if not student_response.data:
            raise NotFoundError("Student not found")

        student = student_response.data[0]

        # Get active quests with quest details
        active_quests_response = supabase.table('user_quests').select('''
            quest_id, started_at, is_active,
            quests!inner(id, title, image_url, header_image_url)
        ''').eq('user_id', student_id).is_('completed_at', 'null').eq('is_active', True).execute()

        active_quest_ids = [uq['quest_id'] for uq in active_quests_response.data]

        # DEBUG: Log quest counts
        logger.info(f"DEBUG - Student {student_id} has {len(active_quest_ids)} active quests: {active_quest_ids}")

        # Batch fetch all tasks and completions for active quests
        tasks_map = {}
        completions_map = {}

        if active_quest_ids:
            # Get all user tasks for active quests
            all_tasks_response = supabase.table('user_quest_tasks').select('id, quest_id').eq(
                'user_id', student_id
            ).in_('quest_id', active_quest_ids).execute()

            for task in all_tasks_response.data:
                qid = task['quest_id']
                if qid not in tasks_map:
                    tasks_map[qid] = []
                tasks_map[qid].append(task['id'])

            # DEBUG: Log task counts per quest
            logger.info(f"DEBUG - Task counts by quest: {[(qid, len(tasks)) for qid, tasks in tasks_map.items()]}")

            # Get all completions for active quests in one query
            all_completions_response = supabase.table('quest_task_completions').select('task_id, quest_id, user_quest_task_id').eq(
                'user_id', student_id
            ).in_('quest_id', active_quest_ids).execute()

            for comp in all_completions_response.data:
                qid = comp['quest_id']
                # Use user_quest_task_id as the canonical task identifier
                task_id = comp.get('user_quest_task_id') or comp.get('task_id')
                if qid not in completions_map:
                    completions_map[qid] = []
                if task_id:
                    completions_map[qid].append(task_id)

        # Build active quests list
        active_quests = []
        for uq in active_quests_response.data:
            quest = uq['quests']
            quest_id = quest['id']

            total_tasks = len(tasks_map.get(quest_id, []))
            completed_tasks = len(completions_map.get(quest_id, []))

            active_quests.append({
                'quest_id': quest_id,
                'title': quest['title'],
                'image_url': quest.get('image_url') or quest.get('header_image_url'),
                'started_at': uq['started_at'],
                'progress': {
                    'completed_tasks': completed_tasks,
                    'total_tasks': total_tasks,
                    'percentage': round((completed_tasks / total_tasks * 100)) if total_tasks > 0 else 0
                }
            })

        # DEBUG: Log final active quests
        logger.info(f"DEBUG - Returning {len(active_quests)} active quests: {[(q['quest_id'], q['title'], q['progress']) for q in active_quests]}")

        # Get weekly wins (last 7 days)
        seven_days_ago = (date.today() - timedelta(days=7)).isoformat()
        weekly_wins = []

        # Recent quest completions
        completed_quests = supabase.table('user_quests').select('''
            quest_id, completed_at,
            quests!inner(title)
        ''').eq('user_id', student_id).gte('completed_at', seven_days_ago).execute()

        for cq in completed_quests.data:
            weekly_wins.append({
                'type': 'quest_completed',
                'title': cq['quests']['title'],
                'date': cq['completed_at']
            })

        # Recent badges earned (check user_badges table if exists, otherwise skip)
        try:
            badges_response = supabase.table('user_badges').select('''
                badge_id, earned_at,
                badges!inner(name)
            ''').eq('user_id', student_id).gte('earned_at', seven_days_ago).execute()

            for badge in badges_response.data:
                weekly_wins.append({
                    'type': 'badge_earned',
                    'title': badge['badges']['name'],
                    'date': badge['earned_at']
                })
        except Exception:
            pass  # Table may not exist yet

        # Sort weekly wins by date
        weekly_wins.sort(key=lambda x: x['date'], reverse=True)

        # Get recent task completions (last 10)
        recent_completions_response = supabase.table('quest_task_completions').select('''
            completed_at,
            user_quest_task_id,
            task_id,
            quest_id
        ''').eq('user_id', student_id).order('completed_at', desc=True).limit(10).execute()

        recent_completions = []
        if recent_completions_response.data:
            # Collect all task IDs (both personalized and template)
            personalized_ids = [c['user_quest_task_id'] for c in recent_completions_response.data if c.get('user_quest_task_id')]
            template_ids = [c['task_id'] for c in recent_completions_response.data if c.get('task_id')]
            quest_ids_for_lookup = list(set(c['quest_id'] for c in recent_completions_response.data if c.get('quest_id')))

            # Build task maps
            task_details = {}

            # Get task details from user_quest_tasks
            all_task_ids = list(set(personalized_ids + template_ids))
            if all_task_ids:
                tasks_response = supabase.table('user_quest_tasks').select('''
                    id, title, pillar, xp_value, quest_id
                ''').in_('id', all_task_ids).execute()
                for task in tasks_response.data:
                    task_details[task['id']] = task

            # Get quest titles
            quest_titles = {}
            if quest_ids_for_lookup:
                quests_response = supabase.table('quests').select('id, title').in_('id', quest_ids_for_lookup).execute()
                quest_titles = {q['id']: q['title'] for q in quests_response.data}

            # Build recent completions with task and quest details
            for comp in recent_completions_response.data:
                task_id = comp.get('user_quest_task_id') or comp.get('task_id')
                if task_id and task_id in task_details:
                    task = task_details[task_id]
                    quest_title = quest_titles.get(comp.get('quest_id'), 'Unknown Quest')
                    recent_completions.append({
                        'task_title': task['title'],
                        'quest_title': quest_title,
                        'pillar': get_pillar_name(task.get('pillar', 0)),
                        'xp_earned': task.get('xp_value', 0),
                        'completed_at': comp['completed_at']
                    })

        return jsonify({
            'student': {
                'id': student['id'],
                'first_name': student.get('first_name'),
                'last_name': student.get('last_name'),
                'avatar_url': student.get('avatar_url'),
                'level': student.get('level', 0),
                'total_xp': student.get('total_xp', 0),
                'streak_days': student.get('streak_days', 0)
            },
            'learning_rhythm': {
                'status': rhythm_data['status'],
                'has_overdue_tasks': rhythm_data['has_overdue_tasks'],
                'has_recent_progress': rhythm_data['has_recent_progress'],
                'last_activity_date': rhythm_data['last_activity_date'],
                'overdue_task_count': rhythm_data['overdue_task_count']
            },
            'active_quests': active_quests,
            'weekly_wins': weekly_wins[:10],  # Limit to 10 most recent
            'recent_completions': recent_completions
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting parent dashboard: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to get parent dashboard'}), 500
