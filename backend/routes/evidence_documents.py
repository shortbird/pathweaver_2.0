"""
Evidence documents endpoints for multi-format evidence system.
Handles creating, updating, and retrieving evidence documents with multiple content blocks.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth
from services.evidence_service import EvidenceService
from services.xp_service import XPService
from datetime import datetime
import os
import mimetypes
from werkzeug.utils import secure_filename
from typing import Dict, Any, Optional, List
import json

bp = Blueprint('evidence_documents', __name__, url_prefix='/api/evidence')

# Initialize services
evidence_service = EvidenceService()
xp_service = XPService()

# File upload configuration
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads/evidence')
MAX_FILE_SIZE = int(os.getenv('MAX_IMAGE_UPLOAD_SIZE', 10485760))  # 10MB default for images
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
ALLOWED_DOCUMENT_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt'}

@bp.route('/documents/<task_id>', methods=['GET'])
@require_auth
def get_evidence_document(user_id: str, task_id: str):
    """
    Get the evidence document for a specific task by a user.
    Returns the document with all content blocks.
    """
    try:
        supabase = get_user_client()

        # Get the evidence document
        document_response = supabase.table('user_task_evidence_documents')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('task_id', task_id)\
            .execute()

        if not document_response.data:
            # Return empty document structure if none exists yet
            return jsonify({
                'success': True,
                'document': None,
                'blocks': []
            })

        document = document_response.data[0]

        # Get all content blocks for this document
        blocks_response = supabase.table('evidence_document_blocks')\
            .select('*')\
            .eq('document_id', document['id'])\
            .order('order_index')\
            .execute()

        return jsonify({
            'success': True,
            'document': document,
            'blocks': blocks_response.data or []
        })

    except Exception as e:
        print(f"Error getting evidence document: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch evidence document'
        }), 500

@bp.route('/documents/<task_id>', methods=['POST', 'PUT'])
@require_auth
def save_evidence_document(user_id: str, task_id: str):
    """
    Create or update an evidence document with content blocks.
    This is used for auto-save and manual save operations.
    """
    try:
        supabase = get_user_client()
        admin_supabase = get_supabase_admin_client()

        data = request.get_json()
        blocks = data.get('blocks', [])
        status = data.get('status', 'draft')  # 'draft' or 'completed'

        # Validate task exists and user is enrolled (V3 personalized task system)
        task_check = supabase.table('user_quest_tasks')\
            .select('quest_id, title, xp_value, pillar, user_id')\
            .eq('id', task_id)\
            .execute()

        if not task_check.data:
            # Provide helpful debugging info
            print(f"Task {task_id} not found in user_quest_tasks table for user {user_id}")
            return jsonify({
                'success': False,
                'error': f'Task not found. This task may not have been created yet. Please complete the personalization wizard first, or the task ID may be invalid. (Task ID: {task_id[:8]}...)'
            }), 404

        # Verify task belongs to this user
        if task_check.data[0]['user_id'] != user_id:
            return jsonify({
                'success': False,
                'error': 'You do not have permission to submit evidence for this task'
            }), 403

        quest_id = task_check.data[0]['quest_id']

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
                'error': 'You must be enrolled in the quest to save evidence'
            }), 403

        # Get or create evidence document using upsert pattern
        document_response = supabase.table('user_task_evidence_documents')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('task_id', task_id)\
            .execute()

        if document_response.data:
            # Update existing document
            document_id = document_response.data[0]['id']

            update_data = {
                'updated_at': datetime.utcnow().isoformat(),
                'status': status
            }

            if status == 'completed':
                update_data['completed_at'] = datetime.utcnow().isoformat()

            supabase.table('user_task_evidence_documents')\
                .update(update_data)\
                .eq('id', document_id)\
                .execute()
        else:
            # Create new document with conflict handling
            try:
                document_insert = supabase.table('user_task_evidence_documents')\
                    .insert({
                        'user_id': user_id,
                        'quest_id': quest_id,
                        'task_id': task_id,
                        'status': status,
                        'completed_at': datetime.utcnow().isoformat() if status == 'completed' else None
                    })\
                    .execute()

                if not document_insert.data:
                    # If insert failed, try to get it again (race condition)
                    document_response = supabase.table('user_task_evidence_documents')\
                        .select('*')\
                        .eq('user_id', user_id)\
                        .eq('task_id', task_id)\
                        .execute()

                    if document_response.data:
                        document_id = document_response.data[0]['id']
                    else:
                        return jsonify({
                            'success': False,
                            'error': 'Failed to create evidence document'
                        }), 500
                else:
                    document_id = document_insert.data[0]['id']
            except Exception as insert_error:
                # Handle 409 conflict - document was created by another request
                print(f"Insert conflict (likely race condition): {str(insert_error)}")
                document_response = supabase.table('user_task_evidence_documents')\
                    .select('*')\
                    .eq('user_id', user_id)\
                    .eq('task_id', task_id)\
                    .execute()

                if document_response.data:
                    document_id = document_response.data[0]['id']
                else:
                    raise  # Re-raise if we still can't find it

        # Update content blocks
        update_document_blocks(supabase, document_id, blocks)

        # If completing the task, award XP
        xp_awarded = 0
        has_collaboration = False
        quest_completed = False

        if status == 'completed':
            # Check if this task was already completed (V3 system)
            existing_completion = supabase.table('quest_task_completions')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('task_id', task_id)\
                .execute()

            if not existing_completion.data:
                # Award XP for task completion
                task_data = task_check.data[0]
                base_xp = task_data.get('xp_value', 0)

                # Calculate XP with collaboration bonus if applicable
                final_xp, has_collaboration = xp_service.calculate_task_xp(
                    user_id, task_id, quest_id, base_xp
                )

                # Create task completion record using V3 system
                completion = supabase.table('quest_task_completions')\
                    .insert({
                        'user_id': user_id,
                        'quest_id': quest_id,
                        'task_id': task_id,
                        'user_quest_task_id': task_id,  # In V3, task_id IS the user_quest_task_id
                        'evidence_text': f'Multi-format evidence document (Document ID: {document_id})',
                        'completed_at': datetime.utcnow().isoformat()
                    })\
                    .execute()

                if completion.data:
                    # Award XP to user (this will be handled by existing XP service)
                    task_pillar = task_data.get('pillar', 'creativity')
                    xp_awarded = final_xp

                    xp_service.award_xp(
                        user_id,
                        task_pillar,
                        final_xp,
                        f'task_completion:{task_id}'
                    )

                    # Check if quest is now completed
                    quest_completed = check_quest_completion(supabase, user_id, quest_id)

        return jsonify({
            'success': True,
            'message': 'Evidence document saved successfully',
            'document_id': document_id,
            'status': status,
            'xp_awarded': xp_awarded,
            'has_collaboration_bonus': has_collaboration,
            'quest_completed': quest_completed
        })

    except Exception as e:
        print(f"Error saving evidence document: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to save evidence document'
        }), 500

@bp.route('/blocks/<block_id>/upload', methods=['POST'])
@require_auth
def upload_block_file(user_id: str, block_id: str):
    """
    Upload a file for a specific content block (image or document).
    """
    try:
        supabase = get_user_client()
        admin_supabase = get_supabase_admin_client()

        # Validate the block exists and belongs to the user
        block_response = supabase.table('evidence_document_blocks')\
            .select('*, user_task_evidence_documents!inner(user_id)')\
            .eq('id', block_id)\
            .eq('user_task_evidence_documents.user_id', user_id)\
            .single()\
            .execute()

        if not block_response.data:
            return jsonify({
                'success': False,
                'error': 'Block not found or access denied'
            }), 404

        block = block_response.data
        block_type = block['block_type']

        if block_type not in ['image', 'document']:
            return jsonify({
                'success': False,
                'error': 'File upload only supported for image and document blocks'
            }), 400

        # Handle file upload
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided'
            }), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400

        # Validate file
        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        if block_type == 'image':
            allowed_extensions = ALLOWED_IMAGE_EXTENSIONS
            max_file_size = MAX_FILE_SIZE
        else:  # document
            allowed_extensions = ALLOWED_DOCUMENT_EXTENSIONS
            max_file_size = 25 * 1024 * 1024  # 25MB

        if ext not in allowed_extensions:
            return jsonify({
                'success': False,
                'error': f'Invalid file type. Allowed: {", ".join(allowed_extensions)}'
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
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            unique_filename = f"evidence-blocks/{user_id}/{block_id}_{timestamp}_{filename}"

            file_content = file.read()
            content_type = file.content_type or mimetypes.guess_type(filename)[0] or 'application/octet-stream'

            storage_response = admin_supabase.storage.from_('quest-evidence').upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": content_type}
            )

            public_url = admin_supabase.storage.from_('quest-evidence').get_public_url(unique_filename)

            # Update block content with file information
            current_content = block.get('content', {})
            current_content.update({
                'url': public_url,
                'filename': filename,
                'file_size': file_size,
                'content_type': content_type
            })

            if block_type == 'image' and not current_content.get('alt'):
                current_content['alt'] = filename

            supabase.table('evidence_document_blocks')\
                .update({'content': current_content})\
                .eq('id', block_id)\
                .execute()

            return jsonify({
                'success': True,
                'message': 'File uploaded successfully',
                'file_url': public_url,
                'filename': filename,
                'file_size': file_size
            })

        except Exception as upload_error:
            print(f"Error uploading file: {str(upload_error)}")
            return jsonify({
                'success': False,
                'error': 'Failed to upload file'
            }), 500

    except Exception as e:
        print(f"Error in upload_block_file: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to process file upload'
        }), 500

def process_evidence_completion(user_id: str, task_id: str, blocks: List[Dict], status: str = 'completed'):
    """
    Process evidence document completion - extracted from save_evidence_document
    """
    try:
        supabase = get_user_client()
        admin_supabase = get_supabase_admin_client()

        # Validate task exists and user is enrolled (V3 personalized task system)
        task_check = supabase.table('user_quest_tasks')\
            .select('quest_id, title, xp_value, pillar')\
            .eq('id', task_id)\
            .execute()

        if not task_check.data:
            return {
                'success': False,
                'error': 'Task not found'
            }

        quest_id = task_check.data[0]['quest_id']

        # Check if user is enrolled in the quest
        enrollment = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        if not enrollment.data:
            return {
                'success': False,
                'error': 'You must be enrolled in the quest to complete tasks'
            }

        # Get or update evidence document
        document_response = supabase.table('user_task_evidence_documents')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('task_id', task_id)\
            .execute()

        if document_response.data:
            # Update existing document
            document_id = document_response.data[0]['id']

            update_data = {
                'updated_at': datetime.utcnow().isoformat(),
                'status': status
            }

            if status == 'completed':
                update_data['completed_at'] = datetime.utcnow().isoformat()

            supabase.table('user_task_evidence_documents')\
                .update(update_data)\
                .eq('id', document_id)\
                .execute()
        else:
            return {
                'success': False,
                'error': 'No evidence document found'
            }

        # Update content blocks
        update_document_blocks(supabase, document_id, blocks)

        # If completing the task, award XP
        xp_awarded = 0
        has_collaboration = False
        quest_completed = False

        if status == 'completed':
            # Check if this task was already completed
            existing_completion = supabase.table('user_quest_tasks')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('quest_task_id', task_id)\
                .execute()

            if not existing_completion.data:
                # Award XP for task completion
                task_data = task_check.data[0]
                base_xp = task_data.get('xp_value', 0)

                # Calculate XP with collaboration bonus if applicable
                final_xp, has_collaboration = xp_service.calculate_task_xp(
                    user_id, task_id, quest_id, base_xp
                )

                # Get user_quest_id for the completion record
                user_quest_response = supabase.table('user_quests')\
                    .select('id')\
                    .eq('user_id', user_id)\
                    .eq('quest_id', quest_id)\
                    .eq('is_active', True)\
                    .execute()

                if not user_quest_response.data:
                    raise Exception('User not enrolled in quest')

                user_quest_id = user_quest_response.data[0]['id']

                # Create task completion record using V3 system
                completion = supabase.table('user_quest_tasks')\
                    .insert({
                        'user_id': user_id,
                        'quest_task_id': task_id,
                        'user_quest_id': user_quest_id,
                        'evidence_type': 'document',
                        'evidence_content': f'Multi-format evidence document (Document ID: {document_id})',
                        'xp_awarded': final_xp,
                        'completed_at': datetime.utcnow().isoformat()
                    })\
                    .execute()

                if completion.data:
                    # Award XP to user
                    task_pillar = task_data.get('pillar', 'creativity')
                    xp_awarded = final_xp

                    xp_service.award_xp(
                        user_id,
                        task_pillar,
                        final_xp,
                        f'task_completion:{task_id}'
                    )

                    # Check if quest is now completed
                    quest_completed = check_quest_completion(supabase, user_id, quest_id)

        return {
            'success': True,
            'message': 'Task completed successfully',
            'document_id': document_id,
            'status': status,
            'xp_awarded': xp_awarded,
            'has_collaboration_bonus': has_collaboration,
            'quest_completed': quest_completed
        }

    except Exception as e:
        print(f"Error processing evidence completion: {str(e)}")
        return {
            'success': False,
            'error': 'Failed to complete task'
        }

def update_document_blocks(supabase, document_id: str, blocks: List[Dict]):
    """
    Update the content blocks for a document.
    Deletes removed blocks and creates/updates existing ones.
    """
    try:
        # Get existing blocks
        existing_blocks = supabase.table('evidence_document_blocks')\
            .select('id')\
            .eq('document_id', document_id)\
            .execute()

        existing_block_ids = {block['id'] for block in existing_blocks.data}
        incoming_block_ids = {block.get('id') for block in blocks if block.get('id')}

        # Delete blocks that are no longer present
        blocks_to_delete = existing_block_ids - incoming_block_ids
        if blocks_to_delete:
            supabase.table('evidence_document_blocks')\
                .delete()\
                .in_('id', list(blocks_to_delete))\
                .execute()

        # Create or update blocks
        for index, block in enumerate(blocks):
            block_data = {
                'document_id': document_id,
                'block_type': block['type'],
                'content': block['content'],
                'order_index': index
            }

            block_id = block.get('id')
            if block_id and block_id in existing_block_ids:
                # Update existing block (only if it actually exists in database)
                supabase.table('evidence_document_blocks')\
                    .update(block_data)\
                    .eq('id', block_id)\
                    .execute()
            else:
                # Create new block (either no ID or ID doesn't exist in database)
                supabase.table('evidence_document_blocks')\
                    .insert(block_data)\
                    .execute()

    except Exception as e:
        print(f"Error updating document blocks: {str(e)}")
        raise

def check_quest_completion(supabase, user_id: str, quest_id: str) -> bool:
    """
    Check if all required tasks for a quest are now completed.
    """
    try:
        # Get all required tasks for the quest (V3 system)
        required_tasks = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .eq('is_required', True)\
            .execute()

        if not required_tasks.data:
            # If no required tasks, treat all tasks as required
            all_tasks = supabase.table('user_quest_tasks')\
                .select('id')\
                .eq('quest_id', quest_id)\
                .execute()
            required_task_ids = {task['id'] for task in all_tasks.data}
        else:
            required_task_ids = {task['id'] for task in required_tasks.data}

        # Get completed tasks by this user for this quest
        # First get the user_quest record to filter by
        user_quest = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        if not user_quest.data:
            return False  # User not enrolled in quest

        user_quest_id = user_quest.data[0]['id']

        completed_tasks = supabase.table('quest_task_completions')\
            .select('task_id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        completed_task_ids = {task['task_id'] for task in completed_tasks.data}

        # Check if all required tasks are completed
        if required_task_ids and required_task_ids.issubset(completed_task_ids):
            # Mark quest as completed
            supabase.table('user_quests')\
                .update({
                    'completed_at': datetime.utcnow().isoformat(),
                    'is_active': False
                })\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            return True

        return False

    except Exception as e:
        print(f"Error checking quest completion: {str(e)}")
        return False

@bp.route('/documents/<task_id>/complete', methods=['POST'])
@require_auth
def complete_task_with_evidence(user_id: str, task_id: str):
    """
    Mark a task as complete using the multi-format evidence document.
    This replaces the old single-format completion endpoint.
    """
    try:
        supabase = get_user_client()

        # Check if evidence document exists and has content
        document_response = supabase.table('user_task_evidence_documents')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('task_id', task_id)\
            .execute()

        if not document_response.data:
            return jsonify({
                'success': False,
                'error': 'No evidence document found. Please add some evidence first.'
            }), 400

        document = document_response.data[0]

        # Check if document has content blocks
        blocks_response = supabase.table('evidence_document_blocks')\
            .select('id')\
            .eq('document_id', document['id'])\
            .execute()

        if not blocks_response.data:
            return jsonify({
                'success': False,
                'error': 'Evidence document is empty. Please add content before completing.'
            }), 400

        # Get current blocks
        current_blocks_response = supabase.table('evidence_document_blocks')\
            .select('*')\
            .eq('document_id', document['id'])\
            .order('order_index')\
            .execute()

        # Transform blocks to the format expected by the completion function
        blocks = []
        for block in current_blocks_response.data or []:
            # Clean up content to remove any temporary blob URLs
            content = block['content'].copy() if block['content'] else {}
            if 'url' in content and content['url'] and content['url'].startswith('blob:'):
                # Remove blob URLs as they're temporary
                content.pop('url', None)

            blocks.append({
                'id': block['id'],
                'type': block['block_type'],  # Convert block_type to type
                'content': content,
                'order': block['order_index']
            })

        # Process completion using the same logic as save_evidence_document
        response = process_evidence_completion(user_id, task_id, blocks, 'completed')
        return jsonify(response)

    except Exception as e:
        print(f"Error completing task with evidence: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to complete task'
        }), 500