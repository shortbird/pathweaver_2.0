"""
Routes for managing quest sources and their default header images
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
import uuid
import base64
import json
import os

bp = Blueprint('sources', __name__, url_prefix='/sources')

# Store source images with predictable filenames in Supabase storage
SOURCE_IMAGE_PREFIX = 'source_defaults/'

@bp.route('', methods=['GET'])
def get_sources():
    """Get all available sources and their header images"""
    supabase = get_supabase_admin_client()
    
    # Define sources with their storage paths
    sources = {
        'optio': {
            'id': 'optio',
            'name': 'Optio',
            'header_image_path': f'{SOURCE_IMAGE_PREFIX}optio_header.png'
        },
        'khan_academy': {
            'id': 'khan_academy', 
            'name': 'Khan Academy',
            'header_image_path': f'{SOURCE_IMAGE_PREFIX}khan_academy_header.png'
        }
    }
    
    # Check if header images exist and get their public URLs
    for source_id, source_data in sources.items():
        try:
            # Try to get the public URL for the source's header image
            public_url = supabase.storage.from_('quest-images').get_public_url(source_data['header_image_path'])
            source_data['header_image_url'] = public_url
        except:
            source_data['header_image_url'] = None
    
    # Also get custom sources from localStorage (stored as metadata in a special file)
    try:
        custom_sources_data = supabase.storage.from_('quest-images').download(f'{SOURCE_IMAGE_PREFIX}custom_sources.json')
        if custom_sources_data:
            custom_sources = json.loads(custom_sources_data)
            for custom_id, custom_data in custom_sources.items():
                if custom_id not in sources:
                    sources[custom_id] = custom_data
                    # Get public URL for custom source
                    try:
                        public_url = supabase.storage.from_('quest-images').get_public_url(custom_data['header_image_path'])
                        sources[custom_id]['header_image_url'] = public_url
                    except:
                        sources[custom_id]['header_image_url'] = None
    except:
        # No custom sources file yet
        pass
    
    return jsonify(sources), 200

@bp.route('/<source_id>/header', methods=['POST'])
@require_admin
def upload_source_header(user_id, source_id):
    """Upload or update the default header image for a source"""
    supabase = get_supabase_admin_client()
    
    try:
        # Handle both FormData and JSON with base64
        file_content = None
        content_type = 'image/png'
        
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Handle file upload
            if 'header_image' not in request.files:
                return jsonify({'error': 'No image file provided'}), 400
            
            file = request.files['header_image']
            if file and file.filename:
                file_content = file.read()
                content_type = file.content_type or 'image/png'
        else:
            # Handle JSON with base64
            data = request.json
            if 'header_image_base64' not in data:
                return jsonify({'error': 'No image data provided'}), 400
            
            # Extract base64 data
            base64_str = data['header_image_base64']
            if ',' in base64_str:
                base64_str = base64_str.split(',')[1]
            
            file_content = base64.b64decode(base64_str)
            
            # Determine content type from filename or default
            if 'header_image_filename' in data:
                ext = data['header_image_filename'].rsplit('.', 1)[-1].lower()
                content_type = f'image/{ext}'
        
        if not file_content:
            return jsonify({'error': 'No image data received'}), 400
        
        # Determine file extension
        ext = 'png'
        if 'jpeg' in content_type or 'jpg' in content_type:
            ext = 'jpg'
        elif 'gif' in content_type:
            ext = 'gif'
        elif 'webp' in content_type:
            ext = 'webp'
        
        # Store with predictable filename based on source_id
        file_name = f'{SOURCE_IMAGE_PREFIX}{source_id}_header.{ext}'
        
        # Delete existing file if it exists (with different extension)
        for old_ext in ['png', 'jpg', 'jpeg', 'gif', 'webp']:
            old_file = f'{SOURCE_IMAGE_PREFIX}{source_id}_header.{old_ext}'
            try:
                supabase.storage.from_('quest-images').remove([old_file])
            except:
                pass  # File might not exist
        
        # Upload new file
        print(f"Uploading source header: {file_name}, size: {len(file_content)} bytes")
        storage_response = supabase.storage.from_('quest-images').upload(
            file_name,
            file_content,
            {'content-type': content_type, 'upsert': 'true'}
        )
        
        # Check if upload was successful
        if hasattr(storage_response, 'error') and storage_response.error:
            # Try upsert if file exists
            storage_response = supabase.storage.from_('quest-images').update(
                file_name,
                file_content,
                {'content-type': content_type}
            )
            
            if hasattr(storage_response, 'error') and storage_response.error:
                print(f"Storage upload error: {storage_response.error}")
                return jsonify({'error': f'Image upload failed: {storage_response.error}'}), 400
        
        # Get public URL
        header_image_url = supabase.storage.from_('quest-images').get_public_url(file_name)
        
        # If this is a custom source, update the custom sources metadata
        if source_id not in ['optio', 'khan_academy']:
            try:
                # Get existing custom sources
                custom_sources = {}
                try:
                    custom_data = supabase.storage.from_('quest-images').download(f'{SOURCE_IMAGE_PREFIX}custom_sources.json')
                    if custom_data:
                        custom_sources = json.loads(custom_data)
                except:
                    pass
                
                # Add/update this source
                source_name = request.form.get('source_name') or request.json.get('source_name', source_id.replace('_', ' ').title())
                custom_sources[source_id] = {
                    'id': source_id,
                    'name': source_name,
                    'header_image_path': file_name
                }
                
                # Save updated custom sources
                custom_json = json.dumps(custom_sources).encode('utf-8')
                supabase.storage.from_('quest-images').upload(
                    f'{SOURCE_IMAGE_PREFIX}custom_sources.json',
                    custom_json,
                    {'content-type': 'application/json', 'upsert': 'true'}
                )
            except Exception as e:
                print(f"Error updating custom sources metadata: {e}")
        
        return jsonify({
            'source_id': source_id,
            'header_image_url': header_image_url,
            'message': 'Source header image uploaded successfully'
        }), 200
        
    except Exception as e:
        print(f"Error uploading source header: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@bp.route('/<source_id>/header', methods=['GET'])
def get_source_header(source_id):
    """Get the header image URL for a specific source"""
    supabase = get_supabase_admin_client()
    
    # Try different extensions
    for ext in ['png', 'jpg', 'jpeg', 'gif', 'webp']:
        file_name = f'{SOURCE_IMAGE_PREFIX}{source_id}_header.{ext}'
        try:
            # Check if file exists by trying to get its public URL
            public_url = supabase.storage.from_('quest-images').get_public_url(file_name)
            
            # Verify the file actually exists by trying to list it
            files = supabase.storage.from_('quest-images').list(SOURCE_IMAGE_PREFIX)
            if any(f['name'] == f'{source_id}_header.{ext}' for f in files):
                return jsonify({
                    'source_id': source_id,
                    'header_image_url': public_url
                }), 200
        except:
            continue
    
    return jsonify({
        'source_id': source_id,
        'header_image_url': None,
        'message': 'No header image found for this source'
    }), 200