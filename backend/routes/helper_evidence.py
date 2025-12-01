"""
Helper Evidence Upload Routes - Advisors and Parents uploading evidence for students
Allows advisors and parents to add evidence blocks to student tasks without completing them.
Students retain full control and can edit/delete helper-uploaded evidence.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError, AuthorizationError, NotFoundError
import uuid
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('helper_evidence', __name__, url_prefix='/api/evidence/helper')


def verify_advisor_access(advisor_user_id, student_user_id):
    """Verify advisor has access to student"""
    supabase = get_supabase_admin_client()

    # Verify advisor role
    user_response = supabase.table('users').select('role').eq('id', advisor_user_id).execute()
    if not user_response.data:
        raise AuthorizationError("User not found")

    user_role = user_response.data[0].get('role')
    if user_role not in ['advisor', 'admin']:
        raise AuthorizationError("Only advisors can access this endpoint")

    # Verify advisor-student link
    link_response = supabase.table('advisor_students').select('id').eq(
        'advisor_id', advisor_user_id
    ).eq('student_id', student_user_id).execute()

    if not link_response.data:
        raise AuthorizationError("You do not have access to this student's data")

    return True


def verify_parent_access(parent_user_id, student_user_id):
    """Verify parent has active access to student"""
    supabase = get_supabase_admin_client()

    # Verify parent role
    user_response = supabase.table('users').select('role').eq('id', parent_user_id).execute()
    if not user_response.data:
        raise AuthorizationError("User not found")

    user_role = user_response.data[0].get('role')
    if user_role not in ['parent', 'admin']:
        raise AuthorizationError("Only parents can access this endpoint")

    # Verify active link
    link_response = supabase.table('parent_student_links').select('id').eq(
        'parent_user_id', parent_user_id
    ).eq('student_user_id', student_user_id).eq('status', 'active').execute()

    if not link_response.data:
        raise AuthorizationError("You do not have access to this student's data")

    return True


def get_or_create_evidence_document(supabase, student_user_id, task_id, quest_id):
    """Get existing evidence document or create a new one"""
    # Check if document exists
    document_response = supabase.table('user_task_evidence_documents')\
        .select('*')\
        .eq('user_id', student_user_id)\
        .eq('task_id', task_id)\
        .execute()

    if document_response.data:
        return document_response.data[0]['id']

    # Create new document
    document_data = {
        'user_id': student_user_id,
        'quest_id': quest_id,
        'task_id': task_id,
        'status': 'draft'
    }

    document_insert = supabase.table('user_task_evidence_documents')\
        .insert(document_data)\
        .execute()

    if not document_insert.data:
        raise Exception("Failed to create evidence document")

    return document_insert.data[0]['id']


@bp.route('/upload-for-student', methods=['POST'])
@require_auth
def upload_evidence_for_student(user_id):
    """
    Advisor or parent uploads evidence block for a student's task.
    Evidence is added as a draft block - student must still complete the task.

    Request body:
    {
        "student_id": "uuid",
        "task_id": "uuid",
        "block_type": "text|link|image|video|document",
        "content": {...block content...}
    }
    """
    try:
        supabase = get_supabase_admin_client()

        data = request.get_json()
        student_id = data.get('student_id')
        task_id = data.get('task_id')
        block_type = data.get('block_type')
        content = data.get('content', {})

        if not all([student_id, task_id, block_type]):
            raise ValidationError("student_id, task_id, and block_type are required")

        if block_type not in ['text', 'link', 'image', 'video', 'document']:
            raise ValidationError("Invalid block_type")

        # Get user role to determine access type
        user_response = supabase.table('users').select('role').eq('id', user_id).execute()
        if not user_response.data:
            raise NotFoundError("User not found")

        user_role = user_response.data[0].get('role')

        # Verify access based on role
        if user_role in ['advisor', 'admin']:
            verify_advisor_access(user_id, student_id)
            uploader_role = 'advisor'
        elif user_role == 'parent':
            verify_parent_access(user_id, student_id)
            uploader_role = 'parent'
        else:
            raise AuthorizationError("Only advisors and parents can upload evidence for students")

        # Verify task exists and belongs to student
        task_response = supabase.table('user_quest_tasks').select('''
            id, quest_id, title, user_id
        ''').eq('id', task_id).eq('user_id', student_id).execute()

        if not task_response.data:
            raise NotFoundError("Task not found for this student")

        task = task_response.data[0]
        quest_id = task['quest_id']

        # Verify quest is active
        quest_response = supabase.table('user_quests').select('''
            quest_id, is_active, completed_at
        ''').eq('user_id', student_id).eq('quest_id', quest_id).execute()

        if not quest_response.data:
            raise NotFoundError("Student is not enrolled in this quest")

        user_quest = quest_response.data[0]

        if not user_quest.get('is_active') or user_quest.get('completed_at'):
            raise ValidationError("Quest is not active or already completed")

        # Check if task is already completed
        completion_check = supabase.table('quest_task_completions').select('id').eq(
            'user_id', student_id
        ).eq('task_id', task_id).execute()

        if completion_check.data:
            raise ValidationError("Task is already completed")

        # Get or create evidence document
        document_id = get_or_create_evidence_document(supabase, student_id, task_id, quest_id)

        # Get current max order_index
        blocks_response = supabase.table('evidence_document_blocks')\
            .select('order_index')\
            .eq('document_id', document_id)\
            .order('order_index', desc=True)\
            .limit(1)\
            .execute()

        next_order = 0
        if blocks_response.data:
            next_order = blocks_response.data[0]['order_index'] + 1

        # Create evidence block
        block_data = {
            'id': str(uuid.uuid4()),
            'document_id': document_id,
            'block_type': block_type,
            'content': content,
            'order_index': next_order,
            'is_private': False,
            'uploaded_by_user_id': user_id,
            'uploaded_by_role': uploader_role
        }

        block_insert = supabase.table('evidence_document_blocks')\
            .insert(block_data)\
            .execute()

        if not block_insert.data:
            raise Exception("Failed to create evidence block")

        # Get uploader name for response
        uploader_response = supabase.table('users').select('first_name, last_name').eq('id', user_id).execute()
        uploader_name = "Unknown"
        if uploader_response.data:
            first = uploader_response.data[0].get('first_name', '')
            last = uploader_response.data[0].get('last_name', '')
            uploader_name = f"{first} {last}".strip()

        logger.info(f"{uploader_role.capitalize()} {user_id} uploaded evidence block for student {student_id} task {task_id}")

        return jsonify({
            'success': True,
            'message': f'Evidence added successfully by {uploader_role}',
            'block_id': block_data['id'],
            'document_id': document_id,
            'task_title': task['title'],
            'uploaded_by': uploader_name,
            'uploader_role': uploader_role
        }), 201

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error uploading helper evidence: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to upload evidence'}), 500


@bp.route('/student-tasks/<student_id>', methods=['GET'])
@require_auth
def get_student_tasks_for_evidence(user_id, student_id):
    """
    Get list of active tasks for a student (for advisors/parents to add evidence).
    Only returns tasks from active quests that are not yet completed.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user role
        user_response = supabase.table('users').select('role').eq('id', user_id).execute()
        if not user_response.data:
            raise NotFoundError("User not found")

        user_role = user_response.data[0].get('role')

        # Verify access based on role
        if user_role in ['advisor', 'admin']:
            verify_advisor_access(user_id, student_id)
        elif user_role == 'parent':
            verify_parent_access(user_id, student_id)
        else:
            raise AuthorizationError("Only advisors and parents can access this endpoint")

        # Get active quests
        active_quests = supabase.table('user_quests').select('''
            quest_id,
            quests!inner(title, image_url)
        ''').eq('user_id', student_id).eq('is_active', True).execute()

        if not active_quests.data:
            return jsonify({
                'success': True,
                'quests': []
            }), 200

        quest_ids = [q['quest_id'] for q in active_quests.data]

        # Get tasks for these quests
        tasks_response = supabase.table('user_quest_tasks').select('''
            id, quest_id, title, description, pillar, xp_value, order_index
        ''').eq('user_id', student_id).in_('quest_id', quest_ids).order('order_index').execute()

        # Get completed task IDs
        completed_response = supabase.table('quest_task_completions').select('task_id').eq(
            'user_id', student_id
        ).in_('quest_id', quest_ids).execute()

        completed_task_ids = {c['task_id'] for c in completed_response.data}

        # Build quest structure with tasks
        quests_with_tasks = []
        for quest in active_quests.data:
            quest_tasks = [
                {
                    'id': t['id'],
                    'title': t['title'],
                    'description': t['description'],
                    'pillar': t['pillar'],
                    'xp_value': t['xp_value'],
                    'completed': t['id'] in completed_task_ids
                }
                for t in tasks_response.data
                if t['quest_id'] == quest['quest_id']
            ]

            quests_with_tasks.append({
                'quest_id': quest['quest_id'],
                'quest_title': quest['quests']['title'],
                'quest_image': quest['quests'].get('image_url'),
                'tasks': quest_tasks,
                'active_task_count': len([t for t in quest_tasks if not t['completed']])
            })

        return jsonify({
            'success': True,
            'quests': quests_with_tasks
        }), 200

    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting student tasks: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to get student tasks'}), 500
