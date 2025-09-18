"""
Task completion endpoints for Quest V3 system.
Handles task completion with evidence upload and XP awards.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth
from services.evidence_service import EvidenceService
from services.xp_service import XPService
from datetime import datetime
import os
import math
import mimetypes
from werkzeug.utils import secure_filename
from typing import Dict, Any, Optional

bp = Blueprint('tasks', __name__, url_prefix='/api/v3/tasks')

# Initialize services
evidence_service = EvidenceService()
xp_service = XPService()

# File upload configuration
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads/evidence')
MAX_FILE_SIZE = int(os.getenv('MAX_IMAGE_UPLOAD_SIZE', 10485760))  # 10MB default for images
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}

@bp.route('/<task_id>/complete', methods=['POST'])
@require_auth
def complete_task(user_id: str, task_id: str):
    """
    Complete a task with evidence submission.
    Handles file uploads and awards XP with collaboration bonus if applicable.
    """
    try:
        # Use user client for user operations (RLS enforcement)
        supabase = get_user_client()
        # Admin client only for XP awards (requires elevated privileges)
        admin_supabase = get_supabase_admin_client()
        
        # Get task details
        task = supabase.table('quest_tasks')\
            .select('*, quests(id, title)')\
            .eq('id', task_id)\
            .single()\
            .execute()
        
        if not task.data:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        task_data = task.data
        quest_id = task_data['quest_id']
        
        # Check if user is enrolled in the quest
        enrollment = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()
        
        if not enrollment.data:
            return jsonify({
                'success': False,
                'error': 'You must be enrolled in the quest to complete tasks'
            }), 403
        
        user_quest_id = enrollment.data[0]['id']
        
        # Check if task already completed
        existing_completion = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_task_id', task_id)\
            .execute()
        
        if existing_completion.data:
            return jsonify({
                'success': False,
                'error': 'Task already completed'
            }), 400
        
        # Get evidence from request
        evidence_type = request.form.get('evidence_type')
        if not evidence_type:
            return jsonify({
                'success': False,
                'error': 'Evidence type is required'
            }), 400
        
        # Prepare evidence data based on type
        evidence_data = {}
        evidence_content = ''
        
        if evidence_type == 'text':
            evidence_data['content'] = request.form.get('text_content', '')
            evidence_content = evidence_data['content']
            
        elif evidence_type == 'link' or evidence_type == 'video':
            evidence_data['url'] = request.form.get('text_content', '')
            evidence_data['title'] = request.form.get('link_title', '')
            evidence_content = evidence_data['url']
            
        elif evidence_type == 'image' or evidence_type == 'document':
            # Handle file upload to Supabase storage
            if 'file' not in request.files:
                return jsonify({
                    'success': False,
                    'error': f'File is required for {evidence_type} evidence'
                }), 400

            file = request.files['file']
            if file.filename == '':
                return jsonify({
                    'success': False,
                    'error': 'No file selected'
                }), 400

            # Validate file extension
            filename = secure_filename(file.filename)
            ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

            # Set allowed extensions based on evidence type
            if evidence_type == 'image':
                allowed_extensions = ALLOWED_IMAGE_EXTENSIONS
                max_file_size = MAX_FILE_SIZE
            elif evidence_type == 'document':
                allowed_extensions = {'pdf', 'doc', 'docx', 'txt'}
                max_file_size = 25 * 1024 * 1024  # 25MB for documents
            else:
                return jsonify({
                    'success': False,
                    'error': f'Unsupported file evidence type: {evidence_type}'
                }), 400

            if ext not in allowed_extensions:
                return jsonify({
                    'success': False,
                    'error': f'Invalid {evidence_type} format. Extension "{ext}" not allowed. Allowed: {", ".join(allowed_extensions)}'
                }), 400

            # Check file size
            file.seek(0, os.SEEK_END)
            file_size = file.tell()
            file.seek(0)

            if file_size > max_file_size:
                return jsonify({
                    'success': False,
                    'error': f'File too large. Maximum size: {max_file_size // (1024*1024)}MB'
                }), 400

            # Upload to Supabase storage
            try:
                # Generate unique filename for Supabase storage
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                unique_filename = f"task-evidence/{user_id}/{task_id}_{timestamp}_{filename}"

                # Read file content
                file_content = file.read()
                file.seek(0)  # Reset file pointer

                # Determine content type
                content_type = file.content_type or mimetypes.guess_type(filename)[0] or 'application/octet-stream'

                # Upload to Supabase storage
                storage_response = admin_supabase.storage.from_('quest-evidence').upload(
                    path=unique_filename,
                    file=file_content,
                    file_options={"content-type": content_type}
                )

                # Get public URL
                public_url = admin_supabase.storage.from_('quest-evidence').get_public_url(unique_filename)

                evidence_data['file_url'] = public_url
                evidence_data['file_size'] = file_size
                evidence_data['original_name'] = filename
                evidence_data['validated_extension'] = ext  # Flag that we already validated this
                evidence_content = public_url

            except Exception as upload_error:
                print(f"Error uploading to Supabase storage: {str(upload_error)}")
                return jsonify({
                    'success': False,
                    'error': 'Failed to upload image. Please try again.'
                }), 500
        
        # Validate evidence
        is_valid, error_msg = evidence_service.validate_evidence(evidence_type, evidence_data)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error_msg
            }), 400
        
        # Calculate XP with collaboration bonus
        base_xp = task_data['xp_amount']
        final_xp, has_collaboration = xp_service.calculate_task_xp(
            user_id, task_id, quest_id, base_xp
        )
        
        # Create task completion record
        completion = supabase.table('user_quest_tasks')\
            .insert({
                'user_id': user_id,
                'quest_task_id': task_id,
                'user_quest_id': user_quest_id,
                'evidence_type': evidence_type,
                'evidence_content': evidence_content,
                'xp_awarded': final_xp,
                'completed_at': datetime.utcnow().isoformat()
            })\
            .execute()
        
        if not completion.data:
            return jsonify({
                'success': False,
                'error': 'Failed to save task completion'
            }), 500
        
        # Award XP to user
        print(f"=== TASK COMPLETION XP DEBUG ===")
        print(f"Task ID: {task_id}, User ID: {user_id}")
        print(f"Task pillar: {task_data.get('pillar')}")
        print(f"XP to award: {final_xp}")
        print("================================")
        
        # The XP service will handle pillar normalization internally
        xp_awarded = xp_service.award_xp(
            user_id,
            task_data.get('pillar', 'creativity'),  # Default to old key, service will normalize
            final_xp,
            f'task_completion:{task_id}'
        )

        if not xp_awarded:
            print(f"Warning: Failed to award XP for task {task_id} to user {user_id}")

        # Award subject-specific XP for diploma credits
        subject_xp_distribution = task_data.get('subject_xp_distribution', {})
        if subject_xp_distribution:
            print(f"=== SUBJECT XP TRACKING ===")
            print(f"Task ID: {task_id}, User ID: {user_id}")
            print(f"Subject XP Distribution: {subject_xp_distribution}")

            for subject, subject_xp in subject_xp_distribution.items():
                try:
                    # Update or insert subject XP
                    existing_subject_xp = admin_supabase.table('user_subject_xp')\
                        .select('id, xp_amount')\
                        .eq('user_id', user_id)\
                        .eq('school_subject', subject)\
                        .execute()

                    if existing_subject_xp.data:
                        # Update existing record
                        current_xp = existing_subject_xp.data[0]['xp_amount']
                        new_total = current_xp + subject_xp

                        admin_supabase.table('user_subject_xp')\
                            .update({
                                'xp_amount': new_total,
                                'updated_at': datetime.utcnow().isoformat()
                            })\
                            .eq('user_id', user_id)\
                            .eq('school_subject', subject)\
                            .execute()

                        print(f"Updated {subject}: {current_xp} + {subject_xp} = {new_total} XP")
                    else:
                        # Create new record
                        admin_supabase.table('user_subject_xp')\
                            .insert({
                                'user_id': user_id,
                                'school_subject': subject,
                                'xp_amount': subject_xp,
                                'updated_at': datetime.utcnow().isoformat()
                            })\
                            .execute()

                        print(f"Created {subject}: {subject_xp} XP")

                except Exception as e:
                    print(f"Warning: Failed to award subject XP for {subject}: {e}")

            print("==========================")
        else:
            print(f"No subject XP distribution found for task {task_id}")
        
        # Check if all required tasks are completed
        all_required_tasks = supabase.table('quest_tasks')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .eq('is_required', True)\
            .execute()
        
        # Also get ALL tasks for completion bonus check
        all_tasks = supabase.table('quest_tasks')\
            .select('id, xp_amount, pillar')\
            .eq('quest_id', quest_id)\
            .execute()
        
        completed_tasks = supabase.table('user_quest_tasks')\
            .select('quest_task_id')\
            .eq('user_id', user_id)\
            .eq('user_quest_id', user_quest_id)\
            .execute()
        
        required_task_ids = {t['id'] for t in all_required_tasks.data}
        all_task_ids = {t['id'] for t in all_tasks.data}
        completed_task_ids = {t['quest_task_id'] for t in completed_tasks.data}
        
        # Check if all tasks (required and optional) are completed for bonus
        all_tasks_completed = all_task_ids.issubset(completed_task_ids)
        
        # If no required tasks are specified, treat all tasks as required
        # This ensures quests are marked complete when all tasks are done
        if not required_task_ids:
            required_task_ids = all_task_ids
            
        # If all required tasks completed, mark quest as complete
        if required_task_ids and required_task_ids.issubset(completed_task_ids):
            supabase.table('user_quests')\
                .update({
                    'completed_at': datetime.utcnow().isoformat(),
                    'is_active': False
                })\
                .eq('id', user_quest_id)\
                .execute()
            
            quest_completed = True
            
            # Award completion bonus if ALL tasks are done (50% bonus, rounded up to nearest 50)
            if all_tasks_completed and len(all_task_ids) == len(completed_task_ids):
                # Calculate total base XP for the quest
                total_base_xp = sum(task['xp_amount'] for task in all_tasks.data)
                
                # Calculate 50% bonus
                bonus_xp = total_base_xp * 0.5
                
                # Round up to nearest multiple of 50
                bonus_xp = math.ceil(bonus_xp / 50) * 50
                
                # Get the quest's primary pillar for the bonus
                quest_pillar = 'creativity'  # Default pillar
                try:
                    quest_info = supabase.table('quests')\
                        .select('pillar')\
                        .eq('id', quest_id)\
                        .single()\
                        .execute()
                    
                    if quest_info.data and quest_info.data.get('pillar'):
                        quest_pillar = quest_info.data['pillar']
                except Exception as e:
                    print(f"Warning: Could not fetch quest pillar, using default: {e}")
                    # Use the most common pillar from tasks as fallback
                    try:
                        task_pillars = [task['pillar'] for task in all_tasks.data if task.get('pillar')]
                        if task_pillars:
                            quest_pillar = max(set(task_pillars), key=task_pillars.count)
                    except:
                        pass
                
                # Award the completion bonus
                print(f"=== QUEST COMPLETION BONUS ===")
                print(f"User {user_id} completed ALL tasks for quest {quest_id}")
                print(f"Total base XP: {total_base_xp}, Bonus XP: {bonus_xp}")
                print("==============================")
                
                bonus_awarded = xp_service.award_xp(
                    user_id,
                    quest_pillar,
                    bonus_xp,
                    f'quest_completion_bonus:{quest_id}'
                )
                
                # Return response with or without bonus
                return jsonify({
                    'success': True,
                    'message': f'Task completed! Earned {final_xp} XP. Quest fully completed!' + 
                              (f' Bonus {bonus_xp} XP awarded!' if bonus_awarded else ' (Bonus XP award pending)'),
                    'xp_awarded': final_xp,
                    'completion_bonus': bonus_xp if bonus_awarded else 0,
                    'has_collaboration_bonus': has_collaboration,
                    'quest_completed': quest_completed,
                    'all_tasks_completed': True,
                    'bonus_awarded': bonus_awarded,
                    'completion': completion.data[0]
                })
        else:
            quest_completed = False
        
        return jsonify({
            'success': True,
            'message': f'Task completed! Earned {final_xp} XP',
            'xp_awarded': final_xp,
            'has_collaboration_bonus': has_collaboration,
            'quest_completed': quest_completed,
            'completion': completion.data[0]
        })
        
    except Exception as e:
        print(f"Error completing task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to complete task'
        }), 500

@bp.route('/<task_id>/completions', methods=['GET'])
@require_auth
def get_task_completions(user_id: str, task_id: str):
    """
    Get all completions for a specific task.
    Useful for showing examples to other users.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get task details first
        task = supabase.table('quest_tasks')\
            .select('id, title, quest_id')\
            .eq('id', task_id)\
            .single()\
            .execute()
        
        if not task.data:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        # Get completions with user info
        completions = supabase.table('user_quest_tasks')\
            .select('*, users(username, avatar_url)')\
            .eq('quest_task_id', task_id)\
            .order('completed_at', desc=True)\
            .limit(20)\
            .execute()
        
        # Format evidence for display
        formatted_completions = []
        for completion in completions.data:
            # Only show non-sensitive evidence
            if completion['evidence_type'] in ['text', 'link']:
                evidence_display = evidence_service.get_evidence_display_data(
                    completion['evidence_type'],
                    completion['evidence_content']
                )
                
                formatted_completions.append({
                    'user': completion.get('users'),
                    'evidence_type': completion['evidence_type'],
                    'evidence_display': evidence_display,
                    'xp_awarded': completion['xp_awarded'],
                    'completed_at': completion['completed_at']
                })
        
        return jsonify({
            'success': True,
            'task': task.data,
            'completions': formatted_completions,
            'total': len(formatted_completions)
        })
        
    except Exception as e:
        print(f"Error getting task completions: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch task completions'
        }), 500

@bp.route('/suggest', methods=['POST'])
@require_auth
def suggest_task(user_id: str):
    """
    Allow users to suggest new tasks for existing quests.
    Suggestions go to admin review queue.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get suggestion data
        data = request.get_json()
        quest_id = data.get('quest_id')
        title = data.get('title')
        description = data.get('description')
        suggested_xp = data.get('xp_amount', 50)
        suggested_pillar = data.get('pillar')
        
        # Validate required fields
        if not all([quest_id, title, suggested_pillar]):
            return jsonify({
                'success': False,
                'error': 'Quest ID, title, and pillar are required'
            }), 400
        
        # Validate pillar - accept both old and new pillar keys
        old_pillars = ['creativity', 'critical_thinking', 'practical_skills', 
                      'communication', 'cultural_literacy']
        new_pillars = ['arts_creativity', 'stem_logic', 'life_wellness',
                      'language_communication', 'society_culture']
        valid_pillars = old_pillars + new_pillars
        
        if suggested_pillar not in valid_pillars:
            return jsonify({
                'success': False,
                'error': f'Invalid pillar. Must be one of: {", ".join(new_pillars)}'
            }), 400
        
        # Check if quest exists
        quest = supabase.table('quests')\
            .select('id, title')\
            .eq('id', quest_id)\
            .single()\
            .execute()
        
        if not quest.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found'
            }), 404
        
        # Create task suggestion (stored as inactive task)
        suggestion = supabase.table('quest_tasks')\
            .insert({
                'quest_id': quest_id,
                'title': f"[SUGGESTION] {title}",
                'description': description or '',
                'xp_amount': min(max(suggested_xp, 10), 500),  # Clamp between 10-500
                'pillar': suggested_pillar,
                'task_order': 999,  # Put suggestions at the end
                'is_required': False,
                'is_collaboration_eligible': False,
                'is_suggestion_task': True,  # Custom flag for suggestions
                'suggested_by': user_id,
                'created_at': datetime.utcnow().isoformat()
            })\
            .execute()
        
        if not suggestion.data:
            return jsonify({
                'success': False,
                'error': 'Failed to submit suggestion'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Task suggestion submitted for review',
            'suggestion': suggestion.data[0]
        })
        
    except Exception as e:
        print(f"Error suggesting task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to submit task suggestion'
        }), 500