"""
Parent Dashboard API routes.
Provides read-only access to student data for linked parents.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, date, timedelta
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import AuthorizationError, NotFoundError
from utils.pillar_utils import get_pillar_name
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

bp = Blueprint('parent_dashboard', __name__, url_prefix='/api/parent')


def verify_parent_access(supabase, parent_user_id, student_user_id):
    """
    Helper function to verify parent has active access to student.
    IMPORTANT: Accepts supabase client to avoid connection exhaustion.
    """
    # Verify parent role
    user_response = supabase.table('users').select('role').eq('id', parent_user_id).execute()
    if not user_response.data or user_response.data[0].get('role') != 'parent':
        raise AuthorizationError("Only parent accounts can access this endpoint")

    # Verify active link
    link_response = supabase.table('parent_student_links').select('id').eq(
        'parent_user_id', parent_user_id
    ).eq('student_user_id', student_user_id).eq('status', 'active').execute()

    if not link_response.data:
        raise AuthorizationError("You do not have access to this student's data")

    return True


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

        # Batch fetch all tasks and completions for active quests
        tasks_map = {}
        completions_map = {}

        if active_quest_ids:
            # Get all tasks for active quests in one query
            all_tasks_response = supabase.table('user_quest_tasks').select('id, quest_id').eq(
                'user_id', student_id
            ).in_('quest_id', active_quest_ids).execute()

            for task in all_tasks_response.data:
                qid = task['quest_id']
                if qid not in tasks_map:
                    tasks_map[qid] = []
                tasks_map[qid].append(task['id'])

            # Get all completions for active quests in one query
            all_completions_response = supabase.table('quest_task_completions').select('task_id, quest_id').eq(
                'user_id', student_id
            ).in_('quest_id', active_quest_ids).execute()

            for comp in all_completions_response.data:
                qid = comp['quest_id']
                if qid not in completions_map:
                    completions_map[qid] = []
                completions_map[qid].append(comp['task_id'])

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
            'weekly_wins': weekly_wins[:10]  # Limit to 10 most recent
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

        # Get task details
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
            completed_at, xp_awarded, task_id, user_quest_task_id
        ''').eq('user_id', student_id).gte('completed_at', thirty_days_ago).execute()

        # Get task details if we have completions
        recent_completions = []
        if completions_response.data:
            task_ids = [comp['user_quest_task_id'] for comp in completions_response.data if comp.get('user_quest_task_id')]

            if task_ids:
                tasks_response = supabase.table('user_quest_tasks').select('''
                    id, title, pillar
                ''').in_('id', task_ids).execute()

                tasks_map = {task['id']: task for task in tasks_response.data}

                for comp in completions_response.data:
                    task_id = comp.get('user_quest_task_id')
                    if task_id and task_id in tasks_map:
                        task = tasks_map[task_id]
                        recent_completions.append({
                            'task_title': task['title'],
                            'pillar': get_pillar_name(task['pillar']),
                            'xp_awarded': comp.get('xp_awarded', 0),
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
            task_ids = [comp['user_quest_task_id'] for comp in completions_response.data if comp.get('user_quest_task_id')]
            if task_ids:
                tasks_response = supabase.table('user_quest_tasks').select('id, pillar').in_('id', task_ids).execute()
                task_pillars = {task['id']: task['pillar'] for task in tasks_response.data}

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
            'total_activities_last_60_days': len(completions_response.data)
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting learning insights: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get learning insights'}), 500


@bp.route('/communications/<student_id>', methods=['GET'])
@require_auth
def get_student_communications(user_id, student_id):
    """
    Get student's tutor conversations with safety monitoring.
    Read-only access for parents.
    """
    try:
        verify_parent_access(user_id, student_id)
        supabase = get_supabase_admin_client()

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
        verify_parent_access(user_id, student_id)
        supabase = get_supabase_admin_client()

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
