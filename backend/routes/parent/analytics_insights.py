"""
Parent Dashboard - Analytics & Insights.
Provides learning insights, progress tracking, communications, and encouragement tips.
Part of parent/dashboard.py refactoring (Month 6 - Backend Optimization).
"""
from flask import Blueprint, jsonify
from datetime import datetime, date, timedelta
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import AuthorizationError
from utils.pillar_utils import get_pillar_name
from utils.logger import get_logger
from .dashboard_overview import verify_parent_access
from collections import defaultdict
import logging

logger = get_logger(__name__)
logger = logging.getLogger(__name__)

bp = Blueprint('parent_analytics_insights', __name__, url_prefix='/api/parent')


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
            'conversation_starters': conversation_starters
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting learning insights: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to get learning insights'}), 500


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

        # Batch fetch last messages for all conversations (N+1 optimization)
        conversation_ids = [conv['id'] for conv in conversations_response.data]
        messages_map = {}

        if conversation_ids:
            # Get latest messages for all conversations in one query
            all_messages_response = supabase.table('tutor_messages').select('''
                conversation_id, content, role, safety_level, created_at
            ''').in_('conversation_id', conversation_ids).order('created_at', desc=True).execute()

            # Group by conversation_id and take first (latest) for each
            for msg in all_messages_response.data:
                conv_id = msg['conversation_id']
                if conv_id not in messages_map:
                    messages_map[conv_id] = msg

        # Build conversations list with mapped messages
        conversations = []
        for conv in conversations_response.data:
            last_message = messages_map.get(conv['id'])

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
