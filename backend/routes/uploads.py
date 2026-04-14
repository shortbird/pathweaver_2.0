"""Evidence upload endpoints.

Routes the generic /evidence + /evidence/base64 flows through
MediaUploadService (with security_scan=True so magic-byte / polyglot /
suspicious-pattern checks still run). Also exposes the direct-to-Supabase
signed-URL flow for superadmin large-file uploads.
"""

from datetime import datetime
from io import BytesIO

from flask import Blueprint, request, jsonify
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from database import get_supabase_admin_client
from middleware.error_handler import ValidationError
from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_auth, require_role
from utils.logger import get_logger
from utils.file_validator import MAX_FILE_SIZE

import base64

logger = get_logger(__name__)

bp = Blueprint('uploads', __name__)

def _status_for(error_code: str) -> int:
    """Map MediaUploadResult error_code to an HTTP status."""
    if error_code == 'FILE_TOO_LARGE':
        return 413
    if error_code == 'NO_FILE':
        return 400
    if error_code == 'SECURITY_REJECTED':
        return 400
    return 400


def _result_to_upload_entry(result, original_name: str) -> dict:
    """Shape a MediaUploadResult into the legacy /evidence response entry."""
    from utils.storage_url import fix_storage_url  # noqa: F401 (already applied in service)
    return {
        'original_name': original_name,
        'stored_name': result.filename,
        'url': result.file_url,
        'size': result.file_size,
        'content_type': result.content_type,
        'sha256_hash': result.sha256_hash,
        'uploaded_at': datetime.utcnow().isoformat(),
    }


@bp.route('/evidence', methods=['POST'])
@rate_limit(limit=10, per=3600)  # 10 per hour (per P1-SEC-2)
@require_auth
def upload_evidence(user_id):
    """Upload evidence files via multipart/form-data."""
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400

    files = [f for f in request.files.getlist('files') if f.filename]

    # Content-Length DoS guard — reject before we start reading file bodies.
    if request.content_length and request.content_length > MAX_FILE_SIZE * max(1, len(files)):
        max_mb = MAX_FILE_SIZE / (1024 * 1024)
        return jsonify({'error': f'Request exceeds maximum total size of {max_mb}MB per file'}), 413

    from services.media_upload_service import MediaUploadService
    # admin client justified: file upload to Supabase Storage scoped to caller (self) under @require_auth
    service = MediaUploadService(get_supabase_admin_client())

    uploaded: list[dict] = []
    for file in files:
        original_name = file.filename
        result = service.upload_evidence_file(
            file,
            user_id=user_id,
            context_type='task_evidence',
            context_id='generic',
            security_scan=True,
        )
        if not result.success:
            logger.warning(
                f"[Upload] /evidence rejected for user={user_id} file={original_name}: "
                f"{result.error_code} {result.error_message}"
            )
            return jsonify({'error': f'File {original_name}: {result.error_message}'}), _status_for(result.error_code)
        uploaded.append(_result_to_upload_entry(result, original_name))

    return jsonify({'files': uploaded, 'count': len(uploaded)}), 200


@bp.route('/evidence/base64', methods=['POST'])
@rate_limit(limit=10, per=3600)  # 10 per hour (per P1-SEC-2)
@require_auth
def upload_evidence_base64(user_id):
    """Upload evidence files as base64 (for clients that can't do multipart)."""
    data = request.get_json(silent=True) or {}
    if 'files' not in data:
        return jsonify({'error': 'No files provided'}), 400

    from services.media_upload_service import MediaUploadService
    # admin client justified: file upload to Supabase Storage scoped to caller (self) under @require_auth
    service = MediaUploadService(get_supabase_admin_client())

    uploaded: list[dict] = []
    for file_data in data['files']:
        original_name = file_data.get('filename') or 'upload.bin'
        b64 = file_data.get('content', '')
        claimed_type = file_data.get('content_type', 'application/octet-stream')

        try:
            file_bytes = base64.b64decode(b64)
        except Exception:
            return jsonify({'error': 'Invalid base64 content'}), 400

        if len(file_bytes) > MAX_FILE_SIZE:
            max_mb = MAX_FILE_SIZE / (1024 * 1024)
            return jsonify({'error': f'File exceeds maximum size of {max_mb}MB'}), 413

        wrapper = FileStorage(
            stream=BytesIO(file_bytes),
            filename=secure_filename(original_name) or 'upload.bin',
            content_type=claimed_type,
        )
        result = service.upload_evidence_file(
            wrapper,
            user_id=user_id,
            context_type='task_evidence',
            context_id='generic',
            security_scan=True,
        )
        if not result.success:
            logger.warning(
                f"[Upload] /evidence/base64 rejected for user={user_id} "
                f"file={original_name}: {result.error_code} {result.error_message}"
            )
            return jsonify({'error': f'File {original_name}: {result.error_message}'}), _status_for(result.error_code)
        uploaded.append(_result_to_upload_entry(result, original_name))

    return jsonify({'files': uploaded, 'count': len(uploaded)}), 200


# --- Direct-to-Supabase upload for large files (superadmin only) ---

@bp.route('/request-signed-url', methods=['POST'])
@require_role('superadmin')
def request_signed_upload_url(user_id):
    """
    Generate a signed upload URL for direct-to-Supabase file upload.
    Bypasses Render's 100MB request body limit.
    Superadmin only for now.

    Body JSON: { filename, content_type, context_type, context_id, sub_id? }
    Returns: { upload_url, storage_path, bucket, token }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        filename = data.get('filename')
        content_type = data.get('content_type', 'video/mp4')
        context_type = data.get('context_type')
        context_id = data.get('context_id')
        sub_id = data.get('sub_id')

        if not filename or not context_type or not context_id:
            return jsonify({'error': 'filename, context_type, and context_id required'}), 400

        from services.media_upload_service import MediaUploadService
        service = MediaUploadService()

        # Validate the file type first
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        block_type = service._detect_media_type(ext)
        validation = service.validate_file(filename, 0, block_type)
        if not validation.success and validation.error_code == 'INVALID_TYPE':
            return jsonify({'error': validation.error_message}), 400

        # Generate storage path
        storage_path = service._generate_storage_path(
            context_type=context_type,
            context_id=context_id,
            user_id=user_id,
            filename=secure_filename(filename),
            ext=ext,
            sub_id=sub_id,
        )

        from services.media_upload_service import DEFAULT_BUCKETS
        bucket = DEFAULT_BUCKETS.get(context_type, 'quest-evidence')

        # Create signed upload URL
        # admin client justified: file upload endpoints write to Supabase Storage scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()
        result = supabase.storage.from_(bucket).create_signed_upload_url(storage_path)

        if not result or not result.get('signed_url'):
            logger.error(f"[Upload] Failed to create signed URL for {storage_path}: {result}")
            return jsonify({'error': 'Failed to create upload URL'}), 500

        logger.info(f"[Upload] Signed URL created for superadmin {user_id}: {bucket}/{storage_path}")

        return jsonify({
            'upload_url': result['signed_url'],
            'storage_path': storage_path,
            'bucket': bucket,
            'token': result.get('token', ''),
        }), 200

    except Exception as e:
        logger.error(f"[Upload] Failed to create signed URL: {e}", exc_info=True)
        return jsonify({'error': 'Failed to create upload URL'}), 500


@bp.route('/process-uploaded', methods=['POST'])
@require_role('superadmin')
def process_uploaded_file(user_id):
    """
    Trigger background processing for a file uploaded directly to Supabase.
    Called after the frontend completes a direct upload via signed URL.

    Body JSON: { storage_path, bucket }
    Returns: { success, file_url }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        storage_path = data.get('storage_path')
        bucket = data.get('bucket', 'quest-evidence')

        if not storage_path:
            return jsonify({'error': 'storage_path required'}), 400

        # admin client justified: file upload endpoints write to Supabase Storage scoped to caller (self) under @require_auth
        supabase = get_supabase_admin_client()

        # Get public URL
        from utils.storage_url import fix_storage_url
        public_url = fix_storage_url(supabase.storage.from_(bucket).get_public_url(storage_path))

        # Kick off background video processing
        ext = storage_path.rsplit('.', 1)[1].lower() if '.' in storage_path else ''
        if ext in ('mp4', 'mov'):
            from services.video_processing_service import video_processing_service
            video_processing_service.process_video_background(
                public_url=public_url,
                storage_path=storage_path,
                bucket_name=bucket,
                user_id=user_id,
            )

        logger.info(f"[Upload] Processing triggered for direct upload: {bucket}/{storage_path}")

        return jsonify({
            'success': True,
            'file_url': public_url,
        }), 200

    except Exception as e:
        logger.error(f"[Upload] Failed to process uploaded file: {e}", exc_info=True)
        return jsonify({'error': 'Failed to process uploaded file'}), 500