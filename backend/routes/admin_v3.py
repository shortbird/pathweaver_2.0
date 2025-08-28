from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from datetime import datetime
import json
import base64
import uuid

bp = Blueprint('admin_v3', __name__, url_prefix='/api/v3/admin')

@bp.route('/quests', methods=['POST'])
@require_admin
def create_quest(user_id):
    """Create a new quest with tasks."""
    print(f"CREATE QUEST V3: user_id={user_id}, content_type={request.content_type}")
    print(f"Files in request: {list(request.files.keys())}")
    print(f"Form data keys: {list(request.form.keys())}")
    
    supabase = get_supabase_admin_client()
    
    try:
        # Check if this is FormData or JSON
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Handle FormData
            data = {
                'title': request.form.get('title'),
                'big_idea': request.form.get('big_idea'),
                'is_active': request.form.get('is_active', 'true').lower() == 'true'
            }
            
            # Parse tasks from JSON string
            tasks_json = request.form.get('tasks', '[]')
            tasks = json.loads(tasks_json)
            
            # Handle header image upload
            header_image_url = None
            if 'header_image' in request.files:
                file = request.files['header_image']
                if file and file.filename:
                    # Read file content
                    file_content = file.read()
                    file_extension = file.filename.rsplit('.', 1)[-1].lower()
                    
                    # Generate unique filename
                    file_name = f"quest_headers/{uuid.uuid4()}.{file_extension}"
                    
                    # Upload to Supabase storage
                    try:
                        print(f"Uploading image: {file.filename}, size: {len(file_content)} bytes, type: {file.content_type}")
                        storage_response = supabase.storage.from_('quest-images').upload(
                            file_name,
                            file_content,
                            {'content-type': file.content_type}
                        )
                        
                        # Check if upload was successful
                        if hasattr(storage_response, 'error') and storage_response.error:
                            print(f"Storage upload error: {storage_response.error}")
                            return jsonify({'error': f'Image upload failed: {storage_response.error}'}), 400
                        
                        # Get public URL
                        header_image_url = supabase.storage.from_('quest-images').get_public_url(file_name)
                        data['header_image_url'] = header_image_url
                        print(f"Image uploaded successfully: {header_image_url}")
                    except Exception as upload_error:
                        print(f"Storage upload exception: {str(upload_error)}")
                        import traceback
                        traceback.print_exc()
                        return jsonify({'error': f'Image upload failed: {str(upload_error)}'}), 400
        else:
            # Handle JSON
            data = request.json
            tasks = data.pop('tasks', [])
            
            # Check if base64 image is included
            if 'header_image_base64' in data:
                try:
                    import base64
                    # Extract base64 data (remove data:image/xxx;base64, prefix)
                    base64_str = data['header_image_base64']
                    if ',' in base64_str:
                        base64_str = base64_str.split(',')[1]
                    
                    # Decode base64 to bytes
                    file_content = base64.b64decode(base64_str)
                    
                    # Get filename and extension
                    filename = data.get('header_image_filename', 'image.jpg')
                    file_extension = filename.rsplit('.', 1)[-1].lower()
                    
                    # Generate unique filename
                    file_name = f"quest_headers/{uuid.uuid4()}.{file_extension}"
                    
                    # Upload to Supabase storage
                    print(f"Uploading base64 image: {filename}, size: {len(file_content)} bytes")
                    storage_response = supabase.storage.from_('quest-images').upload(
                        file_name,
                        file_content,
                        {'content-type': f'image/{file_extension}'}
                    )
                    
                    # Check if upload was successful
                    if hasattr(storage_response, 'error') and storage_response.error:
                        print(f"Storage upload error: {storage_response.error}")
                        return jsonify({'error': f'Image upload failed: {storage_response.error}'}), 400
                    
                    # Get public URL
                    header_image_url = supabase.storage.from_('quest-images').get_public_url(file_name)
                    data['header_image_url'] = header_image_url
                    print(f"Image uploaded successfully: {header_image_url}")
                    
                    # Remove base64 data from data dict
                    del data['header_image_base64']
                    if 'header_image_filename' in data:
                        del data['header_image_filename']
                except Exception as upload_error:
                    print(f"Base64 image upload exception: {str(upload_error)}")
                    import traceback
                    traceback.print_exc()
                    return jsonify({'error': f'Image upload failed: {str(upload_error)}'}), 400
        
        # Create quest
        quest_data = {
            'title': data['title'],
            'big_idea': data['big_idea'],
            'is_active': data.get('is_active', True),
            'created_at': datetime.utcnow().isoformat()
        }
        
        if 'header_image_url' in data:
            quest_data['header_image_url'] = data['header_image_url']
        
        quest_response = supabase.table('quests').insert(quest_data).execute()
        
        if not quest_response.data:
            return jsonify({'error': 'Failed to create quest'}), 500
        
        quest = quest_response.data[0]
        quest_id = quest['id']
        
        # Create tasks
        if tasks:
            task_records = []
            for idx, task in enumerate(tasks):
                task_records.append({
                    'quest_id': quest_id,
                    'title': task['title'],
                    'description': task.get('description'),
                    'xp_amount': task['xp_amount'],
                    'pillar': task['pillar'],
                    'task_order': idx,
                    'created_at': datetime.utcnow().isoformat()
                })
            
            tasks_response = supabase.table('quest_tasks').insert(task_records).execute()
            
            if not tasks_response.data:
                # Rollback quest creation if tasks fail
                supabase.table('quests').delete().eq('id', quest_id).execute()
                return jsonify({'error': 'Failed to create quest tasks'}), 500
            
            quest['quest_tasks'] = tasks_response.data
        
        return jsonify({'quest': quest}), 201
        
    except Exception as e:
        print(f"Error creating quest: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/quests/<quest_id>', methods=['PUT'])
@require_admin
def update_quest(user_id, quest_id):
    """Update an existing quest with tasks."""
    supabase = get_supabase_admin_client()
    
    try:
        # Check if this is FormData or JSON
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Handle FormData
            data = {
                'title': request.form.get('title'),
                'big_idea': request.form.get('big_idea'),
                'is_active': request.form.get('is_active', 'true').lower() == 'true'
            }
            
            # Parse tasks from JSON string
            tasks_json = request.form.get('tasks', '[]')
            tasks = json.loads(tasks_json)
            
            # Handle header image upload
            if 'header_image' in request.files:
                file = request.files['header_image']
                if file and file.filename:
                    # Read file content
                    file_content = file.read()
                    file_extension = file.filename.rsplit('.', 1)[-1].lower()
                    
                    # Generate unique filename
                    file_name = f"quest_headers/{uuid.uuid4()}.{file_extension}"
                    
                    # Upload to Supabase storage
                    try:
                        print(f"Uploading image: {file.filename}, size: {len(file_content)} bytes, type: {file.content_type}")
                        storage_response = supabase.storage.from_('quest-images').upload(
                            file_name,
                            file_content,
                            {'content-type': file.content_type}
                        )
                        
                        # Check if upload was successful
                        if hasattr(storage_response, 'error') and storage_response.error:
                            print(f"Storage upload error: {storage_response.error}")
                            return jsonify({'error': f'Image upload failed: {storage_response.error}'}), 400
                        
                        # Get public URL
                        header_image_url = supabase.storage.from_('quest-images').get_public_url(file_name)
                        data['header_image_url'] = header_image_url
                        print(f"Image uploaded successfully: {header_image_url}")
                    except Exception as upload_error:
                        print(f"Storage upload exception: {str(upload_error)}")
                        import traceback
                        traceback.print_exc()
                        return jsonify({'error': f'Image upload failed: {str(upload_error)}'}), 400
        else:
            # Handle JSON
            data = request.json
            tasks = data.pop('tasks', [])
            
            # Check if base64 image is included (same as create endpoint)
            if 'header_image_base64' in data:
                try:
                    import base64
                    # Extract base64 data (remove data:image/xxx;base64, prefix)
                    base64_str = data['header_image_base64']
                    if ',' in base64_str:
                        base64_str = base64_str.split(',')[1]
                    
                    # Decode base64 to bytes
                    file_content = base64.b64decode(base64_str)
                    
                    # Get filename and extension
                    filename = data.get('header_image_filename', 'image.jpg')
                    file_extension = filename.rsplit('.', 1)[-1].lower()
                    
                    # Generate unique filename
                    file_name = f"quest_headers/{uuid.uuid4()}.{file_extension}"
                    
                    # Upload to Supabase storage
                    print(f"Uploading base64 image: {filename}, size: {len(file_content)} bytes")
                    storage_response = supabase.storage.from_('quest-images').upload(
                        file_name,
                        file_content,
                        {'content-type': f'image/{file_extension}'}
                    )
                    
                    # Check if upload was successful
                    if hasattr(storage_response, 'error') and storage_response.error:
                        print(f"Storage upload error: {storage_response.error}")
                        return jsonify({'error': f'Image upload failed: {storage_response.error}'}), 400
                    
                    # Get public URL
                    header_image_url = supabase.storage.from_('quest-images').get_public_url(file_name)
                    data['header_image_url'] = header_image_url
                    print(f"Image uploaded successfully: {header_image_url}")
                    
                    # Remove base64 data from data dict
                    del data['header_image_base64']
                    if 'header_image_filename' in data:
                        del data['header_image_filename']
                except Exception as upload_error:
                    print(f"Base64 image upload exception: {str(upload_error)}")
                    import traceback
                    traceback.print_exc()
                    return jsonify({'error': f'Image upload failed: {str(upload_error)}'}), 400
        
        # Update quest
        quest_data = {
            'title': data['title'],
            'big_idea': data['big_idea'],
            'is_active': data.get('is_active', True),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        if 'header_image_url' in data:
            quest_data['header_image_url'] = data['header_image_url']
        
        quest_response = supabase.table('quests').update(quest_data).eq('id', quest_id).execute()
        
        if not quest_response.data:
            return jsonify({'error': 'Failed to update quest'}), 500
        
        quest = quest_response.data[0]
        
        # Delete existing tasks and recreate
        supabase.table('quest_tasks').delete().eq('quest_id', quest_id).execute()
        
        # Create new tasks
        if tasks:
            task_records = []
            for idx, task in enumerate(tasks):
                task_records.append({
                    'quest_id': quest_id,
                    'title': task['title'],
                    'description': task.get('description'),
                    'xp_amount': task['xp_amount'],
                    'pillar': task['pillar'],
                    'task_order': idx,
                    'created_at': datetime.utcnow().isoformat()
                })
            
            tasks_response = supabase.table('quest_tasks').insert(task_records).execute()
            quest['quest_tasks'] = tasks_response.data if tasks_response.data else []
        
        return jsonify({'quest': quest}), 200
        
    except Exception as e:
        print(f"Error updating quest: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/quests/<quest_id>', methods=['DELETE'])
@require_admin
def delete_quest(user_id, quest_id):
    """Delete a quest and all its tasks."""
    supabase = get_supabase_admin_client()
    
    try:
        # Delete quest (tasks will cascade delete)
        result = supabase.table('quests').delete().eq('id', quest_id).execute()
        
        if not result.data:
            return jsonify({'error': 'Quest not found'}), 404
        
        return jsonify({'message': 'Quest deleted successfully'}), 200
        
    except Exception as e:
        print(f"Error deleting quest: {str(e)}")
        return jsonify({'error': str(e)}), 500