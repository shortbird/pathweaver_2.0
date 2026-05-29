"""
Helper Evidence Upload Routes - Advisors and Parents uploading evidence for students

Allows advisors and parents to add evidence blocks to student tasks without completing them.
Students retain full control and can edit/delete helper-uploaded evidence.

REPOSITORY MIGRATION: COMPLETE
- Uses AdvisorRepository for advisor-student access verification
- Uses ParentRepository for parent-student access verification
- Uses EvidenceDocumentRepository for evidence operations
- Uses UserRepository for user lookups
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.roles import get_effective_role  # A2: org_managed users have actual role in org_role
from middleware.rate_limiter import rate_limit
from middleware.error_handler import ValidationError, AuthorizationError, NotFoundError
from repositories import (
    UserRepository,
    TaskRepository,
    QuestRepository,
    EvidenceDocumentRepository,
    ParentRepository,
    AdvisorRepository
)

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('helper_evidence', __name__, url_prefix='/api/evidence/helper')


def verify_advisor_access(advisor_user_id, student_user_id):
    """Verify advisor has access to student.

    Superadmins are granted universal access (matches the read-side checks
    used elsewhere). Without this bypass, a superadmin demo account hits the
    advisor branch of `_verify_helper_can_upload_for_task` and fails the
    advisor_student_assignments lookup even when the same account could
    successfully read the kid's quest.
    """
    # Admin client: Cross-user access verification (ADR-002, Rule 5)
    user_repo = UserRepository()
    advisor_repo = AdvisorRepository()

    # Verify advisor role (A2: get_effective_role resolves org_managed → real role)
    user = user_repo.find_by_id(advisor_user_id)
    if not user:
        raise AuthorizationError("User not found")

    user_role = get_effective_role(user)
    if user_role not in ['advisor', 'org_admin', 'superadmin']:
        raise AuthorizationError("Only advisors can access this endpoint")

    # Superadmin: universal access, no link check needed.
    if user_role == 'superadmin':
        return True

    # Verify advisor-student link using repository
    if not advisor_repo.verify_student_access(advisor_user_id, student_user_id):
        raise AuthorizationError("You do not have access to this student's data")

    return True


def verify_parent_access(parent_user_id, student_user_id):
    """Verify parent has active access to student.

    Superadmins are granted universal access (matches the read-side check in
    `routes/parent/dashboard_overview.py:verify_parent_access`). Without this
    bypass, superadmin demo accounts can read a kid's quest but can't attach
    evidence — the two sides of the same flow diverge.
    """
    # admin client justified: parent-access verification helper; reads users + parent_student_links to validate cross-user access
    user_repo = UserRepository()
    supabase = get_supabase_admin_client()
    parent_repo = ParentRepository(client=supabase)

    # Verify parent role (A2: get_effective_role resolves org_managed → real role)
    user = user_repo.find_by_id(parent_user_id)
    if not user:
        raise AuthorizationError("User not found")

    user_role = get_effective_role(user)
    if user_role not in ['parent', 'superadmin']:
        raise AuthorizationError("Only parents can access this endpoint")

    # Superadmin: universal access, no link check needed.
    if user_role == 'superadmin':
        return True

    # Verify parent-student link
    is_linked = parent_repo.is_linked(parent_user_id, student_user_id)
    if not is_linked:
        raise AuthorizationError("You do not have access to this student's data")

    return True


def get_or_create_evidence_document(student_user_id, task_id, quest_id):
    """Get existing evidence document ID or create a new one"""
    # admin client justified: cross-user evidence document creation helper; access already verified by caller (parent/advisor)
    supabase = get_supabase_admin_client()
    evidence_repo = EvidenceDocumentRepository()
    evidence_repo._client = supabase  # Use admin client since we already verified access

    return evidence_repo.get_or_create_document(student_user_id, task_id, quest_id)


@bp.route('/upload-for-student', methods=['POST'])
@rate_limit(limit=30, per=3600)  # CVE-OPTIO-2025-017 FIX: 30 uploads per hour for helpers
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
        # Admin client: Parent/advisor cross-user access (ADR-002, Rule 5)
        # admin client justified: advisor/parent uploads evidence onto student tasks; cross-user writes gated by helper relationship verification (advisor_student_assignments / parent->child)
        supabase = get_supabase_admin_client()
        user_repo = UserRepository()
        task_repo = TaskRepository()
        task_repo._client = supabase
        evidence_repo = EvidenceDocumentRepository()
        evidence_repo._client = supabase

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
        user = user_repo.find_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        user_role = get_effective_role(user)  # A2: resolves org_managed → real role

        # Verify access based on role
        if user_role in ['advisor', 'org_admin', 'superadmin']:
            verify_advisor_access(user_id, student_id)
            uploader_role = 'advisor'
        elif user_role == 'parent':
            verify_parent_access(user_id, student_id)
            uploader_role = 'parent'
        else:
            raise AuthorizationError("Only advisors and parents can upload evidence for students")

        # Verify task exists and belongs to student
        # Note: Using direct query for now as task_repo doesn't have a method to verify task ownership with quest details
        task_response = supabase.table('user_quest_tasks').select('''
            id, quest_id, title, user_id
        ''').eq('id', task_id).eq('user_id', student_id).execute()

        if not task_response.data:
            raise NotFoundError("Task not found for this student")

        task = task_response.data[0]
        quest_id = task['quest_id']

        # Verify quest is active
        # Note: Using direct query for complex filtering (active quest check)
        quest_response = supabase.table('user_quests').select('''
            quest_id, is_active, completed_at
        ''').eq('user_id', student_id).eq('quest_id', quest_id).execute()

        if not quest_response.data:
            raise NotFoundError("Student is not enrolled in this quest")

        user_quest = quest_response.data[0]

        if not user_quest.get('is_active') or user_quest.get('completed_at'):
            raise ValidationError("Quest is not active or already completed")

        # Get or create evidence document using repository
        document_id = get_or_create_evidence_document(student_id, task_id, quest_id)

        # Get next block order index using repository
        next_order = evidence_repo.get_next_block_order_index(document_id)

        # Create helper evidence block using repository
        created_block = evidence_repo.create_helper_block(
            document_id=document_id,
            block_type=block_type,
            content=content,
            order_index=next_order,
            uploaded_by_user_id=user_id,
            uploaded_by_role=uploader_role,
            is_private=False
        )

        # Get uploader name for response using repository
        uploader_user = user_repo.find_by_id(user_id)
        uploader_name = "Unknown"
        if uploader_user:
            first = uploader_user.get('first_name', '')
            last = uploader_user.get('last_name', '')
            uploader_name = f"{first} {last}".strip()

        # Create a learning event so this appears in the student's journal and activity feed
        try:
            _create_helper_learning_event(
                supabase, student_id, user_id, uploader_role,
                quest_id, task['id'], task['title'], block_type, content
            )
        except Exception as le_err:
            # Non-fatal: evidence block was created successfully, journal entry is supplementary
            logger.warning(f"Failed to create learning event for helper evidence: {le_err}")

        logger.info(f"{uploader_role.capitalize()} {user_id} uploaded evidence block for student {student_id} task {task_id}")

        return jsonify({
            'success': True,
            'message': f'Evidence added successfully by {uploader_role}',
            'block_id': created_block['id'],
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
        return jsonify({'success': False, 'error': 'Failed to upload evidence'}), 500


@bp.route('/upload-for-student/batch', methods=['POST'])
@rate_limit(limit=30, per=3600)
@require_auth
def upload_evidence_batch(user_id):
    """
    Batch variant of /upload-for-student: a parent/advisor uploads N blocks
    in a single request. Verification (role + relationship + task ownership
    + quest active) runs ONCE, blocks are created in one insert, and a
    single learning_event is recorded for the whole batch (rather than N
    learning_events).

    Request body:
    {
        "student_id": "uuid",
        "task_id": "uuid",
        "blocks": [{ "block_type": "...", "content": {...} }, ...]
    }
    """
    try:
        supabase = get_supabase_admin_client()
        user_repo = UserRepository()

        data = request.get_json() or {}
        student_id = data.get('student_id')
        task_id = data.get('task_id')
        blocks = data.get('blocks', [])

        if not student_id or not task_id:
            raise ValidationError("student_id and task_id are required")
        if not isinstance(blocks, list) or not blocks:
            raise ValidationError("blocks must be a non-empty array")
        if len(blocks) > 25:
            raise ValidationError("blocks: maximum 25 per batch")

        # Validate every block shape up front so we don't half-commit.
        for i, b in enumerate(blocks):
            if not isinstance(b, dict):
                raise ValidationError(f"blocks[{i}]: must be an object")
            if b.get('block_type') not in ('text', 'link', 'image', 'video', 'document'):
                raise ValidationError(f"blocks[{i}]: invalid block_type")

        # Role + relationship check ONCE (was per-block in the single-shot
        # endpoint — N round trips on a 5-block save).
        user = user_repo.find_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        user_role = get_effective_role(user)
        if user_role in ['advisor', 'org_admin', 'superadmin']:
            verify_advisor_access(user_id, student_id)
            uploader_role = 'advisor'
        elif user_role == 'parent':
            verify_parent_access(user_id, student_id)
            uploader_role = 'parent'
        else:
            raise AuthorizationError("Only advisors and parents can upload evidence for students")

        task_response = supabase.table('user_quest_tasks') \
            .select('id, quest_id, title, user_id') \
            .eq('id', task_id).eq('user_id', student_id).execute()
        if not task_response.data:
            raise NotFoundError("Task not found for this student")
        task = task_response.data[0]
        quest_id = task['quest_id']

        quest_response = supabase.table('user_quests') \
            .select('quest_id, is_active, completed_at') \
            .eq('user_id', student_id).eq('quest_id', quest_id).execute()
        if not quest_response.data:
            raise NotFoundError("Student is not enrolled in this quest")
        user_quest = quest_response.data[0]
        if not user_quest.get('is_active') or user_quest.get('completed_at'):
            raise ValidationError("Quest is not active or already completed")

        document_id = get_or_create_evidence_document(student_id, task_id, quest_id)

        evidence_repo = EvidenceDocumentRepository()
        evidence_repo._client = supabase
        next_order = evidence_repo.get_next_block_order_index(document_id)

        created_ids = []
        for offset, b in enumerate(blocks):
            created = evidence_repo.create_helper_block(
                document_id=document_id,
                block_type=b['block_type'],
                content=b.get('content', {}),
                order_index=next_order + offset,
                uploaded_by_user_id=user_id,
                uploaded_by_role=uploader_role,
                is_private=False,
            )
            created_ids.append(created['id'])

        # ONE learning event for the whole batch (was N — duplicate journal
        # rows for every parent save). Use the first block to derive the
        # description.
        try:
            first = blocks[0]
            _create_helper_learning_event(
                supabase, student_id, user_id, uploader_role,
                quest_id, task['id'], task['title'],
                first['block_type'], first.get('content', {}),
            )
        except Exception as le_err:
            logger.warning(f"Failed to create learning event for helper evidence batch: {le_err}")

        logger.info(f"{uploader_role.capitalize()} {user_id} uploaded {len(created_ids)} evidence blocks for student {student_id} task {task_id}")

        return jsonify({
            'success': True,
            'block_ids': created_ids,
            'document_id': document_id,
            'task_title': task['title'],
            'count': len(created_ids),
            'uploader_role': uploader_role,
        }), 201

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error uploading helper evidence batch: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to upload evidence'}), 500


def _create_helper_learning_event(supabase, student_id, uploader_id, uploader_role,
                                   quest_id, task_id, task_title, block_type, content):
    """
    Create a learning_events entry so helper evidence appears in the student's
    learning journal (grouped under the quest topic) and activity feed.

    `attached_task_id` is set so the observer feed's "skip task-attached
    learning_events" filter (feed.py — `is_('attached_task_id', 'null')`)
    actually catches it. Without this, every helper-evidence upload would
    surface as TWO feed items: one from the evidence_document_blocks path,
    plus a duplicate from this learning_event.
    """
    # Get quest title for the description
    quest_result = supabase.table('quests').select('title').eq('id', quest_id).execute()
    quest_title = quest_result.data[0]['title'] if quest_result.data else 'Quest'

    source_type = 'parent_captured' if uploader_role == 'parent' else 'advisor_captured'

    # Build a description from the evidence content
    if block_type == 'text':
        description = content.get('text', 'Evidence uploaded')
    else:
        description = f"Evidence uploaded for task: {task_title}"

    # Create learning event
    event_data = {
        'user_id': student_id,
        'captured_by_user_id': uploader_id,
        'description': description,
        'source_type': source_type,
        'quest_id': quest_id,
        'attached_task_id': task_id,
        'pillars': []
    }

    event_response = supabase.table('learning_events').insert(event_data).execute()
    if not event_response.data:
        return

    event_id = event_response.data[0]['id']

    # Link to quest via junction table
    try:
        supabase.table('learning_event_topics').insert({
            'learning_event_id': event_id,
            'topic_type': 'quest',
            'topic_id': quest_id
        }).execute()
    except Exception:
        logger.debug("intentional swallow", exc_info=True)  # Duplicate or constraint error, non-fatal

    # Create evidence block on the learning event
    block_data = {
        'learning_event_id': event_id,
        'block_type': block_type,
        'content': content,
        'order_index': 0
    }

    # Add file_url if present in content
    if content.get('url') and block_type in ('image', 'document'):
        block_data['file_url'] = content['url']

    supabase.table('learning_event_evidence_blocks').insert(block_data).execute()

    logger.info(f"Created learning event {event_id} for helper evidence (quest={quest_id}, student={student_id})")


@bp.route('/blocks/<block_id>', methods=['DELETE'])
@require_auth
def delete_helper_evidence_block(user_id, block_id):
    """
    Parent removes an evidence block they previously uploaded for a student.

    Authorization: caller must be the original uploader (uploaded_by_user_id == user_id)
    AND the block must have been uploaded as a parent (uploaded_by_role == 'parent').
    Parent->student relationship is re-verified to defend against stale links.

    Cleans up associated storage files and the parent document if it becomes empty.
    """
    try:
        # admin client justified: cross-user delete on student's evidence document; gated by uploader-identity check + parent->child relationship verification
        supabase = get_supabase_admin_client()

        block_result = supabase.table('evidence_document_blocks') \
            .select('id, document_id, content, block_type, uploaded_by_user_id, uploaded_by_role') \
            .eq('id', block_id) \
            .execute()

        if not block_result.data:
            raise NotFoundError("Evidence block not found")

        block = block_result.data[0]

        if block.get('uploaded_by_role') != 'parent' or block.get('uploaded_by_user_id') != user_id:
            raise AuthorizationError("You can only remove evidence you uploaded")

        document_id = block['document_id']

        doc_result = supabase.table('user_task_evidence_documents') \
            .select('id, user_id') \
            .eq('id', document_id) \
            .execute()

        if not doc_result.data:
            raise NotFoundError("Evidence document not found")

        student_id = doc_result.data[0]['user_id']

        # Re-verify parent role + parent->student link (defense in depth)
        verify_parent_access(user_id, student_id)

        # Best-effort storage cleanup; reuse helpers from evidence_documents to avoid drift
        from routes.evidence_documents import _collect_file_urls_from_content, _delete_storage_file
        for url in _collect_file_urls_from_content(block.get('content') or {}):
            _delete_storage_file(supabase, url)

        supabase.table('evidence_document_blocks') \
            .delete() \
            .eq('id', block_id) \
            .execute()

        remaining = supabase.table('evidence_document_blocks') \
            .select('id') \
            .eq('document_id', document_id) \
            .limit(1) \
            .execute()

        document_empty = not remaining.data
        if document_empty:
            supabase.table('user_task_evidence_documents') \
                .delete() \
                .eq('id', document_id) \
                .execute()

        logger.info(f"Parent {user_id} removed evidence block {block_id} for student {student_id}")

        return jsonify({
            'success': True,
            'document_empty': document_empty
        }), 200

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error deleting helper evidence block: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to remove evidence'}), 500


@bp.route('/student-tasks/<student_id>', methods=['GET'])
@require_auth
def get_student_tasks_for_evidence(user_id, student_id):
    """
    Get list of active tasks for a student (for advisors/parents to add evidence).
    Only returns tasks from active quests that are not yet completed.
    """
    try:
        # Admin client: Parent/advisor cross-user access (ADR-002, Rule 5)
        # admin client justified: advisor/parent uploads evidence onto student tasks; cross-user writes gated by helper relationship verification (advisor_student_assignments / parent->child)
        supabase = get_supabase_admin_client()
        user_repo = UserRepository()

        # Get user role using repository
        user = user_repo.find_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        user_role = get_effective_role(user)  # A2: resolves org_managed → real role

        # Verify access based on role
        if user_role in ['advisor', 'org_admin', 'superadmin']:
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
        return jsonify({'success': False, 'error': 'Failed to get student tasks'}), 500


def _verify_helper_can_upload_for_task(user_id: str, student_id: str, task_id: str):
    """Shared guard for the helper signed-upload init + finalize endpoints.

    Mirrors `/upload-for-student` so signed-URL routing has the same access
    contract as the block-creation route. Raises on failure; returns the
    user_role string on success.
    """
    user_repo = UserRepository()
    user = user_repo.find_by_id(user_id)
    if not user:
        raise NotFoundError("User not found")
    user_role = get_effective_role(user)

    if user_role in ['advisor', 'org_admin', 'superadmin']:
        verify_advisor_access(user_id, student_id)
    elif user_role == 'parent':
        verify_parent_access(user_id, student_id)
    else:
        raise AuthorizationError("Only advisors and parents can upload evidence for students")

    # Confirm the task belongs to the named student so a parent can't smuggle
    # files into another kid's evidence document via a forged task_id.
    supabase = get_supabase_admin_client()
    task_check = supabase.table('user_quest_tasks') \
        .select('id, user_id') \
        .eq('id', task_id) \
        .execute()
    if not task_check.data:
        raise NotFoundError("Task not found")
    if task_check.data[0]['user_id'] != student_id:
        raise AuthorizationError("Task does not belong to this student")

    return user_role


@bp.route('/upload-init', methods=['POST'])
@rate_limit(limit=30, per=3600)
@require_auth
def helper_signed_upload_init(user_id):
    """
    Begin a signed-URL upload for a helper (parent/advisor) attaching media
    evidence to a student's task. Mirrors the student endpoint at
    /api/evidence/documents/<task_id>/upload-init, but routes through the
    helper access check so the caller does NOT need to own the task.

    Body: { student_id, task_id, filename, file_size, content_type?, block_type? }
    Returns the same { success, upload: { signed_url, storage_path, bucket, ... } }
    shape so the existing client-side signedUpload helper works unchanged.
    """
    try:
        data = request.get_json() or {}
        student_id = data.get('student_id')
        task_id = data.get('task_id')
        filename = data.get('filename')
        file_size = data.get('file_size')
        content_type = data.get('content_type')
        block_type = data.get('block_type')

        if not student_id or not task_id:
            raise ValidationError("student_id and task_id are required")
        if not filename or not isinstance(file_size, int):
            raise ValidationError("filename and file_size are required")

        _verify_helper_can_upload_for_task(user_id, student_id, task_id)

        # Storage path is keyed off the student so files live alongside the
        # student's own evidence and are picked up by their existing read
        # paths (portfolio, journal, etc.).
        from services.media_upload_service import MediaUploadService
        admin_supabase = get_supabase_admin_client()
        session = MediaUploadService(admin_supabase).create_upload_session(
            user_id=student_id,
            context_type='task',
            context_id=task_id,
            filename=filename,
            file_size=file_size,
            content_type=content_type,
            block_type=block_type,
        )
        if not session.success:
            status = 413 if session.error_code == 'FILE_TOO_LARGE' else 400
            return jsonify({'success': False, 'error': session.error_message}), status

        return jsonify({'success': True, 'upload': session.to_dict()})

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error in helper_signed_upload_init: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create upload session'}), 500


@bp.route('/upload-finalize', methods=['POST'])
@rate_limit(limit=60, per=3600)
@require_auth
def helper_signed_upload_finalize(user_id):
    """
    Finalize a helper signed upload — verifies the file landed in storage,
    runs the same post-processing (video thumbnails, etc.) the student flow
    uses, and returns the final file URL + metadata.

    Body: { student_id, task_id, storage_path, bucket, block_type? }
    """
    try:
        data = request.get_json() or {}
        student_id = data.get('student_id')
        task_id = data.get('task_id')
        storage_path = data.get('storage_path')
        bucket = data.get('bucket')
        block_type = data.get('block_type')

        if not student_id or not task_id:
            raise ValidationError("student_id and task_id are required")
        if not storage_path or not bucket:
            raise ValidationError("storage_path and bucket are required")

        _verify_helper_can_upload_for_task(user_id, student_id, task_id)

        from services.media_upload_service import MediaUploadService
        admin_supabase = get_supabase_admin_client()
        result = MediaUploadService(admin_supabase).finalize_upload(
            user_id=student_id,
            storage_path=storage_path,
            bucket=bucket,
            context_type='task',
            context_id=task_id,
            block_type=block_type,
        )
        if not result.success:
            status = 413 if result.error_code == 'FILE_TOO_LARGE' else 400
            return jsonify({'success': False, 'error': result.error_message, 'error_code': result.error_code}), status

        response_data = {
            'success': True,
            'url': result.file_url,
            'filename': result.filename,
            'file_size': result.file_size,
            'content_type': result.content_type,
        }
        if result.thumbnail_url:
            response_data['thumbnail_url'] = result.thumbnail_url
        if result.duration_seconds is not None:
            response_data['duration_seconds'] = result.duration_seconds
        if result.width is not None:
            response_data['width'] = result.width
        if result.height is not None:
            response_data['height'] = result.height

        return jsonify(response_data)

    except ValidationError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except AuthorizationError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error in helper_signed_upload_finalize: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to finalize upload'}), 500
