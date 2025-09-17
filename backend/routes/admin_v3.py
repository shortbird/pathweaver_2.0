from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.pillar_utils import normalize_pillar_key, is_valid_pillar
from utils.school_subjects import validate_school_subjects, normalize_subject_key
from datetime import datetime, timedelta
import json
import base64
import uuid

bp = Blueprint('admin_v3', __name__, url_prefix='/api/v3/admin')

@bp.route('/school-subjects', methods=['GET'])
def get_school_subjects():
    """
    Get all available school subjects for quest creation.
    Public endpoint - no auth required for getting subject list.
    """
    try:
        from utils.school_subjects import get_all_subjects_with_info
        subjects = get_all_subjects_with_info()
        
        return jsonify({
            'success': True,
            'school_subjects': subjects
        })
        
    except Exception as e:
        print(f"Error getting school subjects: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch school subjects'
        }), 500

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
        
        if not data.get('tasks') or not isinstance(data['tasks'], list) or len(data['tasks']) == 0:
            return jsonify({'error': 'At least one task is required'}), 400
        
        # Validate and normalize each task
        validated_tasks = []
        for idx, task in enumerate(data['tasks']):
            # Validate required task fields
            if not task.get('title'):
                return jsonify({'error': f'Task {idx + 1}: Title is required'}), 400
            
            if not task.get('pillar'):
                return jsonify({'error': f'Task {idx + 1}: Pillar is required'}), 400
            
            # Validate and normalize pillar
            try:
                normalized_pillar = normalize_pillar_key(task['pillar'])
                if not normalized_pillar or not is_valid_pillar(normalized_pillar):
                    raise ValueError(f"Unknown pillar: {task['pillar']}")
                print(f"Task {idx + 1}: Normalized pillar from '{task['pillar']}' to '{normalized_pillar}'")
            except Exception as e:
                return jsonify({'error': f'Task {idx + 1}: Invalid pillar - {str(e)}'}), 400
            
            # Validate and normalize school subjects
            school_subjects = task.get('school_subjects', [])
            if school_subjects:
                # Normalize subject keys
                normalized_subjects = []
                for subject in school_subjects:
                    normalized_subject = normalize_subject_key(subject)
                    if normalized_subject:
                        normalized_subjects.append(normalized_subject)
                    else:
                        print(f"Warning: Unknown school subject '{subject}' in task {idx + 1}")
                        normalized_subjects.append(subject)  # Keep original for validation error
                
                # Validate the normalized subjects
                is_valid, error_msg = validate_school_subjects(normalized_subjects)
                if not is_valid:
                    return jsonify({'error': f'Task {idx + 1}: {error_msg}'}), 400
                school_subjects = normalized_subjects
            else:
                # Default to electives if no subjects provided
                school_subjects = ['electives']
            
            # Validate XP value
            xp_value = task.get('xp_value', 100)
            if not isinstance(xp_value, (int, float)) or xp_value < 0:
                return jsonify({'error': f'Task {idx + 1}: XP value must be a positive number'}), 400

            # Handle subject XP distribution
            subject_xp_distribution = task.get('subject_xp_distribution', {})
            if subject_xp_distribution:
                # Validate that distribution sums to total XP
                total_distribution_xp = sum(subject_xp_distribution.values())
                if total_distribution_xp != xp_value:
                    return jsonify({'error': f'Task {idx + 1}: Subject XP distribution ({total_distribution_xp}) must equal total XP ({xp_value})'}), 400

                # Validate that all subjects in distribution are in school_subjects
                for subject in subject_xp_distribution.keys():
                    if subject not in school_subjects:
                        return jsonify({'error': f'Task {idx + 1}: Subject XP distribution contains subject "{subject}" not in school_subjects list'}), 400
            else:
                # Auto-distribute XP evenly among school subjects
                if school_subjects:
                    xp_per_subject = xp_value // len(school_subjects)
                    remainder = xp_value % len(school_subjects)
                    subject_xp_distribution = {}

                    for i, subject in enumerate(school_subjects):
                        subject_xp_distribution[subject] = xp_per_subject + (1 if i < remainder else 0)
            
            validated_task = {
                'title': task['title'],
                'description': task.get('description', ''),  # Optional field
                'pillar': normalized_pillar,  # Use normalized pillar
                'school_subjects': school_subjects,  # Use normalized school subjects
                'subject_xp_distribution': subject_xp_distribution,  # NEW: XP distribution by subject
                'xp_amount': int(xp_value),  # Use xp_amount (database column)
                'order_index': task.get('order_index', task.get('task_order', idx)),  # Use order_index (database column)
                'evidence_prompt': task.get('evidence_prompt', f"Provide evidence for completing: {task['title']}"),
                'is_collaboration_eligible': task.get('collaboration_eligible', task.get('is_collaboration_eligible', True)),
                'is_required': not task.get('is_optional', False)
            }
            
            validated_tasks.append(validated_task)
        
        # Create the quest record with actual schema columns
        quest_data = {
            'title': data['title'],
            'big_idea': data.get('big_idea') or data.get('description') or '',
            'header_image_url': data.get('header_image_url'),
            'material_link': data.get('material_link'),  # NEW: Optional material link
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
                'school_subjects': task['school_subjects'],
                'subject_xp_distribution': task['subject_xp_distribution'],  # NEW: XP distribution
                'xp_amount': task['xp_amount'],
                'order_index': task['order_index'],
                'evidence_prompt': task.get('evidence_prompt'),
                'is_required': task.get('is_required', True),  # Use from validated task
                'is_collaboration_eligible': task.get('is_collaboration_eligible', True)
            }
            
            # Remove None values
            task_data = {k: v for k, v in task_data.items() if v is not None}
            
            print(f"Creating task: {task_data['title']}")
            print(f"Task data being inserted: {json.dumps(task_data, indent=2)}")
            task_response = supabase.table('quest_tasks').insert(task_data).execute()
            
            if not task_response.data:
                print(f"Failed to create task: {task_data['title']}")
                print(f"Task creation error response: {task_response}")
                # Rollback: delete the quest
                supabase.table('quests').delete().eq('id', quest_id).execute()
                return jsonify({'error': f"Failed to create task: {task_data['title']}"}), 500
            else:
                print(f"Successfully created task: {task_response.data[0]}")
        
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
            .select('*, quest_tasks(*)')\
            .eq('id', quest_id)\
            .execute()
        
        if complete_quest.data:
            quest_result = complete_quest.data[0]
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
                    'xp_amount': task.get('xp_value', 100),  # Map xp_value to xp_amount
                    'evidence_prompt': task.get('evidence_prompt'),
                    'order_index': task.get('order_index', idx),  # Use 0-based indexing consistently
                    'is_required': not task.get('is_optional', False),
                    'is_collaboration_eligible': task.get('collaboration_eligible', True),
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
                    'order_index': idx,
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
            'material_link': data.get('material_link'),  # NEW: Optional material link
            'source': data.get('source', 'optio'),
            'is_active': data.get('is_active', True),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        if 'header_image_url' in data:
            quest_data['header_image_url'] = data['header_image_url']

        # Remove None values
        quest_data = {k: v for k, v in quest_data.items() if v is not None}

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
                # Validate and normalize school subjects for this task
                school_subjects = task.get('school_subjects', ['electives'])
                if school_subjects:
                    # Normalize subject keys
                    normalized_subjects = []
                    for subject in school_subjects:
                        normalized_subject = normalize_subject_key(subject)
                        if normalized_subject:
                            normalized_subjects.append(normalized_subject)
                        else:
                            normalized_subjects.append(subject)  # Keep original
                    
                    # Validate the normalized subjects
                    is_valid, error_msg = validate_school_subjects(normalized_subjects)
                    if is_valid:
                        school_subjects = normalized_subjects
                    else:
                        print(f"Warning: Invalid school subjects for task {idx}: {error_msg}")
                        school_subjects = ['electives']  # Default fallback
                else:
                    school_subjects = ['electives']

                # Handle subject XP distribution for update
                subject_xp_distribution = task.get('subject_xp_distribution', {})
                if subject_xp_distribution:
                    # Validate that distribution sums to total XP
                    total_distribution_xp = sum(subject_xp_distribution.values())
                    if total_distribution_xp != task['xp_amount']:
                        print(f"Warning: Task {idx} XP distribution ({total_distribution_xp}) != total XP ({task['xp_amount']})")
                        # Auto-fix by redistributing
                        subject_xp_distribution = {}

                # Auto-distribute XP if not provided or invalid
                if not subject_xp_distribution:
                    xp_per_subject = task['xp_amount'] // len(school_subjects)
                    remainder = task['xp_amount'] % len(school_subjects)
                    for i, subject in enumerate(school_subjects):
                        subject_xp_distribution[subject] = xp_per_subject + (1 if i < remainder else 0)

                task_records.append({
                    'quest_id': quest_id,
                    'title': task['title'],
                    'description': task.get('description'),
                    'xp_amount': task['xp_amount'],
                    'pillar': task['pillar'],
                    'school_subjects': school_subjects,
                    'subject_xp_distribution': subject_xp_distribution,  # NEW: XP distribution
                    'order_index': idx,
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
        
        # Reverse tier mapping: convert database tier names to frontend tier names
        reverse_tier_mapping = {
            'explorer': 'free',
            'creator': 'supported', 
            'enterprise': 'academy'  # Updated: Academy tier uses 'enterprise' in database
        }
        
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
            
            # Convert database tier to frontend tier for consistency
            db_tier = user.get('subscription_tier', 'explorer')
            frontend_tier = reverse_tier_mapping.get(db_tier, db_tier)
            user['subscription_tier'] = frontend_tier
            print(f"User {user.get('id', 'unknown')}: DB tier '{db_tier}' -> Frontend tier '{frontend_tier}'")
            
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
        
        # Convert database tier to frontend tier for consistency
        reverse_tier_mapping = {
            'explorer': 'free',
            'creator': 'supported', 
            'enterprise': 'academy'  # Updated: Academy tier uses 'enterprise' in database
        }
        db_tier = user.get('subscription_tier', 'explorer')
        frontend_tier = reverse_tier_mapping.get(db_tier, db_tier)
        user['subscription_tier'] = frontend_tier
        print(f"User details: DB tier '{db_tier}' -> Frontend tier '{frontend_tier}'")
        
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
        # Valid frontend tier values (what the admin panel sends)
        valid_frontend_tiers = ['free', 'supported', 'academy']
        
        requested_tier = data.get('tier', 'free')
        
        # Validate tier
        if requested_tier not in valid_frontend_tiers:
            return jsonify({'error': f'Invalid tier: {requested_tier}. Must be one of: {valid_frontend_tiers}'}), 400
        
        # Primary tier mapping based on actual database enum values (discovered via testing)
        tier_mapping = {
            'free': 'explorer',      # Assuming this maps correctly
            'supported': 'creator',  # Assuming this maps correctly
            'academy': 'enterprise'  # Confirmed: Academy tier uses 'enterprise' in database
        }
        
        db_tier = tier_mapping.get(requested_tier, 'explorer')
        
        update_data = {
            'subscription_tier': db_tier
        }
        
        # Note: subscription_expires field is not used in database schema
        
        print(f"TIER UPDATE: User {user_id}, Frontend tier: {requested_tier} -> DB tier: {db_tier}")
        print(f"Update data being sent to Supabase: {update_data}")
        
        # Try primary tier mapping first
        def try_tier_update(tier_value):
            try:
                update_data = {'subscription_tier': tier_value}
                print(f"ATTEMPTING TIER UPDATE: User {user_id}, Trying tier value: {tier_value}")
                
                response = supabase.table('users')\
                    .update(update_data)\
                    .eq('id', user_id)\
                    .execute()
                
                print(f"Supabase update response: {response}")
                print(f"Supabase response data: {response.data}")
                
                if response.data:
                    updated_user = response.data[0]
                    actual_db_tier = updated_user.get('subscription_tier')
                    print(f"SUCCESS: User {user_id} tier updated to: {actual_db_tier}")
                    return response.data[0]
                else:
                    print(f"ERROR: No data returned from Supabase")
                    return None
                    
            except Exception as e:
                print(f"TIER UPDATE FAILED for value '{tier_value}': {str(e)}")
                return None
        
        # Try the primary mapping first
        result = try_tier_update(db_tier)
        
        # If primary mapping failed, try alternative values
        if result is None:
            print(f"Primary mapping failed for tier '{requested_tier}' -> '{db_tier}'. Trying alternatives...")
            
            # Try direct frontend value
            result = try_tier_update(requested_tier)
            
            # If that failed too, try some common alternatives
            if result is None:
                alternative_mappings = {
                    'free': ['basic', 'starter', 'free'],
                    'supported': ['premium', 'standard', 'supported'],
                    'academy': ['visionary', 'pro', 'academy']  # Try visionary (schema), then alternatives
                }
                
                alternatives = alternative_mappings.get(requested_tier, [])
                for alt_value in alternatives:
                    if alt_value != db_tier and alt_value != requested_tier:  # Skip already tried values
                        result = try_tier_update(alt_value)
                        if result is not None:
                            break
        
        # Check final result
        if result is None:
            return jsonify({
                'error': f'Failed to update subscription tier to {requested_tier}',
                'details': 'Database enum constraints do not allow this value',
                'attempted_values': [db_tier, requested_tier] + alternative_mappings.get(requested_tier, [])
            }), 500
        
        # Success case - the tier update worked with one of our attempted values
        print(f"FINAL SUCCESS: User {user_id} subscription tier updated successfully")
        
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
            .update({'role': new_role})\
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

@bp.route('/quests', methods=['GET'])
@require_admin
def list_admin_quests(user_id):
    """
    List all quests for admin management.
    Supports pagination, search, and filtering.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        search = request.args.get('search', '').strip()
        is_active = request.args.get('is_active')
        source = request.args.get('source')
        
        # Calculate offset
        offset = (page - 1) * per_page
        
        # Build query
        query = supabase.table('quests')\
            .select('*, quest_tasks(*)', count='exact')\
            .order('created_at', desc=True)
        
        # Apply filters
        if search:
            query = query.ilike('title', f'%{search}%')
        
        if is_active is not None:
            is_active_bool = is_active.lower() == 'true'
            query = query.eq('is_active', is_active_bool)
        
        if source:
            query = query.eq('source', source)
        
        # Apply pagination
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Process quest data to include task counts and total XP
        quests = []
        for quest in result.data:
            # Calculate total XP and task breakdown
            total_xp = 0
            task_count = len(quest.get('quest_tasks', []))
            
            for task in quest.get('quest_tasks', []):
                total_xp += task.get('xp_amount', 0)
            
            # Add calculated fields
            quest['total_xp'] = total_xp
            quest['task_count'] = task_count
            
            quests.append(quest)
        
        return jsonify({
            'success': True,
            'quests': quests,
            'total': result.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (result.count + per_page - 1) // per_page if result.count else 0
        })
        
    except Exception as e:
        print(f"Error listing admin quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quests'
        }), 500

# Quest Ideas Management Endpoints

@bp.route('/quest-ideas', methods=['GET'])
@require_admin
def list_quest_ideas(user_id):
    """Get all quest ideas for admin review"""
    try:
        supabase = get_supabase_admin_client()
        
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        status_filter = request.args.get('status', 'all')  # all, pending_review, approved, rejected
        
        # Map frontend status names to database status values
        status_mapping = {
            'pending': 'pending_review',
            'pending_review': 'pending_review',
            'approved': 'approved', 
            'rejected': 'rejected'
        }
        
        offset = (page - 1) * per_page
        
        # Build query - we'll get user info separately since there's no foreign key relationship
        query = supabase.table('quest_ideas')\
            .select('*', count='exact')\
            .order('created_at', desc=True)
        
        # Apply status filter
        if status_filter != 'all':
            db_status = status_mapping.get(status_filter, status_filter)
            query = query.eq('status', db_status)
        
        # Apply pagination
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Enrich quest ideas with user information
        quest_ideas_with_users = []
        if result.data:
            for idea in result.data:
                # Get user information for each quest idea
                try:
                    user_response = supabase.table('users')\
                        .select('first_name, last_name')\
                        .eq('id', idea['user_id'])\
                        .single().execute()
                    
                    if user_response.data:
                        idea['users'] = user_response.data
                    else:
                        idea['users'] = {'first_name': 'Unknown', 'last_name': 'User'}
                except:
                    idea['users'] = {'first_name': 'Unknown', 'last_name': 'User'}

                # Normalize status for frontend - map database values to frontend values
                if idea['status'] == 'pending_review':
                    idea['status'] = 'pending'

                quest_ideas_with_users.append(idea)
        
        return jsonify({
            'success': True,
            'quest_ideas': quest_ideas_with_users,
            'total': result.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (result.count + per_page - 1) // per_page if result.count else 0
        })
        
    except Exception as e:
        print(f"Error listing quest ideas: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quest ideas'
        }), 500

@bp.route('/quest-ideas/<idea_id>/approve', methods=['PUT'])
@require_admin
def approve_quest_idea(user_id, idea_id):
    """Approve a quest idea"""
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json()
        approved_quest_id = data.get('approved_quest_id', None)

        # Update the quest idea status
        update_data = {
            'status': 'approved',
            'updated_at': datetime.utcnow().isoformat()
        }

        # Link to the created quest if provided
        if approved_quest_id:
            update_data['approved_quest_id'] = approved_quest_id
        
        result = supabase.table('quest_ideas').update(update_data).eq('id', idea_id).execute()
        
        if not result.data:
            return jsonify({'error': 'Quest idea not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Quest idea approved successfully',
            'quest_idea': result.data[0]
        })
        
    except Exception as e:
        print(f"Error approving quest idea: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to approve quest idea'
        }), 500

@bp.route('/quest-ideas/<idea_id>/reject', methods=['PUT'])
@require_admin
def reject_quest_idea(user_id, idea_id):
    """Reject a quest idea"""
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json()

        # Update the quest idea status
        update_data = {
            'status': 'rejected',
            'updated_at': datetime.utcnow().isoformat()
        }
        
        result = supabase.table('quest_ideas').update(update_data).eq('id', idea_id).execute()
        
        if not result.data:
            return jsonify({'error': 'Quest idea not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Quest idea rejected',
            'quest_idea': result.data[0]
        })
        
    except Exception as e:
        print(f"Error rejecting quest idea: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to reject quest idea'
        }), 500

@bp.route('/quest-ideas/<idea_id>/generate-quest', methods=['POST'])
@require_admin
def generate_quest_from_idea(user_id, idea_id):
    """Generate a complete quest from an approved quest idea using AI"""
    try:
        supabase = get_supabase_admin_client()

        # Get the quest idea
        idea_response = supabase.table('quest_ideas').select('*').eq('id', idea_id).single().execute()

        if not idea_response.data:
            return jsonify({'error': 'Quest idea not found'}), 404

        idea = idea_response.data

        # Check if quest idea is approved
        if idea['status'] != 'approved':
            return jsonify({'error': 'Quest idea must be approved before generating quest'}), 400

        # Use AI service to generate quest
        from services.quest_ai_service import QuestAIService
        ai_service = QuestAIService()

        # Generate quest from the idea
        result = ai_service.generate_quest_from_topic(
            topic=idea['title'],
            learning_objectives=idea['description']
        )

        if not result['success']:
            return jsonify({
                'success': False,
                'error': f'AI generation failed: {result["error"]}'
            }), 500

        generated_quest = result['quest']

        # Create the quest in the database using the existing create quest endpoint logic
        quest_data = {
            'title': generated_quest['title'],
            'big_idea': generated_quest.get('big_idea', generated_quest.get('description', '')),
            'source': 'custom',
            'is_active': True,
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert quest
        quest_response = supabase.table('quests').insert(quest_data).execute()

        if not quest_response.data:
            return jsonify({'error': 'Failed to create quest in database'}), 500

        quest = quest_response.data[0]
        quest_id = quest['id']

        # Create tasks from generated quest
        tasks = generated_quest.get('tasks', [])
        if tasks:
            task_records = []
            for idx, task in enumerate(tasks):
                task_record = {
                    'quest_id': quest_id,
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'pillar': task.get('pillar', 'critical_thinking'),
                    'xp_amount': task.get('xp_amount', 100),
                    'order_index': idx,
                    'is_required': task.get('is_required', True),
                    'created_at': datetime.utcnow().isoformat()
                }
                task_records.append(task_record)

            # Insert tasks
            tasks_response = supabase.table('quest_tasks').insert(task_records).execute()

            if not tasks_response.data:
                # Rollback quest creation if tasks fail
                supabase.table('quests').delete().eq('id', quest_id).execute()
                return jsonify({'error': 'Failed to create quest tasks'}), 500

            quest['quest_tasks'] = tasks_response.data

        # Update quest idea to mark it as converted to quest
        supabase.table('quest_ideas').update({
            'approved_quest_id': quest_id,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', idea_id).execute()

        return jsonify({
            'success': True,
            'message': 'Quest generated successfully from idea',
            'quest': quest
        }), 201

    except Exception as e:
        print(f"Error generating quest from idea: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to generate quest from idea'
        }), 500

@bp.route('/quest-ideas/<idea_id>/create-quest-manual', methods=['POST'])
@require_admin
def create_quest_from_idea_manual(user_id, idea_id):
    """Create a basic quest structure from a quest idea for manual completion"""
    try:
        supabase = get_supabase_admin_client()

        # Get the quest idea
        idea_response = supabase.table('quest_ideas').select('*').eq('id', idea_id).single().execute()

        if not idea_response.data:
            return jsonify({'error': 'Quest idea not found'}), 404

        idea = idea_response.data

        # Check if quest idea is approved
        if idea['status'] != 'approved':
            return jsonify({'error': 'Quest idea must be approved before creating quest'}), 400

        # Create basic quest structure
        quest_data = {
            'title': idea['title'],
            'big_idea': idea['description'],
            'source': 'custom',
            'is_active': False,  # Set as inactive so admin can complete it
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert quest
        quest_response = supabase.table('quests').insert(quest_data).execute()

        if not quest_response.data:
            return jsonify({'error': 'Failed to create quest in database'}), 500

        quest = quest_response.data[0]
        quest_id = quest['id']

        # Create a basic task structure for the admin to complete
        basic_task = {
            'quest_id': quest_id,
            'title': f'Complete {idea["title"]}',
            'description': f'Based on: {idea["description"]}',
            'pillar': 'critical_thinking',  # Default pillar
            'xp_amount': 100,  # Default XP
            'order_index': 0,
            'is_required': True,
            'created_at': datetime.utcnow().isoformat()
        }

        # Insert basic task
        task_response = supabase.table('quest_tasks').insert(basic_task).execute()

        if not task_response.data:
            # Rollback quest creation if task fails
            supabase.table('quests').delete().eq('id', quest_id).execute()
            return jsonify({'error': 'Failed to create basic quest task'}), 500

        quest['quest_tasks'] = task_response.data

        # Update quest idea to mark it as converted to quest
        supabase.table('quest_ideas').update({
            'approved_quest_id': quest_id,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', idea_id).execute()

        return jsonify({
            'success': True,
            'message': 'Basic quest created successfully. Please edit it to add proper tasks and details.',
            'quest': quest,
            'redirect_to_edit': True
        }), 201

    except Exception as e:
        print(f"Error creating manual quest from idea: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to create quest from idea'
        }), 500

@bp.route('/quest-sources', methods=['GET'])
@require_admin
def get_quest_sources(user_id):
    """Get all quest sources with their usage count."""
    supabase = get_supabase_admin_client()
    try:
        # Get all sources
        sources_response = supabase.table('quest_sources').select('*').execute()
        if not sources_response.data:
            return jsonify({'sources': []})

        sources = sources_response.data

        # Get valid enum values for quest_source to avoid constraint errors
        valid_sources = {'khan_academy', 'optio', 'brilliant', 'custom'}  # Known valid enum values

        # Get quest counts for each source
        for source in sources:
            try:
                # Use the source identifier (name/key) instead of UUID id
                source_identifier = source.get('name') or source.get('key') or source.get('id')
                print(f"Counting quests for source: {source_identifier}")

                # Only query if this is a valid enum value to avoid constraint errors
                if source_identifier in valid_sources:
                    count_response = supabase.table('quests').select('id', count='exact').eq('source', source_identifier).execute()
                    source['quest_count'] = count_response.count if count_response.count else 0
                else:
                    # For new sources not in enum, set count to 0 until enum is updated
                    print(f"Source {source_identifier} not in valid enum values - setting count to 0")
                    source['quest_count'] = 0

                print(f"Source {source_identifier}: {source['quest_count']} quests")

            except Exception as source_error:
                error_message = str(source_error)
                print(f"Error counting quests for source {source.get('name', 'unknown')}: {error_message}")
                source['quest_count'] = 0

        return jsonify({'sources': sources})
    except Exception as e:
        print(f"Error fetching quest sources: {str(e)}")
        return jsonify({'error': 'Failed to fetch quest sources'}), 500
