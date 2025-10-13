"""
Calendar routes for managing user quest/task scheduling and deadlines.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta, date
from database import get_supabase_admin_client, get_user_client
from middleware.csrf_protection import csrf_protect
from utils.auth.decorators import require_auth
from collections import defaultdict

calendar_bp = Blueprint('calendar', __name__, url_prefix='/api/calendar')

@calendar_bp.route('/<user_id>', methods=['GET'])
@require_auth
def get_calendar_items(user_id):
    """
    Get all calendar items for a user (scheduled quests/tasks + completed items).
    Returns data structured for both calendar and list views.
    """
    try:
        supabase = get_user_client(request)

        # Get user's active quests with tasks
        active_quests_response = supabase.table('user_quests')\
            .select('''
                quest_id,
                quests(id, title, description, image_url, header_image_url),
                started_at,
                completed_at
            ''')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .execute()

        # Get all user quest tasks with completion status
        tasks_response = supabase.table('user_quest_tasks')\
            .select('''
                id,
                quest_id,
                title,
                description,
                pillar,
                xp_value,
                order_index,
                is_required
            ''')\
            .eq('user_id', user_id)\
            .execute()

        # Get task completions
        completions_response = supabase.table('quest_task_completions')\
            .select('task_id, completed_at, evidence_url, evidence_text, scheduled_date')\
            .eq('user_id', user_id)\
            .execute()

        # Get user deadlines
        deadlines_response = supabase.table('user_quest_deadlines')\
            .select('quest_id, task_id, scheduled_date')\
            .eq('user_id', user_id)\
            .execute()

        # Build completion map
        completions_map = {}
        for comp in completions_response.data:
            completions_map[comp['task_id']] = comp

        # Build deadline map
        deadline_map = {}
        for deadline in deadlines_response.data:
            key = f"{deadline['quest_id']}_{deadline.get('task_id', 'quest')}"
            deadline_map[key] = deadline['scheduled_date']

        # Build task map by quest
        tasks_by_quest = defaultdict(list)
        for task in tasks_response.data:
            tasks_by_quest[task['quest_id']].append(task)

        # Build calendar items
        calendar_items = []

        for quest_enrollment in active_quests_response.data:
            quest = quest_enrollment['quests']
            quest_id = quest['id']

            # Get quest-level deadline if exists
            quest_deadline_key = f"{quest_id}_quest"
            quest_deadline = deadline_map.get(quest_deadline_key)

            # Get tasks for this quest
            quest_tasks = tasks_by_quest.get(quest_id, [])

            for task in quest_tasks:
                task_id = task['id']
                completion = completions_map.get(task_id)

                # Get task-level deadline
                task_deadline_key = f"{quest_id}_{task_id}"
                task_deadline = deadline_map.get(task_deadline_key, quest_deadline)

                # Calculate status
                status = 'exploring'
                if completion:
                    status = 'completed'
                elif task_deadline:
                    scheduled_date = datetime.strptime(task_deadline, '%Y-%m-%d').date() if isinstance(task_deadline, str) else task_deadline
                    today = date.today()

                    # Check if wandering (past deadline or inactive 7+ days)
                    if scheduled_date < today:
                        status = 'wandering'
                    else:
                        status = 'on-track'

                calendar_items.append({
                    'id': task_id,
                    'quest_id': quest_id,
                    'quest_title': quest['title'],
                    'quest_image': quest.get('image_url') or quest.get('header_image_url'),
                    'task_title': task['title'],
                    'task_description': task['description'],
                    'pillar': task['pillar'],
                    'xp_value': task['xp_value'],
                    'scheduled_date': task_deadline,
                    'completed_at': completion['completed_at'] if completion else None,
                    'evidence_url': completion['evidence_url'] if completion else None,
                    'evidence_text': completion['evidence_text'] if completion else None,
                    'status': status,
                    'is_required': task.get('is_required', False),
                    'order_index': task.get('order_index', 0)
                })

        return jsonify({
            'items': calendar_items,
            'summary': {
                'total_active': len([i for i in calendar_items if i['status'] != 'completed']),
                'total_completed': len([i for i in calendar_items if i['status'] == 'completed']),
                'scheduled_today': len([i for i in calendar_items if i['scheduled_date'] == str(date.today()) and i['status'] != 'completed']),
                'wandering': len([i for i in calendar_items if i['status'] == 'wandering'])
            }
        }), 200

    except Exception as e:
        print(f"Error fetching calendar items: {str(e)}")
        return jsonify({'error': 'Failed to fetch calendar items'}), 500


@calendar_bp.route('/deadline', methods=['PUT'])
@csrf_protect
@require_auth
def update_deadline(user_id=None):
    """
    Update deadline for a single quest or task.
    """
    try:
        data = request.get_json()
        user_id = user_id or data.get('user_id')
        quest_id = data.get('quest_id')
        task_id = data.get('task_id')
        scheduled_date = data.get('scheduled_date')  # Can be None to remove deadline

        if not user_id or not quest_id:
            return jsonify({'error': 'user_id and quest_id are required'}), 400

        supabase = get_user_client(request)

        # Upsert deadline
        deadline_data = {
            'user_id': user_id,
            'quest_id': quest_id,
            'task_id': task_id,
            'scheduled_date': scheduled_date,
            'updated_at': datetime.utcnow().isoformat()
        }

        if scheduled_date is None:
            # Delete deadline if scheduled_date is null
            query = supabase.table('user_quest_deadlines')\
                .delete()\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)

            if task_id:
                query = query.eq('task_id', task_id)
            else:
                query = query.is_('task_id', 'null')

            query.execute()
        else:
            # Upsert deadline
            supabase.table('user_quest_deadlines')\
                .upsert(deadline_data, on_conflict='user_id,quest_id,task_id')\
                .execute()

        return jsonify({'success': True, 'scheduled_date': scheduled_date}), 200

    except Exception as e:
        print(f"Error updating deadline: {str(e)}")
        return jsonify({'error': 'Failed to update deadline'}), 500


@calendar_bp.route('/bulk-deadline', methods=['PUT'])
@csrf_protect
@require_auth
def bulk_update_deadlines(user_id=None):
    """
    Update deadlines for multiple quests/tasks at once.
    """
    try:
        data = request.get_json()
        user_id = user_id or data.get('user_id')
        items = data.get('items', [])

        if not user_id or not items:
            return jsonify({'error': 'user_id and items are required'}), 400

        supabase = get_user_client(request)

        # Prepare bulk upsert data
        deadline_records = []
        for item in items:
            deadline_records.append({
                'user_id': user_id,
                'quest_id': item['quest_id'],
                'task_id': item.get('task_id'),
                'scheduled_date': item.get('scheduled_date'),
                'updated_at': datetime.utcnow().isoformat()
            })

        # Bulk upsert
        supabase.table('user_quest_deadlines')\
            .upsert(deadline_records, on_conflict='user_id,quest_id,task_id')\
            .execute()

        return jsonify({'success': True, 'updated_count': len(deadline_records)}), 200

    except Exception as e:
        print(f"Error bulk updating deadlines: {str(e)}")
        return jsonify({'error': 'Failed to bulk update deadlines'}), 500


@calendar_bp.route('/next-up/<user_id>', methods=['GET'])
@require_auth
def get_next_up(user_id):
    """
    Get prioritized list of what to do next (today, this week, wandering items).
    """
    try:
        supabase = get_user_client(request)
        today = date.today()
        week_end = today + timedelta(days=7)

        # Get all calendar items (reuse logic from get_calendar_items)
        calendar_response = get_calendar_items(user_id)
        if calendar_response[1] != 200:
            return calendar_response

        calendar_data = calendar_response[0].get_json()
        items = calendar_data['items']

        # Filter and categorize
        today_items = []
        this_week_items = []
        wandering_items = []

        for item in items:
            if item['status'] == 'completed':
                continue

            scheduled_date_str = item.get('scheduled_date')
            if not scheduled_date_str:
                continue

            scheduled_date = datetime.strptime(scheduled_date_str, '%Y-%m-%d').date()

            if item['status'] == 'wandering':
                wandering_items.append(item)
            elif scheduled_date == today:
                today_items.append(item)
            elif scheduled_date <= week_end:
                this_week_items.append(item)

        # Sort by order_index and xp_value
        today_items.sort(key=lambda x: (x.get('order_index', 999), -x.get('xp_value', 0)))
        this_week_items.sort(key=lambda x: (x.get('order_index', 999), -x.get('xp_value', 0)))
        wandering_items.sort(key=lambda x: (x.get('order_index', 999), -x.get('xp_value', 0)))

        return jsonify({
            'today': today_items[:3],  # Max 3 for display
            'this_week': this_week_items[:5],
            'wandering': wandering_items[:5],
            'has_more_today': len(today_items) > 3,
            'has_more_week': len(this_week_items) > 5,
            'has_more_wandering': len(wandering_items) > 5
        }), 200

    except Exception as e:
        print(f"Error fetching next-up items: {str(e)}")
        return jsonify({'error': 'Failed to fetch next-up items'}), 500


@calendar_bp.route('/preferences/<user_id>', methods=['GET'])
@require_auth
def get_preferences(user_id):
    """
    Get user's calendar view preferences.
    """
    try:
        supabase = get_user_client(request)

        response = supabase.table('calendar_view_preferences')\
            .select('*')\
            .eq('user_id', user_id)\
            .execute()

        if response.data:
            return jsonify(response.data[0]), 200
        else:
            # Return defaults if no preferences set
            return jsonify({
                'user_id': user_id,
                'view_mode': 'calendar',
                'default_pillar_filter': None
            }), 200

    except Exception as e:
        print(f"Error fetching preferences: {str(e)}")
        return jsonify({'error': 'Failed to fetch preferences'}), 500


@calendar_bp.route('/preferences/<user_id>', methods=['PUT'])
@csrf_protect
@require_auth
def update_preferences(user_id):
    """
    Update user's calendar view preferences.
    """
    try:
        data = request.get_json()
        supabase = get_user_client(request)

        preference_data = {
            'user_id': user_id,
            'view_mode': data.get('view_mode', 'calendar'),
            'default_pillar_filter': data.get('default_pillar_filter'),
            'updated_at': datetime.utcnow().isoformat()
        }

        supabase.table('calendar_view_preferences')\
            .upsert(preference_data, on_conflict='user_id')\
            .execute()

        return jsonify({'success': True, 'preferences': preference_data}), 200

    except Exception as e:
        print(f"Error updating preferences: {str(e)}")
        return jsonify({'error': 'Failed to update preferences'}), 500
