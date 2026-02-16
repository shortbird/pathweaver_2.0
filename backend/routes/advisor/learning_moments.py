"""
Advisor Learning Moments - Capture learning moments for assigned students.
Allows advisors to capture and document learning moments for their students.
Cloned from parent/learning_moments.py with advisor-specific access checks.
"""
from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import AuthorizationError, ValidationError
from routes.advisor.student_overview import verify_advisor_access
from utils.logger import get_logger
import uuid

logger = get_logger(__name__)

bp = Blueprint('advisor_learning_moments', __name__, url_prefix='/api/advisor')

# Constants for file uploads
MAX_MEDIA_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'}
ALLOWED_DOCUMENT_EXTENSIONS = {'pdf', 'doc', 'docx'}
ALLOWED_UPLOAD_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_DOCUMENT_EXTENSIONS


@bp.route('/students/<student_id>/learning-moments', methods=['POST'])
@require_auth
def create_student_learning_moment(user_id, student_id):
    """
    Advisor captures a learning moment for their student.

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
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify advisor has access to this student
        verify_advisor_access(supabase, user_id, student_id)

        data = request.get_json() or {}
        description = data.get('description', '').strip()
        media = data.get('media', [])

        # Validate: at least description OR media required
        if not description and not media:
            raise ValidationError("Please provide a description, attach a file, or include a link")

        # Create the learning event for the student
        event_data = {
            'user_id': student_id,  # The moment belongs to the student
            'captured_by_user_id': user_id,  # Advisor who captured it
            'description': description or 'Learning moment captured by advisor',
            'source_type': 'advisor_captured',
            'pillars': []
        }

        event_response = supabase.table('learning_events').insert(event_data).execute()

        if not event_response.data:
            raise ValidationError("Failed to create learning moment")

        event = event_response.data[0]
        event_id = event['id']

        # Create evidence blocks for media attachments
        evidence_blocks = []
        for idx, media_item in enumerate(media):
            media_type = media_item.get('type', 'image')

            if media_type == 'link':
                block_data = {
                    'learning_event_id': event_id,
                    'block_type': 'link',
                    'content': {
                        'url': media_item.get('url'),
                        'title': media_item.get('title', ''),
                        'caption': ''
                    },
                    'order_index': idx
                }
            elif media_type == 'document':
                block_data = {
                    'learning_event_id': event_id,
                    'block_type': 'document',
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
                block_data = {
                    'learning_event_id': event_id,
                    'block_type': 'image',
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

        logger.info(f"Advisor {user_id} captured learning moment for student {student_id}")

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


@bp.route('/students/<student_id>/learning-moments/upload', methods=['POST'])
@require_auth
def upload_moment_media(user_id, student_id):
    """
    Upload photo or document for a learning moment.

    Multipart form data:
    - file: The media file to upload (image or document)
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify advisor has access to this student
        verify_advisor_access(supabase, user_id, student_id)

        if 'file' not in request.files:
            raise ValidationError("No file provided")

        file = request.files['file']

        if not file or not file.filename:
            raise ValidationError("No file selected")

        filename = file.filename
        file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        if file_ext not in ALLOWED_UPLOAD_EXTENSIONS:
            allowed = ', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))
            raise ValidationError(f'Invalid file type ".{file_ext}". Allowed: {allowed}')

        file_data = file.read()
        file_size = len(file_data)

        if file_size > MAX_MEDIA_SIZE:
            raise ValidationError(f"File size exceeds {MAX_MEDIA_SIZE // (1024*1024)}MB limit")

        media_type = 'image' if file_ext in ALLOWED_IMAGE_EXTENSIONS else 'document'

        unique_filename = f"learning_moments/{student_id}/{uuid.uuid4()}.{file_ext}"

        bucket_name = 'user-uploads'

        supabase.storage.from_(bucket_name).upload(
            path=unique_filename,
            file=file_data,
            file_options={"content-type": file.content_type}
        )

        file_url = supabase.storage.from_(bucket_name).get_public_url(unique_filename)

        logger.info(f"Advisor {user_id} uploaded {media_type} for student {student_id}")

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


@bp.route('/students/<student_id>/learning-moments', methods=['GET'])
@require_auth
def get_student_learning_moments(user_id, student_id):
    """
    Get learning moments for a student (advisor view).
    Includes both self-captured and advisor/parent-captured moments.

    Query params:
    - limit: Maximum number of moments (default 20)
    - offset: Pagination offset (default 0)
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify advisor has access to this student
        verify_advisor_access(supabase, user_id, student_id)

        limit = request.args.get('limit', 20, type=int)
        offset = request.args.get('offset', 0, type=int)

        moments_response = supabase.table('learning_events') \
            .select('*') \
            .eq('user_id', student_id) \
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

        captured_by_names = {}
        if captured_by_ids:
            users_response = supabase.table('users') \
                .select('id, first_name, display_name') \
                .in_('id', list(captured_by_ids)) \
                .execute()
            for u in (users_response.data or []):
                captured_by_names[u['id']] = u.get('first_name') or u.get('display_name') or 'Unknown'

        # Fetch evidence blocks for each moment
        for moment in moments:
            blocks_response = supabase.table('learning_event_evidence_blocks') \
                .select('*') \
                .eq('learning_event_id', moment['id']) \
                .order('order_index') \
                .execute()

            moment['evidence_blocks'] = blocks_response.data or []

            captured_by_id = moment.get('captured_by_user_id')
            if captured_by_id:
                moment['captured_by_name'] = captured_by_names.get(captured_by_id, 'Unknown')

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


@bp.route('/students/<student_id>/learning-moments/<moment_id>', methods=['PUT'])
@require_auth
def update_student_learning_moment(user_id, student_id, moment_id):
    """
    Advisor updates a learning moment they captured for a student.
    Advisors can only update moments they captured (captured_by_user_id = advisor's ID).

    Request body:
    {
        "description": "string (optional)",
        "title": "string (optional)"
    }
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify advisor has access to this student
        verify_advisor_access(supabase, user_id, student_id)

        # Fetch the moment and verify advisor captured it
        moment_response = supabase.table('learning_events') \
            .select('*') \
            .eq('id', moment_id) \
            .eq('user_id', student_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({'error': 'Moment not found'}), 404

        moment = moment_response.data

        if moment.get('captured_by_user_id') != user_id:
            raise AuthorizationError('You can only edit moments you captured')

        data = request.get_json() or {}

        update_data = {}
        if 'description' in data:
            description = data.get('description', '').strip()
            if description:
                update_data['description'] = description

        if 'title' in data:
            update_data['title'] = data.get('title', '').strip() or None

        if not update_data:
            return jsonify({
                'success': True,
                'moment': moment,
                'message': 'No changes to update'
            }), 200

        update_response = supabase.table('learning_events') \
            .update(update_data) \
            .eq('id', moment_id) \
            .execute()

        if update_response.data:
            updated_moment = update_response.data[0]
            logger.info(f"Advisor {user_id} updated moment {moment_id} for student {student_id}")
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
        logger.error(f"Error updating learning moment: {str(e)}")
        return jsonify({'error': 'Failed to update learning moment'}), 500


@bp.route('/students/<student_id>/learning-moments/<moment_id>', methods=['DELETE'])
@require_auth
def delete_student_learning_moment(user_id, student_id, moment_id):
    """
    Advisor deletes a learning moment they captured for a student.
    Advisors can only delete moments they captured (captured_by_user_id = advisor's ID).
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify advisor has access to this student
        verify_advisor_access(supabase, user_id, student_id)

        # Fetch the moment and verify advisor captured it
        moment_response = supabase.table('learning_events') \
            .select('id, captured_by_user_id') \
            .eq('id', moment_id) \
            .eq('user_id', student_id) \
            .single() \
            .execute()

        if not moment_response.data:
            return jsonify({'error': 'Moment not found'}), 404

        moment = moment_response.data

        if moment.get('captured_by_user_id') != user_id:
            raise AuthorizationError('You can only delete moments you captured')

        # Delete evidence blocks first
        supabase.table('learning_event_evidence_blocks') \
            .delete() \
            .eq('learning_event_id', moment_id) \
            .execute()

        # Delete the moment
        supabase.table('learning_events') \
            .delete() \
            .eq('id', moment_id) \
            .execute()

        logger.info(f"Advisor {user_id} deleted moment {moment_id} for student {student_id}")

        return jsonify({
            'success': True,
            'message': 'Learning moment deleted'
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error deleting learning moment: {str(e)}")
        return jsonify({'error': 'Failed to delete learning moment'}), 500
