"""
Calendar routes for managing user quest/task scheduling and deadlines.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta, date
from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth
from utils.pillar_utils import get_pillar_name
from collections import defaultdict

calendar_bp = Blueprint('calendar', __name__, url_prefix='/api/calendar')

# Add OPTIONS handler for CORS preflight
@calendar_bp.route('/<path:path>', methods=['OPTIONS'])
@calendar_bp.route('/', methods=['OPTIONS'])
@calendar_bp.route('', methods=['OPTIONS'])
def handle_options(path=None):
    """Handle OPTIONS preflight requests for CORS"""
    return '', 200

@calendar_bp.route('/', methods=['GET'], strict_slashes=False)
@calendar_bp.route('', methods=['GET'])
@require_auth
def get_calendar_items(user_id):
    """
    Get all calendar items for a user (scheduled quests/tasks + completed items).
    Returns data structured for both calendar and list views.
    OPTIMIZED: Filters out tasks from completed quests.
    """
    try:
        supabase = get_user_client()
        today = date.today()

        # Get user quests to check which are completed
        user_quests_response = supabase.table('user_quests')\
            .select('quest_id, completed_at, is_active')\
            .eq('user_id', user_id)\
            .execute()

        # Build map of quest statuses - exclude completed quests
        active_quest_ids = [
            uq['quest_id'] for uq in user_quests_response.data
            if not uq.get('completed_at') and uq.get('is_active', True)
        ]

        if not active_quest_ids:
            return jsonify({'items': [], 'summary': {'total_active': 0, 'total_completed': 0, 'scheduled_today': 0, 'wandering': 0}}), 200

        # Get all user quest tasks for active quests only
        tasks_response = supabase.table('user_quest_tasks')\
            .select('id, quest_id, title, description, pillar, xp_value, order_index, is_required')\
            .eq('user_id', user_id)\
            .in_('quest_id', active_quest_ids)\
            .execute()

        if not tasks_response.data:
            return jsonify({'items': [], 'summary': {'total_active': 0, 'total_completed': 0, 'scheduled_today': 0, 'wandering': 0}}), 200

        # Get quest info separately (RLS-safe)
        quest_ids = list(set(task['quest_id'] for task in tasks_response.data))
        quests_response = supabase.table('quests')\
            .select('id, title, image_url, header_image_url')\
            .in_('id', quest_ids)\
            .execute()

        # Get completions separately
        completions_response = supabase.table('quest_task_completions')\
            .select('task_id, completed_at, evidence_url, evidence_text')\
            .eq('user_id', user_id)\
            .execute()

        # Get deadlines separately
        deadlines_response = supabase.table('user_quest_deadlines')\
            .select('quest_id, task_id, scheduled_date')\
            .eq('user_id', user_id)\
            .execute()

        # Build fast lookup maps
        quests_map = {q['id']: q for q in quests_response.data}
        completions_map = {comp['task_id']: comp for comp in completions_response.data}
        deadline_map = {f"{d['quest_id']}_{d.get('task_id', 'quest')}": d['scheduled_date']
                       for d in deadlines_response.data}

        # Build calendar items efficiently
        calendar_items = []
        for task in tasks_response.data:
            task_id = task['id']
            quest_id = task['quest_id']
            quest = quests_map.get(quest_id, {})

            completion = completions_map.get(task_id)
            task_deadline = deadline_map.get(f"{quest_id}_{task_id}") or deadline_map.get(f"{quest_id}_quest")

            # Calculate status efficiently
            if completion:
                status = 'completed'
            elif task_deadline:
                scheduled_date = datetime.strptime(task_deadline, '%Y-%m-%d').date() if isinstance(task_deadline, str) else task_deadline
                status = 'wandering' if scheduled_date < today else 'on-track'
            else:
                status = 'exploring'

            calendar_items.append({
                'id': task_id,
                'quest_id': quest_id,
                'quest_title': quest.get('title', 'Unknown Quest'),
                'quest_image': quest.get('image_url') or quest.get('header_image_url'),
                'task_title': task['title'],
                'task_description': task.get('description'),
                'pillar': get_pillar_name(task['pillar']),  # Convert key to display name
                'xp_value': task.get('xp_value'),
                'scheduled_date': task_deadline,
                'completed_at': completion['completed_at'] if completion else None,
                'evidence_url': completion['evidence_url'] if completion else None,
                'evidence_text': completion['evidence_text'] if completion else None,
                'status': status,
                'is_required': task.get('is_required', False),
                'order_index': task.get('order_index', 0)
            })

        # Calculate summary efficiently
        today_str = str(today)
        summary = {
            'total_active': sum(1 for i in calendar_items if i['status'] != 'completed'),
            'total_completed': sum(1 for i in calendar_items if i['status'] == 'completed'),
            'scheduled_today': sum(1 for i in calendar_items if i['scheduled_date'] == today_str and i['status'] != 'completed'),
            'wandering': sum(1 for i in calendar_items if i['status'] == 'wandering')
        }

        return jsonify({
            'items': calendar_items,
            'summary': summary
        }), 200

    except Exception as e:
        print(f"Error fetching calendar items: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch calendar items'}), 500


@calendar_bp.route('/deadline', methods=['PUT'], strict_slashes=False)
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

        supabase = get_user_client()

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


@calendar_bp.route('/bulk-deadline', methods=['PUT'], strict_slashes=False)
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

        supabase = get_user_client()

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


@calendar_bp.route('/next-up', methods=['GET'], strict_slashes=False)
@require_auth
def get_next_up(user_id):
    """
    Get prioritized list of what to do next (today, this week, wandering items).
    OPTIMIZED: Direct query instead of calling get_calendar_items for better performance.
    Accepts client_date query parameter to handle timezone differences.
    """
    try:
        supabase = get_user_client()

        # Accept client's local date to avoid timezone issues
        client_date_str = request.args.get('client_date')
        if client_date_str:
            try:
                today = datetime.strptime(client_date_str, '%Y-%m-%d').date()
            except ValueError:
                today = date.today()
        else:
            today = date.today()

        today_str = str(today)
        week_end = today + timedelta(days=7)
        week_end_str = str(week_end)

        # Get active quests only (exclude completed)
        user_quests_response = supabase.table('user_quests')\
            .select('quest_id')\
            .eq('user_id', user_id)\
            .is_('completed_at', 'null')\
            .eq('is_active', True)\
            .execute()

        active_quest_ids = [uq['quest_id'] for uq in user_quests_response.data]

        if not active_quest_ids:
            return jsonify({
                'today': [],
                'this_week': [],
                'wandering': [],
                'has_more_today': False,
                'has_more_week': False,
                'has_more_wandering': False
            }), 200

        # Get tasks with deadlines from active quests
        deadlines_response = supabase.table('user_quest_deadlines')\
            .select('quest_id, task_id, scheduled_date')\
            .eq('user_id', user_id)\
            .in_('quest_id', active_quest_ids)\
            .not_.is_('scheduled_date', 'null')\
            .execute()

        if not deadlines_response.data:
            return jsonify({
                'today': [],
                'this_week': [],
                'wandering': [],
                'has_more_today': False,
                'has_more_week': False,
                'has_more_wandering': False
            }), 200

        # Get task IDs with deadlines
        task_ids_with_deadlines = [d.get('task_id') for d in deadlines_response.data if d.get('task_id')]

        if not task_ids_with_deadlines:
            return jsonify({
                'today': [],
                'this_week': [],
                'wandering': [],
                'has_more_today': False,
                'has_more_week': False,
                'has_more_wandering': False
            }), 200

        # Get task details
        tasks_response = supabase.table('user_quest_tasks')\
            .select('id, quest_id, title, description, pillar, xp_value, order_index')\
            .eq('user_id', user_id)\
            .in_('id', task_ids_with_deadlines)\
            .execute()

        # Get quest info
        quest_ids = list(set(task['quest_id'] for task in tasks_response.data))
        quests_response = supabase.table('quests')\
            .select('id, title, image_url, header_image_url')\
            .in_('id', quest_ids)\
            .execute()

        # Get completions to filter out completed tasks
        completions_response = supabase.table('quest_task_completions')\
            .select('task_id')\
            .eq('user_id', user_id)\
            .in_('task_id', task_ids_with_deadlines)\
            .execute()

        # Build lookup maps
        quests_map = {q['id']: q for q in quests_response.data}
        completed_task_ids = {comp['task_id'] for comp in completions_response.data}
        deadline_map = {d['task_id']: d['scheduled_date'] for d in deadlines_response.data if d.get('task_id')}

        # Categorize tasks
        today_items = []
        this_week_items = []
        wandering_items = []

        for task in tasks_response.data:
            task_id = task['id']

            # Skip completed tasks
            if task_id in completed_task_ids:
                continue

            scheduled_date_str = deadline_map.get(task_id)
            if not scheduled_date_str:
                continue

            scheduled_date = datetime.strptime(scheduled_date_str, '%Y-%m-%d').date()
            quest = quests_map.get(task['quest_id'], {})

            item = {
                'id': task_id,
                'quest_id': task['quest_id'],
                'quest_title': quest.get('title', 'Unknown Quest'),
                'quest_image': quest.get('image_url') or quest.get('header_image_url'),
                'task_title': task['title'],
                'task_description': task.get('description'),
                'pillar': get_pillar_name(task['pillar']),  # Convert key to display name
                'xp_value': task.get('xp_value'),
                'scheduled_date': scheduled_date_str,
                'order_index': task.get('order_index', 0)
            }

            if scheduled_date < today:
                item['status'] = 'wandering'
                wandering_items.append(item)
            elif scheduled_date == today:
                item['status'] = 'on-track'
                today_items.append(item)
            elif scheduled_date <= week_end:
                item['status'] = 'on-track'
                this_week_items.append(item)

        # Sort by order_index and xp_value
        today_items.sort(key=lambda x: (x.get('order_index', 999), -x.get('xp_value', 0)))
        this_week_items.sort(key=lambda x: (x.get('order_index', 999), -x.get('xp_value', 0)))
        wandering_items.sort(key=lambda x: (x.get('order_index', 999), -x.get('xp_value', 0)))

        return jsonify({
            'today': today_items[:3],
            'this_week': this_week_items[:5],
            'wandering': wandering_items[:5],
            'has_more_today': len(today_items) > 3,
            'has_more_week': len(this_week_items) > 5,
            'has_more_wandering': len(wandering_items) > 5
        }), 200

    except Exception as e:
        print(f"Error fetching next-up items: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch next-up items'}), 500


@calendar_bp.route('/preferences', methods=['GET'], strict_slashes=False)
@require_auth
def get_preferences(user_id):
    """
    Get user's calendar view preferences.
    """
    try:
        supabase = get_user_client()

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


@calendar_bp.route('/preferences', methods=['PUT'], strict_slashes=False)
@require_auth
def update_preferences(user_id):
    """
    Update user's calendar view preferences.
    """
    try:
        data = request.get_json()
        supabase = get_user_client()

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
