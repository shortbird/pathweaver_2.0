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

logger = get_logger(__name__)

bp = Blueprint('advisor_learning_moments', __name__, url_prefix='/api/advisor')



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
        # admin client justified: advisor captures learning moments for assigned student; cross-user writes (learning_events, evidence blocks) gated by advisor_student_assignments + @require_advisor verification
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
            elif media_type == 'video':
                block_data = {
                    'learning_event_id': event_id,
                    'block_type': 'video',
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
        # admin client justified: advisor captures learning moments for assigned student; cross-user writes (learning_events, evidence blocks) gated by advisor_student_assignments + @require_advisor verification
        supabase = get_supabase_admin_client()
        verify_advisor_access(supabase, user_id, student_id)

        file = request.files.get('file')
        from services.media_upload_service import MediaUploadService
        result = MediaUploadService(supabase).upload_evidence_file(
            file,
            user_id=user_id,
            context_type='moment',
            context_id=student_id,
        )

        if not result.success:
            status = 413 if result.error_code == 'FILE_TOO_LARGE' else 400
            return jsonify({'error': result.error_message}), status

        return jsonify({
            'success': True,
            'file_url': result.file_url,
            'file_name': result.filename,
            'file_size': result.file_size,
            'media_type': result.media_type,
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error uploading media: {str(e)}")
        return jsonify({'error': 'Failed to upload file'}), 500


@bp.route('/students/<student_id>/learning-moments/upload-init', methods=['POST'])
@require_auth
def init_moment_signed_upload(user_id, student_id):
    """Begin a signed upload for an advisor-captured learning-moment file."""
    try:
        # admin client justified: advisor captures learning moments for assigned student; cross-user writes gated by advisor_student_assignments verification
        supabase = get_supabase_admin_client()
        verify_advisor_access(supabase, user_id, student_id)

        data = request.get_json() or {}
        filename = data.get('filename')
        file_size = data.get('file_size')
        if not filename or not isinstance(file_size, int):
            return jsonify({'error': 'filename and file_size required'}), 400

        from services.media_upload_service import MediaUploadService
        session = MediaUploadService(supabase).create_upload_session(
            user_id=user_id,
            context_type='moment',
            context_id=student_id,
            filename=filename,
            file_size=file_size,
            content_type=data.get('content_type'),
            block_type=data.get('block_type'),
        )
        if not session.success:
            status = 413 if session.error_code == 'FILE_TOO_LARGE' else 400
            return jsonify({'error': session.error_message}), status
        return jsonify({'success': True, 'upload': session.to_dict()})

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in advisor init_moment_signed_upload: {str(e)}")
        return jsonify({'error': 'Failed to create upload session'}), 500


@bp.route('/students/<student_id>/learning-moments/upload-finalize', methods=['POST'])
@require_auth
def finalize_moment_signed_upload(user_id, student_id):
    """Finalize a signed upload for an advisor-captured learning-moment file."""
    try:
        # admin client justified: advisor captures learning moments for assigned student; cross-user writes gated by advisor_student_assignments verification
        supabase = get_supabase_admin_client()
        verify_advisor_access(supabase, user_id, student_id)

        data = request.get_json() or {}
        storage_path = data.get('storage_path')
        bucket = data.get('bucket')
        if not storage_path or not bucket:
            return jsonify({'error': 'storage_path and bucket required'}), 400

        from services.media_upload_service import MediaUploadService
        result = MediaUploadService(supabase).finalize_upload(
            user_id=user_id,
            storage_path=storage_path,
            bucket=bucket,
            context_type='moment',
            context_id=student_id,
            block_type=data.get('block_type'),
            notify_user_id=student_id,
        )
        if not result.success:
            status = 413 if result.error_code == 'FILE_TOO_LARGE' else 400
            return jsonify({'error': result.error_message, 'error_code': result.error_code}), status

        return jsonify({
            'success': True,
            'file_url': result.file_url,
            'file_name': result.filename,
            'filename': result.filename,
            'file_size': result.file_size,
            'media_type': result.media_type,
            **({'thumbnail_url': result.thumbnail_url} if result.thumbnail_url else {}),
            **({'duration_seconds': result.duration_seconds} if result.duration_seconds is not None else {}),
            **({'width': result.width} if result.width is not None else {}),
            **({'height': result.height} if result.height is not None else {}),
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in advisor finalize_moment_signed_upload: {str(e)}")
        return jsonify({'error': 'Failed to finalize upload'}), 500


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
        # admin client justified: advisor captures learning moments for assigned student; cross-user writes (learning_events, evidence blocks) gated by advisor_student_assignments + @require_advisor verification
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
        # admin client justified: advisor captures learning moments for assigned student; cross-user writes (learning_events, evidence blocks) gated by advisor_student_assignments + @require_advisor verification
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
        # admin client justified: advisor captures learning moments for assigned student; cross-user writes (learning_events, evidence blocks) gated by advisor_student_assignments + @require_advisor verification
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

        # Fetch evidence blocks to clean up storage files
        blocks_response = supabase.table('learning_event_evidence_blocks') \
            .select('content, file_url') \
            .eq('learning_event_id', moment_id) \
            .execute()

        # Delete storage files from evidence blocks
        for block in (blocks_response.data or []):
            file_url = block.get('file_url') or (block.get('content') or {}).get('url')
            if file_url and 'supabase.co' in file_url:
                try:
                    for bucket in ['user-uploads', 'quest-evidence']:
                        marker = f'/{bucket}/'
                        if marker in file_url:
                            file_path = file_url.split(marker, 1)[1].split('?')[0]
                            supabase.storage.from_(bucket).remove([file_path])
                            break
                except Exception as e:
                    logger.warning(f"Failed to delete storage file during moment deletion: {e}")

        # Delete evidence blocks
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
