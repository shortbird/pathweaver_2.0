"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- Direct database calls for course quest CRUD operations
- Uses image_service for quest image generation (line 11)
- Could create CourseQuestRepository with methods:
  - create_course_quest(quest_data, creator_id)
  - update_course_quest(quest_id, quest_data)
  - delete_course_quest(quest_id)
  - get_course_quest_with_preset_tasks(quest_id)
- Image management should remain in service layer

Admin Course Quest Management Routes
=====================================

Handles CRUD operations for course quests and their preset tasks.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin, require_advisor
from services.image_service import search_quest_image
from datetime import datetime
import json

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_course_quest_management', __name__, url_prefix='/api/admin')


@bp.route('/quests/create-course-quest', methods=['POST'])
@require_advisor
def create_course_quest(user_id):
    """
    Create a new course quest with preset tasks.
    Advisors create unpublished drafts; admins can publish immediately.

    Request body:
    {
        "title": "Quest title",
        "description": "Quest description",
        "lms_platform": "canvas|google_classroom|schoology|moodle",  // optional
        "lms_course_id": "course-123",  // optional
        "lms_assignment_id": "assignment-456",  // optional
        "is_active": true,
        "tasks": [
            {
                "title": "Task 1",
                "description": "Task description",
                "pillar": "stem",
                "xp_value": 100,
                "order_index": 0,
                "is_required": true,
                "diploma_subjects": ["Math"],
                "subject_xp_distribution": {"Math": 100}
            },
            ...
        ]
    }
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Validate required fields
        if not data.get('title'):
            return jsonify({'success': False, 'error': 'Title is required'}), 400

        if not data.get('tasks') or not isinstance(data['tasks'], list) or len(data['tasks']) == 0:
            return jsonify({
                'success': False,
                'error': 'At least one task is required for course quests'
            }), 400

        # Get user role to determine default is_active value
        user = supabase.table('users').select('role').eq('id', user_id).execute()
        user_role = user.data[0].get('role') if user.data else 'advisor'

        # Auto-fetch image if not provided
        image_url = data.get('header_image_url')
        if not image_url:
            quest_desc = data.get('description', '').strip()
            image_url = search_quest_image(data['title'].strip(), quest_desc)
            logger.info(f"Auto-fetched image for course quest '{data['title']}': {image_url}")

        # Determine is_active value based on role
        # Admins can set is_active=True (publish immediately)
        # Advisors always create drafts (is_active=False)
        # NOTE: Course quests CANNOT be activated without preset tasks
        # so we create as inactive and let admin activate after adding tasks
        if user_role in ['admin', 'superadmin']:
            is_active = data.get('is_active', False)
        else:
            is_active = False  # Advisors always create unpublished drafts

        # Create quest record
        quest_data = {
            'title': data['title'].strip(),
            'description': data.get('description', '').strip(),
            'big_idea': data.get('description', '').strip(),
            'quest_type': 'course',  # Important: mark as course quest
            'is_active': is_active,
            'material_link': data.get('material_link', '').strip() if data.get('material_link') else None,
            'lms_platform': data.get('lms_platform'),
            'lms_course_id': data.get('lms_course_id'),
            'lms_assignment_id': data.get('lms_assignment_id'),
            'header_image_url': image_url,
            'image_url': image_url,
            'created_by': user_id,  # Track who created the quest
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert quest
        quest_result = supabase.table('quests').insert(quest_data).execute()

        if not quest_result.data:
            return jsonify({'success': False, 'error': 'Failed to create quest'}), 500

        quest_id = quest_result.data[0]['id']
        logger.info(f"Created course quest {quest_id}: {quest_data['title']}")

        # Validate and insert tasks
        valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
        tasks_data = []

        for i, task in enumerate(data['tasks']):
            # Validate task
            if not task.get('title'):
                logger.warning(f"Task {i} missing title, skipping")
                continue

            pillar = task.get('pillar', 'stem').lower().strip()
            if pillar not in valid_pillars:
                logger.warning(f"Task {i} has invalid pillar '{pillar}', defaulting to 'stem'")
                pillar = 'stem'

            task_data = {
                'quest_id': quest_id,
                'title': task['title'].strip(),
                'description': task.get('description', '').strip(),
                'pillar': pillar,
                'xp_value': int(task.get('xp_value', 100)),
                'order_index': task.get('order_index', i),
                'is_required': task.get('is_required', True),
                'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                'subject_xp_distribution': task.get('subject_xp_distribution', {}),
                'created_at': datetime.utcnow().isoformat()
            }

            tasks_data.append(task_data)

        if not tasks_data:
            # Rollback quest creation if no valid tasks
            supabase.table('quests').delete().eq('id', quest_id).execute()
            return jsonify({
                'success': False,
                'error': 'No valid tasks provided'
            }), 400

        # Insert all tasks
        tasks_result = supabase.table('course_quest_tasks').insert(tasks_data).execute()

        if not tasks_result.data:
            # Rollback quest creation if tasks fail
            supabase.table('quests').delete().eq('id', quest_id).execute()
            return jsonify({
                'success': False,
                'error': 'Failed to create course tasks'
            }), 500

        logger.info(f"Created {len(tasks_result.data)} preset tasks for course quest {quest_id}")

        return jsonify({
            'success': True,
            'message': f'Course quest created with {len(tasks_result.data)} preset tasks',
            'quest_id': quest_id,
            'quest': quest_result.data[0],
            'tasks': tasks_result.data
        })

    except Exception as e:
        logger.error(f"Error creating course quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to create course quest: {str(e)}'
        }), 500


@bp.route('/quests/<quest_id>/course-tasks', methods=['GET'])
@require_admin
def get_course_tasks(user_id, quest_id):
    """Get all preset tasks for a course quest"""
    supabase = get_supabase_admin_client()

    try:
        # Verify quest is a course quest
        quest = supabase.table('quests').select('quest_type').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        if quest.data.get('quest_type') != 'course':
            return jsonify({
                'success': False,
                'error': 'This endpoint is only for course quests'
            }), 400

        # Get tasks
        tasks = supabase.table('course_quest_tasks')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .order('order_index')\
            .execute()

        return jsonify({
            'success': True,
            'tasks': tasks.data,
            'total': len(tasks.data)
        })

    except Exception as e:
        logger.error(f"Error getting course tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve course tasks'
        }), 500


@bp.route('/quests/<quest_id>/course-tasks', methods=['PUT'])
@require_admin
def update_course_tasks(user_id, quest_id):
    """
    Update a course quest and replace all preset tasks.

    Request body:
    {
        "title": "Quest title",
        "description": "Quest description",
        "lms_platform": "canvas|google_classroom|schoology|moodle",
        "lms_course_id": "course-123",
        "lms_assignment_id": "assignment-456",
        "is_active": true,
        "tasks": [
            {
                "title": "Task 1",
                "description": "...",
                "pillar": "stem",
                "xp_value": 100,
                "order_index": 0,
                ...
            },
            ...
        ]
    }
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Verify quest is a course quest
        quest = supabase.table('quests').select('quest_type').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        if quest.data.get('quest_type') != 'course':
            return jsonify({
                'success': False,
                'error': 'This endpoint is only for course quests'
            }), 400

        if not data.get('tasks') or not isinstance(data['tasks'], list):
            return jsonify({
                'success': False,
                'error': 'Tasks array is required'
            }), 400

        # Update quest attributes (title, description, lms fields, etc.)
        quest_update_data = {}

        if 'title' in data:
            quest_update_data['title'] = data['title'].strip()
        if 'description' in data:
            quest_update_data['description'] = data['description'].strip()
            quest_update_data['big_idea'] = data['description'].strip()  # Keep big_idea in sync
        if 'material_link' in data:
            quest_update_data['material_link'] = data['material_link'].strip() if data['material_link'] else None
        if 'lms_platform' in data:
            quest_update_data['lms_platform'] = data.get('lms_platform')
        if 'lms_course_id' in data:
            quest_update_data['lms_course_id'] = data.get('lms_course_id')
        if 'lms_assignment_id' in data:
            quest_update_data['lms_assignment_id'] = data.get('lms_assignment_id')
        if 'is_active' in data:
            # Validate course quest has preset tasks before activation
            # Note: Tasks must be provided in this request OR already exist
            if data['is_active']:
                has_tasks_in_request = data.get('tasks') and len(data.get('tasks', [])) > 0
                if not has_tasks_in_request:
                    # Check if tasks already exist
                    from utils.quest_validation import can_activate_quest
                    can_activate, error_msg = can_activate_quest(quest_id)
                    if not can_activate:
                        return jsonify({'success': False, 'error': error_msg}), 400

            quest_update_data['is_active'] = data['is_active']

        # Always update the updated_at timestamp
        quest_update_data['updated_at'] = datetime.utcnow().isoformat()

        # Update the quest record
        if quest_update_data:
            quest_result = supabase.table('quests').update(quest_update_data).eq('id', quest_id).execute()
            logger.info(f"Updated course quest {quest_id} attributes: {list(quest_update_data.keys())}")
        else:
            quest_result = None

        # Delete existing tasks
        supabase.table('course_quest_tasks').delete().eq('quest_id', quest_id).execute()
        logger.info(f"Deleted existing course tasks for quest {quest_id}")

        # Validate and insert new tasks
        valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
        tasks_data = []

        for i, task in enumerate(data['tasks']):
            if not task.get('title'):
                logger.warning(f"Task {i} missing title, skipping")
                continue

            pillar = task.get('pillar', 'stem').lower().strip()
            if pillar not in valid_pillars:
                logger.warning(f"Task {i} has invalid pillar '{pillar}', defaulting to 'stem'")
                pillar = 'stem'

            task_data = {
                'quest_id': quest_id,
                'title': task['title'].strip(),
                'description': task.get('description', '').strip(),
                'pillar': pillar,
                'xp_value': int(task.get('xp_value', 100)),
                'order_index': task.get('order_index', i),
                'is_required': task.get('is_required', True),
                'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                'subject_xp_distribution': task.get('subject_xp_distribution', {}),
                'created_at': datetime.utcnow().isoformat()
            }

            tasks_data.append(task_data)

        if not tasks_data:
            return jsonify({
                'success': False,
                'error': 'No valid tasks provided'
            }), 400

        # Insert new tasks
        tasks_result = supabase.table('course_quest_tasks').insert(tasks_data).execute()

        if not tasks_result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to update course tasks'
            }), 500

        logger.info(f"Updated course tasks for quest {quest_id}: {len(tasks_result.data)} tasks")

        # Get the updated quest data to return to frontend
        updated_quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()

        return jsonify({
            'success': True,
            'message': f'Course quest updated with {len(tasks_result.data)} tasks',
            'quest': updated_quest.data if updated_quest.data else None,
            'tasks': tasks_result.data
        })

    except Exception as e:
        logger.error(f"Error updating course tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update course tasks: {str(e)}'
        }), 500


@bp.route('/quests/<quest_id>/course-tasks/<task_id>', methods=['DELETE'])
@require_admin
def delete_course_task(user_id, quest_id, task_id):
    """Delete a single preset task from a course quest"""
    supabase = get_supabase_admin_client()

    try:
        result = supabase.table('course_quest_tasks')\
            .delete()\
            .eq('id', task_id)\
            .eq('quest_id', quest_id)\
            .execute()

        return jsonify({
            'success': True,
            'message': 'Course task deleted successfully'
        })

    except Exception as e:
        logger.error(f"Error deleting course task: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to delete course task: {str(e)}'
        }), 500
