from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client
import base64
import uuid
import mimetypes
import magic
from datetime import datetime

bp = Blueprint('uploads', __name__)

# Allowed file types and their MIME types
ALLOWED_FILE_TYPES = {
    # Images
    'jpg': ['image/jpeg', 'image/jpg'],
    'jpeg': ['image/jpeg', 'image/jpg'],
    'png': ['image/png'],
    'gif': ['image/gif'],
    'webp': ['image/webp'],
    # Documents
    'pdf': ['application/pdf'],
    'doc': ['application/msword'],
    'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'txt': ['text/plain'],
    # Videos
    'mp4': ['video/mp4'],
    'webm': ['video/webm'],
    'mov': ['video/quicktime'],
    # Audio
    'mp3': ['audio/mpeg'],
    'wav': ['audio/wav'],
    'ogg': ['audio/ogg']
}

# Maximum file size: 10MB (reduced from 50MB)
MAX_FILE_SIZE = 10 * 1024 * 1024

def validate_file_type(filename, file_content):
    """
    Validate file type by checking both extension and magic bytes
    """
    if not filename or '.' not in filename:
        return False, "File must have an extension"
    
    extension = filename.rsplit('.', 1)[1].lower()
    
    if extension not in ALLOWED_FILE_TYPES:
        return False, f"File type '{extension}' not allowed"
    
    # Check magic bytes if python-magic is available
    try:
        mime_type = magic.from_buffer(file_content[:2048], mime=True)
        if mime_type not in ALLOWED_FILE_TYPES[extension]:
            return False, f"File content doesn't match extension. Expected: {ALLOWED_FILE_TYPES[extension]}, Got: {mime_type}"
    except:
        # Fallback to basic extension check if python-magic is not available
        pass
    
    return True, None

def sanitize_filename(filename):
    """
    Sanitize filename to prevent path traversal and other attacks
    """
    if not filename:
        return f"file_{uuid.uuid4()}"
    
    # Remove path separators and dangerous characters
    filename = filename.replace('/', '_').replace('\\', '_').replace('..', '_')
    filename = ''.join(c for c in filename if c.isalnum() or c in '.-_ ')
    
    # Limit filename length
    if len(filename) > 100:
        name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
        filename = name[:95] + ('.' + ext if ext else '')
    
    return filename

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
            
            # Sanitize filename
            safe_filename = sanitize_filename(file.filename)
            
            # Validate file size (10MB max)
            file.seek(0, 2)  # Seek to end
            file_size = file.tell()
            file.seek(0)  # Reset to beginning
            
            if file_size > MAX_FILE_SIZE:
                return jsonify({'error': f'File {safe_filename} exceeds 10MB limit'}), 400
            
            # Read file content for validation
            file_content = file.read()
            file.seek(0)  # Reset for upload
            
            # Validate file type
            is_valid, error_msg = validate_file_type(safe_filename, file_content)
            if not is_valid:
                return jsonify({'error': f'File {safe_filename}: {error_msg}'}), 400
            
            # Generate unique filename
            file_extension = safe_filename.rsplit('.', 1)[1].lower() if '.' in safe_filename else ''
            unique_filename = f"{user_id}/{uuid.uuid4()}.{file_extension}"
            
            # Determine content type
            content_type = file.content_type or mimetypes.guess_type(file.filename)[0] or 'application/octet-stream'
            
            # Upload to Supabase Storage
            file_data = file.read()
            
            response = supabase.storage.from_('quest-evidence').upload(
                path=unique_filename,
                file=file_data,
                file_options={"content-type": content_type}
            )
            
            # Get public URL for the uploaded file
            url_response = supabase.storage.from_('quest-evidence').get_public_url(unique_filename)
            
            uploaded_files.append({
                'original_name': file.filename,
                'stored_name': unique_filename,
                'url': url_response,
                'size': file_size,
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
            
            # Sanitize filename
            safe_filename = sanitize_filename(filename)
            
            # Decode base64 content
            try:
                file_content = base64.b64decode(base64_content)
            except Exception as e:
                return jsonify({'error': f'Invalid base64 content for {safe_filename}'}), 400
            
            # Check file size (10MB max)
            if len(file_content) > MAX_FILE_SIZE:
                return jsonify({'error': f'File {safe_filename} exceeds 10MB limit'}), 400
            
            # Validate file type
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