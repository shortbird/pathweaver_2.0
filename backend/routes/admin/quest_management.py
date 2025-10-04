"""
Admin Quest Management Routes

Handles CRUD operations for quests including creation, editing, deletion,
and quest validation functionality.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.pillar_utils import normalize_pillar_key, is_valid_pillar
from utils.school_subjects import validate_school_subjects, normalize_subject_key
from datetime import datetime, timedelta
import json
import uuid

bp = Blueprint('admin_quest_management', __name__, url_prefix='/api/v3/admin')

@bp.route('/quests/create-v3', methods=['POST'])
@require_admin
def create_quest_v3_clean(user_id):
    """
    Create a new quest (title + idea only).
    Tasks are now created individually per student by advisors or AI.
    """
    print(f"CREATE QUEST V3: admin_user_id={user_id}")
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        print(f"Received quest data: {json.dumps(data, indent=2)}")

        # Validate required fields
        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Title is required'}), 400

        # Create quest record
        quest_data = {
            'title': data['title'].strip(),
            'big_idea': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'description': data.get('big_idea', '').strip() or data.get('description', '').strip(),
            'is_v3': True,
            'is_active': data.get('is_active', True),
            'source': 'optio',  # Always optio for new personalized quests
            'header_image_url': data.get('header_image_url'),
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert quest
        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create quest'}), 500

        quest_id = quest_result.data[0]['id']
        print(f"Successfully created quest {quest_id}: {quest_data['title']}")

        return jsonify({
            'success': True,
            'message': 'Quest created successfully. Tasks can now be added per student.',
            'quest_id': quest_id,
            'quest': quest_result.data[0]
        })

    except Exception as e:
        print(f"Error creating quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create quest: {str(e)}'
        }), 500

@bp.route('/quests/<quest_id>', methods=['PUT'])
@require_admin
def update_quest(user_id, quest_id):
    """Update an existing quest"""
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Validate quest exists
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Update quest data
        update_data = {}
        if 'title' in data:
            update_data['title'] = data['title'].strip()
        if 'description' in data:
            update_data['description'] = data['description'].strip()
        if 'header_image_url' in data:
            update_data['header_image_url'] = data['header_image_url']
        if 'is_active' in data:
            update_data['is_active'] = data['is_active']

        if update_data:
            update_data['updated_at'] = datetime.utcnow().isoformat()
            supabase.table('quests').update(update_data).eq('id', quest_id).execute()

        return jsonify({
            'success': True,
            'message': 'Quest updated successfully'
        })

    except Exception as e:
        print(f"Error updating quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update quest: {str(e)}'
        }), 500

@bp.route('/quests/<quest_id>', methods=['DELETE'])
@require_admin
def delete_quest(user_id, quest_id):
    """Delete a quest and all its associated data"""
    supabase = get_supabase_admin_client()

    try:
        # Check if quest exists
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Delete quest (cascade should handle tasks and completions)
        supabase.table('quests').delete().eq('id', quest_id).execute()

        return jsonify({
            'success': True,
            'message': 'Quest deleted successfully'
        })

    except Exception as e:
        print(f"Error deleting quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to delete quest: {str(e)}'
        }), 500

@bp.route('/quests', methods=['GET'])
@require_admin
def get_admin_quests(user_id):
    """Get all quests for admin management"""
    supabase = get_supabase_admin_client()

    try:
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        offset = (page - 1) * per_page

        # Get quests with task counts
        quests = supabase.table('quests')\
            .select('*, quest_tasks(count)', count='exact')\
            .order('created_at', desc=True)\
            .range(offset, offset + per_page - 1)\
            .execute()

        return jsonify({
            'success': True,
            'quests': quests.data,
            'total': quests.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (quests.count + per_page - 1) // per_page
        })

    except Exception as e:
        print(f"Error getting admin quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve quests'
        }), 500

@bp.route('/quests/<quest_id>/task-templates', methods=['GET'])
@require_admin
def get_quest_task_templates(user_id, quest_id):
    """
    Get reusable task templates for a quest.
    Returns tasks created by other students that can be copied.
    """
    supabase = get_supabase_admin_client()

    try:
        # Get all tasks for this quest from user_quest_tasks
        # Group by title to find commonly used tasks
        tasks = supabase.table('user_quest_tasks')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .execute()

        if not tasks.data:
            return jsonify({
                'success': True,
                'templates': [],
                'message': 'No task templates available yet for this quest'
            })

        # Aggregate tasks by similarity (using title as primary key)
        template_map = {}
        for task in tasks.data:
            title = task.get('title', '').strip().lower()
            if not title:
                continue

            if title not in template_map:
                template_map[title] = {
                    'id': task['id'],  # Use first occurrence ID as template
                    'title': task.get('title'),
                    'description': task.get('description', ''),
                    'pillar': task.get('pillar'),
                    'subject_xp_distribution': task.get('subject_xp_distribution', {}),
                    'xp_amount': task.get('xp_amount', 0),
                    'evidence_prompt': task.get('evidence_prompt', ''),
                    'materials_needed': task.get('materials_needed', []),
                    'usage_count': 0,
                    'created_at': task.get('created_at')
                }

            template_map[title]['usage_count'] += 1

        # Convert to list and sort by usage count (most popular first)
        templates = sorted(
            template_map.values(),
            key=lambda x: (x['usage_count'], x['created_at']),
            reverse=True
        )

        return jsonify({
            'success': True,
            'templates': templates,
            'total': len(templates)
        })

    except Exception as e:
        print(f"Error getting task templates: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve task templates'
        }), 500