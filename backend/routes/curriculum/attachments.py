"""Attachment and image upload/rename/delete.

Split from routes/curriculum.py on 2026-04-14 (Q1).
"""

"""
Curriculum API endpoints for quest curriculum builder.

Handles curriculum content management and file attachments.
Only accessible by school admins and advisors.

ADMIN CLIENT USAGE: Every endpoint in this file uses get_supabase_admin_client()
because curriculum content is org-scoped and edit permission is gated by
CurriculumPermissionService, which is invoked at the top of each endpoint via
_check_read_permission / _check_edit_permission / _check_lesson_edit_permission.
The permission service performs cross-row checks (quest -> course -> course_quests
-> organization, plus user role + org membership) that would require many overlapping
RLS policies to express. Each call site below is annotated `# admin client justified`
to satisfy the H1 audit; the actual access control lives in the permission helpers
above.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.roles import get_effective_role  # A2: org_managed users have actual role in org_role
from middleware.error_handler import ValidationError, AuthorizationError, NotFoundError
from middleware.rate_limiter import rate_limit
from services.curriculum_service import CurriculumService
from services.curriculum_lesson_service import CurriculumLessonService
from services.curriculum_permission_service import CurriculumPermissionService
from services.file_upload_service import FileUploadService
from utils.logger import get_logger
from utils.ai_access import require_ai_access

logger = get_logger(__name__)



from routes.curriculum import bp


@bp.route('/<quest_id>/curriculum/attachments', methods=['POST'])
@require_auth
@rate_limit(limit=20, per=3600)  # 20 uploads per hour
def upload_attachment(user_id: str, quest_id: str):
    """
    Upload a curriculum attachment file.

    Accepts multipart/form-data with 'file' field.

    Returns:
        201: File uploaded successfully
        400: Invalid file or validation error
        403: Permission denied
    """
    try:
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()
        curriculum_service = CurriculumService(supabase)
        upload_service = FileUploadService(supabase)

        quest = _check_edit_permission(user_id, quest_id, supabase)
        organization_id = quest.get('organization_id')

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        result = upload_service.upload_attachment(
            file_data=file.read(),
            filename=file.filename,
            content_type=file.content_type or 'application/octet-stream',
            quest_id=quest_id,
            user_id=user_id,
            organization_id=organization_id
        )

        if not result.success:
            return jsonify({'error': result.error_message}), 400

        # Try to record in curriculum_attachments table, but don't fail if it errors
        # (PostgREST schema cache issue can make this table inaccessible)
        attachment = {
            'file_name': result.filename,
            'file_url': result.url,
            'file_size_bytes': result.file_size,
            'file_type': file.content_type or 'application/octet-stream',
            'quest_id': quest_id
        }
        try:
            db_record = curriculum_service.add_attachment(
                quest_id=quest_id,
                filename=result.filename,
                file_url=result.url,
                file_size=result.file_size,
                mime_type=file.content_type or 'application/octet-stream',
                user_id=user_id,
                organization_id=organization_id
            )
            if db_record:
                attachment = db_record
        except Exception as db_err:
            logger.warning(f"Failed to record attachment in DB (file uploaded OK): {db_err}")

        return jsonify({
            'success': True,
            'attachment': attachment,
            'url': result.url,
            'message': 'File uploaded successfully'
        }), 201

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error uploading attachment: {str(e)}")
        return jsonify({'error': 'Failed to upload file'}), 500


@bp.route('/<quest_id>/curriculum/images', methods=['POST'])
@require_auth
@rate_limit(limit=20, per=3600)  # 20 uploads per hour
def upload_image(user_id: str, quest_id: str):
    """
    Upload an image for curriculum lesson blocks.

    Accepts multipart/form-data with 'file' field.
    Images are resized to max 2000px width and uploaded to Supabase storage.

    Returns:
        201: Image uploaded successfully with public URL
        400: Invalid file or validation error
        403: Permission denied
    """
    try:
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()
        upload_service = FileUploadService(supabase)

        _check_edit_permission(user_id, quest_id, supabase)

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        result = upload_service.upload_image(
            file_data=file.read(),
            filename=file.filename,
            content_type=file.content_type or 'image/jpeg',
            quest_id=quest_id,
            max_width=2000
        )

        if not result.success:
            return jsonify({'error': result.error_message}), 400

        return jsonify({
            'success': True,
            'url': result.url,
            'message': 'Image uploaded successfully'
        }), 201

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error uploading image: {str(e)}")
        return jsonify({'error': 'Failed to upload image'}), 500


@bp.route('/<quest_id>/curriculum/attachments/<attachment_id>', methods=['PATCH'])
@require_auth
def rename_attachment(user_id: str, quest_id: str, attachment_id: str):
    """
    Rename a curriculum attachment.

    Body:
        file_name (str): New file name

    Returns:
        200: Attachment renamed successfully
        403: Permission denied
        404: Attachment not found
    """
    try:
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()

        _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'file_name' not in data:
            return jsonify({'error': 'file_name is required'}), 400

        new_name = data['file_name'].strip()
        if not new_name:
            return jsonify({'error': 'file_name cannot be empty'}), 400

        result = supabase.table('curriculum_attachments')\
            .update({'file_name': new_name})\
            .eq('id', attachment_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not result.data:
            return jsonify({'error': 'Attachment not found'}), 404

        return jsonify({
            'success': True,
            'attachment': result.data[0],
            'message': 'Attachment renamed successfully'
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error renaming attachment: {str(e)}")
        return jsonify({'error': 'Failed to rename attachment'}), 500


@bp.route('/<quest_id>/curriculum/attachments/<attachment_id>', methods=['DELETE'])
@require_auth
def delete_attachment(user_id: str, quest_id: str, attachment_id: str):
    """
    Delete a curriculum attachment.

    Returns:
        200: Attachment deleted successfully
        403: Permission denied
        404: Attachment not found
    """
    try:
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()
        service = CurriculumService(supabase)

        _check_edit_permission(user_id, quest_id, supabase)

        service.delete_attachment(attachment_id, quest_id)

        return jsonify({
            'success': True,
            'message': 'Attachment deleted successfully'
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error deleting attachment: {str(e)}")
        return jsonify({'error': 'Failed to delete attachment'}), 500


# ========================================
# Curriculum Lessons Endpoints
# ========================================

