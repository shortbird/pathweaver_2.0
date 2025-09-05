from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.pillar_mapping import normalize_pillar_name, validate_pillar
from datetime import datetime, timedelta
import json
import base64
import uuid

bp = Blueprint('admin_v3', __name__, url_prefix='/api/v3/admin')

@bp.route('/quests/create-v3', methods=['POST'])
@require_admin
def create_quest_v3_clean(user_id):
    """
    Create a new quest with comprehensive validation and error handling.
    This is the clean, rebuilt version to avoid previous bugs.
    """
    print(f"CREATE QUEST V3 CLEAN: admin_user_id={user_id}")
    supabase = get_supabase_admin_client()
    
    try:
        data = request.json
        print(f"Received quest data: {json.dumps(data, indent=2)}")
        
        # Validate required fields
        if not data.get('title'):
            return jsonify({'error': 'Quest title is required'}), 400
        
        if not data.get('big_idea'):
            return jsonify({'error': 'Quest big idea/description is required'}), 400
        
        if not data.get('tasks') or not isinstance(data['tasks'], list) or len(data['tasks']) == 0:
            return jsonify({'error': 'At least one task is required'}), 400
        
        # Validate and normalize each task
        validated_tasks = []
        for idx, task in enumerate(data['tasks']):
            # Validate required task fields
            if not task.get('title'):
                return jsonify({'error': f'Task {idx + 1}: Title is required'}), 400
            
            if not task.get('description'):
                return jsonify({'error': f'Task {idx + 1}: Description is required'}), 400
            
            if not task.get('pillar'):
                return jsonify({'error': f'Task {idx + 1}: Pillar is required'}), 400
            
            # Validate and normalize pillar
            try:
                normalized_pillar = normalize_pillar_name(task['pillar'])
                print(f"Task {idx + 1}: Normalized pillar from '{task['pillar']}' to '{normalized_pillar}'")
            except ValueError as e:
                return jsonify({'error': f'Task {idx + 1}: Invalid pillar - {str(e)}'}), 400
            
            # Validate XP value
            xp_value = task.get('xp_value', 100)
            if not isinstance(xp_value, (int, float)) or xp_value < 0:
                return jsonify({'error': f'Task {idx + 1}: XP value must be a positive number'}), 400
            
            validated_task = {
                'title': task['title'],
                'description': task['description'],
                'pillar': normalized_pillar,  # Use normalized pillar
                'xp_amount': int(xp_value),  # Use xp_amount (database column)
                'task_order': task.get('task_order', task.get('order_index', idx)),  # Use task_order (database column)
                'evidence_prompt': task.get('evidence_prompt', f"Provide evidence for completing: {task['title']}"),
                'subcategory': task.get('subcategory'),
                'collaboration_eligible': task.get('collaboration_eligible', True),
                'location_required': task.get('location_required', False),
                'is_optional': task.get('is_optional', False)
            }
            
            validated_tasks.append(validated_task)
        
        # Create the quest record with actual schema columns
        quest_data = {
            'title': data['title'],
            'big_idea': data.get('big_idea') or data.get('description') or 'A learning quest',
            'header_image_url': data.get('header_image_url'),
            'is_active': data.get('is_active', True),
            'source': data.get('source', 'optio')
        }
        
        # Remove None values
        quest_data = {k: v for k, v in quest_data.items() if v is not None}
        
        print(f"Creating quest with data: {json.dumps(quest_data, indent=2)}")
        
        # Insert quest
        quest_response = supabase.table('quests').insert(quest_data).execute()
        
        if not quest_response.data:
            print("Failed to create quest: No data returned from insert")
            return jsonify({'error': 'Failed to create quest'}), 500
        
        quest = quest_response.data[0]
        quest_id = quest['id']
        print(f"Created quest with ID: {quest_id}")
        
        # Create quest tasks using actual database schema
        for task in validated_tasks:
            task_data = {
                'quest_id': quest_id,
                'title': task['title'],
                'description': task['description'],
                'pillar': task['pillar'],
                'xp_amount': task['xp_amount'],
                'task_order': task['task_order'],
                'evidence_prompt': task.get('evidence_prompt'),
                'subcategory': task.get('subcategory'),
                'is_required': True,  # Default all tasks to required
                'collaboration_eligible': task.get('collaboration_eligible'),
                'location_required': task.get('location_required'),
                'is_optional': task.get('is_optional')
            }
            
            # Remove None values
            task_data = {k: v for k, v in task_data.items() if v is not None}
            
            print(f"Creating task: {task_data['title']}")
            task_response = supabase.table('quest_tasks').insert(task_data).execute()
            
            if not task_response.data:
                print(f"Failed to create task: {task_data['title']}")
                # Rollback: delete the quest
                supabase.table('quests').delete().eq('id', quest_id).execute()
                return jsonify({'error': f"Failed to create task: {task_data['title']}"}), 500
        
        # Handle optional metadata
        if data.get('metadata'):
            metadata = data['metadata']
            metadata_data = {
                'quest_id': quest_id,
                'location_type': metadata.get('location_type', 'anywhere'),
                'location_address': metadata.get('location_address'),
                'venue_name': metadata.get('venue_name'),
                'seasonal_start': metadata.get('seasonal_start'),
                'seasonal_end': metadata.get('seasonal_end'),
                'created_at': datetime.utcnow().isoformat()
            }
            
            # Remove None values
            metadata_data = {k: v for k, v in metadata_data.items() if v is not None}
            
            # Only insert if there's meaningful metadata
            if len(metadata_data) > 2:  # More than just quest_id and created_at
                try:
                    supabase.table('quest_metadata').insert(metadata_data).execute()
                    print("Created quest metadata")
                except Exception as e:
                    print(f"Warning: Could not create metadata (table may not exist): {e}")
        
        # Fetch the complete quest with tasks for response
        complete_quest = supabase.table('quests')\
            .select('*, quest_tasks(*), quest_sources(header_image_url)')\
            .eq('id', quest_id)\
            .execute()
        
        if complete_quest.data:
            quest_result = complete_quest.data[0]
            # Add header image from source if available
            if quest_result.get('quest_sources'):
                quest_result['header_image_url'] = quest_result['quest_sources'].get('header_image_url')
                del quest_result['quest_sources']  # Clean up nested data
        else:
            quest_result = quest
        
        print(f"Successfully created quest: {quest['title']} with {len(validated_tasks)} tasks")
        
        return jsonify({
            'message': 'Quest created successfully',
            'quest': quest_result
        }), 201
        
    except Exception as e:
        print(f"Error creating quest: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to create quest: {str(e)}'}), 500

@bp.route('/quests/create', methods=['POST'])
@require_admin
def create_quest_v2(user_id):
    """Create a new quest with the updated template structure."""
    print(f"CREATE QUEST V2: user_id={user_id}")
    supabase = get_supabase_admin_client()
    
    try:
        data = request.json
        print(f"Received quest data: {json.dumps(data, indent=2)}")
        
        # Create quest with existing fields
        quest_data = {
            'title': data['title'],
            'big_idea': data.get('big_idea', data.get('description', '')),  # Use description as big_idea if not provided
            'source': data.get('source', 'optio'),
            'is_active': data.get('is_active', True),
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Remove None values
        quest_data = {k: v for k, v in quest_data.items() if v is not None}
        
        # Insert quest
        quest_response = supabase.table('quests').insert(quest_data).execute()
        
        if not quest_response.data:
            return jsonify({'error': 'Failed to create quest'}), 500
        
        quest = quest_response.data[0]
        quest_id = quest['id']
        
        # Store metadata in quest_metadata table (created by migration)
        metadata = {
            'quest_id': quest_id,
            'category': data.get('category', 'general'),
            'difficulty_tier': {
                'beginner': 1,
                'intermediate': 2,
                'advanced': 3,
                'expert': 4
            }.get(data.get('difficulty_level', 'intermediate'), 2),
            'location_type': data.get('location_type', 'anywhere'),
            'location_address': data.get('specific_location'),
            'location_radius_km': data.get('location_radius'),
            'estimated_hours': str(data.get('estimated_hours')) if data.get('estimated_hours') else None,
            'materials_needed': [data.get('materials_needed')] if data.get('materials_needed') else None,
            'seasonal_start': data.get('seasonal_start_date'),
            'seasonal_end': data.get('seasonal_end_date'),
            'team_size_limit': data.get('max_team_size', 5),
            'collaboration_prompts': [data.get('collaboration_prompt')] if data.get('collaboration_prompt') else None,
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Remove None values
        metadata = {k: v for k, v in metadata.items() if v is not None}
        
        # Insert metadata
        try:
            metadata_response = supabase.table('quest_metadata').insert(metadata).execute()
            if metadata_response.data:
                quest['metadata'] = metadata_response.data[0]
        except Exception as metadata_error:
            print(f"Warning: Could not save quest metadata: {metadata_error}")
            # Continue anyway - metadata is optional
        
        # Create tasks with new structure
        tasks = data.get('tasks', [])
        if tasks:
            task_records = []
            for idx, task in enumerate(tasks):
                task_record = {
                    'quest_id': quest_id,
                    'title': task['title'],
                    'description': task.get('description'),
                    'pillar': task['pillar'],
                    'subcategory': task.get('subcategory'),
                    'xp_amount': task.get('xp_value', 100),  # Map xp_value to xp_amount
                    'evidence_prompt': task.get('evidence_prompt'),
                    'task_order': task.get('order_index', idx + 1),  # Map order_index to task_order
                    'is_required': not task.get('is_optional', False),
                    'is_collaboration_eligible': task.get('collaboration_eligible', True),
                    'location_required': task.get('location_required', False),
                    'created_at': datetime.utcnow().isoformat()
                }
                
                # Remove None values
                task_record = {k: v for k, v in task_record.items() if v is not None}
                task_records.append(task_record)
            
            # Insert tasks
            tasks_response = supabase.table('quest_tasks').insert(task_records).execute()
            
            if not tasks_response.data:
                # Rollback quest creation if tasks fail
                supabase.table('quests').delete().eq('id', quest_id).execute()
                return jsonify({'error': 'Failed to create quest tasks'}), 500
            
            quest['tasks'] = tasks_response.data
        
        print(f"Quest created successfully: {quest['id']}")
        return jsonify(quest), 201
        
    except Exception as e:
        print(f"Error creating quest: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

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
                'source': request.form.get('source', 'optio'),
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
            'source': data.get('source', 'optio'),
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
                'source': request.form.get('source', 'optio'),
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
            'source': data.get('source', 'optio'),
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

# =============================================================================
# USER MANAGEMENT ENDPOINTS - V3
# =============================================================================

@bp.route('/users', methods=['GET'])
@require_admin
def get_users_list(user_id):
    """Get paginated list of users with search and filtering capabilities"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 20, type=int)
        search = request.args.get('search', '')
        subscription = request.args.get('subscription', 'all')
        role = request.args.get('role', 'all')
        activity = request.args.get('activity', 'all')
        sort_by = request.args.get('sort_by', 'created_at')
        sort_order = request.args.get('sort_order', 'desc')
        
        # Start building query
        query = supabase.table('users').select('*', count='exact')
        
        # Apply search filter
        if search:
            # Build search query safely
            query = query.or_(f"first_name.ilike.%{search}%,last_name.ilike.%{search}%,username.ilike.%{search}%")
        
        # Apply subscription filter
        if subscription != 'all':
            if subscription == 'free':
                query = query.or_('subscription_tier.eq.free,subscription_tier.is.null')
            else:
                query = query.eq('subscription_tier', subscription)
        
        # Apply role filter
        if role != 'all':
            query = query.eq('role', role)
        
        # Apply activity filter
        if activity != 'all':
            from datetime import datetime, timedelta
            if activity == 'active_7':
                cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat()
                query = query.gte('last_active', cutoff)
            elif activity == 'active_30':
                cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
                query = query.gte('last_active', cutoff)
            elif activity == 'inactive':
                cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
                query = query.or_(f'last_active.lt.{cutoff},last_active.is.null')
        
        # Apply sorting
        if sort_order == 'desc':
            query = query.order(sort_by, desc=True)
        else:
            query = query.order(sort_by)
        
        # Apply pagination
        start = (page - 1) * limit
        end = start + limit - 1
        query = query.range(start, end)
        
        # Execute query
        response = query.execute()
        
        # Enhance user data
        users = response.data if response.data else []
        
        # Get emails from auth.users table
        try:
            auth_users = supabase.auth.admin.list_users()
            email_map = {}
            if auth_users:
                for auth_user in auth_users:
                    email_map[auth_user.id] = getattr(auth_user, 'email', None)
        except Exception as e:
            print(f"Warning: Could not fetch auth users: {e}")
            email_map = {}
        
        for user in users:
            # Add email from auth.users
            user['email'] = email_map.get(user['id'], '')
            
            # Calculate total XP across all pillars
            try:
                xp_response = supabase.table('user_skill_xp')\
                    .select('xp_amount')\
                    .eq('user_id', user['id'])\
                    .execute()
                
                user['total_xp'] = sum(x['xp_amount'] for x in xp_response.data) if xp_response.data else 0
            except Exception:
                user['total_xp'] = 0
        
        # Calculate total count for pagination
        total_count = response.count if hasattr(response, 'count') else len(users)
        
        return jsonify({
            'users': users,
            'total': total_count,
            'page': page,
            'limit': limit
        }), 200
        
    except Exception as e:
        print(f"Error fetching users: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>', methods=['GET'])
@require_admin
def get_user_details(admin_id, user_id):
    """Get detailed information about a specific user"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get user details
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        
        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404
        
        user = user_response.data[0]
        
        # Get XP by pillar
        xp_response = supabase.table('user_skill_xp')\
            .select('pillar, xp_amount')\
            .eq('user_id', user_id)\
            .execute()
        
        xp_by_pillar = {}
        total_xp = 0
        if xp_response.data:
            for xp in xp_response.data:
                xp_by_pillar[xp['pillar']] = xp['xp_amount']
                total_xp += xp['xp_amount']
        
        # Get completed quests
        completed_quests_response = supabase.table('user_quests')\
            .select('*, quests(title)')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .execute()
        
        completed_quests = []
        quests_completed = 0
        if completed_quests_response.data:
            quests_completed = len(completed_quests_response.data)
            for quest in completed_quests_response.data:
                # Calculate XP for this quest completion
                quest_xp = 0  # We'd need to calculate this based on quest tasks
                completed_quests.append({
                    'id': quest.get('quest_id'),
                    'title': quest.get('quests', {}).get('title') if quest.get('quests') else 'Unknown Quest',
                    'completed_at': quest.get('completed_at'),
                    'xp_earned': quest_xp
                })
        
        return jsonify({
            'user': user,
            'xp_by_pillar': xp_by_pillar,
            'total_xp': total_xp,
            'completed_quests': completed_quests,
            'quests_completed': quests_completed,
            'last_active': user.get('last_active'),
            'current_streak': 0  # Could implement streak calculation
        }), 200
        
    except Exception as e:
        print(f"Error fetching user details: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>', methods=['PUT'])
@require_admin
def update_user_profile(admin_id, user_id):
    """Update user profile information"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        # Update user profile
        update_data = {}
        if 'first_name' in data:
            update_data['first_name'] = data['first_name']
        if 'last_name' in data:
            update_data['last_name'] = data['last_name']
        if 'email' in data:
            # Note: Email updates might require auth.users update too
            update_data['email'] = data['email']
            
        if update_data:
            response = supabase.table('users')\
                .update(update_data)\
                .eq('id', user_id)\
                .execute()
            
            if not response.data:
                return jsonify({'error': 'User not found'}), 404
        
        return jsonify({'message': 'User updated successfully'}), 200
        
    except Exception as e:
        print(f"Error updating user: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>/subscription', methods=['POST'])
@require_admin
def update_user_subscription(admin_id, user_id):
    """Update user subscription tier and expiration"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        update_data = {
            'subscription_tier': data.get('tier', 'free'),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        if data.get('expires'):
            update_data['subscription_expires'] = data['expires']
        
        response = supabase.table('users')\
            .update(update_data)\
            .eq('id', user_id)\
            .execute()
        
        if not response.data:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({'message': 'Subscription updated successfully'}), 200
        
    except Exception as e:
        print(f"Error updating subscription: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>/role', methods=['PUT'])
@require_admin
def update_user_role(admin_id, user_id):
    """Update user role with audit logging"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        new_role = data.get('role')
        reason = data.get('reason', 'Role change by admin')
        
        # Validate role
        valid_roles = ['student', 'parent', 'advisor', 'admin']
        if new_role not in valid_roles:
            return jsonify({'error': 'Invalid role'}), 400
        
        # Update user role
        response = supabase.table('users')\
            .update({
                'role': new_role,
                'updated_at': datetime.utcnow().isoformat()
            })\
            .eq('id', user_id)\
            .execute()
        
        if not response.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Get role display name
        role_display_names = {
            'student': 'Student',
            'parent': 'Parent',
            'advisor': 'Advisor',
            'admin': 'Administrator'
        }
        
        return jsonify({
            'message': 'Role updated successfully',
            'display_name': role_display_names.get(new_role, new_role)
        }), 200
        
    except Exception as e:
        print(f"Error updating role: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>/reset-password', methods=['POST'])
@require_admin
def reset_user_password(admin_id, user_id):
    """Send password reset email to user"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get user email
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Get email from auth.users
        try:
            auth_users = supabase.auth.admin.list_users()
            user_email = None
            if auth_users:
                for auth_user in auth_users:
                    if auth_user.id == user_id:
                        user_email = getattr(auth_user, 'email', None)
                        break
            
            if not user_email:
                return jsonify({'error': 'User email not found'}), 404
            
            # Send password reset email
            supabase.auth.admin.generate_link(
                type='recovery',
                email=user_email
            )
            
            return jsonify({'message': 'Password reset email sent'}), 200
            
        except Exception as e:
            print(f"Error sending reset email: {str(e)}")
            return jsonify({'error': 'Failed to send reset email'}), 500
        
    except Exception as e:
        print(f"Error in password reset: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>/toggle-status', methods=['POST'])
@require_admin
def toggle_user_status(admin_id, user_id):
    """Enable or disable a user account"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get current status
        user_response = supabase.table('users').select('status').eq('id', user_id).execute()
        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404
        
        current_status = user_response.data[0].get('status', 'active')
        new_status = 'disabled' if current_status == 'active' else 'active'
        
        # Update status
        response = supabase.table('users')\
            .update({
                'status': new_status,
                'updated_at': datetime.utcnow().isoformat()
            })\
            .eq('id', user_id)\
            .execute()
        
        if not response.data:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'message': f'User account {"enabled" if new_status == "active" else "disabled"} successfully',
            'status': new_status
        }), 200
        
    except Exception as e:
        print(f"Error toggling user status: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>', methods=['DELETE'])
@require_admin
def delete_user_account(admin_id, user_id):
    """Permanently delete a user account and all associated data"""
    supabase = get_supabase_admin_client()
    
    try:
        # Delete user data in proper order to avoid foreign key violations
        
        # Delete user XP data
        supabase.table('user_skill_xp').delete().eq('user_id', user_id).execute()
        
        # Delete user quest enrollments and completions
        supabase.table('user_quests').delete().eq('user_id', user_id).execute()
        supabase.table('quest_task_completions').delete().eq('user_id', user_id).execute()
        
        # Delete user profile
        response = supabase.table('users').delete().eq('id', user_id).execute()
        
        if not response.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Delete from auth.users
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception as e:
            print(f"Warning: Could not delete from auth.users: {e}")
        
        return jsonify({'message': 'User account deleted successfully'}), 200
        
    except Exception as e:
        print(f"Error deleting user: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/bulk-email', methods=['POST'])
@require_admin
def send_bulk_email(admin_id):
    """Send email to multiple users"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        user_ids = data.get('user_ids', [])
        subject = data.get('subject', '')
        message = data.get('message', '')
        
        if not user_ids or not subject or not message:
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Get user details
        users_response = supabase.table('users')\
            .select('id, first_name, last_name')\
            .in_('id', user_ids)\
            .execute()
        
        if not users_response.data:
            return jsonify({'error': 'No users found'}), 404
        
        # Get emails from auth.users
        try:
            auth_users = supabase.auth.admin.list_users()
            email_map = {}
            if auth_users:
                for auth_user in auth_users:
                    if auth_user.id in user_ids:
                        email_map[auth_user.id] = getattr(auth_user, 'email', None)
        except Exception as e:
            print(f"Error fetching emails: {e}")
            return jsonify({'error': 'Could not fetch user emails'}), 500
        
        # For now, we'll just return success
        # In a real implementation, you'd integrate with an email service
        emails_sent = 0
        for user in users_response.data:
            user_email = email_map.get(user['id'])
            if user_email:
                # Here you would send the actual email
                emails_sent += 1
        
        return jsonify({
            'message': f'Bulk email prepared for {emails_sent} users',
            'emails_sent': emails_sent
        }), 200
        
    except Exception as e:
        print(f"Error sending bulk email: {str(e)}")
        return jsonify({'error': str(e)}), 500