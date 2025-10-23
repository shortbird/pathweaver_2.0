"""
Admin Student Task Management Routes

Handles advisor/admin creation of tasks for individual student quest instances.
Supports both creating custom tasks and copying from existing task templates.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.pillar_utils import is_valid_pillar
from utils.pillar_mapping import normalize_pillar_name
from utils.school_subjects import validate_school_subjects
from datetime import datetime
import json

bp = Blueprint('admin_student_task_management', __name__, url_prefix='/api/admin/users')

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

            # Calculate total XP from subject_xp_distribution
            subject_xp_dist = template.data.get('subject_xp_distribution', {})
            total_xp = sum(subject_xp_dist.values()) if subject_xp_dist else template.data.get('xp_value', 100)

            task_data = {
                'user_id': target_user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': template.data['title'],
                'description': template.data.get('description', ''),
                'pillar': template.data['pillar'],
                'subject_xp_distribution': subject_xp_dist or {"Electives": total_xp},
                'xp_value': int(total_xp),
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

            # Validate subject XP distribution
            subject_xp_distribution = data.get('subject_xp_distribution', {})
            if not subject_xp_distribution or sum(subject_xp_distribution.values()) <= 0:
                return jsonify({
                    'success': False,
                    'error': 'At least one subject must have XP assigned'
                }), 400

            # Calculate total XP
            total_xp = sum(subject_xp_distribution.values())

            task_data = {
                'user_id': target_user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': data['title'].strip(),
                'description': data.get('description', '').strip(),
                'pillar': normalized_pillar,
                'subject_xp_distribution': subject_xp_distribution,
                'xp_value': int(total_xp),
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
        print(f"Error creating student task: {str(e)}")
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
            # Calculate total XP from subject_xp_distribution
            subject_xp_dist = template.get('subject_xp_distribution', {})
            total_xp = sum(subject_xp_dist.values()) if subject_xp_dist else template.get('xp_value', 100)

            task_data = {
                'user_id': target_user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': template['title'],
                'description': template.get('description', ''),
                'pillar': template['pillar'],
                'subject_xp_distribution': subject_xp_dist or {"Electives": total_xp},
                'xp_value': int(total_xp),
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
        print(f"Error batch copying tasks: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to copy tasks: {str(e)}'
        }), 500
