"""
Admin Quest Template Task Management Routes
============================================

Handles CRUD operations for quest template tasks (unified required + optional).
This file now supports both the legacy course_quest_tasks table and the new
unified quest_template_tasks table during the migration period.

REPOSITORY MIGRATION: PARTIALLY COMPLETED
- New unified routes use QuestTemplateTaskRepository
- Legacy routes maintained for backward compatibility
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin, require_advisor
from services.image_service import search_quest_image
from services.subject_classification_service import SubjectClassificationService
from datetime import datetime
import json

from utils.logger import get_logger

logger = get_logger(__name__)

# Initialize subject classification service for auto-classification
_subject_service = None
def get_subject_service():
    global _subject_service
    if _subject_service is None:
        _subject_service = SubjectClassificationService()
    return _subject_service

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
        "material_link": "https://khanacademy.org/...",  // optional
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

        # Get user info for role and organization
        user = supabase.table('users').select('role, organization_id').eq('id', user_id).execute()
        user_data = user.data[0] if user.data else {}
        user_role = user_data.get('role', 'advisor')
        user_org_id = user_data.get('organization_id')

        # Check for organization_id in request (for org admin creating from org dashboard)
        # Superadmin can create for any org, others can only create for their own org
        request_org_id = data.get('organization_id')
        if request_org_id:
            if user_role != 'superadmin' and user_org_id != request_org_id:
                return jsonify({
                    'success': False,
                    'error': 'Access denied: cannot create quests for other organizations'
                }), 403
            organization_id = request_org_id
        else:
            organization_id = user_org_id

        # Auto-fetch image if not provided
        image_url = data.get('header_image_url')
        if not image_url:
            quest_desc = data.get('description', '').strip()
            image_url = search_quest_image(data['title'].strip(), quest_desc)
            logger.info(f"Auto-fetched image for course quest '{data['title']}': {image_url}")

        # Generate AI topics for quest filtering/discovery
        topic_primary = None
        topics = None
        try:
            from services.topic_generation_service import get_topic_generation_service
            topic_service = get_topic_generation_service()
            topic_result = topic_service.generate_topics(
                data['title'].strip(),
                data.get('description', '').strip()
            )
            if topic_result.get('success'):
                topic_primary = topic_result.get('primary')
                topics = topic_result.get('topics')
                logger.info(f"Generated topics for course quest '{data['title']}': {topic_primary} - {topics}")
        except Exception as e:
            logger.warning(f"Failed to generate topics for course quest '{data['title']}': {e}")

        # Determine is_active value based on role
        # Admins can set is_active=True (publish immediately)
        # Advisors always create drafts (is_active=False)
        if user_role in ['org_admin', 'superadmin']:
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
            'created_by': user_id,
            'organization_id': organization_id,  # Organization isolation
            'topic_primary': topic_primary,
            'topics': topics,
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

            # Auto-generate subject XP distribution if not provided
            subject_xp_distribution = task.get('subject_xp_distribution', {})
            if not subject_xp_distribution:
                try:
                    subject_service = get_subject_service()
                    subject_xp_distribution = subject_service.classify_task_subjects(
                        title=task['title'].strip(),
                        description=task.get('description', '').strip(),
                        pillar=pillar,
                        xp_value=int(task.get('xp_value', 100))
                    )
                    logger.info(f"Auto-classified subjects for task '{task['title']}': {subject_xp_distribution}")
                except Exception as e:
                    logger.warning(f"Failed to auto-classify subjects for task '{task['title']}': {e}")
                    subject_xp_distribution = {}

            task_data = {
                'quest_id': quest_id,
                'title': task['title'].strip(),
                'description': task.get('description', '').strip(),
                'pillar': pillar,
                'xp_value': int(task.get('xp_value', 100)),
                'order_index': task.get('order_index', i),
                'is_required': task.get('is_required', False),
                'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                'subject_xp_distribution': subject_xp_distribution if subject_xp_distribution else None,
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
@require_advisor
def get_course_tasks(user_id, quest_id):
    """Get all preset tasks for a course quest"""
    from utils.roles import get_effective_role
    supabase = get_supabase_admin_client()

    try:
        # Verify quest exists and get org info
        quest = supabase.table('quests').select('quest_type, organization_id').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        if quest.data.get('quest_type') != 'course':
            return jsonify({
                'success': False,
                'error': 'This endpoint is only for course quests'
            }), 400

        # Check organization access (non-superadmins can only access their org's quests)
        user_result = supabase.table('users').select('organization_id, role, org_role').eq('id', user_id).single().execute()
        if user_result.data:
            user_role = get_effective_role(user_result.data)
            user_org = user_result.data.get('organization_id')
            quest_org = quest.data.get('organization_id')

            if user_role != 'superadmin' and quest_org and quest_org != user_org:
                return jsonify({'success': False, 'error': 'Permission denied'}), 403

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
@require_advisor
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
    from utils.roles import get_effective_role
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Verify quest exists and get org info
        quest = supabase.table('quests').select('quest_type, organization_id').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        if quest.data.get('quest_type') != 'course':
            return jsonify({
                'success': False,
                'error': 'This endpoint is only for course quests'
            }), 400

        # Check organization access (non-superadmins can only update their org's quests)
        user_result = supabase.table('users').select('organization_id, role, org_role').eq('id', user_id).single().execute()
        if user_result.data:
            user_role = get_effective_role(user_result.data)
            user_org = user_result.data.get('organization_id')
            quest_org = quest.data.get('organization_id')

            if user_role != 'superadmin' and quest_org and quest_org != user_org:
                return jsonify({'success': False, 'error': 'Permission denied'}), 403

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

        # Regenerate topics if title or description changed
        if 'title' in data or 'description' in data:
            try:
                from services.topic_generation_service import get_topic_generation_service
                topic_service = get_topic_generation_service()
                topic_result = topic_service.generate_topics(
                    data.get('title', '').strip() or quest.data.get('title', ''),
                    data.get('description', '').strip() or quest.data.get('big_idea', '')
                )
                if topic_result.get('success'):
                    quest_update_data['topic_primary'] = topic_result.get('primary')
                    quest_update_data['topics'] = topic_result.get('topics')
                    logger.info(f"Regenerated topics for course quest {quest_id}: {topic_result.get('primary')} - {topic_result.get('topics')}")
            except Exception as e:
                logger.warning(f"Failed to regenerate topics for course quest {quest_id}: {e}")

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

            # Auto-generate subject XP distribution if not provided
            subject_xp_distribution = task.get('subject_xp_distribution', {})
            if not subject_xp_distribution:
                try:
                    subject_service = get_subject_service()
                    subject_xp_distribution = subject_service.classify_task_subjects(
                        title=task['title'].strip(),
                        description=task.get('description', '').strip(),
                        pillar=pillar,
                        xp_value=int(task.get('xp_value', 100))
                    )
                    logger.info(f"Auto-classified subjects for task '{task['title']}': {subject_xp_distribution}")
                except Exception as e:
                    logger.warning(f"Failed to auto-classify subjects for task '{task['title']}': {e}")
                    subject_xp_distribution = {}

            task_data = {
                'quest_id': quest_id,
                'title': task['title'].strip(),
                'description': task.get('description', '').strip(),
                'pillar': pillar,
                'xp_value': int(task.get('xp_value', 100)),
                'order_index': task.get('order_index', i),
                'is_required': task.get('is_required', False),
                'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                'subject_xp_distribution': subject_xp_distribution,
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
@require_advisor
def delete_course_task(user_id, quest_id, task_id):
    """Delete a single preset task from a course quest"""
    from utils.roles import get_effective_role
    supabase = get_supabase_admin_client()

    try:
        # Verify quest exists and check organization access
        quest = supabase.table('quests').select('organization_id').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Check organization access (non-superadmins can only delete from their org's quests)
        user_result = supabase.table('users').select('organization_id, role, org_role').eq('id', user_id).single().execute()
        if user_result.data:
            user_role = get_effective_role(user_result.data)
            user_org = user_result.data.get('organization_id')
            quest_org = quest.data.get('organization_id')

            if user_role != 'superadmin' and quest_org and quest_org != user_org:
                return jsonify({'success': False, 'error': 'Permission denied'}), 403

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


# =============================================================================
# UNIFIED TEMPLATE TASK ROUTES (New - replaces quest_type-specific routes)
# =============================================================================

@bp.route('/quests/<quest_id>/template-tasks', methods=['GET'])
@require_advisor
def get_template_tasks(user_id, quest_id):
    """
    Get template tasks for any quest (unified approach).
    Works regardless of quest_type.

    Query params:
    - filter: 'all' (default), 'required', or 'optional'
    - randomize: 'true' to shuffle optional tasks
    """
    from utils.roles import get_effective_role
    from repositories.quest_template_task_repository import QuestTemplateTaskRepository
    supabase = get_supabase_admin_client()

    try:
        # Verify quest exists and check access
        quest = supabase.table('quests').select('organization_id').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Check organization access
        user_result = supabase.table('users').select('organization_id, role, org_role').eq('id', user_id).single().execute()
        if user_result.data:
            user_role = get_effective_role(user_result.data)
            user_org = user_result.data.get('organization_id')
            quest_org = quest.data.get('organization_id')

            if user_role != 'superadmin' and quest_org and quest_org != user_org:
                return jsonify({'success': False, 'error': 'Permission denied'}), 403

        # Get filter options
        filter_type = request.args.get('filter', 'all')
        randomize = request.args.get('randomize', 'false').lower() == 'true'

        # Get template tasks using the unified function
        from routes.quest_types import get_template_tasks as fetch_template_tasks
        tasks = fetch_template_tasks(quest_id, filter_type=filter_type, randomize_optional=randomize)

        # Get summary
        repo = QuestTemplateTaskRepository()
        summary = repo.get_quest_task_summary(quest_id)

        return jsonify({
            'success': True,
            'tasks': tasks,
            'total': len(tasks),
            'summary': summary
        })

    except Exception as e:
        logger.error(f"Error getting template tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve template tasks'
        }), 500


@bp.route('/quests/<quest_id>/template-tasks', methods=['PUT'])
@require_advisor
def update_template_tasks(user_id, quest_id):
    """
    Replace all template tasks for a quest (unified approach).
    Supports both required and optional tasks.

    Request body:
    {
        "tasks": [
            {
                "title": "Task 1",
                "description": "...",
                "pillar": "stem",
                "xp_value": 100,
                "order_index": 0,
                "is_required": true,  // Required = auto-copied on enrollment
                "diploma_subjects": ["Math"],
                "subject_xp_distribution": {"Math": 100}
            },
            ...
        ]
    }
    """
    from utils.roles import get_effective_role
    from repositories.quest_template_task_repository import QuestTemplateTaskRepository
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Verify quest exists and check access
        quest = supabase.table('quests').select('organization_id').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Check organization access
        user_result = supabase.table('users').select('organization_id, role, org_role').eq('id', user_id).single().execute()
        if user_result.data:
            user_role = get_effective_role(user_result.data)
            user_org = user_result.data.get('organization_id')
            quest_org = quest.data.get('organization_id')

            if user_role != 'superadmin' and quest_org and quest_org != user_org:
                return jsonify({'success': False, 'error': 'Permission denied'}), 403

        if not data.get('tasks'):
            return jsonify({
                'success': False,
                'error': 'Tasks array is required'
            }), 400

        # Validate and prepare tasks
        valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
        tasks_data = []

        for i, task in enumerate(data['tasks']):
            if not task.get('title'):
                logger.warning(f"Task {i} missing title, skipping")
                continue

            pillar = task.get('pillar', 'stem').lower().strip()
            if pillar not in valid_pillars:
                pillar = 'stem'

            # Auto-generate subject XP distribution if not provided
            subject_xp_distribution = task.get('subject_xp_distribution', {})
            if not subject_xp_distribution:
                try:
                    subject_service = get_subject_service()
                    subject_xp_distribution = subject_service.classify_task_subjects(
                        title=task['title'].strip(),
                        description=task.get('description', '').strip(),
                        pillar=pillar,
                        xp_value=int(task.get('xp_value', 100))
                    )
                except Exception as e:
                    logger.warning(f"Failed to auto-classify subjects: {e}")
                    subject_xp_distribution = {}

            tasks_data.append({
                'title': task['title'].strip(),
                'description': task.get('description', '').strip(),
                'pillar': pillar,
                'xp_value': int(task.get('xp_value', 100)),
                'order_index': task.get('order_index', i),
                'is_required': task.get('is_required', False),
                'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                'subject_xp_distribution': subject_xp_distribution
            })

        # Use repository to bulk update
        repo = QuestTemplateTaskRepository()
        created_tasks = repo.bulk_update_template_tasks(quest_id, tasks_data)

        # Also update legacy table for backward compatibility during migration
        _sync_to_legacy_table(quest_id, tasks_data, supabase)

        return jsonify({
            'success': True,
            'message': f'Template tasks updated: {len(created_tasks)} tasks',
            'tasks': created_tasks,
            'total': len(created_tasks)
        })

    except Exception as e:
        logger.error(f"Error updating template tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update template tasks: {str(e)}'
        }), 500


@bp.route('/quests/<quest_id>/template-tasks/<task_id>', methods=['DELETE'])
@require_advisor
def delete_template_task(user_id, quest_id, task_id):
    """Delete a single template task"""
    from utils.roles import get_effective_role
    from repositories.quest_template_task_repository import QuestTemplateTaskRepository
    supabase = get_supabase_admin_client()

    try:
        # Verify quest exists and check access
        quest = supabase.table('quests').select('organization_id').eq('id', quest_id).single().execute()
        if not quest.data:
            return jsonify({'success': False, 'error': 'Quest not found'}), 404

        # Check organization access
        user_result = supabase.table('users').select('organization_id, role, org_role').eq('id', user_id).single().execute()
        if user_result.data:
            user_role = get_effective_role(user_result.data)
            user_org = user_result.data.get('organization_id')
            quest_org = quest.data.get('organization_id')

            if user_role != 'superadmin' and quest_org and quest_org != user_org:
                return jsonify({'success': False, 'error': 'Permission denied'}), 403

        # Delete from unified table
        repo = QuestTemplateTaskRepository()
        repo.delete_template_task(task_id)

        return jsonify({
            'success': True,
            'message': 'Template task deleted successfully'
        })

    except Exception as e:
        logger.error(f"Error deleting template task: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to delete template task: {str(e)}'
        }), 500


def _sync_to_legacy_table(quest_id: str, tasks_data: list, supabase):
    """
    Sync template tasks to legacy table for backward compatibility.
    This ensures the old course_quest_tasks table stays in sync during migration.
    """
    try:
        # Check if quest has any required tasks (legacy "course quest" behavior)
        required_tasks = [t for t in tasks_data if t.get('is_required')]

        if required_tasks:
            # Sync to course_quest_tasks
            supabase.table('course_quest_tasks').delete().eq('quest_id', quest_id).execute()

            legacy_tasks = []
            for task in required_tasks:
                legacy_tasks.append({
                    'quest_id': quest_id,
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'pillar': task['pillar'],
                    'xp_value': task['xp_value'],
                    'order_index': task['order_index'],
                    'is_required': task['is_required'],
                    'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                    'subject_xp_distribution': task.get('subject_xp_distribution'),
                    'created_at': datetime.utcnow().isoformat()
                })

            if legacy_tasks:
                supabase.table('course_quest_tasks').insert(legacy_tasks).execute()
                logger.info(f"Synced {len(legacy_tasks)} required tasks to legacy course_quest_tasks for quest {quest_id[:8]}")

    except Exception as e:
        logger.warning(f"Failed to sync to legacy table: {e}")
        # Don't fail the main operation if legacy sync fails
