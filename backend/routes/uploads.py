from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client
from middleware.error_handler import ValidationError
from werkzeug.utils import secure_filename
import base64
import uuid
import mimetypes
import magic  # python-magic is now required
import os
from datetime import datetime

bp = Blueprint('uploads', __name__)

# Allowed MIME types (checked via magic bytes)
ALLOWED_MIME_TYPES = {
    # Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    # Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    # Videos
    'video/mp4', 'video/webm', 'video/quicktime',
    # Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg'
}

# Allowed file extensions (as secondary check)
ALLOWED_EXTENSIONS = {
    'jpg', 'jpeg', 'png', 'gif', 'webp',  # Images
    'pdf', 'doc', 'docx', 'txt',          # Documents
    'mp4', 'webm', 'mov',                 # Videos
    'mp3', 'wav', 'ogg'                   # Audio
}

# Maximum file size: 10MB
MAX_FILE_SIZE = 10 * 1024 * 1024

def validate_file_type(filename: str, file_content: bytes) -> tuple[bool, str]:
    """
    Validate file type using magic bytes (MIME type detection)
    Security: Prevents file extension spoofing attacks

    Args:
        filename: Original filename
        file_content: File binary content

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not filename or '.' not in filename:
        return False, "File must have an extension"

    extension = filename.rsplit('.', 1)[1].lower()

    # Check extension is allowed
    if extension not in ALLOWED_EXTENSIONS:
        return False, f"File extension '.{extension}' not allowed"

    # Validate using magic bytes (required - no try/except)
    try:
        # Read first 2048 bytes for MIME detection
        mime_type = magic.from_buffer(file_content[:2048], mime=True)
    except Exception as e:
        return False, f"Failed to detect file type: {str(e)}"

    # Check MIME type is allowed
    if mime_type not in ALLOWED_MIME_TYPES:
        return False, f"File type '{mime_type}' not allowed"

    return True, None

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

@bp.route('/evidence', methods=['POST'])
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

            # Validate file type using magic bytes
            is_valid, error_msg = validate_file_type(safe_filename, file_content)
            if not is_valid:
                return jsonify({'error': f'File {safe_filename}: {error_msg}'}), 400
            
            # Generate unique filename
            file_extension = safe_filename.rsplit('.', 1)[1].lower() if '.' in safe_filename else ''
            unique_filename = f"{user_id}/{uuid.uuid4()}.{file_extension}"
            
            # Determine content type
            content_type = file.content_type or mimetypes.guess_type(file.filename)[0] or 'application/octet-stream'

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
                'size': len(file_content),
                'content_type': content_type,
                'uploaded_at': datetime.utcnow().isoformat()
            })
        
        return jsonify({
            'files': uploaded_files,
            'count': len(uploaded_files)
        }), 200
        
    except Exception as e:
        # Log upload error internally
        return jsonify({'error': 'Upload failed. Please try again.'}), 500

@bp.route('/evidence/base64', methods=['POST'])
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

            # Validate file type using magic bytes
            is_valid, error_msg = validate_file_type(safe_filename, file_content)
            if not is_valid:
                return jsonify({'error': f'File {safe_filename}: {error_msg}'}), 400
            
            # Generate unique filename
            file_extension = safe_filename.rsplit('.', 1)[1].lower() if '.' in safe_filename else ''
            unique_filename = f"{user_id}/{uuid.uuid4()}.{file_extension}"
            
            # Upload to Supabase Storage
            response = supabase.storage.from_('quest-evidence').upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": content_type}
            )
            
            # Get public URL for the uploaded file
            url_response = supabase.storage.from_('quest-evidence').get_public_url(unique_filename)
            
            uploaded_files.append({
                'original_name': filename,
                'stored_name': unique_filename,
                'url': url_response,
                'size': len(file_content),
                'content_type': content_type,
                'uploaded_at': datetime.utcnow().isoformat()
            })
        
        return jsonify({
            'files': uploaded_files,
            'count': len(uploaded_files)
        }), 200
        
    except Exception as e:
        # Log upload error internally
        return jsonify({'error': 'Upload failed. Please try again.'}), 500