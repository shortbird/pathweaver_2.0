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
    Create a new quest with comprehensive validation and error handling.
    This is the clean, rebuilt version to avoid previous bugs.
    """
    print(f"CREATE QUEST V3 CLEAN: admin_user_id={user_id}")
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        print(f"Received quest data: {json.dumps(data, indent=2)}")

        # Validate required fields
        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Title is required'}), 400

        if not data.get('tasks') or len(data['tasks']) == 0:
            return jsonify({'success': False, 'error': 'At least one task is required'}), 400

        # Create quest record
        quest_data = {
            'title': data['title'].strip(),
            'description': data.get('description', '').strip(),
            'is_v3': True,
            'is_active': True,
            'source': data.get('source', 'custom'),
            'header_image_url': data.get('header_image_url'),
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert quest
        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create quest'}), 500

        quest_id = quest_result.data[0]['id']
        print(f"Created quest with ID: {quest_id}")

        # Process and create tasks
        tasks_created = []
        for i, task_data in enumerate(data['tasks']):
            try:
                # Validate task data
                if not task_data.get('title'):
                    raise ValueError(f"Task {i+1}: Title is required")

                if not task_data.get('description'):
                    raise ValueError(f"Task {i+1}: Description is required")

                # Validate pillar
                pillar = task_data.get('pillar', 'creativity')
                if not is_valid_pillar(pillar):
                    raise ValueError(f"Task {i+1}: Invalid pillar '{pillar}'")

                # Normalize pillar key
                normalized_pillar = normalize_pillar_key(pillar)

                # Validate XP value
                xp_value = task_data.get('xp_amount', 50)
                if not isinstance(xp_value, (int, float)) or xp_value <= 0:
                    raise ValueError(f"Task {i+1}: XP amount must be a positive number")

                # Validate school subjects if provided
                school_subjects = task_data.get('school_subjects', [])
                if school_subjects:
                    valid_subjects = validate_school_subjects(school_subjects)
                    if not valid_subjects:
                        print(f"Warning: Invalid school subjects for task {i+1}: {school_subjects}")
                        school_subjects = []

                task_record = {
                    'quest_id': quest_id,
                    'title': task_data['title'].strip(),
                    'description': task_data['description'].strip(),
                    'pillar': normalized_pillar,
                    'xp_amount': int(xp_value),
                    'is_required': task_data.get('is_required', True),
                    'order_index': i + 1,
                    'school_subjects': school_subjects
                }

                # Insert task
                task_result = supabase.table('quest_tasks').insert(task_record).execute()

                if task_result.data:
                    tasks_created.append(task_result.data[0])
                    print(f"Created task {i+1}: {task_data['title']}")
                else:
                    print(f"Failed to create task {i+1}: {task_data['title']}")

            except Exception as task_error:
                print(f"Error creating task {i+1}: {str(task_error)}")
                # Continue with other tasks rather than failing completely
                continue

        if not tasks_created:
            # Clean up quest if no tasks were created
            supabase.table('quests').delete().eq('id', quest_id).execute()
            return jsonify({
                'success': False,
                'error': 'Failed to create any tasks for the quest'
            }), 500

        print(f"Successfully created quest {quest_id} with {len(tasks_created)} tasks")

        return jsonify({
            'success': True,
            'message': f'Quest created successfully with {len(tasks_created)} tasks',
            'quest_id': quest_id,
            'tasks_created': len(tasks_created)
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