"""
Learning Events Routes
API endpoints for spontaneous learning moment capture
"""
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.learning_events_service import LearningEventsService
import logging

logger = logging.getLogger(__name__)

learning_events_bp = Blueprint('learning_events', __name__)


@learning_events_bp.route('/api/learning-events', methods=['POST'])
@require_auth
def create_learning_event(user_id):
    """Create a new learning event"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        if not description or not description.strip():
            return jsonify({'error': 'Description is required'}), 400

        title = data.get('title')
        pillars = data.get('pillars', [])

        # Validate pillars if provided
        valid_pillars = [
            'arts_creativity',
            'stem_logic',
            'life_wellness',
            'language_communication',
            'society_culture'
        ]

        if pillars and not isinstance(pillars, list):
            return jsonify({'error': 'Pillars must be an array'}), 400

        if pillars:
            invalid_pillars = [p for p in pillars if p not in valid_pillars]
            if invalid_pillars:
                return jsonify({
                    'error': f'Invalid pillars: {", ".join(invalid_pillars)}'
                }), 400

        result = LearningEventsService.create_learning_event(
            user_id=user_id,
            description=description,
            title=title,
            pillars=pillars
        )

        if result['success']:
            return jsonify({
                'success': True,
                'event': result['event'],
                'message': 'Learning moment captured!'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to create learning event')
            }), 500

    except Exception as e:
        logger.error(f"Error in create_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events', methods=['GET'])
@require_auth
def get_learning_events(user_id):
    """Get all learning events for the authenticated user"""
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        # Validate pagination parameters
        if limit < 1 or limit > 100:
            return jsonify({'error': 'Limit must be between 1 and 100'}), 400
        if offset < 0:
            return jsonify({'error': 'Offset must be non-negative'}), 400

        result = LearningEventsService.get_user_learning_events(
            user_id=user_id,
            limit=limit,
            offset=offset
        )

        if result['success']:
            return jsonify({
                'success': True,
                'events': result['events']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch learning events'),
                'events': []
            }), 500

    except Exception as e:
        logger.error(f"Error in get_learning_events: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>', methods=['GET'])
@require_auth
def get_learning_event(user_id, event_id):
    """Get a specific learning event with evidence"""
    try:
        result = LearningEventsService.get_learning_event_with_evidence(
            user_id=user_id,
            event_id=event_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'event': result['event']
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch learning event')
            }), status_code

    except Exception as e:
        logger.error(f"Error in get_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>', methods=['PUT'])
@require_auth
def update_learning_event(user_id, event_id):
    """Update a learning event"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        title = data.get('title')
        pillars = data.get('pillars')

        # Validate pillars if provided
        if pillars is not None:
            if not isinstance(pillars, list):
                return jsonify({'error': 'Pillars must be an array'}), 400

            valid_pillars = [
                'arts_creativity',
                'stem_logic',
                'life_wellness',
                'language_communication',
                'society_culture'
            ]
            invalid_pillars = [p for p in pillars if p not in valid_pillars]
            if invalid_pillars:
                return jsonify({
                    'error': f'Invalid pillars: {", ".join(invalid_pillars)}'
                }), 400

        result = LearningEventsService.update_learning_event(
            user_id=user_id,
            event_id=event_id,
            description=description,
            title=title,
            pillars=pillars
        )

        if result['success']:
            return jsonify({
                'success': True,
                'event': result['event'],
                'message': 'Learning moment updated!'
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to update learning event')
            }), status_code

    except Exception as e:
        logger.error(f"Error in update_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>', methods=['DELETE'])
@require_auth
def delete_learning_event(user_id, event_id):
    """Delete a learning event"""
    try:
        result = LearningEventsService.delete_learning_event(
            user_id=user_id,
            event_id=event_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'message': result.get('message', 'Learning moment deleted')
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to delete learning event')
            }), 500

    except Exception as e:
        logger.error(f"Error in delete_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>/evidence', methods=['POST'])
@require_auth
def save_evidence_blocks(user_id, event_id):
    """Save or update evidence blocks for a learning event"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        blocks = data.get('blocks', [])

        if not isinstance(blocks, list):
            return jsonify({'error': 'Blocks must be an array'}), 400

        # Validate block types
        valid_block_types = ['text', 'image', 'video', 'link', 'document']
        for block in blocks:
            block_type = block.get('block_type') or block.get('type')
            if not block_type:
                return jsonify({'error': 'Each block must have a block_type or type'}), 400
            if block_type not in valid_block_types:
                return jsonify({'error': f'Invalid block type: {block_type}'}), 400
            # Normalize to block_type
            if 'type' in block and 'block_type' not in block:
                block['block_type'] = block.pop('type')

        result = LearningEventsService.save_evidence_blocks(
            user_id=user_id,
            event_id=event_id,
            blocks=blocks
        )

        if result['success']:
            return jsonify({
                'success': True,
                'blocks': result['blocks'],
                'message': 'Evidence saved successfully'
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to save evidence blocks')
            }), status_code

    except Exception as e:
        logger.error(f"Error in save_evidence_blocks: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>/upload', methods=['POST'])
@require_auth
def upload_event_file(user_id, event_id):
    """Upload a file for a learning event evidence block"""
    try:
        from database import get_supabase_admin_client, get_user_client
        from werkzeug.utils import secure_filename
        from datetime import datetime
        import os
        import mimetypes

        supabase = get_user_client(user_id)
        admin_supabase = get_supabase_admin_client()

        # Verify event belongs to user
        event_check = supabase.table('learning_events') \
            .select('id') \
            .eq('id', event_id) \
            .eq('user_id', user_id) \
            .single() \
            .execute()

        if not event_check.data:
            return jsonify({
                'success': False,
                'error': 'Learning event not found or access denied'
            }), 404

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

        # Get block information
        block_type = request.form.get('block_type', 'document')
        order_index = request.form.get('order_index', 0)

        # Validate file
        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        # Determine allowed extensions based on block type
        if block_type == 'image':
            allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
            max_file_size = 10 * 1024 * 1024  # 10MB
        elif block_type == 'document':
            allowed_extensions = {'pdf', 'doc', 'docx', 'txt'}
            max_file_size = 10 * 1024 * 1024  # 10MB
        else:
            return jsonify({
                'success': False,
                'error': 'Invalid block type for file upload'
            }), 400

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
            max_size_mb = max_file_size // (1024*1024)
            file_size_mb = file_size / (1024*1024)
            return jsonify({
                'success': False,
                'error': f'File too large ({file_size_mb:.1f}MB). Maximum: {max_size_mb}MB.'
            }), 413

        # Upload to Supabase storage
        try:
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            unique_filename = f"learning-events/{user_id}/{event_id}_{timestamp}_{filename}"

            file_content = file.read()
            content_type = file.content_type or mimetypes.guess_type(filename)[0] or 'application/octet-stream'

            storage_response = admin_supabase.storage.from_('quest-evidence').upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": content_type}
            )

            public_url = admin_supabase.storage.from_('quest-evidence').get_public_url(unique_filename)

            # Find the evidence block to update
            blocks_response = supabase.table('learning_event_evidence_blocks') \
                .select('*') \
                .eq('learning_event_id', event_id) \
                .eq('order_index', int(order_index)) \
                .execute()

            if blocks_response.data and len(blocks_response.data) > 0:
                block = blocks_response.data[0]
                block_id = block['id']

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

                supabase.table('learning_event_evidence_blocks') \
                    .update({'content': current_content}) \
                    .eq('id', block_id) \
                    .execute()

                return jsonify({
                    'success': True,
                    'message': 'File uploaded successfully',
                    'file_url': public_url,
                    'block_id': block_id,
                    'filename': filename,
                    'file_size': file_size
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Evidence block not found'
                }), 404

        except Exception as upload_error:
            logger.error(f"Error uploading file: {str(upload_error)}")
            return jsonify({
                'success': False,
                'error': 'Failed to upload file'
            }), 500

    except Exception as e:
        logger.error(f"Error in upload_event_file: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to process file upload'
        }), 500


@learning_events_bp.route('/api/users/<target_user_id>/learning-events/public', methods=['GET'])
def get_public_learning_events(target_user_id):
    """Get learning events for public diploma view (no auth required)"""
    try:
        limit = request.args.get('limit', 50, type=int)

        # Validate limit
        if limit < 1 or limit > 100:
            return jsonify({'error': 'Limit must be between 1 and 100'}), 400

        result = LearningEventsService.get_public_learning_events(
            user_id=target_user_id,
            limit=limit
        )

        if result['success']:
            return jsonify({
                'success': True,
                'events': result['events']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch learning events'),
                'events': []
            }), 500

    except Exception as e:
        logger.error(f"Error in get_public_learning_events: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
