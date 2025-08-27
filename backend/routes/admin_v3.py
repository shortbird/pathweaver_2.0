"""
Admin endpoints for Quest V3 system.
Handles quest and task management for administrators.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from datetime import datetime
from werkzeug.utils import secure_filename
import os
from typing import Dict, List, Any, Optional

bp = Blueprint('admin_v3', __name__, url_prefix='/api/v3/admin')

# File upload configuration
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads/headers')
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB

@bp.route('/quests', methods=['POST'])
@require_admin
def create_quest(user_id: str):
    """
    Create a new quest with tasks.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get quest data
        title = request.form.get('title', '').strip()
        big_idea = request.form.get('big_idea', '').strip()
        
        if not title or not big_idea:
            return jsonify({
                'success': False,
                'error': 'Title and big idea are required'
            }), 400
        
        # Handle header image upload if provided
        header_image_url = None
        if 'header_image' in request.files:
            file = request.files['header_image']
            if file and file.filename:
                # Validate file
                filename = secure_filename(file.filename)
                ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
                
                if ext not in ALLOWED_IMAGE_EXTENSIONS:
                    return jsonify({
                        'success': False,
                        'error': f'Invalid image format. Allowed: {", ".join(ALLOWED_IMAGE_EXTENSIONS)}'
                    }), 400
                
                # Check file size
                file.seek(0, os.SEEK_END)
                file_size = file.tell()
                file.seek(0)
                
                if file_size > MAX_IMAGE_SIZE:
                    return jsonify({
                        'success': False,
                        'error': f'Image too large. Maximum size: {MAX_IMAGE_SIZE // (1024*1024)}MB'
                    }), 400
                
                # Save file
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                unique_filename = f"quest_header_{timestamp}_{filename}"
                file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
                
                os.makedirs(UPLOAD_FOLDER, exist_ok=True)
                file.save(file_path)
                
                header_image_url = f"/uploads/headers/{unique_filename}"
        
        # Create quest
        quest = supabase.table('quests')\
            .insert({
                'title': title,
                'big_idea': big_idea,
                'header_image_url': header_image_url,
                'is_active': True,
                'created_at': datetime.utcnow().isoformat()
            })\
            .execute()
        
        if not quest.data:
            return jsonify({
                'success': False,
                'error': 'Failed to create quest'
            }), 500
        
        quest_id = quest.data[0]['id']
        
        # Parse and create tasks
        tasks_json = request.form.get('tasks', '[]')
        try:
            import json
            tasks = json.loads(tasks_json)
        except:
            tasks = []
        
        created_tasks = []
        for i, task in enumerate(tasks):
            if not task.get('title') or not task.get('pillar'):
                continue
            
            task_data = supabase.table('quest_tasks')\
                .insert({
                    'quest_id': quest_id,
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'xp_amount': min(max(int(task.get('xp_amount', 50)), 10), 500),
                    'pillar': task['pillar'],
                    'task_order': i,
                    'is_required': task.get('is_required', True),
                    'is_collaboration_eligible': task.get('is_collaboration_eligible', False),
                    'created_at': datetime.utcnow().isoformat()
                })\
                .execute()
            
            if task_data.data:
                created_tasks.append(task_data.data[0])
        
        return jsonify({
            'success': True,
            'message': 'Quest created successfully',
            'quest': quest.data[0],
            'tasks': created_tasks
        })
        
    except Exception as e:
        print(f"Error creating quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create quest'
        }), 500

@bp.route('/quests/<quest_id>', methods=['PUT'])
@require_admin
def update_quest(user_id: str, quest_id: str):
    """
    Update an existing quest.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Check quest exists
        existing = supabase.table('quests')\
            .select('id')\
            .eq('id', quest_id)\
            .single()\
            .execute()
        
        if not existing.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404
        
        # Prepare update data
        update_data = {}
        
        if 'title' in request.form:
            update_data['title'] = request.form['title'].strip()
        
        if 'big_idea' in request.form:
            update_data['big_idea'] = request.form['big_idea'].strip()
        
        if 'is_active' in request.form:
            update_data['is_active'] = request.form['is_active'].lower() == 'true'
        
        # Handle header image update
        if 'header_image' in request.files:
            file = request.files['header_image']
            if file and file.filename:
                # Validate and save file (same as create)
                filename = secure_filename(file.filename)
                ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
                
                if ext not in ALLOWED_IMAGE_EXTENSIONS:
                    return jsonify({
                        'success': False,
                        'error': f'Invalid image format'
                    }), 400
                
                file.seek(0, os.SEEK_END)
                file_size = file.tell()
                file.seek(0)
                
                if file_size > MAX_IMAGE_SIZE:
                    return jsonify({
                        'success': False,
                        'error': f'Image too large'
                    }), 400
                
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                unique_filename = f"quest_header_{quest_id}_{timestamp}_{filename}"
                file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
                
                os.makedirs(UPLOAD_FOLDER, exist_ok=True)
                file.save(file_path)
                
                update_data['header_image_url'] = f"/uploads/headers/{unique_filename}"
        
        update_data['updated_at'] = datetime.utcnow().isoformat()
        
        # Update quest
        updated = supabase.table('quests')\
            .update(update_data)\
            .eq('id', quest_id)\
            .execute()
        
        if not updated.data:
            return jsonify({
                'success': False,
                'error': 'Failed to update quest'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Quest updated successfully',
            'quest': updated.data[0]
        })
        
    except Exception as e:
        print(f"Error updating quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update quest'
        }), 500

@bp.route('/quests/<quest_id>/tasks', methods=['POST'])
@require_admin
def add_task_to_quest(user_id: str, quest_id: str):
    """
    Add a new task to an existing quest.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Verify quest exists
        quest = supabase.table('quests')\
            .select('id')\
            .eq('id', quest_id)\
            .single()\
            .execute()
        
        if not quest.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404
        
        # Get task data
        data = request.get_json()
        title = data.get('title', '').strip()
        pillar = data.get('pillar')
        
        if not title or not pillar:
            return jsonify({
                'success': False,
                'error': 'Title and pillar are required'
            }), 400
        
        # Validate pillar
        valid_pillars = ['creativity', 'critical_thinking', 'practical_skills', 
                        'communication', 'cultural_literacy']
        if pillar not in valid_pillars:
            return jsonify({
                'success': False,
                'error': f'Invalid pillar. Must be one of: {", ".join(valid_pillars)}'
            }), 400
        
        # Get current max task order
        existing_tasks = supabase.table('quest_tasks')\
            .select('task_order')\
            .eq('quest_id', quest_id)\
            .order('task_order', desc=True)\
            .limit(1)\
            .execute()
        
        next_order = (existing_tasks.data[0]['task_order'] + 1) if existing_tasks.data else 0
        
        # Create task
        task = supabase.table('quest_tasks')\
            .insert({
                'quest_id': quest_id,
                'title': title,
                'description': data.get('description', ''),
                'xp_amount': min(max(int(data.get('xp_amount', 50)), 10), 500),
                'pillar': pillar,
                'task_order': next_order,
                'is_required': data.get('is_required', True),
                'is_collaboration_eligible': data.get('is_collaboration_eligible', False),
                'created_at': datetime.utcnow().isoformat()
            })\
            .execute()
        
        if not task.data:
            return jsonify({
                'success': False,
                'error': 'Failed to create task'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Task added successfully',
            'task': task.data[0]
        })
        
    except Exception as e:
        print(f"Error adding task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to add task'
        }), 500

@bp.route('/tasks/<task_id>', methods=['PUT'])
@require_admin
def update_task(user_id: str, task_id: str):
    """
    Update a quest task.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Check task exists
        existing = supabase.table('quest_tasks')\
            .select('id')\
            .eq('id', task_id)\
            .single()\
            .execute()
        
        if not existing.data:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        # Get update data
        data = request.get_json()
        update_data = {}
        
        if 'title' in data:
            update_data['title'] = data['title'].strip()
        
        if 'description' in data:
            update_data['description'] = data['description'].strip()
        
        if 'xp_amount' in data:
            update_data['xp_amount'] = min(max(int(data['xp_amount']), 10), 500)
        
        if 'pillar' in data:
            valid_pillars = ['creativity', 'critical_thinking', 'practical_skills', 
                           'communication', 'cultural_literacy']
            if data['pillar'] in valid_pillars:
                update_data['pillar'] = data['pillar']
        
        if 'task_order' in data:
            update_data['task_order'] = int(data['task_order'])
        
        if 'is_required' in data:
            update_data['is_required'] = bool(data['is_required'])
        
        if 'is_collaboration_eligible' in data:
            update_data['is_collaboration_eligible'] = bool(data['is_collaboration_eligible'])
        
        # Update task
        updated = supabase.table('quest_tasks')\
            .update(update_data)\
            .eq('id', task_id)\
            .execute()
        
        if not updated.data:
            return jsonify({
                'success': False,
                'error': 'Failed to update task'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Task updated successfully',
            'task': updated.data[0]
        })
        
    except Exception as e:
        print(f"Error updating task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update task'
        }), 500

@bp.route('/tasks/<task_id>', methods=['DELETE'])
@require_admin
def delete_task(user_id: str, task_id: str):
    """
    Delete a quest task.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Check if task has completions
        completions = supabase.table('user_quest_tasks')\
            .select('id', count='exact')\
            .eq('quest_task_id', task_id)\
            .execute()
        
        if completions.count > 0:
            return jsonify({
                'success': False,
                'error': f'Cannot delete task with {completions.count} completions. Deactivate instead.'
            }), 400
        
        # Delete task
        deleted = supabase.table('quest_tasks')\
            .delete()\
            .eq('id', task_id)\
            .execute()
        
        if deleted:
            return jsonify({
                'success': True,
                'message': 'Task deleted successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to delete task'
            }), 500
            
    except Exception as e:
        print(f"Error deleting task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete task'
        }), 500

@bp.route('/task-suggestions', methods=['GET'])
@require_admin
def get_task_suggestions(user_id: str):
    """
    Get pending task suggestions from users.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get suggestions (tasks marked as suggestions)
        suggestions = supabase.table('quest_tasks')\
            .select('*, quests(title), users!suggested_by(username)')\
            .eq('is_suggestion_task', True)\
            .like('title', '[SUGGESTION]%')\
            .order('created_at', desc=True)\
            .execute()
        
        if not suggestions.data:
            return jsonify({
                'success': True,
                'suggestions': [],
                'message': 'No pending suggestions'
            })
        
        return jsonify({
            'success': True,
            'suggestions': suggestions.data,
            'total': len(suggestions.data)
        })
        
    except Exception as e:
        print(f"Error getting task suggestions: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch suggestions'
        }), 500

@bp.route('/task-suggestions/<task_id>/approve', methods=['POST'])
@require_admin
def approve_task_suggestion(user_id: str, task_id: str):
    """
    Approve a task suggestion and make it active.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get the suggestion
        task = supabase.table('quest_tasks')\
            .select('*')\
            .eq('id', task_id)\
            .single()\
            .execute()
        
        if not task.data:
            return jsonify({
                'success': False,
                'error': 'Task suggestion not found'
            }), 404
        
        # Remove [SUGGESTION] prefix and mark as regular task
        new_title = task.data['title'].replace('[SUGGESTION] ', '')
        
        updated = supabase.table('quest_tasks')\
            .update({
                'title': new_title,
                'is_suggestion_task': False,
                'approved_at': datetime.utcnow().isoformat(),
                'approved_by': user_id
            })\
            .eq('id', task_id)\
            .execute()
        
        if not updated.data:
            return jsonify({
                'success': False,
                'error': 'Failed to approve suggestion'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Task suggestion approved',
            'task': updated.data[0]
        })
        
    except Exception as e:
        print(f"Error approving suggestion: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to approve suggestion'
        }), 500

@bp.route('/stats', methods=['GET'])
@require_admin
def get_admin_stats(user_id: str):
    """
    Get system statistics for admin dashboard.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get various stats
        stats = {}
        
        # Total quests
        quests = supabase.table('quests')\
            .select('id', count='exact')\
            .execute()
        stats['total_quests'] = quests.count
        
        # Active quests
        active_quests = supabase.table('quests')\
            .select('id', count='exact')\
            .eq('is_active', True)\
            .execute()
        stats['active_quests'] = active_quests.count
        
        # Total tasks
        tasks = supabase.table('quest_tasks')\
            .select('id', count='exact')\
            .execute()
        stats['total_tasks'] = tasks.count
        
        # Total completions
        completions = supabase.table('user_quest_tasks')\
            .select('id', count='exact')\
            .execute()
        stats['total_completions'] = completions.count
        
        # Active collaborations
        collaborations = supabase.table('quest_collaborations')\
            .select('id', count='exact')\
            .eq('status', 'accepted')\
            .execute()
        stats['active_collaborations'] = collaborations.count
        
        # Total users (approximate from enrollments)
        enrollments = supabase.table('user_quests')\
            .select('user_id', count='exact')\
            .execute()
        stats['total_enrollments'] = enrollments.count
        
        # Pending suggestions
        suggestions = supabase.table('quest_tasks')\
            .select('id', count='exact')\
            .eq('is_suggestion_task', True)\
            .execute()
        stats['pending_suggestions'] = suggestions.count
        
        return jsonify({
            'success': True,
            'stats': stats
        })
        
    except Exception as e:
        print(f"Error getting admin stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch statistics'
        }), 500