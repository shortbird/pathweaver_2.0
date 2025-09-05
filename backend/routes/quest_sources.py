"""
Quest Sources Management Routes
Handles CRUD operations for quest sources and their header images
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
import uuid
import base64
from utils.auth.decorators import require_admin
from database import get_supabase_admin_client

bp = Blueprint('quest_sources', __name__, url_prefix='/v3/admin/quest-sources')

@bp.route('', methods=['GET'])
@require_admin
def list_quest_sources(user_id):
    """Get all quest sources with their header images"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get all sources
        response = supabase.table('quest_sources').select('*').execute()
        
        if not response.data:
            # Create default sources if none exist
            default_sources = [
                {'id': 'optio', 'name': 'Optio'},
                {'id': 'khan_academy', 'name': 'Khan Academy'},
                {'id': 'brilliant', 'name': 'Brilliant'},
                {'id': 'admin', 'name': 'Admin Created'},
                {'id': 'student_submitted', 'name': 'Student Submitted'},
                {'id': 'coursera', 'name': 'Coursera'},
                {'id': 'edx', 'name': 'edX'},
                {'id': 'udemy', 'name': 'Udemy'},
                {'id': 'custom', 'name': 'Custom'}
            ]
            
            supabase.table('quest_sources').insert(default_sources).execute()
            response = supabase.table('quest_sources').select('*').execute()
        
        sources = response.data if response.data else []
        
        # Get count of quests for each source
        for source in sources:
            quest_count = supabase.table('quests')\
                .select('id', count='exact')\
                .eq('source', source['id'])\
                .execute()
            source['quest_count'] = quest_count.count if hasattr(quest_count, 'count') else 0
        
        return jsonify({
            'sources': sources,
            'total': len(sources)
        }), 200
        
    except Exception as e:
        print(f"Error fetching quest sources: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('', methods=['POST'])
@require_admin
def create_quest_source(user_id):
    """Create a new quest source with optional header image"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        # Validate required fields
        if not data.get('id') or not data.get('name'):
            return jsonify({'error': 'Source ID and name are required'}), 400
        
        # Check if source ID already exists
        existing = supabase.table('quest_sources')\
            .select('id')\
            .eq('id', data['id'])\
            .execute()
        
        if existing.data:
            return jsonify({'error': 'Source ID already exists'}), 400
        
        # Handle image upload if provided
        header_image_url = None
        if data.get('header_image_base64'):
            try:
                # Extract base64 data and file extension
                image_data = data['header_image_base64']
                if 'data:image/' in image_data:
                    # Extract MIME type and base64 data
                    header, encoded = image_data.split(',', 1)
                    mime_type = header.split(':')[1].split(';')[0]
                    file_extension = mime_type.split('/')[-1]
                else:
                    # Default to jpg if no MIME type
                    encoded = image_data
                    file_extension = 'jpg'
                
                # Decode base64
                image_bytes = base64.b64decode(encoded)
                
                # Generate unique filename
                file_name = f"source_headers/{data['id']}_{uuid.uuid4()}.{file_extension}"
                
                # Upload to Supabase storage
                storage_response = supabase.storage.from_('quest-images').upload(
                    file_name,
                    image_bytes,
                    {'content-type': f'image/{file_extension}'}
                )
                
                if hasattr(storage_response, 'error') and storage_response.error:
                    print(f"Storage upload error: {storage_response.error}")
                    return jsonify({'error': f'Image upload failed: {storage_response.error}'}), 400
                
                # Get public URL
                header_image_url = supabase.storage.from_('quest-images').get_public_url(file_name)
                print(f"Image uploaded successfully: {header_image_url}")
                
            except Exception as e:
                print(f"Error processing image: {str(e)}")
                return jsonify({'error': f'Failed to process image: {str(e)}'}), 400
        
        # Create source record
        source_data = {
            'id': data['id'].lower().replace(' ', '_'),
            'name': data['name'],
            'header_image_url': header_image_url,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        response = supabase.table('quest_sources').insert(source_data).execute()
        
        if not response.data:
            return jsonify({'error': 'Failed to create source'}), 500
        
        return jsonify({
            'source': response.data[0],
            'message': 'Source created successfully'
        }), 201
        
    except Exception as e:
        print(f"Error creating quest source: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/<source_id>', methods=['PUT'])
@require_admin
def update_quest_source(user_id, source_id):
    """Update a quest source's name or header image"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        # Check if source exists
        existing = supabase.table('quest_sources')\
            .select('*')\
            .eq('id', source_id)\
            .execute()
        
        if not existing.data:
            return jsonify({'error': 'Source not found'}), 404
        
        update_data = {'updated_at': datetime.utcnow().isoformat()}
        
        # Update name if provided
        if data.get('name'):
            update_data['name'] = data['name']
        
        # Handle image update if provided
        if data.get('header_image_base64'):
            try:
                # Extract base64 data and file extension
                image_data = data['header_image_base64']
                if 'data:image/' in image_data:
                    header, encoded = image_data.split(',', 1)
                    mime_type = header.split(':')[1].split(';')[0]
                    file_extension = mime_type.split('/')[-1]
                else:
                    encoded = image_data
                    file_extension = 'jpg'
                
                # Decode base64
                image_bytes = base64.b64decode(encoded)
                
                # Generate unique filename
                file_name = f"source_headers/{source_id}_{uuid.uuid4()}.{file_extension}"
                
                # Upload to Supabase storage
                storage_response = supabase.storage.from_('quest-images').upload(
                    file_name,
                    image_bytes,
                    {'content-type': f'image/{file_extension}'}
                )
                
                if hasattr(storage_response, 'error') and storage_response.error:
                    print(f"Storage upload error: {storage_response.error}")
                    return jsonify({'error': f'Image upload failed: {storage_response.error}'}), 400
                
                # Get public URL
                update_data['header_image_url'] = supabase.storage.from_('quest-images').get_public_url(file_name)
                
                # Delete old image if it exists (optional)
                old_image_url = existing.data[0].get('header_image_url')
                if old_image_url and 'quest-images' in old_image_url:
                    try:
                        # Extract file path from URL
                        old_file_path = old_image_url.split('/quest-images/')[-1].split('?')[0]
                        supabase.storage.from_('quest-images').remove([old_file_path])
                    except Exception as e:
                        print(f"Could not delete old image: {e}")
                
            except Exception as e:
                print(f"Error processing image: {str(e)}")
                return jsonify({'error': f'Failed to process image: {str(e)}'}), 400
        
        # Update source
        response = supabase.table('quest_sources')\
            .update(update_data)\
            .eq('id', source_id)\
            .execute()
        
        if not response.data:
            return jsonify({'error': 'Failed to update source'}), 500
        
        return jsonify({
            'source': response.data[0],
            'message': 'Source updated successfully'
        }), 200
        
    except Exception as e:
        print(f"Error updating quest source: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/<source_id>', methods=['DELETE'])
@require_admin
def delete_quest_source(user_id, source_id):
    """Delete a quest source (only if no quests are using it)"""
    supabase = get_supabase_admin_client()
    
    try:
        # Check if any quests use this source
        quests = supabase.table('quests')\
            .select('id')\
            .eq('source', source_id)\
            .execute()
        
        if quests.data:
            return jsonify({
                'error': f'Cannot delete source: {len(quests.data)} quests are using it'
            }), 400
        
        # Get source to delete its image
        source = supabase.table('quest_sources')\
            .select('header_image_url')\
            .eq('id', source_id)\
            .execute()
        
        if not source.data:
            return jsonify({'error': 'Source not found'}), 404
        
        # Delete image from storage if it exists
        header_image_url = source.data[0].get('header_image_url')
        if header_image_url and 'quest-images' in header_image_url:
            try:
                file_path = header_image_url.split('/quest-images/')[-1].split('?')[0]
                supabase.storage.from_('quest-images').remove([file_path])
            except Exception as e:
                print(f"Could not delete image: {e}")
        
        # Delete source record
        supabase.table('quest_sources')\
            .delete()\
            .eq('id', source_id)\
            .execute()
        
        return jsonify({'message': 'Source deleted successfully'}), 200
        
    except Exception as e:
        print(f"Error deleting quest source: {str(e)}")
        return jsonify({'error': str(e)}), 500