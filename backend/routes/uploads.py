from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client
import base64
import uuid
import mimetypes
import magic
import hashlib
from datetime import datetime

bp = Blueprint('uploads', __name__)

# Allowed file types for evidence uploads (whitelist approach)
ALLOWED_EXTENSIONS = {
    'image': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    'video': ['mp4', 'webm', 'ogg', 'mov', 'avi'],
    'audio': ['mp3', 'wav', 'ogg', 'aac', 'm4a'],
    'document': ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'],
    'code': ['py', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'java', 'cpp', 'c', 'h', 'json', 'xml', 'yaml', 'yml'],
    'archive': ['zip', 'tar', 'gz', '7z']
}

# MIME type mapping for security
ALLOWED_MIME_TYPES = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/gif': ['gif'],
    'image/webp': ['webp'],
    'image/svg+xml': ['svg'],
    'video/mp4': ['mp4'],
    'video/webm': ['webm'],
    'video/ogg': ['ogg'],
    'video/quicktime': ['mov'],
    'video/x-msvideo': ['avi'],
    'audio/mpeg': ['mp3'],
    'audio/wav': ['wav'],
    'audio/ogg': ['ogg'],
    'audio/aac': ['aac'],
    'audio/mp4': ['m4a'],
    'application/pdf': ['pdf'],
    'application/msword': ['doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'text/plain': ['txt', 'md'],
    'text/rtf': ['rtf'],
    'text/html': ['html'],
    'text/css': ['css'],
    'application/javascript': ['js'],
    'application/json': ['json'],
    'application/xml': ['xml'],
    'application/zip': ['zip'],
    'application/x-tar': ['tar'],
    'application/gzip': ['gz'],
    'application/x-7z-compressed': ['7z']
}

def get_all_allowed_extensions():
    """Get a flat list of all allowed file extensions"""
    extensions = set()
    for category_extensions in ALLOWED_EXTENSIONS.values():
        extensions.update(category_extensions)
    return extensions

def validate_file_extension(filename):
    """Validate file extension against whitelist"""
    if '.' not in filename:
        return False, "File must have an extension"
    
    extension = filename.rsplit('.', 1)[1].lower()
    allowed = get_all_allowed_extensions()
    
    if extension not in allowed:
        return False, f"File type .{extension} is not allowed. Allowed types: {', '.join(sorted(allowed))}"
    
    return True, extension

def validate_mime_type(content_type, extension):
    """Validate MIME type matches the file extension"""
    # For some file types, MIME type might not be set correctly
    if not content_type or content_type == 'application/octet-stream':
        # Try to guess from extension
        content_type = mimetypes.guess_type(f"file.{extension}")[0]
        if not content_type:
            # Allow for code files which might not have standard MIME types
            if extension in ALLOWED_EXTENSIONS.get('code', []):
                return True, content_type
            return False, "Unable to determine file type"
    
    # Check if MIME type is allowed
    if content_type not in ALLOWED_MIME_TYPES:
        # Special handling for text files
        if content_type.startswith('text/') and extension in ALLOWED_EXTENSIONS.get('code', []):
            return True, content_type
        return False, f"MIME type {content_type} is not allowed"
    
    # Check if extension matches MIME type
    allowed_extensions = ALLOWED_MIME_TYPES.get(content_type, [])
    if extension not in allowed_extensions:
        # Special case for code files
        if extension in ALLOWED_EXTENSIONS.get('code', []):
            return True, content_type
        return False, f"File extension .{extension} does not match MIME type {content_type}"
    
    return True, content_type

def validate_file_content(file_data, extension):
    """Validate file content using magic bytes (file signature)"""
    try:
        # Try to use python-magic if available
        mime = magic.from_buffer(file_data[:1024], mime=True)
        
        # For text/code files, magic might return text/plain which is ok
        if mime == 'text/plain' and extension in ALLOWED_EXTENSIONS.get('code', []):
            return True, "Valid code/text file"
        
        # For other files, check if the detected MIME matches allowed types
        if mime not in ALLOWED_MIME_TYPES and not mime.startswith('text/'):
            return False, f"File content detected as {mime}, which is not allowed"
            
    except:
        # python-magic not available, do basic validation
        # Check for common malicious patterns
        header = file_data[:16] if len(file_data) >= 16 else file_data
        
        # Check for executable file signatures
        if header.startswith(b'MZ'):  # Windows PE executable
            return False, "Executable files are not allowed"
        if header.startswith(b'\x7fELF'):  # Linux ELF executable
            return False, "Executable files are not allowed"
        if header.startswith(b'#!/'):  # Shell script with shebang
            if extension not in ['sh', 'bash', 'py', 'rb']:
                return False, "Script files must have appropriate extension"
    
    return True, "File content validation passed"

def sanitize_filename(filename):
    """Sanitize filename to prevent path traversal attacks"""
    # Remove any path components
    filename = filename.replace('\\', '/').split('/')[-1]
    
    # Remove dangerous characters
    dangerous_chars = ['..', '~', '`', '|', ';', '&', '$', '(', ')', '<', '>', '\n', '\r', '\0']
    for char in dangerous_chars:
        filename = filename.replace(char, '')
    
    # Ensure filename is not empty after sanitization
    if not filename or filename == '.':
        filename = f'file_{uuid.uuid4()}'
    
    return filename

@bp.route('/evidence', methods=['POST'])
@require_auth
def upload_evidence(user_id):
    """
    Upload evidence files for quest submissions with enhanced security
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
            
            # Validate file extension
            valid_ext, ext_result = validate_file_extension(safe_filename)
            if not valid_ext:
                return jsonify({'error': ext_result}), 400
            
            extension = ext_result
            
            # Validate file size (10MB max for better security)
            file.seek(0, 2)  # Seek to end
            file_size = file.tell()
            file.seek(0)  # Reset to beginning
            
            if file_size > 10 * 1024 * 1024:
                return jsonify({'error': f'File {safe_filename} exceeds 10MB limit'}), 400
            
            if file_size == 0:
                return jsonify({'error': f'File {safe_filename} is empty'}), 400
            
            # Read file data
            file_data = file.read()
            file.seek(0)  # Reset for potential re-read
            
            # Validate MIME type
            content_type = file.content_type or mimetypes.guess_type(safe_filename)[0] or 'application/octet-stream'
            valid_mime, mime_result = validate_mime_type(content_type, extension)
            if not valid_mime:
                return jsonify({'error': f'{safe_filename}: {mime_result}'}), 400
            
            # Validate file content
            valid_content, content_result = validate_file_content(file_data, extension)
            if not valid_content:
                return jsonify({'error': f'{safe_filename}: {content_result}'}), 400
            
            # Generate unique filename with user isolation
            file_hash = hashlib.sha256(file_data).hexdigest()[:8]
            unique_filename = f"{user_id}/{uuid.uuid4()}_{file_hash}.{extension}"
            
            # Upload to Supabase Storage
            response = supabase.storage.from_('quest-evidence').upload(
                path=unique_filename,
                file=file_data,
                file_options={"content-type": content_type}
            )
            
            # Get public URL for the uploaded file
            url_response = supabase.storage.from_('quest-evidence').get_public_url(unique_filename)
            
            uploaded_files.append({
                'original_name': safe_filename,
                'stored_name': unique_filename,
                'url': url_response,
                'size': file_size,
                'content_type': content_type,
                'file_hash': file_hash,
                'uploaded_at': datetime.utcnow().isoformat()
            })
        
        return jsonify({
            'files': uploaded_files,
            'count': len(uploaded_files)
        }), 200
        
    except Exception as e:
        print(f"Upload error: {str(e)}")
        return jsonify({'error': 'File upload failed. Please try again.'}), 500

@bp.route('/evidence/base64', methods=['POST'])
@require_auth
def upload_evidence_base64(user_id):
    """
    Upload evidence files as base64 encoded data with enhanced security
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
            
            # Validate file extension
            valid_ext, ext_result = validate_file_extension(safe_filename)
            if not valid_ext:
                return jsonify({'error': ext_result}), 400
            
            extension = ext_result
            
            # Decode base64 content
            try:
                file_content = base64.b64decode(base64_content)
            except Exception as e:
                return jsonify({'error': f'Invalid base64 content for {safe_filename}'}), 400
            
            # Check file size (10MB max for better security)
            if len(file_content) > 10 * 1024 * 1024:
                return jsonify({'error': f'File {safe_filename} exceeds 10MB limit'}), 400
            
            if len(file_content) == 0:
                return jsonify({'error': f'File {safe_filename} is empty'}), 400
            
            # Validate MIME type
            valid_mime, mime_result = validate_mime_type(content_type, extension)
            if not valid_mime:
                return jsonify({'error': f'{safe_filename}: {mime_result}'}), 400
            
            # Validate file content
            valid_content, content_result = validate_file_content(file_content, extension)
            if not valid_content:
                return jsonify({'error': f'{safe_filename}: {content_result}'}), 400
            
            # Generate unique filename with user isolation
            file_hash = hashlib.sha256(file_content).hexdigest()[:8]
            unique_filename = f"{user_id}/{uuid.uuid4()}_{file_hash}.{extension}"
            
            # Upload to Supabase Storage
            response = supabase.storage.from_('quest-evidence').upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": content_type}
            )
            
            # Get public URL for the uploaded file
            url_response = supabase.storage.from_('quest-evidence').get_public_url(unique_filename)
            
            uploaded_files.append({
                'original_name': safe_filename,
                'stored_name': unique_filename,
                'url': url_response,
                'size': len(file_content),
                'content_type': content_type,
                'file_hash': file_hash,
                'uploaded_at': datetime.utcnow().isoformat()
            })
        
        return jsonify({
            'files': uploaded_files,
            'count': len(uploaded_files)
        }), 200
        
    except Exception as e:
        print(f"Upload error: {str(e)}")
        return jsonify({'error': 'File upload failed. Please try again.'}), 500