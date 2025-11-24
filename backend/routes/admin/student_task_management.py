"""
Admin Student Task Management Routes

Handles advisor/admin creation of tasks for individual student quest instances.
Supports both creating custom tasks and copying from existing task templates.
"""

from flask import Blueprint, request, jsonify
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
from utils.auth.decorators import require_admin, require_role
from utils.pillar_utils import is_valid_pillar
from utils.pillar_mapping import normalize_pillar_name
from utils.school_subjects import validate_school_subjects
from datetime import datetime
import json

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_student_task_management', __name__, url_prefix='/api/admin/users')

def is_advisor_for_student(advisor_id, student_id):
    """Helper function to check if advisor has permission for student"""
    supabase = get_supabase_admin_client()

    result = supabase.table('advisor_student_assignments')\
        .select('id')\
        .eq('advisor_id', advisor_id)\
        .eq('student_id', student_id)\
        .eq('is_active', True)\
        .execute()

    return len(result.data) > 0

# Using repository pattern for database access
@bp.route('/<target_user_id>/quests/<quest_id>/tasks', methods=['POST'])
@require_admin
def create_student_task(user_id, target_user_id, quest_id):
    """
    Create a task for a specific student's quest instance.
    Supports two modes:
    1. Create custom task (provide task details)
    2. Copy from template (provide template_task_id)
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        template_task_id = data.get('template_task_id')

        # Get or create user_quest enrollment
        enrollment = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', target_user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        if enrollment.data:
            user_quest_id = enrollment.data[0]['id']

            # Update enrollment to mark personalization as completed
            # This allows adding tasks after initial personalization
            supabase.table('user_quests')\
                .update({'personalization_completed': True})\
                .eq('id', user_quest_id)\
                .execute()
        else:
            # Auto-enroll student in quest
            new_enrollment = supabase.table('user_quests')\
                .insert({
                    'user_id': target_user_id,
                    'quest_id': quest_id,
                    'started_at': datetime.utcnow().isoformat(),
                    'is_active': True,
                    'personalization_completed': True  # Admin-managed tasks
                })\
                .execute()

            if not new_enrollment.data:
                return jsonify({
                    'success': False,
                    'error': 'Failed to enroll student in quest'
                }), 500

            user_quest_id = new_enrollment.data[0]['id']

        # Get current task count for order_index
        existing_tasks = supabase.table('user_quest_tasks')\
            .select('order_index')\
            .eq('user_quest_id', user_quest_id)\
            .execute()

        max_order = max([t['order_index'] for t in existing_tasks.data], default=-1) if existing_tasks.data else -1

        # MODE 1: Copy from template
        if template_task_id:
            template = supabase.table('user_quest_tasks')\
                .select('*')\
                .eq('id', template_task_id)\
                .single()\
                .execute()

            if not template.data:
                return jsonify({
                    'success': False,
                    'error': 'Template task not found'
                }), 404

            # Get XP value from template (use xp_value if available, fallback to subject_xp_distribution for backward compatibility)
            xp_value = template.data.get('xp_value')
            if not xp_value:
                subject_xp_dist = template.data.get('subject_xp_distribution', {})
                xp_value = sum(subject_xp_dist.values()) if subject_xp_dist else 100

            task_data = {
                'user_id': target_user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': template.data['title'],
                'description': template.data.get('description', ''),
                'pillar': template.data['pillar'],
                'subject_xp_distribution': None,
                'xp_value': int(xp_value),
                'order_index': max_order + 1,
                'is_required': True,
                'approval_status': 'approved',  # Admin-created tasks are pre-approved
                'created_at': datetime.utcnow().isoformat()
            }

        # MODE 2: Create custom task
        else:
            # Validate required fields
            if not data.get('title'):
                return jsonify({
                    'success': False,
                    'error': 'Task title is required'
                }), 400

            if not data.get('pillar'):
                return jsonify({
                    'success': False,
                    'error': 'Task pillar is required'
                }), 400

            # Validate pillar
            pillar = data['pillar']
            if not is_valid_pillar(pillar):
                return jsonify({
                    'success': False,
                    'error': f'Invalid pillar: {pillar}'
                }), 400

            normalized_pillar = normalize_pillar_name(pillar)

            # Validate XP value
            xp_value = data.get('xp_value')
            if not xp_value or xp_value <= 0:
                return jsonify({
                    'success': False,
                    'error': 'XP value must be greater than 0'
                }), 400

            task_data = {
                'user_id': target_user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': data['title'].strip(),
                'description': data.get('description', '').strip(),
                'pillar': normalized_pillar,
                'subject_xp_distribution': None,
                'xp_value': int(xp_value),
                'order_index': max_order + 1,
                'is_required': True,
                'approval_status': 'approved',  # Admin-created tasks are pre-approved
                'created_at': datetime.utcnow().isoformat()
            }

        # Insert task
        result = supabase.table('user_quest_tasks')\
            .insert(task_data)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to create task'
            }), 500

        return jsonify({
            'success': True,
            'task': result.data[0],
            'message': 'Task created successfully'
        })

    except Exception as e:
        logger.error(f"Error creating student task: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to create task: {str(e)}'
        }), 500

@bp.route('/<target_user_id>/quests/<quest_id>/tasks/batch', methods=['POST'])
@require_admin
def batch_copy_tasks(user_id, target_user_id, quest_id):
    """
    Copy multiple task templates to a student's quest at once.
    Request body: { "template_task_ids": ["id1", "id2", "id3"] }
    """
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        template_task_ids = data.get('template_task_ids', [])

        if not template_task_ids:
            return jsonify({
                'success': False,
                'error': 'No template task IDs provided'
            }), 400

        # Get or create user_quest enrollment
        enrollment = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', target_user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        if enrollment.data:
            user_quest_id = enrollment.data[0]['id']

            # Update enrollment to mark personalization as completed
            # This allows adding tasks after initial personalization
            supabase.table('user_quests')\
                .update({'personalization_completed': True})\
                .eq('id', user_quest_id)\
                .execute()
        else:
            # Auto-enroll student in quest
            new_enrollment = supabase.table('user_quests')\
                .insert({
                    'user_id': target_user_id,
                    'quest_id': quest_id,
                    'started_at': datetime.utcnow().isoformat(),
                    'is_active': True,
                    'personalization_completed': True  # Admin-managed tasks
                })\
                .execute()

            if not new_enrollment.data:
                return jsonify({
                    'success': False,
                    'error': 'Failed to enroll student in quest'
                }), 500

            user_quest_id = new_enrollment.data[0]['id']

        # Get current task count for order_index
        existing_tasks = supabase.table('user_quest_tasks')\
            .select('order_index')\
            .eq('user_quest_id', user_quest_id)\
            .execute()

        max_order = max([t['order_index'] for t in existing_tasks.data], default=-1) if existing_tasks.data else -1

        # Fetch all template tasks
        templates = supabase.table('user_quest_tasks')\
            .select('*')\
            .in_('id', template_task_ids)\
            .execute()

        if not templates.data:
            return jsonify({
                'success': False,
                'error': 'No template tasks found'
            }), 404

        # Create tasks from templates
        tasks_to_create = []
        for idx, template in enumerate(templates.data):
            # Get XP value from template (use xp_value if available, fallback to subject_xp_distribution for backward compatibility)
            xp_value = template.get('xp_value')
            if not xp_value:
                subject_xp_dist = template.get('subject_xp_distribution', {})
                xp_value = sum(subject_xp_dist.values()) if subject_xp_dist else 100

            task_data = {
                'user_id': target_user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': template['title'],
                'description': template.get('description', ''),
                'pillar': template['pillar'],
                'subject_xp_distribution': None,
                'xp_value': int(xp_value),
                'order_index': max_order + idx + 1,
                'is_required': True,
                'approval_status': 'approved',
                'created_at': datetime.utcnow().isoformat()
            }
            tasks_to_create.append(task_data)

        # Batch insert
        result = supabase.table('user_quest_tasks')\
            .insert(tasks_to_create)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to create tasks'
            }), 500

        return jsonify({
            'success': True,
            'tasks': result.data,
            'count': len(result.data),
            'message': f'{len(result.data)} tasks added successfully'
        })

    except Exception as e:
        logger.error(f"Error batch copying tasks: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to copy tasks: {str(e)}'
        }), 500

@bp.route('/<target_user_id>/quests/<quest_id>/tasks', methods=['GET'])
@require_role('advisor', 'admin')
def get_student_quest_tasks(user_id, target_user_id, quest_id):
    """
    Get all tasks for a specific student's quest.
    Advisors can only access tasks for their assigned students.
    Admins can access any student's tasks.
    """
    supabase = get_supabase_admin_client()

    try:
        # Check authorization for advisors
        user = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        user_role = user.data['role']
        if user_role == 'advisor' and not is_advisor_for_student(user_id, target_user_id):
            return jsonify({
                'success': False,
                'error': 'You do not have permission to view this student\'s tasks'
            }), 403

        # Get user_quest enrollment
        enrollment = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', target_user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        if not enrollment.data:
            return jsonify({
                'success': False,
                'error': 'Student is not enrolled in this quest'
            }), 404

        user_quest_id = enrollment.data[0]['id']

        # Get all tasks for this quest
        tasks = supabase.table('user_quest_tasks')\
            .select('*')\
            .eq('user_quest_id', user_quest_id)\
            .order('order_index')\
            .execute()

        # Get completion status for each task
        task_ids = [task['id'] for task in tasks.data]
        completions = supabase.table('quest_task_completions')\
            .select('task_id, completed_at, evidence_text, evidence_url')\
            .in_('task_id', task_ids)\
            .execute() if task_ids else None

        # Map completions to tasks
        completion_map = {c['task_id']: c for c in completions.data} if completions and completions.data else {}

        # Enrich tasks with completion info
        enriched_tasks = []
        for task in tasks.data:
            completion = completion_map.get(task['id'])
            enriched_tasks.append({
                **task,
                'completed': completion is not None,
                'completed_at': completion['completed_at'] if completion else None,
                'evidence_text': completion.get('evidence_text') if completion else None,
                'evidence_url': completion.get('evidence_url') if completion else None
            })

        return jsonify({
            'success': True,
            'tasks': enriched_tasks,
            'count': len(enriched_tasks)
        })

    except Exception as e:
        logger.error(f"Error getting student quest tasks: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to get tasks: {str(e)}'
        }), 500

@bp.route('/<target_user_id>/quests/<quest_id>/tasks/<task_id>', methods=['PUT'])
@require_role('advisor', 'admin')
def update_student_task(user_id, target_user_id, quest_id, task_id):
    """
    Update a task for a specific student's quest.
    Advisors can only edit tasks for their assigned students.
    Admins can edit any student's tasks.
    """
    supabase = get_supabase_admin_client()

    try:
        # Check authorization for advisors
        user = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        user_role = user.data['role']
        if user_role == 'advisor' and not is_advisor_for_student(user_id, target_user_id):
            return jsonify({
                'success': False,
                'error': 'You do not have permission to edit this student\'s tasks'
            }), 403

        # Verify task exists and belongs to this student's quest
        task = supabase.table('user_quest_tasks')\
            .select('*')\
            .eq('id', task_id)\
            .eq('user_id', target_user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not task.data:
            return jsonify({
                'success': False,
                'error': 'Task not found or does not belong to this student\'s quest'
            }), 404

        # Check if task is already completed
        completion = supabase.table('quest_task_completions')\
            .select('id')\
            .eq('task_id', task_id)\
            .execute()

        if completion.data:
            return jsonify({
                'success': False,
                'error': 'Cannot edit a completed task. Student must re-submit evidence to make changes.'
            }), 400

        data = request.json

        # Build update payload
        update_data = {}

        # Update title if provided
        if 'title' in data:
            if not data['title'].strip():
                return jsonify({
                    'success': False,
                    'error': 'Task title cannot be empty'
                }), 400
            update_data['title'] = data['title'].strip()

        # Update description if provided
        if 'description' in data:
            update_data['description'] = data['description'].strip()

        # Update pillar if provided
        if 'pillar' in data:
            pillar = data['pillar']
            if not is_valid_pillar(pillar):
                return jsonify({
                    'success': False,
                    'error': f'Invalid pillar: {pillar}'
                }), 400
            update_data['pillar'] = normalize_pillar_name(pillar)

        # Update XP value if provided
        if 'xp_value' in data:
            xp_value = data['xp_value']
            if not xp_value or xp_value <= 0:
                return jsonify({
                    'success': False,
                    'error': 'XP value must be greater than 0'
                }), 400
            update_data['xp_value'] = int(xp_value)

        # Update is_required if provided
        if 'is_required' in data:
            update_data['is_required'] = bool(data['is_required'])

        if not update_data:
            return jsonify({
                'success': False,
                'error': 'No fields to update'
            }), 400

        # Add updated timestamp
        update_data['updated_at'] = datetime.utcnow().isoformat()

        # Update task
        result = supabase.table('user_quest_tasks')\
            .update(update_data)\
            .eq('id', task_id)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to update task'
            }), 500

        return jsonify({
            'success': True,
            'task': result.data[0],
            'message': 'Task updated successfully'
        })

    except Exception as e:
        logger.error(f"Error updating student task: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to update task: {str(e)}'
        }), 500

@bp.route('/<target_user_id>/quests/<quest_id>/tasks/<task_id>', methods=['DELETE'])
@require_role('advisor', 'admin')
def delete_student_task(user_id, target_user_id, quest_id, task_id):
    """
    Delete a task from a specific student's quest.
    Advisors can only delete tasks for their assigned students.
    Admins can delete any student's tasks.
    Cannot delete completed tasks.
    """
    supabase = get_supabase_admin_client()

    try:
        # Check authorization for advisors
        user = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        user_role = user.data['role']
        if user_role == 'advisor' and not is_advisor_for_student(user_id, target_user_id):
            return jsonify({
                'success': False,
                'error': 'You do not have permission to delete this student\'s tasks'
            }), 403

        # Verify task exists and belongs to this student's quest
        task = supabase.table('user_quest_tasks')\
            .select('*')\
            .eq('id', task_id)\
            .eq('user_id', target_user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not task.data:
            return jsonify({
                'success': False,
                'error': 'Task not found or does not belong to this student\'s quest'
            }), 404

        # Check if task is already completed
        completion = supabase.table('quest_task_completions')\
            .select('id')\
            .eq('task_id', task_id)\
            .execute()

        if completion.data:
            return jsonify({
                'success': False,
                'error': 'Cannot delete a completed task. Completed tasks must remain for portfolio integrity.'
            }), 400

        # Delete task
        result = supabase.table('user_quest_tasks')\
            .delete()\
            .eq('id', task_id)\
            .execute()

        return jsonify({
            'success': True,
            'message': 'Task deleted successfully'
        })

    except Exception as e:
        logger.error(f"Error deleting student task: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to delete task: {str(e)}'
        }), 500
