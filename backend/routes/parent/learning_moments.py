"""
Parent Learning Moments - Capture learning moments for children.
Allows parents to capture and document learning moments for their dependents/linked students.
Also handles topic management (interest tracks) for children.
"""
from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import AuthorizationError, ValidationError
from routes.parent.dashboard_overview import verify_parent_access
from services.file_upload_service import FileUploadService
from services.interest_tracks_service import InterestTracksService
from services.learning_events_service import LearningEventsService
from utils.logger import get_logger
import uuid

logger = get_logger(__name__)

bp = Blueprint('parent_learning_moments', __name__, url_prefix='/api/parent')

# Constants for file uploads
MAX_MEDIA_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'}
ALLOWED_DOCUMENT_EXTENSIONS = {'pdf', 'doc', 'docx'}
ALLOWED_UPLOAD_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_DOCUMENT_EXTENSIONS


@bp.route('/children/<child_id>/learning-moments', methods=['POST'])
@require_auth
def create_child_learning_moment(user_id, child_id):
    """
    Parent captures a learning moment for their child.

    Request body:
    {
        "description": "string (optional)",
        "media": [
            {
                "type": "image" | "document" | "link",
                "file_url": "https://..." (for image/document),
                "url": "https://..." (for link),
                "file_name": "photo.jpg" (for image/document),
                "file_size": 12345 (for image/document),
                "title": "Link title" (optional, for link)
            }
        ]
    }

    At least description or one media item is required.

    Returns:
        201: Created moment with evidence blocks
        400: Validation error (no content provided)
        403: Not authorized to access this child
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        data = request.get_json() or {}
        description = data.get('description', '').strip()
        media = data.get('media', [])

        # Validate: at least description OR media required
        if not description and not media:
            raise ValidationError("Please provide a description, attach a file, or include a link")

        event_date = data.get('event_date')

        # Create the learning event for the child
        event_data = {
            'user_id': child_id,  # The moment belongs to the child
            'captured_by_user_id': user_id,  # Parent who captured it
            'description': description or 'Learning moment captured by parent',
            'source_type': 'parent_captured',
            'pillars': []  # No pillar selection for quick capture
        }

        if event_date:
            event_data['event_date'] = event_date

        event_response = supabase.table('learning_events').insert(event_data).execute()

        if not event_response.data:
            raise ValidationError("Failed to create learning moment")

        event = event_response.data[0]
        event_id = event['id']

        # Create evidence blocks for media attachments
        evidence_blocks = []
        for idx, media_item in enumerate(media):
            media_type = media_item.get('type', 'image')

            # Determine block_type based on media type
            if media_type == 'link':
                block_type = 'link'
                block_data = {
                    'learning_event_id': event_id,
                    'block_type': block_type,
                    'content': {
                        'url': media_item.get('url'),
                        'title': media_item.get('title', ''),
                        'caption': ''
                    },
                    'order_index': idx
                }
            elif media_type == 'document':
                block_type = 'document'
                block_data = {
                    'learning_event_id': event_id,
                    'block_type': block_type,
                    'content': {
                        'url': media_item.get('file_url'),
                        'filename': media_item.get('file_name', ''),
                        'caption': ''
                    },
                    'order_index': idx,
                    'file_url': media_item.get('file_url'),
                    'file_name': media_item.get('file_name'),
                    'file_size': media_item.get('file_size', 0)
                }
            else:
                # Default to image
                block_type = 'image'
                block_data = {
                    'learning_event_id': event_id,
                    'block_type': block_type,
                    'content': {
                        'url': media_item.get('file_url'),
                        'caption': '',
                        'alt_text': media_item.get('file_name', '')
                    },
                    'order_index': idx,
                    'file_url': media_item.get('file_url'),
                    'file_name': media_item.get('file_name'),
                    'file_size': media_item.get('file_size', 0)
                }

            block_response = supabase.table('learning_event_evidence_blocks').insert(block_data).execute()

            if block_response.data:
                evidence_blocks.append(block_response.data[0])

        event['evidence_blocks'] = evidence_blocks

        logger.info(f"Parent {user_id} captured learning moment for child {child_id}")

        return jsonify({
            'success': True,
            'moment': event,
            'message': 'Learning moment captured successfully'
        }), 201

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating learning moment: {str(e)}")
        return jsonify({'error': 'Failed to create learning moment'}), 500


@bp.route('/children/<child_id>/learning-moments/upload', methods=['POST'])
@require_auth
def upload_moment_media(user_id, child_id):
    """
    Upload photo or document for a learning moment.

    Multipart form data:
    - file: The media file to upload (image or document)

    Returns:
        200: Signed URL for the uploaded file
        400: Validation error (invalid file type/size)
        403: Not authorized to access this child
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        if 'file' not in request.files:
            raise ValidationError("No file provided")

        file = request.files['file']

        if not file or not file.filename:
            raise ValidationError("No file selected")

        # Get file extension
        filename = file.filename
        file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        if file_ext not in ALLOWED_UPLOAD_EXTENSIONS:
            allowed = ', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))
            raise ValidationError(f'Invalid file type ".{file_ext}". Allowed: {allowed}')

        # Read file content
        file_data = file.read()
        file_size = len(file_data)

        if file_size > MAX_MEDIA_SIZE:
            raise ValidationError(f"File size exceeds {MAX_MEDIA_SIZE // (1024*1024)}MB limit")

        # Determine media type
        media_type = 'image' if file_ext in ALLOWED_IMAGE_EXTENSIONS else 'document'

        # Generate unique filename
        unique_filename = f"learning_moments/{child_id}/{uuid.uuid4()}.{file_ext}"

        # Upload to Supabase storage
        # Use 'user-uploads' bucket which is commonly used for user-generated content
        bucket_name = 'user-uploads'

        upload_response = supabase.storage.from_(bucket_name).upload(
            path=unique_filename,
            file=file_data,
            file_options={"content-type": file.content_type}
        )

        # Get public URL
        file_url = supabase.storage.from_(bucket_name).get_public_url(unique_filename)

        logger.info(f"Parent {user_id} uploaded {media_type} for child {child_id}")

        return jsonify({
            'success': True,
            'file_url': file_url,
            'file_name': filename,
            'file_size': file_size,
            'media_type': media_type
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error uploading media: {str(e)}")
        return jsonify({'error': 'Failed to upload file'}), 500


@bp.route('/children/<child_id>/learning-moments', methods=['GET'])
@require_auth
def get_child_learning_moments(user_id, child_id):
    """
    Get learning moments for a child (parent view).
    Includes both self-captured and parent-captured moments.

    Query params:
    - limit: Maximum number of moments (default 20)
    - offset: Pagination offset (default 0)

    Returns:
        200: List of learning moments with evidence
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        limit = request.args.get('limit', 20, type=int)
        offset = request.args.get('offset', 0, type=int)

        # Fetch moments for the child
        moments_response = supabase.table('learning_events') \
            .select('*') \
            .eq('user_id', child_id) \
            .order('created_at', desc=True) \
            .limit(limit) \
            .offset(offset) \
            .execute()

        moments = moments_response.data or []

        # Collect unique captured_by_user_ids to fetch names
        captured_by_ids = set()
        for moment in moments:
            if moment.get('captured_by_user_id'):
                captured_by_ids.add(moment['captured_by_user_id'])

        # Fetch names for captured_by users
        captured_by_names = {}
        if captured_by_ids:
            users_response = supabase.table('users') \
                .select('id, first_name, display_name') \
                .in_('id', list(captured_by_ids)) \
                .execute()
            for u in (users_response.data or []):
                captured_by_names[u['id']] = u.get('first_name') or u.get('display_name') or 'Parent'

        # Fetch evidence blocks for each moment
        for moment in moments:
            blocks_response = supabase.table('learning_event_evidence_blocks') \
                .select('*') \
                .eq('learning_event_id', moment['id']) \
                .order('order_index') \
                .execute()

            moment['evidence_blocks'] = blocks_response.data or []

            # Add captured_by_name if this was captured by someone other than the student
            captured_by_id = moment.get('captured_by_user_id')
            if captured_by_id:
                moment['captured_by_name'] = captured_by_names.get(captured_by_id, 'Parent')

        # Enrich moments with topics from junction table
        moments = LearningEventsService._enrich_events_with_topics(supabase, moments)

        return jsonify({
            'success': True,
            'moments': moments,
            'count': len(moments)
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error fetching learning moments: {str(e)}")
        return jsonify({'error': 'Failed to fetch learning moments'}), 500


# ============================================================================
# Topic Management (Interest Tracks) for Children
# ============================================================================

@bp.route('/children/<child_id>/topics', methods=['GET'])
@require_auth
def get_child_topics(user_id, child_id):
    """
    Get unified topics (interest tracks + active quests) for a child.
    Parent view of their child's topic organization.

    Returns:
        200: List of topics with counts
        403: Not authorized to access this child
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        # Use the service with child's user_id
        result = InterestTracksService.get_unified_topics(user_id=child_id)

        if result['success']:
            return jsonify({
                'success': True,
                'topics': result['topics'],
                'course_topics': result.get('course_topics', []),
                'quest_count': result.get('quest_count', 0),
                'course_count': result.get('course_count', 0),
                'track_count': result.get('track_count', 0)
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch topics'),
                'topics': [],
                'course_topics': []
            }), 500

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error fetching child topics: {str(e)}")
        return jsonify({'error': 'Failed to fetch topics'}), 500


@bp.route('/children/<child_id>/topics', methods=['POST'])
@require_auth
def create_child_topic(user_id, child_id):
    """
    Parent creates an interest track (topic) for their child.

    Request body:
    {
        "name": "string (required)",
        "description": "string (optional)",
        "color": "#hex (optional)",
        "icon": "string (optional)",
        "moment_ids": ["uuid", ...] (optional - moments to assign)
    }

    Returns:
        201: Created topic with assigned count
        400: Validation error
        403: Not authorized to access this child
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        data = request.get_json()

        if not data:
            raise ValidationError('Request body is required')

        name = data.get('name')
        if not name or not name.strip():
            raise ValidationError('Topic name is required')

        description = data.get('description')
        color = data.get('color')
        icon = data.get('icon')
        moment_ids = data.get('moment_ids', [])

        # Validate color format if provided
        if color and not (color.startswith('#') and len(color) in [4, 7]):
            raise ValidationError('Color must be a valid hex code (e.g., #fff or #ffffff)')

        # Create track for the child (not the parent)
        result = InterestTracksService.create_track(
            user_id=child_id,  # Track belongs to the child
            name=name.strip(),
            description=description.strip() if description else None,
            color=color,
            icon=icon
        )

        if result['success']:
            track = result['track']
            assigned_count = 0

            # If moment_ids provided, bulk assign them to the new track
            if moment_ids and len(moment_ids) > 0:
                assign_result = InterestTracksService.bulk_assign_moments_to_track(
                    user_id=child_id,
                    track_id=track['id'],
                    moment_ids=moment_ids
                )
                if assign_result['success']:
                    assigned_count = assign_result.get('assigned_count', 0)
                    track['moment_count'] = assigned_count

            logger.info(f"Parent {user_id} created topic '{name}' for child {child_id}")

            return jsonify({
                'success': True,
                'track': track,
                'assigned_count': assigned_count,
                'message': f'Topic created with {assigned_count} moments!' if assigned_count > 0 else 'Topic created!'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to create topic')
            }), 500

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating child topic: {str(e)}")
        return jsonify({'error': 'Failed to create topic'}), 500


@bp.route('/children/<child_id>/topics/suggestions', methods=['GET'])
@require_auth
def get_child_topic_suggestions(user_id, child_id):
    """
    Get AI-suggested topics based on child's unassigned moments.

    Returns:
        200: List of suggested topics
        403: Not authorized to access this child
    """
    try:
        from services.learning_ai_service import LearningAIService

        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        ai_service = LearningAIService()
        result = ai_service.detect_emerging_tracks(user_id=child_id)

        if result['success']:
            return jsonify({
                'success': True,
                'suggested_tracks': result.get('suggested_tracks', []),
                'message': result.get('message', '')
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to detect emerging topics')
            }), 500

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting topic suggestions for child: {str(e)}")
        return jsonify({'error': 'Failed to get suggestions'}), 500


@bp.route('/children/<child_id>/topics/<track_id>', methods=['GET'])
@require_auth
def get_child_topic_detail(user_id, child_id, track_id):
    """
    Get a specific topic (interest track) with its moments for a child.
    Parent view of child's track details.

    Query params:
    - limit: Maximum number of moments (default 50)
    - offset: Pagination offset (default 0)

    Returns:
        200: Track with moments
        403: Not authorized
        404: Track not found
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        # Use the service with child's user_id
        result = InterestTracksService.get_track_with_moments(
            user_id=child_id,
            track_id=track_id,
            limit=limit,
            offset=offset
        )

        if result['success']:
            return jsonify({
                'success': True,
                'track': result['track']
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 500
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to fetch track')
            }), status_code

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error fetching child track: {str(e)}")
        return jsonify({'error': 'Failed to fetch track'}), 500


@bp.route('/children/<child_id>/learning-events/<moment_id>/assign-topic', methods=['POST'])
@require_auth
def assign_child_moment_to_topic(user_id, child_id, moment_id):
    """
    Parent assigns a child's learning moment to a track or quest.

    Request body:
    {
        "type": "track" | "quest",
        "topic_id": "uuid" (null to unassign),
        "action": "add" | "remove" (default "add")
    }

    Returns:
        200: Updated moment
        400: Validation error
        403: Not authorized
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        data = request.get_json()

        if not data:
            raise ValidationError('Request body is required')

        topic_type = data.get('type')
        topic_id = data.get('topic_id')
        action = data.get('action', 'add')

        # Validate topic_type if topic_id is provided
        if topic_id and topic_type not in ['track', 'quest']:
            raise ValidationError('Type must be "track" or "quest"')

        if action not in ['add', 'remove']:
            raise ValidationError('Action must be "add" or "remove"')

        # Use child_id for the service call
        result = InterestTracksService.assign_moment_to_topic(
            user_id=child_id,
            moment_id=moment_id,
            topic_type=topic_type or 'track',
            topic_id=topic_id,
            action=action
        )

        if result['success']:
            return jsonify({
                'success': True,
                'moment': result.get('moment'),
                'message': 'Moment assigned successfully' if topic_id else 'Moment unassigned'
            }), 200
        else:
            status_code = 404 if 'not found' in result.get('error', '').lower() else 400
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to assign moment')
            }), status_code

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error assigning child moment to topic: {str(e)}")
        return jsonify({'error': 'Failed to assign moment'}), 500


@bp.route('/children/<child_id>/learning-moments/<moment_id>', methods=['PUT'])
@require_auth
def update_child_learning_moment(user_id, child_id, moment_id):
    """
    Parent updates a learning moment for their child.
    Parents can only update moments they captured (captured_by_user_id = parent's ID).

    Request body:
    {
        "description": "string (optional)",
        "title": "string (optional)",
        "topics": [{"type": "topic"|"quest", "id": "uuid"}] (optional, replaces all topics),
        "track_id": "uuid or null (optional, legacy)",
        "quest_id": "uuid or null (optional, legacy)"
    }

    Returns:
        200: Updated moment
        400: Validation error
        403: Not authorized (parent didn't capture this moment)
        404: Moment not found
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        # Fetch the moment and verify parent captured it
        moment_response = supabase.table('learning_events') \
            .select('*') \
            .eq('id', moment_id) \
            .eq('user_id', child_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({'error': 'Moment not found'}), 404

        moment = moment_response.data

        # Check if parent captured this moment
        if moment.get('captured_by_user_id') != user_id:
            raise AuthorizationError('You can only edit moments you captured')

        data = request.get_json() or {}

        # Build update data for basic fields
        update_data = {}
        if 'description' in data:
            description = data.get('description', '').strip()
            if description:
                update_data['description'] = description

        if 'title' in data:
            update_data['title'] = data.get('title', '').strip() or None

        if 'event_date' in data:
            update_data['event_date'] = data.get('event_date') or None

        # Handle topics via junction table (multi-topic support)
        topics_to_set = data.get('topics')
        has_topic_change = topics_to_set is not None or 'track_id' in data or 'quest_id' in data

        if not update_data and not has_topic_change:
            return jsonify({
                'success': True,
                'moment': moment,
                'message': 'No changes to update'
            }), 200

        # Update basic fields if any
        if update_data:
            supabase.table('learning_events') \
                .update(update_data) \
                .eq('id', moment_id) \
                .execute()

        # Handle topic changes via junction table
        if has_topic_change:
            # Normalize: convert legacy track_id/quest_id to topics array
            if topics_to_set is None:
                topics_to_set = []
                if 'track_id' in data and data.get('track_id'):
                    topics_to_set.append({'type': 'topic', 'id': data['track_id']})
                if 'quest_id' in data and data.get('quest_id'):
                    topics_to_set.append({'type': 'quest', 'id': data['quest_id']})

            # Get old junction rows for moment count recalculation
            old_junction = supabase.table('learning_event_topics') \
                .select('topic_type, topic_id') \
                .eq('learning_event_id', moment_id) \
                .execute()
            old_track_ids = [r['topic_id'] for r in (old_junction.data or []) if r['topic_type'] == 'topic']

            # Delete existing junction rows
            supabase.table('learning_event_topics') \
                .delete() \
                .eq('learning_event_id', moment_id) \
                .execute()

            # Insert new junction rows
            new_track_ids = []
            for topic in topics_to_set:
                t_type = topic.get('type', 'topic')
                t_id = topic.get('id')
                if not t_id:
                    continue
                junction_type = 'topic' if t_type in ('topic', 'track') else 'quest'
                try:
                    supabase.table('learning_event_topics').insert({
                        'learning_event_id': moment_id,
                        'topic_type': junction_type,
                        'topic_id': t_id
                    }).execute()
                    if junction_type == 'topic':
                        new_track_ids.append(t_id)
                except Exception:
                    pass  # Duplicate

            # Dual-write legacy columns
            first_topic = next((t for t in topics_to_set if t.get('type') in ('topic', 'track')), None)
            first_quest = next((t for t in topics_to_set if t.get('type') == 'quest'), None)
            legacy_update = {
                'track_id': first_topic['id'] if first_topic else None,
                'quest_id': first_quest['id'] if first_quest else None
            }
            supabase.table('learning_events') \
                .update(legacy_update) \
                .eq('id', moment_id) \
                .execute()

            # Recalculate moment counts for affected tracks
            all_track_ids = set(old_track_ids + new_track_ids)
            for tid in all_track_ids:
                LearningEventsService._recalculate_track_moment_count(supabase, tid)

        # Fetch updated moment
        update_response = supabase.table('learning_events') \
            .select('*') \
            .eq('id', moment_id) \
            .single() \
            .execute()

        if update_response.data:
            updated_moment = update_response.data
            # Enrich with topics
            enriched = LearningEventsService._enrich_events_with_topics(supabase, [updated_moment])
            updated_moment = enriched[0] if enriched else updated_moment
            logger.info(f"Parent {user_id} updated moment {moment_id} for child {child_id}")
            return jsonify({
                'success': True,
                'event': updated_moment,
                'message': 'Learning moment updated!'
            }), 200
        else:
            return jsonify({'error': 'Failed to update moment'}), 500

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error updating child learning moment: {str(e)}")
        return jsonify({'error': 'Failed to update learning moment'}), 500


@bp.route('/children/<child_id>/learning-moments/<moment_id>', methods=['DELETE'])
@require_auth
def delete_child_learning_moment(user_id, child_id, moment_id):
    """
    Parent deletes a learning moment they captured for their child.
    Parents can only delete moments they captured (captured_by_user_id = parent's ID).

    Returns:
        200: Moment deleted
        403: Not authorized (parent didn't capture this moment)
        404: Moment not found
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        # Fetch the moment and verify parent captured it
        moment_response = supabase.table('learning_events') \
            .select('id, captured_by_user_id') \
            .eq('id', moment_id) \
            .eq('user_id', child_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({'error': 'Moment not found'}), 404

        moment = moment_response.data

        # Check if parent captured this moment
        if moment.get('captured_by_user_id') != user_id:
            raise AuthorizationError('You can only delete moments you captured')

        # Get affected track IDs before deletion for moment count recalculation
        junction_response = supabase.table('learning_event_topics') \
            .select('topic_type, topic_id') \
            .eq('learning_event_id', moment_id) \
            .execute()
        affected_track_ids = [r['topic_id'] for r in (junction_response.data or []) if r['topic_type'] == 'topic']

        # Delete evidence blocks first
        supabase.table('learning_event_evidence_blocks') \
            .delete() \
            .eq('learning_event_id', moment_id) \
            .execute()

        # Delete the moment (junction rows cascade-delete)
        delete_response = supabase.table('learning_events') \
            .delete() \
            .eq('id', moment_id) \
            .execute()

        # Recalculate moment counts for affected tracks
        for tid in affected_track_ids:
            LearningEventsService._recalculate_track_moment_count(supabase, tid)

        logger.info(f"Parent {user_id} deleted moment {moment_id} for child {child_id}")

        return jsonify({
            'success': True,
            'message': 'Learning moment deleted'
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error deleting child learning moment: {str(e)}")
        return jsonify({'error': 'Failed to delete learning moment'}), 500


@bp.route('/children/<child_id>/learning-moments/<moment_id>/evidence', methods=['POST'])
@require_auth
def save_child_moment_evidence(user_id, child_id, moment_id):
    """
    Parent saves evidence blocks for a learning moment they captured.
    Parents can only add evidence to moments they captured.

    Request body:
    {
        "blocks": [
            {
                "block_type": "text" | "image" | "video" | "link" | "document",
                "content": {...},
                "order_index": 0
            }
        ]
    }

    Returns:
        200: Evidence saved
        403: Not authorized (parent didn't capture this moment)
        404: Moment not found
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        # Fetch the moment and verify parent captured it
        moment_response = supabase.table('learning_events') \
            .select('id, captured_by_user_id') \
            .eq('id', moment_id) \
            .eq('user_id', child_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({'error': 'Moment not found'}), 404

        moment = moment_response.data

        # Check if parent captured this moment
        if moment.get('captured_by_user_id') != user_id:
            raise AuthorizationError('You can only add evidence to moments you captured')

        data = request.get_json()

        if not data:
            raise ValidationError('Request body is required')

        blocks = data.get('blocks', [])

        if not isinstance(blocks, list):
            raise ValidationError('Blocks must be an array')

        # Validate block types
        valid_block_types = ['text', 'image', 'video', 'link', 'document']
        for block in blocks:
            block_type = block.get('block_type') or block.get('type')
            if not block_type:
                raise ValidationError('Each block must have a block_type')
            if block_type not in valid_block_types:
                raise ValidationError(f'Invalid block type: {block_type}')

        # Delete existing blocks for this event
        supabase.table('learning_event_evidence_blocks') \
            .delete() \
            .eq('learning_event_id', moment_id) \
            .execute()

        # Insert new blocks
        created_blocks = []
        for idx, block in enumerate(blocks):
            block_type = block.get('block_type') or block.get('type')
            block_data = {
                'learning_event_id': moment_id,
                'block_type': block_type,
                'content': block.get('content', {}),
                'order_index': block.get('order_index', idx)
            }

            block_response = supabase.table('learning_event_evidence_blocks') \
                .insert(block_data) \
                .execute()

            if block_response.data:
                created_blocks.append(block_response.data[0])

        logger.info(f"Parent {user_id} saved {len(created_blocks)} evidence blocks for moment {moment_id}")

        return jsonify({
            'success': True,
            'blocks': created_blocks,
            'message': f'Saved {len(created_blocks)} evidence blocks'
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error saving child moment evidence: {str(e)}")
        return jsonify({'error': 'Failed to save evidence'}), 500


@bp.route('/children/<child_id>/learning-moments/<moment_id>/upload', methods=['POST'])
@require_auth
def upload_child_moment_file(user_id, child_id, moment_id):
    """
    Parent uploads a file for a learning moment evidence block.
    Parents can only upload to moments they captured.

    Multipart form data:
    - file: The file to upload
    - block_type: "image" | "document"
    - order_index: integer

    Returns:
        200: File uploaded with URL
        403: Not authorized
        404: Moment not found
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify parent has access to this child
        verify_parent_access(supabase, user_id, child_id)

        # Fetch the moment and verify parent captured it
        moment_response = supabase.table('learning_events') \
            .select('id, captured_by_user_id') \
            .eq('id', moment_id) \
            .eq('user_id', child_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({'error': 'Moment not found'}), 404

        moment = moment_response.data

        # Check if parent captured this moment
        if moment.get('captured_by_user_id') != user_id:
            raise AuthorizationError('You can only upload to moments you captured')

        if 'file' not in request.files:
            raise ValidationError('No file provided')

        file = request.files['file']
        block_type = request.form.get('block_type', 'image')
        order_index = request.form.get('order_index', 0, type=int)

        if not file or not file.filename:
            raise ValidationError('No file selected')

        # Get file extension
        filename = file.filename
        file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        # Validate file type based on block_type
        if block_type == 'image':
            allowed = ALLOWED_IMAGE_EXTENSIONS
        elif block_type == 'document':
            allowed = {'pdf', 'doc', 'docx'}
        else:
            allowed = ALLOWED_MEDIA_EXTENSIONS

        if file_ext not in allowed:
            raise ValidationError(f'Invalid file type for {block_type}')

        # Read file content
        file_data = file.read()
        file_size = len(file_data)

        if file_size > MAX_MEDIA_SIZE:
            raise ValidationError(f"File size exceeds {MAX_MEDIA_SIZE // (1024*1024)}MB limit")

        # Generate unique filename
        unique_filename = f"learning_moments/{child_id}/{moment_id}/{uuid.uuid4()}.{file_ext}"

        # Upload to Supabase storage
        bucket_name = 'user-uploads'

        supabase.storage.from_(bucket_name).upload(
            path=unique_filename,
            file=file_data,
            file_options={"content-type": file.content_type}
        )

        # Get public URL
        file_url = supabase.storage.from_(bucket_name).get_public_url(unique_filename)

        # Create evidence block
        block_data = {
            'learning_event_id': moment_id,
            'block_type': block_type,
            'content': {
                'url': file_url,
                'filename': filename,
                'alt_text': filename
            },
            'order_index': order_index,
            'file_url': file_url,
            'file_name': filename,
            'file_size': file_size
        }

        block_response = supabase.table('learning_event_evidence_blocks') \
            .insert(block_data) \
            .execute()

        logger.info(f"Parent {user_id} uploaded file for moment {moment_id}")

        return jsonify({
            'success': True,
            'file_url': file_url,
            'block_id': block_response.data[0]['id'] if block_response.data else None,
            'message': 'File uploaded successfully'
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error uploading file for child moment: {str(e)}")
        return jsonify({'error': 'Failed to upload file'}), 500
