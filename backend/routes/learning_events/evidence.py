"""Evidence blocks, file uploads, public read.

Split from routes/learning_events.py on 2026-04-14 (Q1).
"""

"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses LearningEventsService exclusively (service layer pattern)
- Only 1 direct database call for file upload verification (line 293-304, acceptable)
- Service layer properly encapsulates all CRUD operations
- File upload endpoint uses get_user_client for RLS enforcement (correct pattern)

Learning Events Routes
API endpoints for spontaneous learning moment capture
"""
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.learning_events_service import LearningEventsService
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)



from routes.learning_events import learning_events_bp


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
        from database import get_supabase_admin_client
        # admin client justified: learning event reads/writes scoped to caller (self) under @require_auth; cross-user only after parent/observer relationship verification
        admin_supabase = get_supabase_admin_client()

        # Verify event belongs to user
        event_check = admin_supabase.table('learning_events') \
            .select('id') \
            .eq('id', event_id) \
            .eq('user_id', user_id) \
            .single() \
            .execute()

        if not event_check.data:
            return jsonify({'success': False, 'error': 'Learning event not found or access denied'}), 404

        file = request.files.get('file')
        block_type = request.form.get('block_type', 'document')

        from services.media_upload_service import MediaUploadService
        result = MediaUploadService(admin_supabase).upload_evidence_file(
            file,
            user_id=user_id,
            context_type='event',
            context_id=event_id,
            block_type=block_type,
        )

        if not result.success:
            status = 413 if result.error_code == 'FILE_TOO_LARGE' else 400
            return jsonify({'success': False, 'error': result.error_message}), status

        response_data = {
            'success': True,
            'message': 'File uploaded successfully',
            'file_url': result.file_url,
            'filename': result.filename,
            'file_size': result.file_size,
            'content_type': result.content_type,
        }
        if result.thumbnail_url:
            response_data['thumbnail_url'] = result.thumbnail_url
        if result.duration_seconds is not None:
            response_data['duration_seconds'] = result.duration_seconds
        if result.width is not None:
            response_data['width'] = result.width
        if result.height is not None:
            response_data['height'] = result.height

        return jsonify(response_data)

    except Exception as e:
        logger.error(f"Error in upload_event_file: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to process file upload'}), 500


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


# ============================================================================
# Curiosity Threads Endpoints (Learning Moments 2.0 - Phase 3)
# ============================================================================

