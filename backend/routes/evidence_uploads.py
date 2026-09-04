"""Evidence file uploads — the six routes that move bytes.

Split out of routes/evidence_documents.py on 2026-09-03 (QB-04), which was
1,718 lines and carried a standing exemption from the 1,400-line route cap. It
no longer needs one.

This block was chosen because it is genuinely separable: it uses NONE of that
module's shared helpers (process_evidence_completion, update_document_blocks,
check_quest_completion and the storage-deletion helpers all stay behind). The
extraction is a code move with no logic change.

Routes stay on the SAME blueprint object, registered through `register_routes(bp)`
the way routes/observer/* does. That matters beyond style: a Flask endpoint name
is `blueprint.view_function`, and `middleware/csrf_protection` plus several
tests resolve routes BY THAT NAME. Creating a second blueprint here would have
renamed every one of these endpoints silently.
"""

from flask import request, jsonify

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_auth
from utils.logger import get_logger
from utils.retry_handler import with_connection_retry

logger = get_logger(__name__)


def register_routes(bp):
    """Attach the upload routes to the evidence_documents blueprint."""
    @bp.route('/documents/<task_id>/upload', methods=['POST'])
    @rate_limit(limit=60, per=3600, per_user=True)  # 60 uploads/hour per user
    @require_auth
    def upload_task_file(user_id: str, task_id: str):
        """
        Upload a file for a task (before block is created).
        Returns the public URL for the uploaded file.
        """
        try:
            # admin client justified: evidence document writes scoped to caller (self) under @require_auth or to dependent under parent verification
            admin_supabase = get_supabase_admin_client()

            # Validate task exists and user owns it
            task_check = admin_supabase.table('user_quest_tasks')\
                .select('id, user_id')\
                .eq('id', task_id)\
                .execute()

            if not task_check.data:
                return jsonify({'success': False, 'error': 'Task not found'}), 404
            if task_check.data[0]['user_id'] != user_id:
                return jsonify({'success': False, 'error': 'Access denied'}), 403

            file = request.files.get('file')
            block_type = request.form.get('block_type') or None

            from services.media_upload_service import MediaUploadService
            result = MediaUploadService(admin_supabase).upload_evidence_file(
                file,
                user_id=user_id,
                context_type='task',
                context_id=task_id,
                block_type=block_type,
            )

            if not result.success:
                status = 413 if result.error_code == 'FILE_TOO_LARGE' else 400
                return jsonify({'success': False, 'error': result.error_message}), status

            response_data = {
                'success': True,
                # `url` is the durable pointer the client persists on the block;
                # `display_url` is the signed, expiring twin it renders right away.
                # Never swap them: storing the twin would put an hour-long
                # capability in the row and the image would go dark after it.
                'url': result.file_url,
                'display_url': result.display_url,
                'filename': result.filename,
                'file_size': result.file_size,
                'content_type': result.content_type,
            }
            if result.thumbnail_url:
                response_data['thumbnail_url'] = result.thumbnail_url
                response_data['thumbnail_display_url'] = result.thumbnail_display_url
            if result.duration_seconds is not None:
                response_data['duration_seconds'] = result.duration_seconds
            if result.width is not None:
                response_data['width'] = result.width
            if result.height is not None:
                response_data['height'] = result.height

            return jsonify(response_data)

        except Exception as e:
            logger.error(f"Error in upload_task_file: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to process file upload'}), 500

    @bp.route('/documents/<task_id>/upload-init', methods=['POST'])
    @rate_limit(limit=60, per=3600, per_user=True)  # 60 uploads/hour per user
    @require_auth
    def init_task_signed_upload(user_id: str, task_id: str):
        """
        Begin a signed upload for a task's evidence file. Returns a pre-signed URL
        the client PUTs the file to directly, avoiding routing large payloads
        through the backend.

        Body: { filename, file_size, content_type?, block_type? }
        """
        try:
            # admin client justified: evidence document writes scoped to caller (self) under @require_auth
            admin_supabase = get_supabase_admin_client()

            # Retried: this is the first call of an upload the user has already
            # picked a file for, and a stale pooled socket here reads to them as
            # "upload failed" (Sentry OPTIO-BACKEND-6M).
            task_check = with_connection_retry(
                lambda: admin_supabase.table('user_quest_tasks')
                .select('id, user_id')
                .eq('id', task_id)
                .execute(),
                operation_name='init_task_signed_upload_task_lookup',
            )
            if not task_check.data:
                return jsonify({'success': False, 'error': 'Task not found'}), 404
            if task_check.data[0]['user_id'] != user_id:
                return jsonify({'success': False, 'error': 'Access denied'}), 403

            data = request.get_json() or {}
            filename = data.get('filename')
            file_size = data.get('file_size')
            content_type = data.get('content_type')
            block_type = data.get('block_type')

            if not filename or not isinstance(file_size, int):
                return jsonify({'success': False, 'error': 'filename and file_size required'}), 400

            from services.media_upload_service import MediaUploadService
            session = MediaUploadService(admin_supabase).create_upload_session(
                user_id=user_id,
                context_type='task',
                context_id=task_id,
                filename=filename,
                file_size=file_size,
                content_type=content_type,
                block_type=block_type,
            )
            if not session.success:
                status = 413 if session.error_code == 'FILE_TOO_LARGE' else 400
                return jsonify({'success': False, 'error': session.error_message}), status

            return jsonify({'success': True, 'upload': session.to_dict()})

        except Exception as e:
            logger.error(f"Error in init_task_signed_upload: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to create upload session'}), 500


    @bp.route('/documents/<task_id>/upload-finalize', methods=['POST'])
    @require_auth
    def finalize_task_signed_upload(user_id: str, task_id: str):
        """
        Finalize a signed upload: verify the file landed in storage, run video
        post-processing if applicable, and return the file URL + metadata.

        Body: { storage_path, bucket, block_type? }
        """
        try:
            # admin client justified: evidence document writes scoped to caller (self) under @require_auth
            admin_supabase = get_supabase_admin_client()

            task_check = admin_supabase.table('user_quest_tasks')\
                .select('id, user_id')\
                .eq('id', task_id)\
                .execute()
            if not task_check.data:
                return jsonify({'success': False, 'error': 'Task not found'}), 404
            if task_check.data[0]['user_id'] != user_id:
                return jsonify({'success': False, 'error': 'Access denied'}), 403

            data = request.get_json() or {}
            storage_path = data.get('storage_path')
            bucket = data.get('bucket')
            block_type = data.get('block_type')

            if not storage_path or not bucket:
                return jsonify({'success': False, 'error': 'storage_path and bucket required'}), 400

            from services.media_upload_service import MediaUploadService
            result = MediaUploadService(admin_supabase).finalize_upload(
                user_id=user_id,
                storage_path=storage_path,
                bucket=bucket,
                context_type='task',
                context_id=task_id,
                block_type=block_type,
            )
            if not result.success:
                status = 413 if result.error_code == 'FILE_TOO_LARGE' else 400
                return jsonify({'success': False, 'error': result.error_message, 'error_code': result.error_code}), status

            response_data = {
                'success': True,
                # `url` is the durable pointer the client persists on the block;
                # `display_url` is the signed, expiring twin it renders right away.
                # Never swap them: storing the twin would put an hour-long
                # capability in the row and the image would go dark after it.
                'url': result.file_url,
                'display_url': result.display_url,
                'filename': result.filename,
                'file_size': result.file_size,
                'content_type': result.content_type,
            }
            if result.thumbnail_url:
                response_data['thumbnail_url'] = result.thumbnail_url
                response_data['thumbnail_display_url'] = result.thumbnail_display_url
            if result.duration_seconds is not None:
                response_data['duration_seconds'] = result.duration_seconds
            if result.width is not None:
                response_data['width'] = result.width
            if result.height is not None:
                response_data['height'] = result.height

            return jsonify(response_data)

        except Exception as e:
            logger.error(f"Error in finalize_task_signed_upload: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to finalize upload'}), 500


    @bp.route('/blocks/<block_id>/upload-init', methods=['POST'])
    @rate_limit(limit=60, per=3600, per_user=True)  # 60 uploads/hour per user
    @require_auth
    def init_block_signed_upload(user_id: str, block_id: str):
        """
        Begin a signed upload for a specific content block. Block type is derived
        from the block record rather than the client.

        Body: { filename, file_size, content_type? }
        """
        try:
            # admin client justified: evidence document writes scoped to caller (self) under @require_auth; ownership verified via user_task_evidence_documents.user_id
            admin_supabase = get_supabase_admin_client()

            block_response = admin_supabase.table('evidence_document_blocks')\
                .select('id, block_type, user_task_evidence_documents(user_id)')\
                .eq('id', block_id)\
                .single()\
                .execute()
            if not block_response.data:
                return jsonify({'success': False, 'error': 'Block not found'}), 404

            block = block_response.data
            document_user_id = (
                block.get('user_task_evidence_documents', {}).get('user_id')
                if isinstance(block.get('user_task_evidence_documents'), dict)
                else None
            )
            if document_user_id != user_id:
                return jsonify({'success': False, 'error': 'Access denied'}), 403

            block_type = block['block_type']
            if block_type not in ['image', 'document', 'video']:
                return jsonify({'success': False, 'error': 'File upload only supported for image, document, and video blocks'}), 400

            data = request.get_json() or {}
            filename = data.get('filename')
            file_size = data.get('file_size')
            content_type = data.get('content_type')

            if not filename or not isinstance(file_size, int):
                return jsonify({'success': False, 'error': 'filename and file_size required'}), 400

            from services.media_upload_service import MediaUploadService
            session = MediaUploadService(admin_supabase).create_upload_session(
                user_id=user_id,
                context_type='block',
                context_id=block_id,
                filename=filename,
                file_size=file_size,
                content_type=content_type,
                block_type=block_type,
            )
            if not session.success:
                status = 413 if session.error_code == 'FILE_TOO_LARGE' else 400
                return jsonify({'success': False, 'error': session.error_message}), status

            return jsonify({'success': True, 'upload': session.to_dict()})

        except Exception as e:
            logger.error(f"Error in init_block_signed_upload: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to create upload session'}), 500


    @bp.route('/blocks/<block_id>/upload-finalize', methods=['POST'])
    @require_auth
    def finalize_block_signed_upload(user_id: str, block_id: str):
        """
        Finalize a signed upload for a block: verify storage, run post-processing,
        write the file URL + metadata into the block's content JSON.

        Body: { storage_path, bucket }
        """
        try:
            # admin client justified: evidence document writes scoped to caller (self) under @require_auth; ownership verified via user_task_evidence_documents.user_id
            admin_supabase = get_supabase_admin_client()

            block_response = admin_supabase.table('evidence_document_blocks')\
                .select('*, user_task_evidence_documents(user_id)')\
                .eq('id', block_id)\
                .single()\
                .execute()
            if not block_response.data:
                return jsonify({'success': False, 'error': 'Block not found'}), 404

            block = block_response.data
            document_user_id = (
                block.get('user_task_evidence_documents', {}).get('user_id')
                if isinstance(block.get('user_task_evidence_documents'), dict)
                else None
            )
            if document_user_id != user_id:
                return jsonify({'success': False, 'error': 'Access denied'}), 403

            block_type = block['block_type']

            data = request.get_json() or {}
            storage_path = data.get('storage_path')
            bucket = data.get('bucket')

            if not storage_path or not bucket:
                return jsonify({'success': False, 'error': 'storage_path and bucket required'}), 400

            from services.media_upload_service import MediaUploadService
            result = MediaUploadService(admin_supabase).finalize_upload(
                user_id=user_id,
                storage_path=storage_path,
                bucket=bucket,
                context_type='block',
                context_id=block_id,
                block_type=block_type,
            )
            if not result.success:
                status = 413 if result.error_code == 'FILE_TOO_LARGE' else 400
                return jsonify({'success': False, 'error': result.error_message, 'error_code': result.error_code}), status

            # Update block content with file info (mirrors legacy upload_block_file behaviour).
            current_content = block.get('content') or {}
            current_content.update({
                'url': result.file_url,
                'filename': result.filename,
                'file_size': result.file_size,
                'content_type': result.content_type,
            })
            if result.thumbnail_url:
                current_content['thumbnail_url'] = result.thumbnail_url
            if result.duration_seconds is not None:
                current_content['duration_seconds'] = result.duration_seconds
            if result.width is not None:
                current_content['width'] = result.width
            if result.height is not None:
                current_content['height'] = result.height
            if block_type == 'image' and not current_content.get('alt'):
                current_content['alt'] = result.filename

            update_data = {'content': current_content}
            if block_type == 'document' and result.content_type and result.content_type.startswith('image/'):
                update_data['block_type'] = 'image'
                if not current_content.get('alt'):
                    current_content['alt'] = result.filename
                update_data['content'] = current_content

            admin_supabase.table('evidence_document_blocks')\
                .update(update_data)\
                .eq('id', block_id)\
                .execute()

            response_data = {
                'success': True,
                'message': 'File uploaded successfully',
                # The block row already holds the canonical pointer (set above), so
                # this field is preview-only — hand back the signed twin.
                'file_url': result.display_url or result.file_url,
                'filename': result.filename,
                'file_size': result.file_size,
            }
            if result.thumbnail_url:
                response_data['thumbnail_url'] = result.thumbnail_url
                response_data['thumbnail_display_url'] = result.thumbnail_display_url
            if result.duration_seconds is not None:
                response_data['duration_seconds'] = result.duration_seconds
            if result.width is not None:
                response_data['width'] = result.width
            if result.height is not None:
                response_data['height'] = result.height

            return jsonify(response_data)

        except Exception as e:
            logger.error(f"Error in finalize_block_signed_upload: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to finalize upload'}), 500


    @bp.route('/blocks/<block_id>/upload', methods=['POST'])
    @rate_limit(limit=60, per=3600, per_user=True)  # CVE-OPTIO-2025-017: 60 uploads/hour per user
    @require_auth
    def upload_block_file(user_id: str, block_id: str):
        """
        Upload a file for a specific content block (image or document).
        """
        try:
            # admin client justified: evidence document writes scoped to caller (self) under @require_auth or to dependent under parent verification
            admin_supabase = get_supabase_admin_client()

            # Validate block exists and user owns it
            block_response = admin_supabase.table('evidence_document_blocks')\
                .select('*, user_task_evidence_documents(user_id)')\
                .eq('id', block_id)\
                .single()\
                .execute()

            if not block_response.data:
                return jsonify({'success': False, 'error': 'Block not found'}), 404

            block = block_response.data
            document_user_id = block.get('user_task_evidence_documents', {}).get('user_id') if isinstance(block.get('user_task_evidence_documents'), dict) else None
            if document_user_id != user_id:
                return jsonify({'success': False, 'error': 'Access denied'}), 403

            block_type = block['block_type']
            if block_type not in ['image', 'document', 'video']:
                return jsonify({'success': False, 'error': 'File upload only supported for image, document, and video blocks'}), 400

            file = request.files.get('file')

            from services.media_upload_service import MediaUploadService
            result = MediaUploadService(admin_supabase).upload_evidence_file(
                file,
                user_id=user_id,
                context_type='block',
                context_id=block_id,
                block_type=block_type,
            )

            if not result.success:
                status = 413 if result.error_code == 'FILE_TOO_LARGE' else 400
                return jsonify({'success': False, 'error': result.error_message}), status

            # Update block content with file information
            current_content = block.get('content', {})
            current_content.update({
                'url': result.file_url,
                'filename': result.filename,
                'file_size': result.file_size,
                'content_type': result.content_type,
            })
            if result.thumbnail_url:
                current_content['thumbnail_url'] = result.thumbnail_url
            if result.duration_seconds is not None:
                current_content['duration_seconds'] = result.duration_seconds
            if result.width is not None:
                current_content['width'] = result.width
            if result.height is not None:
                current_content['height'] = result.height

            if block_type == 'image' and not current_content.get('alt'):
                current_content['alt'] = result.filename

            # If the file was converted (e.g. HEIC->JPG), reclassify block as image
            update_data = {'content': current_content}
            if block_type == 'document' and result.content_type and result.content_type.startswith('image/'):
                update_data['block_type'] = 'image'
                if not current_content.get('alt'):
                    current_content['alt'] = result.filename
                update_data['content'] = current_content

            admin_supabase.table('evidence_document_blocks')\
                .update(update_data)\
                .eq('id', block_id)\
                .execute()

            response_data = {
                'success': True,
                'message': 'File uploaded successfully',
                # The block row already holds the canonical pointer (set above), so
                # this field is preview-only — hand back the signed twin.
                'file_url': result.display_url or result.file_url,
                'filename': result.filename,
                'file_size': result.file_size,
            }
            if result.thumbnail_url:
                response_data['thumbnail_url'] = result.thumbnail_url
                response_data['thumbnail_display_url'] = result.thumbnail_display_url
            if result.duration_seconds is not None:
                response_data['duration_seconds'] = result.duration_seconds
            if result.width is not None:
                response_data['width'] = result.width
            if result.height is not None:
                response_data['height'] = result.height

            return jsonify(response_data)

        except Exception as e:
            logger.error(f"Error in upload_block_file: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to process file upload'}), 500
