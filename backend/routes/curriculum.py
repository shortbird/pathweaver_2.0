"""
Curriculum API endpoints for quest curriculum builder.

Handles curriculum content management and file attachments.
Only accessible by school admins and advisors.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError
from middleware.rate_limiter import rate_limit
from services.curriculum_service import CurriculumService
from utils.file_validator import validate_file, MAX_FILE_SIZE
from werkzeug.utils import secure_filename
from utils.logger import get_logger
import uuid

logger = get_logger(__name__)

bp = Blueprint('curriculum', __name__, url_prefix='/api/quests')


def verify_curriculum_permission(user_id: str, quest_id: str, supabase) -> dict:
    """
    Verify user has permission to edit curriculum for this quest.
    Must be school admin or advisor in the quest's organization.

    Args:
        user_id: User ID to check
        quest_id: Quest ID
        supabase: Supabase client

    Returns:
        Quest data with organization_id

    Raises:
        ValidationError: If permission denied
    """
    # Get user role and organization
    user = supabase.table('users')\
        .select('role, organization_id')\
        .eq('id', user_id)\
        .single()\
        .execute()

    if not user.data:
        raise ValidationError("User not found", 404)

    user_role = user.data.get('role')
    user_org = user.data.get('organization_id')

    # Check role
    if user_role not in ['school_admin', 'advisor', 'superadmin']:
        raise ValidationError(
            "Only school administrators and advisors can edit curriculum",
            403
        )

    # Get quest organization
    quest = supabase.table('quests')\
        .select('organization_id, title')\
        .eq('id', quest_id)\
        .single()\
        .execute()

    if not quest.data:
        raise ValidationError("Quest not found", 404)

    quest_org = quest.data.get('organization_id')

    # Verify same organization (unless superadmin)
    if user_role != 'superadmin' and quest_org != user_org:
        raise ValidationError(
            "You can only edit curriculum for quests in your organization",
            403
        )

    return quest.data


@bp.route('/<quest_id>/curriculum', methods=['GET'])
@require_auth
def get_curriculum(user_id: str, quest_id: str):
    """
    Get curriculum content and attachments for a quest.

    Returns:
        200: Curriculum data with attachments
        404: Quest or curriculum not found
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumService(supabase)

        # Verify permission
        verify_curriculum_permission(user_id, quest_id, supabase)

        # Get curriculum content
        curriculum = service.get_curriculum(quest_id)

        # Get attachments
        attachments = service.get_attachments(quest_id)

        return jsonify({
            'success': True,
            'curriculum': curriculum,
            'attachments': attachments
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error fetching curriculum: {str(e)}")
        return jsonify({'error': 'Failed to fetch curriculum'}), 500


@bp.route('/<quest_id>/curriculum', methods=['PUT'])
@require_auth
@rate_limit(limit=30, per=60)  # 30 saves per minute
def save_curriculum(user_id: str, quest_id: str):
    """
    Save or update curriculum content for a quest.

    Body:
        content (str): Curriculum content (markdown/HTML)

    Returns:
        200: Curriculum saved successfully
        400: Validation error
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumService(supabase)

        # Verify permission
        quest = verify_curriculum_permission(user_id, quest_id, supabase)

        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        content = data.get('content', '')

        # Validate content length
        if len(content) > 1000000:  # 1MB text limit
            return jsonify({'error': 'Content too large (max 1MB)'}), 400

        # Save curriculum
        result = service.save_curriculum(
            quest_id=quest_id,
            content=content,
            user_id=user_id,
            organization_id=quest.get('organization_id')
        )

        return jsonify({
            'success': True,
            'curriculum': result,
            'message': 'Curriculum saved successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error saving curriculum: {str(e)}")
        return jsonify({'error': 'Failed to save curriculum'}), 500


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
        supabase = get_supabase_admin_client()
        service = CurriculumService(supabase)

        # Verify permission
        verify_curriculum_permission(user_id, quest_id, supabase)

        # Check file provided
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file
        file_data = file.read()
        original_filename = file.filename

        validate_file(
            file_data=file_data,
            filename=original_filename,
            max_size=MAX_FILE_SIZE
        )

        # Sanitize filename
        safe_filename = secure_filename(original_filename)
        if not safe_filename or '..' in safe_filename:
            return jsonify({'error': 'Invalid filename'}), 400

        # Generate unique filename
        file_ext = safe_filename.rsplit('.', 1)[-1] if '.' in safe_filename else 'bin'
        unique_filename = f"{quest_id}_{uuid.uuid4().hex[:12]}.{file_ext}"

        # Create curriculum bucket if needed
        try:
            supabase.storage.create_bucket('curriculum', {'public': True})
        except Exception:
            pass  # Bucket exists

        # Upload to storage
        file_path = f"quest_{quest_id}/{unique_filename}"
        supabase.storage.from_('curriculum').upload(
            file_path,
            file_data,
            {'content-type': file.content_type or 'application/octet-stream'}
        )

        # Get public URL
        file_url = supabase.storage.from_('curriculum').get_public_url(file_path)

        # Record attachment in database
        attachment = service.add_attachment(
            quest_id=quest_id,
            filename=original_filename,
            file_url=file_url,
            file_size=len(file_data),
            mime_type=file.content_type or 'application/octet-stream',
            user_id=user_id
        )

        return jsonify({
            'success': True,
            'attachment': attachment,
            'message': 'File uploaded successfully'
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error uploading attachment: {str(e)}")
        return jsonify({'error': 'Failed to upload file'}), 500


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
        supabase = get_supabase_admin_client()
        service = CurriculumService(supabase)

        # Verify permission
        verify_curriculum_permission(user_id, quest_id, supabase)

        # Delete attachment
        service.delete_attachment(attachment_id, quest_id)

        return jsonify({
            'success': True,
            'message': 'Attachment deleted successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error deleting attachment: {str(e)}")
        return jsonify({'error': 'Failed to delete attachment'}), 500
