"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- File upload handling only - no database calls
- Uses Supabase Storage API (not database operations)
- Includes security features: magic byte validation, filename sanitization, size limits
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client
from repositories import (
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
from middleware.error_handler import ValidationError
from middleware.rate_limiter import rate_limit
from werkzeug.utils import secure_filename
import base64
import uuid
import mimetypes
import os
from datetime import datetime

# Import enhanced file validator (P1-SEC-1)
from utils.file_validator import validate_file, MAX_FILE_SIZE

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('uploads', __name__)

def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename using werkzeug's secure_filename
    Security: Prevents path traversal attacks

    Args:
        filename: Original filename

    Returns:
        Sanitized filename safe for storage

    Raises:
        ValidationError: If filename is invalid or contains path traversal attempts
    """
    if not filename:
        raise ValidationError("Filename cannot be empty")

    # Use werkzeug's secure_filename implementation
    safe = secure_filename(filename)

    # Additional security checks
    if not safe or '..' in safe or '/' in safe or '\\' in safe:
        raise ValidationError("Invalid filename - path traversal detected")

    # Ensure filename has an extension
    if '.' not in safe:
        raise ValidationError("Filename must have an extension")

    # Limit filename length (keep extension intact)
    if len(safe) > 100:
        name, ext = safe.rsplit('.', 1)
        safe = f"{name[:95]}.{ext}"

    return safe

# Using repository pattern for database access
@bp.route('/evidence', methods=['POST'])
@rate_limit(limit=10, per=3600)  # 10 per hour (per P1-SEC-2)
@require_auth
def upload_evidence(user_id):
    """
    Upload evidence files for quest submissions
    Accepts multipart/form-data with files
    """
    supabase = get_supabase_admin_client()
    
    try:
        if 'files' not in request.files:
            return jsonify({'error': 'No files provided'}), 400
        
        files = request.files.getlist('files')
        uploaded_files = []
        
        # Create evidence bucket if it doesn't exist
        try:
            supabase.storage.create_bucket('quest-evidence', {'public': False})
        except:
            pass  # Bucket might already exist
        
        for file in files:
            if file.filename == '':
                continue

            # Read file content first for validation
            file_content = file.read()

            # Explicit file size validation (10MB max)
            if len(file_content) > MAX_FILE_SIZE:
                max_mb = MAX_FILE_SIZE / (1024 * 1024)
                return jsonify({'error': f'File exceeds maximum size of {max_mb}MB'}), 400

            # Sanitize filename (raises ValidationError on invalid filename)
            try:
                safe_filename = sanitize_filename(file.filename)
            except ValidationError as e:
                return jsonify({'error': str(e)}), 400

            # Enhanced file validation (P1-SEC-1: full file scan, polyglot detection, virus scan)
            validation_result = validate_file(
                filename=safe_filename,
                file_content=file_content,
                claimed_content_type=file.content_type
            )

            if not validation_result.is_valid:
                logger.warning(
                    f"[Upload] File validation failed - "
                    f"user={user_id}, file={safe_filename}, reason={validation_result.error_message}"
                )
                return jsonify({'error': f'File {safe_filename}: {validation_result.error_message}'}), 400

            # Log warnings if any (e.g., Content-Type mismatch, suspicious patterns)
            if validation_result.warnings:
                logger.warning(
                    f"[Upload] File validation warnings - "
                    f"user={user_id}, file={safe_filename}, warnings={validation_result.warnings}"
                )
            
            # Generate unique filename
            file_extension = safe_filename.rsplit('.', 1)[1].lower() if '.' in safe_filename else ''
            unique_filename = f"{user_id}/{uuid.uuid4()}.{file_extension}"
            
            # Use detected MIME type from validation (more secure than trusting client)
            content_type = validation_result.detected_mime

            # Upload to Supabase Storage (use file_content we already read)
            response = supabase.storage.from_('quest-evidence').upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": content_type}
            )
            
            # Get public URL for the uploaded file
            url_response = supabase.storage.from_('quest-evidence').get_public_url(unique_filename)
            
            uploaded_files.append({
                'original_name': file.filename,
                'stored_name': unique_filename,
                'url': url_response,
                'size': validation_result.file_size,
                'content_type': content_type,
                'sha256_hash': validation_result.sha256_hash,
                'uploaded_at': datetime.utcnow().isoformat()
            })
        
        return jsonify({
            'files': uploaded_files,
            'count': len(uploaded_files)
        }), 200

    except Exception as e:
        # Log upload error with details (P1-QUAL-1: specific exception handling)
        logger.error(f"[Upload] Upload failed for user {user_id}: {e}", exc_info=True)
        return jsonify({'error': 'Upload failed. Please try again.'}), 500

@bp.route('/evidence/base64', methods=['POST'])
@rate_limit(limit=10, per=3600)  # 10 per hour (per P1-SEC-2)
@require_auth
def upload_evidence_base64(user_id):
    """
    Upload evidence files as base64 encoded data
    Useful for when multipart/form-data is not convenient
    """
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        if 'files' not in data:
            return jsonify({'error': 'No files provided'}), 400
        
        uploaded_files = []
        
        # Create evidence bucket if it doesn't exist
        try:
            supabase.storage.create_bucket('quest-evidence', {'public': False})
        except:
            pass  # Bucket might already exist
        
        for file_data in data['files']:
            filename = file_data.get('filename', f'file_{uuid.uuid4()}')
            base64_content = file_data.get('content', '')
            content_type = file_data.get('content_type', 'application/octet-stream')

            # Decode base64 content
            try:
                file_content = base64.b64decode(base64_content)
            except Exception as e:
                return jsonify({'error': f'Invalid base64 content'}), 400

            # Explicit file size validation (10MB max)
            if len(file_content) > MAX_FILE_SIZE:
                max_mb = MAX_FILE_SIZE / (1024 * 1024)
                return jsonify({'error': f'File exceeds maximum size of {max_mb}MB'}), 400

            # Sanitize filename (raises ValidationError on invalid filename)
            try:
                safe_filename = sanitize_filename(filename)
            except ValidationError as e:
                return jsonify({'error': str(e)}), 400

            # Enhanced file validation (P1-SEC-1: full file scan, polyglot detection, virus scan)
            validation_result = validate_file(
                filename=safe_filename,
                file_content=file_content,
                claimed_content_type=content_type
            )

            if not validation_result.is_valid:
                logger.warning(
                    f"[Upload] Base64 file validation failed - "
                    f"user={user_id}, file={safe_filename}, reason={validation_result.error_message}"
                )
                return jsonify({'error': f'File {safe_filename}: {validation_result.error_message}'}), 400

            # Log warnings if any (e.g., Content-Type mismatch, suspicious patterns)
            if validation_result.warnings:
                logger.warning(
                    f"[Upload] Base64 file validation warnings - "
                    f"user={user_id}, file={safe_filename}, warnings={validation_result.warnings}"
                )
            
            # Generate unique filename
            file_extension = safe_filename.rsplit('.', 1)[1].lower() if '.' in safe_filename else ''
            unique_filename = f"{user_id}/{uuid.uuid4()}.{file_extension}"

            # Use detected MIME type from validation (more secure than trusting client)
            validated_content_type = validation_result.detected_mime

            # Upload to Supabase Storage
            response = supabase.storage.from_('quest-evidence').upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": validated_content_type}
            )
            
            # Get public URL for the uploaded file
            url_response = supabase.storage.from_('quest-evidence').get_public_url(unique_filename)
            
            uploaded_files.append({
                'original_name': filename,
                'stored_name': unique_filename,
                'url': url_response,
                'size': validation_result.file_size,
                'content_type': validated_content_type,
                'sha256_hash': validation_result.sha256_hash,
                'uploaded_at': datetime.utcnow().isoformat()
            })

        return jsonify({
            'files': uploaded_files,
            'count': len(uploaded_files)
        }), 200

    except Exception as e:
        # Log upload error with details (P1-QUAL-1: specific exception handling)
        logger.error(f"[Upload] Base64 upload failed for user {user_id}: {e}", exc_info=True)
        return jsonify({'error': 'Upload failed. Please try again.'}), 500