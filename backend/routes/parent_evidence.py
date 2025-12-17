"""
Parent Evidence Upload API routes.
Allows parents to upload evidence on behalf of their students for tasks.
Parents cannot start quests - only upload evidence for active tasks.

NOTE: Admin client usage justified throughout this file for cross-user operations.
Parents uploading evidence for students requires elevated privileges to write to student records.
All endpoints verify parent-student link before allowing operations.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
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
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError, AuthorizationError, NotFoundError
import uuid
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

bp = Blueprint('parent_evidence', __name__, url_prefix='/api/parent')


def verify_parent_access(parent_user_id, student_user_id):
    """Helper function to verify parent has active access to student"""
    supabase = get_supabase_admin_client()

    # Verify parent role
    user_response = supabase.table('users').select('role').eq('id', parent_user_id).execute()
    if not user_response.data or user_response.data[0].get('role') != 'parent':
        raise AuthorizationError("Only parent accounts can access this endpoint")

    # Verify active link
    link_response = supabase.table('parent_student_links').select('id').eq(
        'parent_user_id', parent_user_id
    ).eq('student_user_id', student_user_id).eq('status', 'active').execute()

    if not link_response.data:
        raise AuthorizationError("You do not have access to this student's data")

    return True


# New endpoint for inline evidence upload (January 2025)
@bp.route('/evidence/upload', methods=['POST'])
@require_auth
def upload_evidence_inline(user_id):
    """
    Upload evidence for a student's task (parent-only, no task completion).

    Parent must be linked to student or be parent of dependent.
    Evidence is added as a block to the task's evidence document.
    Student can edit/remove evidence before completing task.

    Required form fields:
        student_id: Student user ID
        task_id: User quest task ID
        evidence_type: text, link, image, video, document

    Optional form fields (based on type):
        text_content: For text type
        url: For link/video/image/document (URL mode)
        title: For link type
        file: For image/document (file upload mode)
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get request data
        student_id = request.form.get('student_id')
        task_id = request.form.get('task_id')
        evidence_type = request.form.get('evidence_type')

        if not all([student_id, task_id, evidence_type]):
            return jsonify({
                'success': False,
                'error': 'Missing required fields: student_id, task_id, evidence_type'
            }), 400

        # Verify parent has permission (linked student or dependent)
        parent_check = admin_client.rpc('verify_parent_student_access', {
            'p_parent_id': user_id,
            'p_student_id': student_id
        }).execute()

        if not parent_check.data or not parent_check.data[0].get('has_access'):
            logger.warning(f"Parent {user_id[:8]} attempted unauthorized access to student {student_id[:8]}")
            return jsonify({
                'success': False,
                'error': 'You do not have permission to access this student'
            }), 403

        # Verify task belongs to student
        task_check = admin_client.table('user_quest_tasks')\
            .select('id, user_id, title')\
            .eq('id', task_id)\
            .eq('user_id', student_id)\
            .single()\
            .execute()

        if not task_check.data:
            return jsonify({
                'success': False,
                'error': 'Task not found or does not belong to student'
            }), 404

        # Check if task already completed
        completion_check = admin_client.table('quest_task_completions')\
            .select('id')\
            .eq('user_quest_task_id', task_id)\
            .eq('user_id', student_id)\
            .execute()

        if completion_check.data:
            return jsonify({
                'success': False,
                'error': 'Cannot add evidence to completed tasks'
            }), 400

        # Prepare evidence content based on type
        evidence_content = {}
        file_url = None

        if evidence_type == 'text':
            evidence_content['text'] = request.form.get('text_content', '')
            if not evidence_content['text'].strip():
                return jsonify({
                    'success': False,
                    'error': 'Text content is required'
                }), 400

        elif evidence_type in ['link', 'video']:
            evidence_content['url'] = request.form.get('url', '')
            evidence_content['title'] = request.form.get('title', '')
            if not evidence_content['url'].strip():
                return jsonify({
                    'success': False,
                    'error': 'URL is required'
                }), 400

        elif evidence_type in ['image', 'document']:
            # Check if file upload or URL
            if 'file' in request.files:
                file = request.files['file']
                if file.filename == '':
                    return jsonify({
                        'success': False,
                        'error': 'No file selected'
                    }), 400

                # Validate file
                from werkzeug.utils import secure_filename
                filename = secure_filename(file.filename)
                ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

                allowed_image_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
                allowed_document_extensions = {'pdf', 'doc', 'docx', 'txt'}

                if evidence_type == 'image':
                    allowed_extensions = allowed_image_extensions
                    max_size = 10 * 1024 * 1024  # 10MB
                elif evidence_type == 'document':
                    allowed_extensions = allowed_document_extensions
                    max_size = 25 * 1024 * 1024  # 25MB

                if ext not in allowed_extensions:
                    return jsonify({
                        'success': False,
                        'error': f'Invalid file extension. Allowed: {", ".join(allowed_extensions)}'
                    }), 400

                # Check file size
                import os
                file.seek(0, os.SEEK_END)
                file_size = file.tell()
                file.seek(0)

                if file_size > max_size:
                    return jsonify({
                        'success': False,
                        'error': f'File too large. Maximum size: {max_size // (1024*1024)}MB'
                    }), 400

                # Upload to Supabase storage
                try:
                    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                    storage_path = f"parent-evidence/{student_id}/{task_id}_{timestamp}_{filename}"

                    file_content = file.read()
                    file.seek(0)

                    storage_response = admin_client.storage.from_('quest-evidence').upload(
                        path=storage_path,
                        file=file_content,
                        file_options={"content-type": file.content_type or 'application/octet-stream'}
                    )

                    file_url = admin_client.storage.from_('quest-evidence').get_public_url(storage_path)
                    evidence_content['url'] = file_url
                    evidence_content['filename'] = filename
                    evidence_content['file_size'] = file_size

                except Exception as e:
                    logger.error(f"Failed to upload file to storage: {e}")
                    return jsonify({
                        'success': False,
                        'error': 'Failed to upload file. Please try again.'
                    }), 500
            else:
                # URL mode
                evidence_content['url'] = request.form.get('url', '')
                if not evidence_content['url'].strip():
                    return jsonify({
                        'success': False,
                        'error': 'URL or file is required'
                    }), 400

        # Get or create evidence document for task
        evidence_doc = admin_client.table('evidence_documents')\
            .select('id, blocks')\
            .eq('user_quest_task_id', task_id)\
            .eq('user_id', student_id)\
            .execute()

        if evidence_doc.data:
            # Append to existing document
            doc_id = evidence_doc.data[0]['id']
            existing_blocks = evidence_doc.data[0].get('blocks', [])

            new_block = {
                'id': f"block_{len(existing_blocks) + 1}",
                'type': evidence_type,
                'content': evidence_content,
                'uploaded_by_parent': True,
                'uploaded_by': user_id,
                'uploaded_at': datetime.utcnow().isoformat()
            }

            existing_blocks.append(new_block)

            admin_client.table('evidence_documents')\
                .update({
                    'blocks': existing_blocks,
                    'updated_at': datetime.utcnow().isoformat()
                })\
                .eq('id', doc_id)\
                .execute()
        else:
            # Create new evidence document
            new_block = {
                'id': 'block_1',
                'type': evidence_type,
                'content': evidence_content,
                'uploaded_by_parent': True,
                'uploaded_by': user_id,
                'uploaded_at': datetime.utcnow().isoformat()
            }

            admin_client.table('evidence_documents')\
                .insert({
                    'user_id': student_id,
                    'user_quest_task_id': task_id,
                    'blocks': [new_block],
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat()
                })\
                .execute()

        logger.info(f"Parent {user_id[:8]} uploaded {evidence_type} evidence for student {student_id[:8]} task {task_id[:8]}")

        return jsonify({
            'success': True,
            'message': 'Evidence uploaded successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error uploading parent evidence: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to upload evidence'
        }), 500


# Legacy endpoint (kept for backwards compatibility)
@bp.route('/evidence/<student_id>', methods=['POST'])
@require_auth
def upload_parent_evidence(user_id, student_id):
    """
    Parent uploads evidence for student task.
    Requires: quest_id, task_id, file_url, description
    Evidence is marked as 'uploaded by parent' and requires student approval.
    """
    try:
        verify_parent_access(user_id, student_id)

        data = request.get_json()
        quest_id = data.get('quest_id')
        task_id = data.get('task_id')
        file_url = data.get('file_url')
        description = data.get('description', '').strip()

        if not all([quest_id, task_id, file_url]):
            raise ValidationError("quest_id, task_id, and file_url are required")

        if not description:
            raise ValidationError("Description is required")

        supabase = get_supabase_admin_client()

        # Verify task exists and belongs to an active quest for this student
        task_response = supabase.table('user_quest_tasks').select('''
            id, quest_id, title
        ''').eq('id', task_id).eq('user_id', student_id).eq('quest_id', quest_id).execute()

        if not task_response.data:
            raise NotFoundError("Task not found for this student or quest")

        task = task_response.data[0]

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

        # Create parent evidence upload record
        evidence_data = {
            'id': str(uuid.uuid4()),
            'parent_user_id': user_id,
            'student_user_id': student_id,
            'task_id': task_id,
            'file_url': file_url,
            'description': description,
            'uploaded_at': datetime.utcnow().isoformat(),
            'student_approved': False
        }

        supabase.table('parent_evidence_uploads').insert(evidence_data).execute()

        logger.info(f"Parent {user_id} uploaded evidence for student {student_id} task {task_id}")

        # TODO: Send notification to student about pending evidence approval

        return jsonify({
            'message': 'Evidence uploaded successfully. Awaiting student approval.',
            'evidence_id': evidence_data['id'],
            'task_title': task['title'],
            'status': 'pending_approval'
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error uploading parent evidence: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to upload evidence'}), 500


@bp.route('/evidence-pending/<student_id>', methods=['GET'])
@require_auth
def get_pending_evidence(user_id, student_id):
    """
    Get pending parent-uploaded evidence for student.
    Can be called by either parent or student.
    """
    try:
        supabase = get_supabase_admin_client()

        # Check if requester is parent or student
        user_response = supabase.table('users').select('role').eq('id', user_id).execute()
        if not user_response.data:
            raise NotFoundError("User not found")

        user_role = user_response.data[0].get('role')

        if user_role == 'parent':
            verify_parent_access(user_id, student_id)
        elif user_id != student_id:
            raise AuthorizationError("You can only view your own pending evidence")

        # Get pending evidence
        evidence_response = supabase.table('parent_evidence_uploads').select('''
            id, parent_user_id, task_id, file_url, description, uploaded_at, student_approved
        ''').eq('student_user_id', student_id).eq('student_approved', False).execute()

        if not evidence_response.data:
            return jsonify({'pending_evidence': []}), 200

        # Get task and parent details
        task_ids = list(set(e['task_id'] for e in evidence_response.data))
        parent_ids = list(set(e['parent_user_id'] for e in evidence_response.data))

        tasks_response = supabase.table('user_quest_tasks').select('''
            id, title, quest_id,
            quests!inner(title)
        ''').eq('user_id', student_id).in_('id', task_ids).execute()

        parents_response = supabase.table('users').select('''
            id, first_name, last_name
        ''').in_('id', parent_ids).execute()

        # Build maps
        tasks_map = {t['id']: t for t in tasks_response.data}
        parents_map = {p['id']: p for p in parents_response.data}

        # Build response
        pending_evidence = []
        for evidence in evidence_response.data:
            task = tasks_map.get(evidence['task_id'])
            parent = parents_map.get(evidence['parent_user_id'])

            if task and parent:
                pending_evidence.append({
                    'evidence_id': evidence['id'],
                    'task_id': evidence['task_id'],
                    'task_title': task['title'],
                    'quest_id': task['quest_id'],
                    'quest_title': task['quests']['title'],
                    'file_url': evidence['file_url'],
                    'description': evidence['description'],
                    'uploaded_by': f"{parent.get('first_name', '')} {parent.get('last_name', '')}".strip(),
                    'uploaded_at': evidence['uploaded_at']
                })

        return jsonify({'pending_evidence': pending_evidence}), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting pending evidence: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get pending evidence'}), 500


@bp.route('/evidence/<evidence_id>/approve', methods=['POST'])
@require_auth
def approve_parent_evidence(user_id, evidence_id):
    """
    Student approves parent-uploaded evidence.
    This completes the task with the parent's evidence.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get evidence record
        evidence_response = supabase.table('parent_evidence_uploads').select('''
            id, parent_user_id, student_user_id, task_id, file_url, description, student_approved
        ''').eq('id', evidence_id).execute()

        if not evidence_response.data:
            raise NotFoundError("Evidence not found")

        evidence = evidence_response.data[0]

        # Verify student owns this evidence
        if evidence['student_user_id'] != user_id:
            raise AuthorizationError("You can only approve evidence uploaded for you")

        # Check if already approved
        if evidence['student_approved']:
            return jsonify({'message': 'Evidence already approved'}), 200

        # Get task details
        task_response = supabase.table('user_quest_tasks').select('''
            id, quest_id, xp_value, pillar, title
        ''').eq('id', evidence['task_id']).eq('user_id', user_id).execute()

        if not task_response.data:
            raise NotFoundError("Task not found")

        task = task_response.data[0]

        # Check if task is already completed
        completion_check = supabase.table('quest_task_completions').select('id').eq(
            'user_id', user_id
        ).eq('task_id', evidence['task_id']).execute()

        if completion_check.data:
            # Mark evidence as approved but don't create duplicate completion
            supabase.table('parent_evidence_uploads').update({
                'student_approved': True,
                'approved_at': datetime.utcnow().isoformat()
            }).eq('id', evidence_id).execute()

            return jsonify({'message': 'Evidence approved, but task was already completed'}), 200

        # Mark evidence as approved
        supabase.table('parent_evidence_uploads').update({
            'student_approved': True,
            'approved_at': datetime.utcnow().isoformat()
        }).eq('id', evidence_id).execute()

        # Create task completion with parent evidence
        completion_data = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'quest_id': task['quest_id'],
            'task_id': task['id'],
            'evidence_url': evidence['file_url'],
            'evidence_text': f"[Uploaded by parent]\n\n{evidence['description']}",
            'completed_at': datetime.utcnow().isoformat(),
            'xp_awarded': task.get('xp_value', 0)
        }

        supabase.table('quest_task_completions').insert(completion_data).execute()

        # Award XP to user_skill_xp
        if task.get('xp_value', 0) > 0 and task.get('pillar'):
            try:
                supabase.rpc('add_user_skill_xp', {
                    'p_user_id': user_id,
                    'p_pillar': task['pillar'],
                    'p_xp_amount': task['xp_value']
                }).execute()
            except Exception as xp_error:
                logger.warning(f"Failed to award XP: {xp_error}")

        logger.info(f"Student {user_id} approved parent evidence {evidence_id} and completed task {task['id']}")

        return jsonify({
            'message': 'Evidence approved and task completed successfully',
            'task_title': task['title'],
            'xp_awarded': task.get('xp_value', 0)
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error approving parent evidence: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to approve evidence'}), 500


@bp.route('/evidence/<evidence_id>/reject', methods=['POST'])
@require_auth
def reject_parent_evidence(user_id, evidence_id):
    """
    Student rejects parent-uploaded evidence.
    This deletes the evidence record.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get evidence record
        evidence_response = supabase.table('parent_evidence_uploads').select('''
            id, student_user_id
        ''').eq('id', evidence_id).execute()

        if not evidence_response.data:
            raise NotFoundError("Evidence not found")

        evidence = evidence_response.data[0]

        # Verify student owns this evidence
        if evidence['student_user_id'] != user_id:
            raise AuthorizationError("You can only reject evidence uploaded for you")

        # Delete evidence record
        supabase.table('parent_evidence_uploads').delete().eq('id', evidence_id).execute()

        logger.info(f"Student {user_id} rejected parent evidence {evidence_id}")

        return jsonify({'message': 'Evidence rejected and removed'}), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error rejecting parent evidence: {str(e)}")
        return jsonify({'error': 'Failed to reject evidence'}), 500
