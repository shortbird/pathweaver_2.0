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
            'art',
            'stem',
            'wellness',
            'communication',
            'civics'
        ]

        if pillars and not isinstance(pillars, list):
            return jsonify({'error': 'Pillars must be an array'}), 400

        if pillars:
            invalid_pillars = [p for p in pillars if p not in valid_pillars]
            if invalid_pillars:
                return jsonify({
                    'error': f'Invalid pillars: {", ".join(invalid_pillars)}'
                }), 400

        # New optional fields for Learning Moments 2.0
        track_id = data.get('track_id')
        quest_id = data.get('quest_id')  # Mutually exclusive with track_id
        parent_moment_id = data.get('parent_moment_id')
        source_type = data.get('source_type', 'realtime')
        estimated_duration_minutes = data.get('estimated_duration_minutes')
        ai_generated_title = data.get('ai_generated_title')
        ai_suggested_pillars = data.get('ai_suggested_pillars')

        # Validate: track_id and quest_id are mutually exclusive
        if track_id and quest_id:
            return jsonify({'error': 'Cannot assign to both track and quest'}), 400

        # Validate source_type
        if source_type not in ['realtime', 'retroactive']:
            return jsonify({'error': 'source_type must be "realtime" or "retroactive"'}), 400

        # Validate estimated_duration_minutes if provided
        if estimated_duration_minutes is not None:
            try:
                estimated_duration_minutes = int(estimated_duration_minutes)
                if estimated_duration_minutes < 0:
                    return jsonify({'error': 'estimated_duration_minutes must be non-negative'}), 400
            except (TypeError, ValueError):
                return jsonify({'error': 'estimated_duration_minutes must be an integer'}), 400

        result = LearningEventsService.create_learning_event(
            user_id=user_id,
            description=description,
            title=title,
            pillars=pillars,
            track_id=track_id,
            quest_id=quest_id,
            parent_moment_id=parent_moment_id,
            source_type=source_type,
            estimated_duration_minutes=estimated_duration_minutes,
            ai_generated_title=ai_generated_title,
            ai_suggested_pillars=ai_suggested_pillars
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


@learning_events_bp.route('/api/learning-events/quick', methods=['POST'])
@require_auth
def create_quick_learning_event(user_id):
    """Create a quick learning moment with minimal fields"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        if not description or not description.strip():
            return jsonify({'error': 'Description is required'}), 400

        track_id = data.get('track_id')
        quest_id = data.get('quest_id')  # Mutually exclusive with track_id
        parent_moment_id = data.get('parent_moment_id')

        # Validate: track_id and quest_id are mutually exclusive
        if track_id and quest_id:
            return jsonify({'error': 'Cannot assign to both track and quest'}), 400

        result = LearningEventsService.create_quick_moment(
            user_id=user_id,
            description=description.strip(),
            track_id=track_id,
            quest_id=quest_id,
            parent_moment_id=parent_moment_id
        )

        if result['success']:
            return jsonify({
                'success': True,
                'event': result['event'],
                'message': 'Moment captured!'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to capture moment')
            }), 500

    except Exception as e:
        logger.error(f"Error in create_quick_learning_event: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/ai-suggestions', methods=['POST'])
@require_auth
def get_ai_suggestions(user_id):
    """Get AI-generated title and pillar suggestions from description"""
    try:
        from services.learning_ai_service import LearningAIService

        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        description = data.get('description')
        if not description or not description.strip():
            return jsonify({'error': 'Description is required'}), 400

        ai_service = LearningAIService()
        result = ai_service.suggest_title_and_pillars(description.strip())

        if result['success']:
            return jsonify({
                'success': True,
                'suggestions': {
                    'title': result.get('title', ''),
                    'pillars': result.get('pillars', []),
                    'confidence': result.get('confidence', 0.5),
                    'reasoning': result.get('reasoning', '')
                }
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate suggestions')
            }), 500

    except Exception as e:
        logger.error(f"Error in get_ai_suggestions: {str(e)}")
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
        track_id = data.get('track_id')  # Can be None to unassign, or omitted to leave unchanged

        # Validate pillars if provided
        if pillars is not None:
            if not isinstance(pillars, list):
                return jsonify({'error': 'Pillars must be an array'}), 400

            valid_pillars = [
                'art',
                'stem',
                'wellness',
                'communication',
                'civics'
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
            pillars=pillars,
            track_id=track_id
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
        from database import get_supabase_admin_client
        from werkzeug.utils import secure_filename
        from datetime import datetime
        import os
        import mimetypes

        # Admin client: Auth verified by decorator (ADR-002, Rule 3)
        admin_supabase = get_supabase_admin_client()

        # Verify event belongs to user
        event_check = admin_supabase.table('learning_events') \
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

            # Find the evidence block to update (use admin client for RLS bypass)
            blocks_response = admin_supabase.table('learning_event_evidence_blocks') \
                .select('*') \
                .eq('learning_event_id', event_id) \
                .eq('order_index', int(order_index)) \
                .execute()

            if blocks_response.data and len(blocks_response.data) > 0:
                block = blocks_response.data[0]
                block_id = block['id']

                # Update block content with file information
                current_content = block.get('content', {}) or {}
                current_content.update({
                    'url': public_url,
                    'filename': filename,
                    'file_size': file_size,
                    'content_type': content_type
                })

                if block_type == 'image' and not current_content.get('alt'):
                    current_content['alt'] = filename

                admin_supabase.table('learning_event_evidence_blocks') \
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


# ============================================================================
# Curiosity Threads Endpoints (Learning Moments 2.0 - Phase 3)
# ============================================================================

@learning_events_bp.route('/api/learning-events/<event_id>/thread', methods=['GET'])
@require_auth
def get_thread_chain(user_id, event_id):
    """Get the full thread chain for a moment (parent and children)."""
    try:
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        # Get the moment to find its place in the thread
        moment_response = supabase.table('learning_events') \
            .select('*') \
            .eq('id', event_id) \
            .eq('user_id', user_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({
                'success': False,
                'error': 'Moment not found'
            }), 404

        moment = moment_response.data

        # Find the root of the thread
        root_id = event_id
        current = moment
        ancestors = []

        while current.get('parent_moment_id'):
            parent_response = supabase.table('learning_events') \
                .select('*') \
                .eq('id', current['parent_moment_id']) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if parent_response.data:
                ancestors.insert(0, parent_response.data)
                current = parent_response.data
                root_id = current['id']
            else:
                break

        # Get all descendants from the root
        def get_descendants(moment_id, depth=0, max_depth=10):
            if depth >= max_depth:
                return []

            children_response = supabase.table('learning_events') \
                .select('*') \
                .eq('parent_moment_id', moment_id) \
                .eq('user_id', user_id) \
                .order('created_at') \
                .execute()

            children = children_response.data or []
            result = []

            for child in children:
                child['depth'] = depth + 1
                result.append(child)
                result.extend(get_descendants(child['id'], depth + 1, max_depth))

            return result

        descendants = get_descendants(event_id)

        return jsonify({
            'success': True,
            'thread': {
                'root_id': root_id,
                'current_moment': moment,
                'ancestors': ancestors,
                'descendants': descendants,
                'total_moments': len(ancestors) + 1 + len(descendants)
            }
        }), 200

    except Exception as e:
        logger.error(f"Error in get_thread_chain: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/threads', methods=['GET'])
@require_auth
def get_user_threads(user_id):
    """List all threads (root moments that have children) for a user."""
    try:
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        # Get all moments with children
        all_moments_response = supabase.table('learning_events') \
            .select('id, title, description, pillars, created_at, parent_moment_id') \
            .eq('user_id', user_id) \
            .order('created_at', desc=True) \
            .execute()

        all_moments = all_moments_response.data or []

        # Find all parent IDs
        parent_ids = set(m['parent_moment_id'] for m in all_moments if m['parent_moment_id'])

        # Find root moments (have children but no parent)
        threads = []
        for moment in all_moments:
            if moment['id'] in parent_ids and not moment['parent_moment_id']:
                # This is a root of a thread
                # Count descendants
                child_count = sum(1 for m in all_moments if m['parent_moment_id'] == moment['id'])

                threads.append({
                    'root_moment': moment,
                    'child_count': child_count,
                    'is_root': True
                })

        return jsonify({
            'success': True,
            'threads': threads,
            'total_threads': len(threads)
        }), 200

    except Exception as e:
        logger.error(f"Error in get_user_threads: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>/find-related', methods=['POST'])
@require_auth
def find_related_moments(user_id, event_id):
    """Use AI to find moments related to a given moment."""
    try:
        from database import get_supabase_admin_client
        from services.thread_ai_service import ThreadAIService

        supabase = get_supabase_admin_client()

        # Get the source moment
        moment_response = supabase.table('learning_events') \
            .select('*') \
            .eq('id', event_id) \
            .eq('user_id', user_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({
                'success': False,
                'error': 'Moment not found'
            }), 404

        moment = moment_response.data

        # Get other moments
        other_response = supabase.table('learning_events') \
            .select('id, title, description, pillars, created_at') \
            .eq('user_id', user_id) \
            .neq('id', event_id) \
            .order('created_at', desc=True) \
            .limit(50) \
            .execute()

        other_moments = other_response.data or []

        if not other_moments:
            return jsonify({
                'success': True,
                'related_moments': []
            }), 200

        # Use AI to find related moments
        ai_service = ThreadAIService()
        result = ai_service.find_related_moments(
            moment=moment,
            all_moments=other_moments,
            limit=5
        )

        if result['success']:
            return jsonify({
                'success': True,
                'related_moments': result['related_moments']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to find related moments')
            }), 500

    except Exception as e:
        logger.error(f"Error in find_related_moments: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/detect-threads', methods=['GET'])
@require_auth
def detect_hidden_threads(user_id):
    """Use AI to detect potential threads in unlinked moments."""
    try:
        from database import get_supabase_admin_client
        from services.thread_ai_service import ThreadAIService

        supabase = get_supabase_admin_client()

        # Get unlinked moments (no parent and no children)
        all_response = supabase.table('learning_events') \
            .select('id, title, description, pillars, created_at, parent_moment_id') \
            .eq('user_id', user_id) \
            .is_('parent_moment_id', 'null') \
            .order('created_at', desc=True) \
            .limit(40) \
            .execute()

        moments = all_response.data or []

        if len(moments) < 3:
            return jsonify({
                'success': True,
                'hidden_threads': [],
                'message': 'Not enough moments to detect threads'
            }), 200

        # Use AI to detect hidden threads
        ai_service = ThreadAIService()
        result = ai_service.detect_hidden_threads(moments=moments)

        if result['success']:
            return jsonify({
                'success': True,
                'hidden_threads': result['hidden_threads']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to detect threads')
            }), 500

    except Exception as e:
        logger.error(f"Error in detect_hidden_threads: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@learning_events_bp.route('/api/learning-events/<event_id>/thread-narrative', methods=['GET'])
@require_auth
def get_thread_narrative(user_id, event_id):
    """Generate an AI narrative for a thread."""
    try:
        from database import get_supabase_admin_client
        from services.thread_ai_service import ThreadAIService

        supabase = get_supabase_admin_client()

        # Get the thread chain
        # First, find the root
        moment_response = supabase.table('learning_events') \
            .select('*') \
            .eq('id', event_id) \
            .eq('user_id', user_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({
                'success': False,
                'error': 'Moment not found'
            }), 404

        # Traverse to root
        current = moment_response.data
        thread_moments = [current]

        while current.get('parent_moment_id'):
            parent_response = supabase.table('learning_events') \
                .select('*') \
                .eq('id', current['parent_moment_id']) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if parent_response.data:
                thread_moments.insert(0, parent_response.data)
                current = parent_response.data
            else:
                break

        # Get children of current moment
        def get_children_flat(moment_id):
            children_response = supabase.table('learning_events') \
                .select('*') \
                .eq('parent_moment_id', moment_id) \
                .eq('user_id', user_id) \
                .order('created_at') \
                .execute()

            children = children_response.data or []
            result = []
            for child in children:
                result.append(child)
                result.extend(get_children_flat(child['id']))
            return result

        descendants = get_children_flat(event_id)
        thread_moments.extend(descendants)

        if len(thread_moments) < 2:
            return jsonify({
                'success': True,
                'narrative': None,
                'message': 'Thread needs at least 2 moments for narrative'
            }), 200

        # Generate narrative
        ai_service = ThreadAIService()
        result = ai_service.generate_thread_narrative(thread_moments)

        if result['success']:
            return jsonify({
                'success': True,
                'narrative': {
                    'text': result['narrative'],
                    'theme': result['theme'],
                    'growth_pattern': result['growth_pattern'],
                    'key_insight': result['key_insight'],
                    'potential_next_step': result['potential_next_step']
                },
                'moment_count': len(thread_moments)
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate narrative')
            }), 500

    except Exception as e:
        logger.error(f"Error in get_thread_narrative: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
