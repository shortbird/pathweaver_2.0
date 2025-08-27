from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client
import base64
import uuid
import mimetypes
from datetime import datetime

bp = Blueprint('uploads', __name__)

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
            
            # Validate file size (50MB max)
            file.seek(0, 2)  # Seek to end
            file_size = file.tell()
            file.seek(0)  # Reset to beginning
            
            if file_size > 50 * 1024 * 1024:
                return jsonify({'error': f'File {file.filename} exceeds 50MB limit'}), 400
            
            # Generate unique filename
            file_extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
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
        print(f"Upload error: {str(e)}")
        return jsonify({'error': str(e)}), 500

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
                return jsonify({'error': f'Invalid base64 content for {filename}'}), 400
            
            # Check file size (50MB max)
            if len(file_content) > 50 * 1024 * 1024:
                return jsonify({'error': f'File {filename} exceeds 50MB limit'}), 400
            
            # Generate unique filename
            file_extension = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
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
        print(f"Upload error: {str(e)}")
        return jsonify({'error': str(e)}), 500