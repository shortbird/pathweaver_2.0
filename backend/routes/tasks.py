"""
Task completion endpoints for Quest V3 system.
Handles task completion with evidence upload and XP awards.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth
from services.evidence_service import EvidenceService
from services.xp_service import XPService
from services.atomic_quest_service import atomic_quest_service
from datetime import datetime
import os
import math
import mimetypes
from werkzeug.utils import secure_filename
from typing import Dict, Any, Optional

bp = Blueprint('tasks', __name__, url_prefix='/api/tasks')

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
        # JUSTIFICATION: Admin client only for Supabase storage and XP operations
        # Storage operations (line 165-172) and XP awards (line 257-288) require elevated privileges
        # All user-scoped database operations use user client with proper RLS enforcement
        admin_supabase = get_supabase_admin_client()
        
        # Get user-specific task details (personalized task)
        task = supabase.table('user_quest_tasks')\
            .select('*, quests(id, title), user_quests!user_quest_id(id, user_id)')\
            .eq('id', task_id)\
            .eq('user_id', user_id)\
            .single()\
            .execute()

        if not task.data:
            return jsonify({
                'success': False,
                'error': 'Task not found or not owned by you'
            }), 404

        task_data = task.data
        quest_id = task_data['quest_id']
        user_quest_id = task_data['user_quest_id']

        # Verify task is approved (for manual tasks)
        if task_data.get('approval_status') != 'approved':
            return jsonify({
                'success': False,
                'error': 'This task is pending approval and cannot be completed yet'
            }), 403

        # Check if task already completed
        existing_completion = supabase.table('quest_task_completions')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('user_quest_task_id', task_id)\
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
        
        # Get base XP from task
        base_xp = task_data.get('xp_value', 100)

        # Check for active collaboration on this task
        # Use user client (RLS-enforced) to check user's own collaboration data
        collaboration = supabase.table('task_collaborations')\
            .select('*')\
            .eq('task_id', task_id)\
            .eq('status', 'active')\
            .execute()

        # Collaboration bonus removed in Phase 1 refactoring (January 2025)
        has_collaboration = False
        final_xp = base_xp

        # Create task completion record
        completion = supabase.table('quest_task_completions')\
            .insert({
                'user_id': user_id,
                'quest_id': quest_id,
                'task_id': task_id,
                'user_quest_task_id': task_id,  # Reference to personalized task
                'evidence_text': evidence_content if evidence_type == 'text' else None,
                'evidence_url': evidence_content if evidence_type != 'text' else None,
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
        print(f"Base XP: {base_xp}, Final XP: {final_xp}, Has Collaboration: {has_collaboration}")
        print("================================")

        # Award XP using XP service
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
        
        # Check if all required tasks are completed (personalized quest system)
        # Get user's personalized tasks for this quest
        all_required_tasks = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .eq('user_id', user_id)\
            .eq('is_required', True)\
            .execute()

        # Also get ALL user tasks for completion bonus check
        all_tasks = supabase.table('user_quest_tasks')\
            .select('id, xp_value, pillar')\
            .eq('quest_id', quest_id)\
            .eq('user_id', user_id)\
            .execute()

        # Get completed task IDs from quest_task_completions
        completed_tasks = supabase.table('quest_task_completions')\
            .select('user_quest_task_id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        required_task_ids = {t['id'] for t in all_required_tasks.data}
        all_task_ids = {t['id'] for t in all_tasks.data}
        completed_task_ids = {t['user_quest_task_id'] for t in completed_tasks.data}
        
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

            # Completion bonus removed in Phase 1 refactoring (January 2025)
            # Users now only receive XP from individual task completions
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

# REMOVED: get_task_completions endpoint (originally lines 421-482)
# Reason: Unused - no frontend references found
# Feature: View other students' task completions - never implemented in UI

# REMOVED: suggest_task endpoint (originally lines 484-569)
# Reason: Unused - superseded by quest personalization system
# Feature: Student task suggestions - replaced by AI-powered task generation

# Note: The above functions have been removed because:
# 1. get_task_completions() - queried non-existent quest_tasks table and had no UI
# 2. suggest_task() - created quest_tasks entries which conflict with personalized quest system