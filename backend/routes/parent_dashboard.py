"""
Parent Dashboard API routes.
Provides read-only access to student data for linked parents.

NOTE: Admin client usage justified throughout this file for cross-user data access.
Parents viewing linked student data requires elevated privileges beyond normal RLS.
All endpoints verify parent-student link before allowing access.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, date, timedelta
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
from middleware.error_handler import AuthorizationError, NotFoundError
from utils.pillar_utils import get_pillar_name
from collections import defaultdict
import logging

from utils.logger import get_logger
import re
from typing import Optional, List, Dict, Any

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

bp = Blueprint('parent_dashboard', __name__, url_prefix='/api/parent')


# Helper functions for evidence display enhancement
def parse_document_id_from_evidence_text(evidence_text: str) -> Optional[str]:
    """
    Extract document ID from multi-format evidence placeholder string.

    Args:
        evidence_text: Text from quest_task_completions.evidence_text

    Returns:
        Document UUID if found, None otherwise
    """
    if evidence_text and evidence_text.startswith('Multi-format evidence document'):
        match = re.search(r'Document ID: ([\w-]+)', evidence_text)
        if match:
            return match.group(1)
    return None


def fetch_evidence_blocks_by_document_id(
    supabase,
    document_id: str,
    filter_private: bool = False,
    viewer_user_id: str = None
) -> tuple[List[Dict[str, Any]], bool, str]:
    """
    Fetch evidence blocks directly by document ID.
    Used as fallback when task_id matching fails.

    Args:
        supabase: Supabase client
        document_id: UUID of user_task_evidence_documents record
        filter_private: If True, exclude private blocks (False for parents)
        viewer_user_id: User ID of the person viewing

    Returns:
        Tuple of (blocks list, is_confidential boolean, owner_user_id string)
    """
    try:
        query = supabase.table('user_task_evidence_documents').select('''
            id,
            user_id,
            is_confidential,
            evidence_document_blocks (
                id, block_type, content, order_index, is_private
            )
        ''').eq('id', document_id)

        if filter_private:
            query = query.eq('evidence_document_blocks.is_private', False)

        result = query.execute()

        if result.data and len(result.data) > 0:
            doc = result.data[0]
            is_confidential = doc.get('is_confidential', False)
            owner_user_id = doc.get('user_id')

            blocks = doc.get('evidence_document_blocks', [])
            sorted_blocks = sorted(blocks, key=lambda b: b.get('order_index', 0))

            return sorted_blocks, is_confidential, owner_user_id

        logger.warning(f"No evidence blocks found for document ID: {document_id}")
        return [], False, None

    except Exception as e:
        logger.error(f"Error fetching evidence blocks for document {document_id}: {e}")
        return [], False, None


def verify_parent_access(supabase, parent_user_id, student_user_id):
    """
    Helper function to verify parent has active access to student.
    IMPORTANT: Accepts supabase client to avoid connection exhaustion.

    Special case: Admin users can view their own student data for demo purposes.
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

        # Verify parent role
        if user_role != 'parent':
            raise AuthorizationError("Only parent accounts can access this endpoint")

        # Check for link to this specific student (all links are permanent once created)
        links = user.get('parent_student_links', [])
        has_active_link = any(
            link.get('student_user_id') == student_user_id
            for link in links
        )

        if not has_active_link:
            raise AuthorizationError("You do not have access to this student's data")

        return True

    except AuthorizationError:
        raise
    except Exception as e:
        logger.error(f"Error in verify_parent_access: {str(e)}")
        raise AuthorizationError("Failed to verify parent access")


# Using repository pattern for database access
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
        personalized_quests = set()  # Track which quests have personalized tasks

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
        # Get completions with both user_quest_task_id and task_id for fallback
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
            'recent_completions': recent_completions  # NEW: Recent task completions
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting parent dashboard: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get parent dashboard'}), 500


@bp.route('/calendar/<student_id>', methods=['GET'])
@require_auth
def get_student_calendar(user_id, student_id):
    """
    Get student's calendar view with tasks and deadlines.
    Read-only access for parents. Optimized for connection reuse.
    """
    supabase = None
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get active quests
        user_quests_response = supabase.table('user_quests').select(
            'quest_id'
        ).eq('user_id', student_id).is_('completed_at', 'null').eq('is_active', True).execute()

        active_quest_ids = [uq['quest_id'] for uq in user_quests_response.data]

        if not active_quest_ids:
            return jsonify({'items': []}), 200

        # Get tasks with deadlines
        deadlines_response = supabase.table('user_quest_deadlines').select('''
            quest_id, task_id, scheduled_date
        ''').eq('user_id', student_id).in_('quest_id', active_quest_ids).execute()

        if not deadlines_response.data:
            return jsonify({'items': []}), 200

        task_ids = [d['task_id'] for d in deadlines_response.data if d.get('task_id')]

        if not task_ids:
            return jsonify({'items': []}), 200

        # Get task details from user_quest_tasks
        tasks_response = supabase.table('user_quest_tasks').select('''
            id, quest_id, title, description, pillar, xp_value
        ''').eq('user_id', student_id).in_('id', task_ids).execute()

        # Get quest info
        quest_ids = list(set(task['quest_id'] for task in tasks_response.data))
        quests_response = supabase.table('quests').select('''
            id, title, image_url, header_image_url
        ''').in_('id', quest_ids).execute()

        # Get completions
        completions_response = supabase.table('quest_task_completions').select(
            'task_id, completed_at'
        ).eq('user_id', student_id).in_('task_id', task_ids).execute()

        # Build maps
        quests_map = {q['id']: q for q in quests_response.data}
        completions_map = {c['task_id']: c for c in completions_response.data}
        deadline_map = {d['task_id']: d['scheduled_date'] for d in deadlines_response.data if d.get('task_id')}

        # Build calendar items
        today = date.today()
        calendar_items = []

        for task in tasks_response.data:
            task_id = task['id']
            quest = quests_map.get(task['quest_id'], {})
            completion = completions_map.get(task_id)
            scheduled_date_str = deadline_map.get(task_id)

            status = 'completed' if completion else 'on-track'
            if not completion and scheduled_date_str:
                scheduled_date = datetime.strptime(scheduled_date_str, '%Y-%m-%d').date()
                if scheduled_date < today:
                    status = 'wandering'

            calendar_items.append({
                'id': task_id,
                'quest_id': task['quest_id'],
                'quest_title': quest.get('title', 'Unknown Quest'),
                'quest_image': quest.get('image_url') or quest.get('header_image_url'),
                'task_title': task['title'],
                'task_description': task.get('description'),
                'pillar': get_pillar_name(task['pillar']),
                'xp_value': task.get('xp_value'),
                'scheduled_date': scheduled_date_str,
                'completed_at': completion['completed_at'] if completion else None,
                'status': status
            })

        return jsonify({'items': calendar_items}), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting student calendar: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get student calendar'}), 500


@bp.route('/task/<student_id>/<task_id>', methods=['GET'])
@require_auth
def get_task_details(user_id, student_id, task_id):
    """
    Get detailed task information including evidence for parent viewing.
    Parents can view task details and any submitted evidence.
    """
    supabase = None
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get task details from user_quest_tasks
        task_response = supabase.table('user_quest_tasks').select('''
            id, quest_id, user_quest_id, title, description, pillar, xp_value, order_index, is_required
        ''').eq('user_id', student_id).eq('id', task_id).single().execute()

        if not task_response.data:
            raise NotFoundError("Task not found")

        task = task_response.data

        # Get quest details
        quest_response = supabase.table('quests').select('''
            id, title, description, image_url, header_image_url
        ''').eq('id', task['quest_id']).single().execute()

        quest = quest_response.data if quest_response.data else {}

        # Get completion status and evidence
        completion_response = supabase.table('quest_task_completions').select('''
            id, completed_at, evidence_url, evidence_text
        ''').eq('user_id', student_id).eq('task_id', task_id).execute()

        completion = completion_response.data[0] if completion_response.data else None

        # Note: Evidence is stored in the completion record as text and URL fields
        # No separate file uploads table exists

        # Get scheduled date if exists
        deadline_response = supabase.table('user_quest_deadlines').select(
            'scheduled_date'
        ).eq('user_id', student_id).eq('task_id', task_id).execute()

        scheduled_date = deadline_response.data[0]['scheduled_date'] if deadline_response.data else None

        # Determine status
        status = 'not_started'
        if completion:
            status = 'completed'
        elif scheduled_date:
            scheduled_date_obj = datetime.strptime(scheduled_date, '%Y-%m-%d').date()
            if scheduled_date_obj < date.today():
                status = 'overdue'
            else:
                status = 'scheduled'

        return jsonify({
            'task': {
                'id': task['id'],
                'title': task['title'],
                'description': task.get('description'),
                'pillar': get_pillar_name(task['pillar']),
                'xp_value': task.get('xp_value', 0),
                'order_index': task.get('order_index'),
                'is_required': task.get('is_required', False),
                'status': status,
                'scheduled_date': scheduled_date
            },
            'quest': {
                'id': quest.get('id'),
                'title': quest.get('title'),
                'description': quest.get('description'),
                'image_url': quest.get('image_url') or quest.get('header_image_url')
            },
            'completion': {
                'completed_at': completion['completed_at'] if completion else None,
                'evidence_text': completion['evidence_text'] if completion else None,
                'evidence_url': completion['evidence_url'] if completion else None,
                'xp_awarded': task.get('xp_value', 0)  # XP comes from task, not completion
            } if completion else None
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting task details: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get task details'}), 500


@bp.route('/progress/<student_id>', methods=['GET'])
@require_auth
def get_student_progress(user_id, student_id):
    """
    Get student's XP breakdown by pillar, achievements, and streak.
    Optimized for connection reuse.
    """
    supabase = None
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get XP by pillar
        xp_response = supabase.table('user_skill_xp').select('''
            pillar, xp_amount
        ''').eq('user_id', student_id).execute()

        xp_by_pillar = {}
        for row in xp_response.data:
            pillar_name = get_pillar_name(row['pillar'])
            xp_by_pillar[pillar_name] = row['xp_amount']

        # Get recent completions (last 30 days)
        thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
        completions_response = supabase.table('quest_task_completions').select('''
            completed_at, task_id, user_quest_task_id
        ''').eq('user_id', student_id).gte('completed_at', thirty_days_ago).execute()

        # Get task details if we have completions
        recent_completions = []
        if completions_response.data:
            # Get user_quest_task_id from completions
            task_ids = [comp['user_quest_task_id'] for comp in completions_response.data if comp.get('user_quest_task_id')]

            tasks_map = {}
            if task_ids:
                tasks_response = supabase.table('user_quest_tasks').select('''
                    id, title, pillar, xp_value
                ''').in_('id', task_ids).execute()
                tasks_map = {task['id']: task for task in tasks_response.data}

            # Build recent completions list
            for comp in completions_response.data:
                task_id = comp.get('user_quest_task_id')
                if task_id and task_id in tasks_map:
                    task = tasks_map[task_id]
                    recent_completions.append({
                        'task_title': task['title'],
                        'pillar': get_pillar_name(task['pillar']),
                        'xp_awarded': task.get('xp_value', 0),
                        'completed_at': comp['completed_at']
                    })

        # Sort by date
        recent_completions.sort(key=lambda x: x['completed_at'], reverse=True)

        # Get student summary
        student_response = supabase.table('users').select('''
            total_xp, streak_days, level, achievements_count
        ''').eq('id', student_id).execute()

        student_data = student_response.data[0] if student_response.data else {}

        return jsonify({
            'xp_by_pillar': xp_by_pillar,
            'total_xp': student_data.get('total_xp', 0),
            'streak_days': student_data.get('streak_days', 0),
            'level': student_data.get('level', 0),
            'achievements_count': student_data.get('achievements_count', 0),
            'recent_completions': recent_completions[:20]  # Limit to 20 most recent
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting student progress: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get student progress'}), 500


@bp.route('/insights/<student_id>', methods=['GET'])
@require_auth
def get_learning_insights(user_id, student_id):
    """
    Get learning insights: time patterns, pillar preferences, completion velocity.
    Optimized for connection reuse.
    """
    supabase = None
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get completions from last 60 days for pattern analysis
        sixty_days_ago = (date.today() - timedelta(days=60)).isoformat()
        completions_response = supabase.table('quest_task_completions').select('''
            completed_at, task_id, user_quest_task_id
        ''').eq('user_id', student_id).gte('completed_at', sixty_days_ago).execute()

        # Get task details for pillar analysis
        task_pillars = {}
        if completions_response.data:
            # Get user quest task IDs
            task_ids = [comp['user_quest_task_id'] for comp in completions_response.data if comp.get('user_quest_task_id')]

            # Get task pillars
            if task_ids:
                tasks_response = supabase.table('user_quest_tasks').select('id, pillar').in_('id', task_ids).execute()
                for task in tasks_response.data:
                    task_pillars[task['id']] = task['pillar']

        # Analyze time patterns
        hour_activity = defaultdict(int)
        day_activity = defaultdict(int)

        for comp in completions_response.data:
            completed_at = datetime.fromisoformat(comp['completed_at'].replace('Z', '+00:00'))
            hour_activity[completed_at.hour] += 1
            day_activity[completed_at.strftime('%A')] += 1

        # Find peak hours and days
        peak_hour = max(hour_activity.items(), key=lambda x: x[1])[0] if hour_activity else None
        peak_day = max(day_activity.items(), key=lambda x: x[1])[0] if day_activity else None

        # Format peak hour
        if peak_hour is not None:
            if peak_hour == 0:
                peak_hour_str = "12 AM"
            elif peak_hour < 12:
                peak_hour_str = f"{peak_hour} AM"
            elif peak_hour == 12:
                peak_hour_str = "12 PM"
            else:
                peak_hour_str = f"{peak_hour - 12} PM"
        else:
            peak_hour_str = None

        # Analyze pillar preferences
        pillar_completions = defaultdict(int)
        for comp in completions_response.data:
            task_id = comp.get('user_quest_task_id')
            if task_id and task_id in task_pillars:
                pillar_name = get_pillar_name(task_pillars[task_id])
                pillar_completions[pillar_name] += 1

        # Sort pillars by completion count
        pillar_preferences = sorted(
            [{'pillar': p, 'completions': c} for p, c in pillar_completions.items()],
            key=lambda x: x['completions'],
            reverse=True
        )

        # Calculate completion velocity (average days per quest)
        quest_completions_response = supabase.table('user_quests').select('''
            started_at, completed_at
        ''').eq('user_id', student_id).not_.is_('completed_at', 'null').gte(
            'completed_at', sixty_days_ago
        ).execute()

        completion_times = []
        for quest in quest_completions_response.data:
            if quest.get('started_at') and quest.get('completed_at'):
                started = datetime.fromisoformat(quest['started_at'].replace('Z', '+00:00'))
                completed = datetime.fromisoformat(quest['completed_at'].replace('Z', '+00:00'))
                days_to_complete = (completed - started).days
                if days_to_complete >= 0:
                    completion_times.append(days_to_complete)

        avg_completion_days = sum(completion_times) / len(completion_times) if completion_times else None

        # Get recent task completions for conversation starters
        recent_tasks_response = supabase.table('quest_task_completions').select('''
            completed_at,
            user_quest_task_id,
            user_quest_tasks!inner(
                title,
                pillar,
                quest_id,
                quests!inner(title)
            )
        ''').eq('user_id', student_id).order('completed_at', desc=True).limit(5).execute()

        # Generate process-focused conversation starters
        conversation_starters = []

        if recent_tasks_response.data:
            for comp in recent_tasks_response.data[:3]:  # Top 3 most recent
                task = comp['user_quest_tasks']
                task_title = task['title']
                quest_title = task['quests']['title']
                pillar = get_pillar_name(task.get('pillar', 0))

                # Process-focused starters emphasizing journey over outcome
                starters = [
                    f"What was the most interesting part of working on '{task_title}'?",
                    f"What did you learn while exploring '{task_title}' in {quest_title}?",
                    f"How did it feel when you were figuring out '{task_title}'?",
                    f"What surprised you most while working on '{task_title}'?",
                    f"What would you do differently if you tackled '{task_title}' again?"
                ]

                # Pick one based on task position (variety)
                starter_index = len(conversation_starters) % len(starters)
                conversation_starters.append({
                    'question': starters[starter_index],
                    'context': {
                        'task': task_title,
                        'quest': quest_title,
                        'pillar': pillar,
                        'completed_at': comp['completed_at']
                    }
                })

        # Add pillar-based starters if student has clear preferences
        if pillar_preferences:
            top_pillar = pillar_preferences[0]['pillar']
            pillar_starters = [
                f"I noticed you've been exploring a lot of {top_pillar} lately. What draws you to this area?",
                f"You seem to really enjoy {top_pillar}. What's your favorite part about learning in this area?",
                f"How does working on {top_pillar} make you feel compared to other subjects?"
            ]
            conversation_starters.append({
                'question': pillar_starters[0],
                'context': {
                    'type': 'pillar_preference',
                    'pillar': top_pillar,
                    'completions': pillar_preferences[0]['completions']
                }
            })

        return jsonify({
            'time_patterns': {
                'peak_hour': peak_hour_str,
                'peak_day': peak_day,
                'activity_by_hour': dict(hour_activity),
                'activity_by_day': dict(day_activity)
            },
            'pillar_preferences': pillar_preferences,
            'completion_velocity': {
                'average_days_per_quest': round(avg_completion_days, 1) if avg_completion_days else None,
                'total_quests_analyzed': len(completion_times)
            },
            'total_activities_last_60_days': len(completions_response.data),
            'conversation_starters': conversation_starters  # NEW: Process-focused conversation starters
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting learning insights: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get learning insights'}), 500


@bp.route('/completions/<student_id>', methods=['GET'])
@require_auth
def get_recent_completions(user_id, student_id):
    """
    Get recent task completions with evidence for parent viewing.
    Returns last 30 days of completed tasks with full evidence details.
    """
    supabase = None
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get completions from last 30 days
        thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
        completions_response = supabase.table('quest_task_completions').select('''
            id, task_id, user_quest_task_id, completed_at, evidence_url, evidence_text, is_confidential
        ''').eq('user_id', student_id).gte('completed_at', thirty_days_ago).order('completed_at', desc=True).execute()

        if not completions_response.data:
            return jsonify({'completions': []}), 200

        # Get task details
        task_ids = [comp['user_quest_task_id'] for comp in completions_response.data if comp.get('user_quest_task_id')]

        tasks_map = {}
        quests_map = {}

        if task_ids:
            tasks_response = supabase.table('user_quest_tasks').select('''
                id, quest_id, title, description, pillar, xp_value
            ''').in_('id', task_ids).execute()

            tasks_map = {task['id']: task for task in tasks_response.data}

            # Get quest details
            quest_ids = list(set(task['quest_id'] for task in tasks_response.data))
            quests_response = supabase.table('quests').select('''
                id, title, image_url, header_image_url
            ''').in_('id', quest_ids).execute()

            quests_map = {q['id']: q for q in quests_response.data}

        # Build completions list with evidence enhancement
        completions = []
        for comp in completions_response.data:
            task_id = comp.get('user_quest_task_id')
            if not task_id or task_id not in tasks_map:
                continue

            task = tasks_map[task_id]
            quest = quests_map.get(task['quest_id'], {})

            evidence_text = comp.get('evidence_text')
            evidence_url = comp.get('evidence_url')
            evidence_blocks = []
            evidence_type = 'legacy_text'  # Default
            is_confidential = comp.get('is_confidential', False)
            owner_user_id = student_id

            # Check if evidence_text contains multi-format document reference
            document_id = parse_document_id_from_evidence_text(evidence_text)

            if document_id:
                # Fetch blocks directly by document ID
                logger.info(f"Fetching evidence blocks for completion {comp['id']} via document ID: {document_id}")
                blocks, doc_confidential, doc_owner = fetch_evidence_blocks_by_document_id(
                    supabase, document_id, filter_private=False, viewer_user_id=user_id
                )

                if blocks:
                    evidence_blocks = blocks
                    evidence_type = 'multi_format'
                    # Clear placeholder text so frontend doesn't display it
                    evidence_text = None
                    is_confidential = doc_confidential
                    owner_user_id = doc_owner

            completions.append({
                'completion_id': comp['id'],
                'task': {
                    'id': comp['task_id'],
                    'title': task['title'],
                    'description': task.get('description'),
                    'pillar': get_pillar_name(task['pillar']),
                    'xp_value': task.get('xp_value', 0)
                },
                'quest': {
                    'id': task['quest_id'],
                    'title': quest.get('title'),
                    'image_url': quest.get('image_url') or quest.get('header_image_url')
                },
                'completed_at': comp['completed_at'],
                'evidence_type': evidence_type,
                'evidence_text': evidence_text,
                'evidence_url': evidence_url,
                'evidence_blocks': evidence_blocks,
                'is_confidential': is_confidential,
                'owner_user_id': owner_user_id
            })

        return jsonify({
            'completions': completions,
            'total_count': len(completions)
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting recent completions: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get recent completions'}), 500


@bp.route('/communications/<student_id>', methods=['GET'])
@require_auth
def get_student_communications(user_id, student_id):
    """
    Get student's tutor conversations with safety monitoring.
    Read-only access for parents.
    """
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get tutor conversations
        conversations_response = supabase.table('tutor_conversations').select('''
            id, title, conversation_mode, message_count, last_message_at, created_at
        ''').eq('user_id', student_id).order('created_at', desc=True).limit(20).execute()

        conversations = []
        for conv in conversations_response.data:
            # Get message preview (last message)
            messages_response = supabase.table('tutor_messages').select('''
                content, role, safety_level, created_at
            ''').eq('conversation_id', conv['id']).order('created_at', desc=True).limit(1).execute()

            last_message = messages_response.data[0] if messages_response.data else None

            conversations.append({
                'id': conv['id'],
                'title': conv.get('title'),
                'mode': conv.get('conversation_mode'),
                'message_count': conv.get('message_count', 0),
                'last_message_at': conv.get('last_message_at'),
                'created_at': conv['created_at'],
                'last_message_preview': last_message['content'][:100] if last_message else None,
                'last_message_safety': last_message['safety_level'] if last_message else 'safe'
            })

        # Get safety reports
        safety_reports_response = supabase.table('tutor_safety_reports').select('''
            id, incident_type, safety_level, original_message, created_at
        ''').eq('user_id', student_id).order('created_at', desc=True).limit(10).execute()

        safety_reports = []
        for report in safety_reports_response.data:
            safety_reports.append({
                'id': report['id'],
                'incident_type': report.get('incident_type'),
                'safety_level': report.get('safety_level'),
                'message_preview': report.get('original_message', '')[:100],
                'created_at': report['created_at']
            })

        return jsonify({
            'conversations': conversations,
            'safety_reports': safety_reports,
            'total_conversations': len(conversations_response.data),
            'total_safety_flags': len(safety_reports)
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting student communications: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get student communications'}), 500


@bp.route('/encouragement-tips/<student_id>', methods=['GET'])
@require_auth
def get_encouragement_tips(user_id, student_id):
    """
    Get context-aware process-focused encouragement tips for parents.
    """
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get learning rhythm
        rhythm_response = supabase.rpc('get_learning_rhythm_status', {
            'p_student_id': student_id
        }).execute()

        rhythm_data = rhythm_response.data[0] if rhythm_response.data else {'status': 'needs_support'}

        # Get recent activity
        recent_completions = supabase.table('quest_task_completions').select('''
            task_id, completed_at,
            quest_tasks!inner(title, pillar)
        ''').eq('user_id', student_id).order('completed_at', desc=True).limit(5).execute()

        tips = {
            'conversation_starters': [],
            'dos_and_donts': {
                'dos': [
                    "Ask: 'What surprised you most about this quest?'",
                    "Say: 'How did that challenge feel?'",
                    "Try: 'What would you try differently next time?'",
                    "Explore: 'What's the most interesting thing you learned today?'"
                ],
                'donts': [
                    "Avoid: 'You need to work harder'",
                    "Skip: 'Why aren't you done yet?'",
                    "Don't: 'You should be further along'",
                    "Never: 'This will help you get into college'"
                ]
            }
        }

        # Context-aware conversation starters
        if rhythm_data['status'] == 'flow':
            tips['conversation_starters'].append("I'd love to hear about what you're working on!")
            tips['conversation_starters'].append("What part of your current quest is most interesting?")

            if recent_completions.data:
                recent_task = recent_completions.data[0]
                pillar = get_pillar_name(recent_task['quest_tasks']['pillar'])
                tips['conversation_starters'].append(
                    f"I saw you completed {recent_task['quest_tasks']['title']}. How did it go?"
                )
        else:
            tips['conversation_starters'].append("What are you exploring right now?")
            tips['conversation_starters'].append("Is there anything you'd like help thinking through?")
            tips['conversation_starters'].append("Would you like to work on a quest together?")

        return jsonify(tips), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting encouragement tips: {str(e)}")
        return jsonify({'error': 'Failed to get encouragement tips'}), 500


@bp.route('/completed-quests/<student_id>', methods=['GET'])
@require_auth
def get_completed_quests(user_id, student_id):
    """
    Get all completed quests for a student.
    Returns quest details with completion stats for parent viewing.
    """
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get completed quests with quest details
        completed_quests_response = supabase.table('user_quests').select('''
            quest_id, started_at, completed_at,
            quests!inner(id, title, description, image_url, header_image_url)
        ''').eq('user_id', student_id).not_.is_('completed_at', 'null').order('completed_at', desc=True).execute()

        completed_quest_ids = [uq['quest_id'] for uq in completed_quests_response.data]

        # DEBUG: Log quest counts
        logger.info(f"DEBUG - Student {student_id} has {len(completed_quest_ids)} completed quests: {completed_quest_ids}")

        # Batch fetch all tasks and completions for completed quests
        tasks_map = {}
        completions_map = {}

        if completed_quest_ids:
            # Get all user tasks for completed quests
            all_tasks_response = supabase.table('user_quest_tasks').select('id, quest_id').eq(
                'user_id', student_id
            ).in_('quest_id', completed_quest_ids).execute()

            for task in all_tasks_response.data:
                qid = task['quest_id']
                if qid not in tasks_map:
                    tasks_map[qid] = []
                tasks_map[qid].append(task['id'])

            # DEBUG: Log task counts per quest
            logger.info(f"DEBUG - Task counts by quest: {[(qid, len(tasks)) for qid, tasks in tasks_map.items()]}")

            # Get all completions for completed quests in one query
            all_completions_response = supabase.table('quest_task_completions').select('task_id, quest_id, user_quest_task_id').eq(
                'user_id', student_id
            ).in_('quest_id', completed_quest_ids).execute()

            for comp in all_completions_response.data:
                qid = comp['quest_id']
                # Use user_quest_task_id as the canonical task identifier
                task_id = comp.get('user_quest_task_id') or comp.get('task_id')
                if qid not in completions_map:
                    completions_map[qid] = []
                if task_id:
                    completions_map[qid].append(task_id)

        # Build completed quests list
        completed_quests = []
        for uq in completed_quests_response.data:
            quest = uq['quests']
            quest_id = quest['id']

            total_tasks = len(tasks_map.get(quest_id, []))
            completed_tasks = len(completions_map.get(quest_id, []))

            completed_quests.append({
                'quest_id': quest_id,
                'title': quest['title'],
                'description': quest.get('description'),
                'image_url': quest.get('image_url') or quest.get('header_image_url'),
                'started_at': uq['started_at'],
                'completed_at': uq['completed_at'],
                'progress': {
                    'completed_tasks': completed_tasks,
                    'total_tasks': total_tasks,
                    'percentage': 100  # Always 100% for completed quests
                }
            })

        # DEBUG: Log final completed quests
        logger.info(f"DEBUG - Returning {len(completed_quests)} completed quests: {[(q['quest_id'], q['title'], q['completed_at']) for q in completed_quests]}")

        return jsonify({
            'quests': completed_quests,
            'total_count': len(completed_quests)
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting completed quests: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get completed quests'}), 500


@bp.route('/quest/<student_id>/<quest_id>', methods=['GET'])
@require_auth
def get_student_quest_view(user_id, student_id, quest_id):
    """
    Get read-only quest view for parents.
    Shows student's personalized tasks and completion status.
    """
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get quest details
        quest_response = supabase.table('quests').select('''
            id, title, description, image_url, header_image_url, quest_type
        ''').eq('id', quest_id).single().execute()

        if not quest_response.data:
            raise NotFoundError("Quest not found")

        quest = quest_response.data

        # Get student's personalized tasks for this quest
        tasks_response = supabase.table('user_quest_tasks').select('''
            id, title, description, pillar, xp_value, order_index, is_required
        ''').eq('user_id', student_id).eq('quest_id', quest_id).order('order_index').execute()

        # Get task completions
        task_ids = [task['id'] for task in tasks_response.data]
        completions_map = {}

        if task_ids:
            completions_response = supabase.table('quest_task_completions').select('''
                user_quest_task_id, completed_at, evidence_text, evidence_url, is_confidential
            ''').eq('user_id', student_id).in_('user_quest_task_id', task_ids).execute()

            completions_map = {
                comp['user_quest_task_id']: comp
                for comp in completions_response.data
            }

        # Build tasks list with completion status and enhanced evidence
        tasks = []
        for task in tasks_response.data:
            task_id = task['id']
            completion = completions_map.get(task_id)

            # Enhanced evidence handling
            evidence_text = None
            evidence_url = None
            evidence_blocks = []
            evidence_type = 'legacy_text'
            is_confidential = False

            if completion:
                evidence_text = completion.get('evidence_text')
                evidence_url = completion.get('evidence_url')
                is_confidential = completion.get('is_confidential', False)

                # Check if evidence_text contains multi-format document reference
                document_id = parse_document_id_from_evidence_text(evidence_text)

                if document_id:
                    # Fetch blocks directly by document ID
                    logger.info(f"Fetching evidence blocks for task {task_id} via document ID: {document_id}")
                    blocks, doc_confidential, doc_owner = fetch_evidence_blocks_by_document_id(
                        supabase, document_id, filter_private=False, viewer_user_id=user_id
                    )

                    if blocks:
                        evidence_blocks = blocks
                        evidence_type = 'multi_format'
                        # Clear placeholder text so frontend doesn't display it
                        evidence_text = None
                        is_confidential = doc_confidential

            tasks.append({
                'id': task_id,
                'title': task['title'],
                'description': task.get('description'),
                'pillar': get_pillar_name(task['pillar']),
                'xp_value': task.get('xp_value', 0),
                'order_index': task.get('order_index', 0),
                'is_required': task.get('is_required', False),
                'is_completed': completion is not None,
                'completed_at': completion['completed_at'] if completion else None,
                'evidence_type': evidence_type,
                'evidence_text': evidence_text,
                'evidence_url': evidence_url,
                'evidence_blocks': evidence_blocks,
                'is_confidential': is_confidential
            })

        # Calculate progress
        completed_count = len([t for t in tasks if t['is_completed']])
        total_count = len(tasks)
        progress_percentage = round((completed_count / total_count * 100)) if total_count > 0 else 0

        # Check if student has started this quest
        user_quest_response = supabase.table('user_quests').select('''
            started_at, completed_at, is_active
        ''').eq('user_id', student_id).eq('quest_id', quest_id).execute()

        quest_status = 'not_started'
        started_at = None
        completed_at = None

        if user_quest_response.data and len(user_quest_response.data) > 0:
            user_quest = user_quest_response.data[0]
            started_at = user_quest.get('started_at')
            completed_at = user_quest.get('completed_at')

            if completed_at:
                quest_status = 'completed'
            elif user_quest.get('is_active'):
                quest_status = 'in_progress'
            else:
                quest_status = 'abandoned'

        return jsonify({
            'quest': {
                'id': quest['id'],
                'title': quest['title'],
                'description': quest.get('description'),
                'image_url': quest.get('image_url') or quest.get('header_image_url'),
                'quest_type': quest.get('quest_type'),
                'status': quest_status,
                'started_at': started_at,
                'completed_at': completed_at
            },
            'tasks': tasks,
            'progress': {
                'completed_tasks': completed_count,
                'total_tasks': total_count,
                'percentage': progress_percentage
            }
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting student quest view: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get quest details'}), 500
