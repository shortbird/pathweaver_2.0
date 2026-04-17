"""
Media Upload Service - Single source of truth for all evidence/media file uploads.

Handles validation, storage, video processing, and background transcoding
for all upload paths: evidence documents, learning events, parent/advisor
learning moments, and task submissions.
"""

import mimetypes
import os
import tempfile
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional

from werkzeug.utils import secure_filename

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.storage_url import fix_storage_url
from config.constants import (
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_DOCUMENT_EXTENSIONS,
    ALLOWED_VIDEO_EXTENSIONS,
    MAX_IMAGE_SIZE,
    MAX_DOCUMENT_SIZE,
    MAX_VIDEO_SIZE,
    MAX_VIDEO_SIZE_SIGNED,
    MAX_VIDEO_DURATION_SECONDS,
    IMAGE_FORMAT_LABEL,
    DOCUMENT_FORMAT_LABEL,
    VIDEO_FORMAT_LABEL,
)

logger = get_logger(__name__)


# Grouped constants for easy lookup.
# EVIDENCE_SIZE_LIMITS bounds legacy multipart-through-backend uploads.
# SIGNED_EVIDENCE_SIZE_LIMITS bounds signed-upload (direct-to-Supabase) uploads,
# where the payload never buffers on a worker and we can accept larger videos.
EVIDENCE_SIZE_LIMITS = {
    'image': MAX_IMAGE_SIZE,
    'video': MAX_VIDEO_SIZE,
    'document': MAX_DOCUMENT_SIZE,
}

SIGNED_EVIDENCE_SIZE_LIMITS = {
    'image': MAX_IMAGE_SIZE,
    'video': MAX_VIDEO_SIZE_SIGNED,
    'document': MAX_DOCUMENT_SIZE,
}

EVIDENCE_ALLOWED_EXTENSIONS = {
    'image': ALLOWED_IMAGE_EXTENSIONS,
    'video': ALLOWED_VIDEO_EXTENSIONS,
    'document': ALLOWED_DOCUMENT_EXTENSIONS,
}

EVIDENCE_FORMAT_LABELS = {
    'image': IMAGE_FORMAT_LABEL,
    'video': VIDEO_FORMAT_LABEL,
    'document': DOCUMENT_FORMAT_LABEL,
}

# Storage path templates per context type
STORAGE_PATH_TEMPLATES = {
    'task': 'evidence-tasks/{user_id}/{context_id}_{timestamp}_{filename}',
    'block': 'evidence-blocks/{user_id}/{context_id}_{timestamp}_{filename}',
    'event': 'learning-events/{user_id}/{context_id}_{timestamp}_{filename}',
    'moment': 'learning_moments/{context_id}/{file_uuid}.{ext}',
    'moment_block': 'learning_moments/{context_id}/{sub_id}/{file_uuid}.{ext}',
    'task_evidence': 'task-evidence/{user_id}/{context_id}_{timestamp}_{filename}',
}

# Thumbnail path templates
THUMBNAIL_PATH_TEMPLATES = {
    'task': 'evidence-tasks/{user_id}/thumbnails/{context_id}_{timestamp}_{thumb_name}',
    'block': 'evidence-blocks/{user_id}/thumbnails/{context_id}_{timestamp}_{thumb_name}',
    'event': 'learning-events/{user_id}/thumbnails/{context_id}_{timestamp}_{thumb_name}',
    'moment': 'learning_moments/{context_id}/thumbnails/{file_uuid}_{thumb_name}',
    'moment_block': 'learning_moments/{context_id}/{sub_id}/thumbnails/{file_uuid}_{thumb_name}',
}

# Default bucket per context type
DEFAULT_BUCKETS = {
    'task': 'quest-evidence',
    'block': 'quest-evidence',
    'event': 'quest-evidence',
    'moment': 'user-uploads',
    'moment_block': 'user-uploads',
    'task_evidence': 'quest-evidence',
}


@dataclass
class MediaUploadResult:
    """Result of a media upload operation."""
    success: bool
    file_url: Optional[str] = None
    filename: Optional[str] = None
    file_size: int = 0
    content_type: Optional[str] = None
    media_type: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration_seconds: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    sha256_hash: Optional[str] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None

    def to_dict(self):
        """Convert to dict, omitting None values."""
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class UploadSession:
    """Pre-signed upload session for direct-to-Supabase uploads."""
    success: bool
    signed_url: Optional[str] = None
    token: Optional[str] = None
    storage_path: Optional[str] = None
    bucket: Optional[str] = None
    final_url: Optional[str] = None
    media_type: Optional[str] = None
    max_size: Optional[int] = None
    expires_in: int = 7200
    error_message: Optional[str] = None
    error_code: Optional[str] = None

    def to_dict(self):
        return {k: v for k, v in asdict(self).items() if v is not None}


class MediaUploadService:
    """
    Single source of truth for all evidence/media file uploads.
    Handles validation, storage, video processing, and background transcoding.
    """

    def __init__(self, supabase_client=None):
        self._client = supabase_client

    def _get_client(self):
        if self._client:
            return self._client
        return get_supabase_admin_client()

    def upload_evidence_file(
        self,
        file,
        *,
        user_id: str,
        context_type: str,
        context_id: str,
        block_type: Optional[str] = None,
        bucket: Optional[str] = None,
        sub_id: Optional[str] = None,
        notify_user_id: Optional[str] = None,
        security_scan: bool = False,
    ) -> MediaUploadResult:
        """
        Unified upload pipeline:
        1. Validate file (extension, size, type-specific limits)
        2. Validate video duration (if video)
        3. Upload raw file to Supabase storage
        4. Generate video thumbnail (if video and ffmpeg available)
        5. Kick off background video transcoding (if video)
        6. Return URL and metadata

        Args:
            file: werkzeug FileStorage object
            user_id: The authenticated user performing the upload
            context_type: 'task' | 'block' | 'event' | 'moment' | 'moment_block' | 'task_evidence'
            context_id: Primary context ID (task_id, block_id, event_id, child_id, student_id)
            block_type: 'image' | 'video' | 'document' (auto-detected if None)
            bucket: Override storage bucket (defaults based on context_type)
            sub_id: Secondary ID for nested paths (e.g., moment_id)
            notify_user_id: User ID for failure notifications (defaults to user_id)
        """
        notify_user_id = notify_user_id or user_id
        bucket = bucket or DEFAULT_BUCKETS.get(context_type, 'quest-evidence')

        # Validate file exists
        if not file or not file.filename:
            return MediaUploadResult(
                success=False,
                error_message='No file provided',
                error_code='NO_FILE',
            )

        # Sanitize filename and get extension
        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        # Auto-detect block_type from extension if not provided
        if not block_type:
            block_type = self._detect_media_type(ext)

        # Validate extension
        allowed_exts = EVIDENCE_ALLOWED_EXTENSIONS.get(block_type)
        if not allowed_exts or ext not in allowed_exts:
            label = EVIDENCE_FORMAT_LABELS.get(block_type, 'supported files')
            return MediaUploadResult(
                success=False,
                error_message=f'"{file.filename}" is not a supported {block_type} format. Supported: {label}',
                error_code='INVALID_TYPE',
            )

        # Check file size without reading into memory (prevents OOM on large uploads)
        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)
        max_size = EVIDENCE_SIZE_LIMITS.get(block_type, MAX_IMAGE_SIZE)

        if file_size > max_size:
            max_mb = max_size // (1024 * 1024)
            file_mb = file_size / (1024 * 1024)
            return MediaUploadResult(
                success=False,
                error_message=f'File is too large ({file_mb:.1f}MB). Maximum for {block_type}s is {max_mb}MB.',
                error_code='FILE_TOO_LARGE',
            )

        content_type = file.content_type or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        is_video = block_type == 'video'

        # Stream file to a temp file to avoid holding entire upload in memory
        tmp_path = None
        try:
            suffix = f'.{ext}' if ext else ''
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp_path = tmp.name
                while True:
                    chunk = file.read(64 * 1024)  # 64KB chunks
                    if not chunk:
                        break
                    tmp.write(chunk)

            # Optional security scan (magic-byte / polyglot / suspicious pattern detection).
            # Only used by the generic /api/uploads/evidence endpoint — other
            # contexts trust the FileStorage's claimed type.
            sha256_hash: Optional[str] = None
            if security_scan:
                from utils.file_validator import validate_file as _security_validate
                with open(tmp_path, 'rb') as f:
                    _scan_bytes = f.read()
                _scan = _security_validate(filename, _scan_bytes, content_type)
                del _scan_bytes  # free
                if not _scan.is_valid:
                    logger.warning(
                        f"[MediaUpload] Security scan rejected {filename!r} "
                        f"for user {user_id}: {_scan.error_message}"
                    )
                    return MediaUploadResult(
                        success=False,
                        error_message=_scan.error_message or 'File failed security validation',
                        error_code='SECURITY_REJECTED',
                    )
                sha256_hash = _scan.sha256_hash
                # Prefer the scanner's detected MIME over the client-supplied one.
                if _scan.detected_mime:
                    content_type = _scan.detected_mime

            # Convert HEIF/HEIC to JPEG (browsers can't display HEIF natively)
            if ext in ('heic', 'heif') and block_type == 'image':
                from utils.image_utils import convert_heif_if_needed
                with open(tmp_path, 'rb') as f:
                    file_content = f.read()
                file_content, filename, content_type = convert_heif_if_needed(file_content, filename, content_type)
                ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ext
                file_size = len(file_content)
                # Re-write converted content to temp file
                with open(tmp_path, 'wb') as f:
                    f.write(file_content)
                del file_content  # Free memory immediately

            # Video duration validation (uses temp file path, no extra memory copy)
            if is_video:
                from services.video_processing_service import video_processing_service
                duration_ok, duration = video_processing_service.validate_duration_from_path(tmp_path)
                if not duration_ok:
                    return MediaUploadResult(
                        success=False,
                        error_message=f'Video is too long ({duration:.0f}s). Maximum duration is {MAX_VIDEO_DURATION_SECONDS // 60} minutes.',
                        error_code='VIDEO_TOO_LONG',
                    )

            # Video thumbnail and metadata extraction (synchronous, fast)
            video_metadata = {}
            if is_video:
                from services.video_processing_service import video_processing_service

                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                file_uuid = str(uuid.uuid4())

                def upload_thumbnail(thumb_bytes, thumb_name):
                    thumb_template = THUMBNAIL_PATH_TEMPLATES.get(context_type)
                    if not thumb_template:
                        return None
                    thumb_path = thumb_template.format(
                        user_id=user_id,
                        context_id=context_id,
                        sub_id=sub_id or '',
                        timestamp=timestamp,
                        file_uuid=file_uuid,
                        thumb_name=thumb_name,
                    )
                    supabase = self._get_client()
                    supabase.storage.from_(bucket).upload(
                        path=thumb_path,
                        file=thumb_bytes,
                        file_options={"content-type": "image/jpeg"}
                    )
                    return fix_storage_url(supabase.storage.from_(bucket).get_public_url(thumb_path))

                meta = video_processing_service.process_video_from_path(tmp_path, storage_upload_fn=upload_thumbnail)
                video_metadata = {
                    'thumbnail_url': meta.thumbnail_url,
                    'duration_seconds': meta.duration_seconds,
                    'width': meta.width,
                    'height': meta.height,
                }

            # Generate storage path
            storage_path = self._generate_storage_path(
                context_type=context_type,
                context_id=context_id,
                user_id=user_id,
                filename=filename,
                ext=ext,
                sub_id=sub_id,
            )

            # Upload directly from temp file handle to Supabase storage.
            # Passing the handle (not a bytes copy) avoids buffering the whole payload
            # in memory during the upload. storage3 accepts BufferedReader; httpx
            # streams it as the multipart body. Large videos previously caused ~2-3x
            # in-memory copies (file bytes + httpx multipart buffer) -> Render OOMs.
            try:
                supabase = self._get_client()
                with open(tmp_path, 'rb') as f:
                    supabase.storage.from_(bucket).upload(
                        path=storage_path,
                        file=f,
                        file_options={"content-type": content_type},
                    )
                public_url = fix_storage_url(
                    supabase.storage.from_(bucket).get_public_url(storage_path)
                )
            except Exception as e:
                logger.error(f"[MediaUpload] Storage upload failed: {e}")
                return MediaUploadResult(
                    success=False,
                    error_message='Failed to upload file to storage',
                    error_code='STORAGE_ERROR',
                )

            # Kick off background video processing (transcode/compress)
            if is_video:
                from services.video_processing_service import video_processing_service
                video_processing_service.process_video_background(
                    public_url=public_url,
                    storage_path=storage_path,
                    bucket_name=bucket,
                    user_id=notify_user_id,
                )

            logger.info(f"[MediaUpload] Uploaded {block_type} ({file_size} bytes) to {bucket}/{storage_path}")
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

        return MediaUploadResult(
            success=True,
            file_url=public_url,
            filename=filename,
            file_size=file_size,
            content_type=content_type,
            media_type=block_type,
            sha256_hash=sha256_hash,
            **video_metadata,
        )

    def create_upload_session(
        self,
        *,
        user_id: str,
        context_type: str,
        context_id: str,
        filename: str,
        file_size: int,
        content_type: Optional[str] = None,
        block_type: Optional[str] = None,
        bucket: Optional[str] = None,
        sub_id: Optional[str] = None,
    ) -> UploadSession:
        """
        Create a pre-signed upload session. The caller PUTs the file directly to
        `signed_url`, then calls :meth:`finalize_upload` to trigger post-processing
        (HEAD verification, video thumbnail/duration/transcode).

        This path avoids routing large payloads through the backend (OOM on
        Render for >50MB payloads), and frees a Gunicorn worker from holding
        the connection during a slow client upload.
        """
        bucket = bucket or DEFAULT_BUCKETS.get(context_type, 'quest-evidence')

        if not filename:
            return UploadSession(
                success=False,
                error_message='Filename required',
                error_code='NO_FILENAME',
            )

        safe_name = secure_filename(filename)
        ext = safe_name.rsplit('.', 1)[1].lower() if '.' in safe_name else ''

        if not block_type:
            block_type = self._detect_media_type(ext)

        allowed_exts = EVIDENCE_ALLOWED_EXTENSIONS.get(block_type)
        if not allowed_exts or ext not in allowed_exts:
            label = EVIDENCE_FORMAT_LABELS.get(block_type, 'supported files')
            return UploadSession(
                success=False,
                error_message=f'"{filename}" is not a supported {block_type} format. Supported: {label}',
                error_code='INVALID_TYPE',
            )

        max_size = SIGNED_EVIDENCE_SIZE_LIMITS.get(block_type, MAX_IMAGE_SIZE)
        if file_size <= 0:
            return UploadSession(
                success=False,
                error_message='File size is required',
                error_code='INVALID_SIZE',
            )
        if file_size > max_size:
            max_mb = max_size // (1024 * 1024)
            file_mb = file_size / (1024 * 1024)
            return UploadSession(
                success=False,
                error_message=f'File is too large ({file_mb:.1f}MB). Maximum for {block_type}s is {max_mb}MB.',
                error_code='FILE_TOO_LARGE',
            )

        storage_path = self._generate_storage_path(
            context_type=context_type,
            context_id=context_id,
            user_id=user_id,
            filename=safe_name,
            ext=ext,
            sub_id=sub_id,
        )

        try:
            supabase = self._get_client()
            signed = supabase.storage.from_(bucket).create_signed_upload_url(storage_path)
        except Exception as e:
            logger.error(f"[MediaUpload] Failed to create signed upload URL for {bucket}/{storage_path}: {e}")
            return UploadSession(
                success=False,
                error_message='Failed to create upload session',
                error_code='SIGN_FAILED',
            )

        try:
            final_url = fix_storage_url(
                supabase.storage.from_(bucket).get_public_url(storage_path)
            )
        except Exception as e:
            logger.error(f"[MediaUpload] Failed to compute public URL for {bucket}/{storage_path}: {e}")
            final_url = None

        return UploadSession(
            success=True,
            signed_url=signed.get('signed_url') or signed.get('signedUrl'),
            token=signed.get('token'),
            storage_path=storage_path,
            bucket=bucket,
            final_url=final_url,
            media_type=block_type,
            max_size=max_size,
        )

    def finalize_upload(
        self,
        *,
        user_id: str,
        storage_path: str,
        bucket: str,
        context_type: str,
        context_id: str,
        block_type: Optional[str] = None,
        sub_id: Optional[str] = None,
        notify_user_id: Optional[str] = None,
    ) -> MediaUploadResult:
        """
        Finalize a signed upload: verify the file landed in storage, enforce
        per-context size limits (defense against client-declared-size lies),
        run video post-processing, and return the same MediaUploadResult shape
        as :meth:`upload_evidence_file`.
        """
        notify_user_id = notify_user_id or user_id
        supabase = self._get_client()

        # Defense: storage path templates include the user_id; reject finalize
        # calls where the authenticated user doesn't match the path owner. This
        # prevents one user from finalizing another user's upload.
        if f'/{user_id}/' not in f'/{storage_path}/':
            logger.warning(
                f"[MediaUpload] finalize_upload path ownership mismatch: "
                f"user_id={user_id} path={storage_path}"
            )
            return MediaUploadResult(
                success=False,
                error_message='Upload path does not belong to this user',
                error_code='PATH_MISMATCH',
            )

        filename = storage_path.rsplit('/', 1)[-1]
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        if not block_type:
            block_type = self._detect_media_type(ext)

        # Verify the file exists in storage and pull size/mimetype metadata.
        try:
            parent_path = storage_path.rsplit('/', 1)[0] if '/' in storage_path else ''
            listing = supabase.storage.from_(bucket).list(
                parent_path,
                {'limit': 100, 'search': filename},
            )
            match = next((f for f in (listing or []) if f.get('name') == filename), None)
            if not match:
                return MediaUploadResult(
                    success=False,
                    error_message='Uploaded file not found in storage',
                    error_code='FILE_NOT_FOUND',
                )
            meta = match.get('metadata') or {}
            file_size = int(meta.get('size') or 0)
            actual_content_type = meta.get('mimetype')
        except Exception as e:
            logger.error(f"[MediaUpload] Failed to verify uploaded file {bucket}/{storage_path}: {e}")
            return MediaUploadResult(
                success=False,
                error_message='Failed to verify uploaded file',
                error_code='VERIFY_FAILED',
            )

        # Enforce per-context size limit again, now against actual bytes stored.
        # Supabase's bucket-level limit is the outermost cap; this is the
        # per-media-type cap (e.g. document uploaded as .mp4 extension).
        max_size = SIGNED_EVIDENCE_SIZE_LIMITS.get(block_type, MAX_IMAGE_SIZE)
        if file_size > max_size:
            try:
                supabase.storage.from_(bucket).remove([storage_path])
            except Exception:
                logger.debug("failed to clean up oversized upload", exc_info=True)
            max_mb = max_size // (1024 * 1024)
            file_mb = file_size / (1024 * 1024)
            return MediaUploadResult(
                success=False,
                error_message=f'File is too large ({file_mb:.1f}MB). Maximum for {block_type}s is {max_mb}MB.',
                error_code='FILE_TOO_LARGE',
            )

        content_type = actual_content_type or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        public_url = fix_storage_url(
            supabase.storage.from_(bucket).get_public_url(storage_path)
        )

        video_metadata = {}
        if block_type == 'video':
            video_metadata = self._process_finalized_video(
                public_url=public_url,
                storage_path=storage_path,
                bucket=bucket,
                ext=ext,
                user_id=user_id,
                context_type=context_type,
                context_id=context_id,
                sub_id=sub_id,
                notify_user_id=notify_user_id,
            )
            if video_metadata.get('_error'):
                return MediaUploadResult(
                    success=False,
                    error_message=video_metadata['_error'],
                    error_code=video_metadata.get('_error_code', 'VIDEO_PROCESSING_FAILED'),
                )

        logger.info(f"[MediaUpload] Finalized {block_type} ({file_size} bytes) at {bucket}/{storage_path}")

        return MediaUploadResult(
            success=True,
            file_url=public_url,
            filename=filename,
            file_size=file_size,
            content_type=content_type,
            media_type=block_type,
            **{k: v for k, v in video_metadata.items() if not k.startswith('_')},
        )

    def _process_finalized_video(
        self,
        *,
        public_url: str,
        storage_path: str,
        bucket: str,
        ext: str,
        user_id: str,
        context_type: str,
        context_id: str,
        sub_id: Optional[str],
        notify_user_id: str,
    ) -> dict:
        """
        Video post-processing for a finalized signed upload. Streams the video
        to a temp file (no memory buffering), validates duration, generates a
        thumbnail, and kicks off background transcoding.

        Returns a metadata dict. If duration validation fails, returns
        {'_error': ..., '_error_code': ...} and the uploaded file is deleted
        from storage.
        """
        import requests

        from services.video_processing_service import video_processing_service

        supabase = self._get_client()
        tmp_path = None
        video_metadata: dict = {}

        try:
            suffix = f'.{ext}' if ext else ''
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp_path = tmp.name
                with requests.get(public_url, stream=True, timeout=300) as r:
                    r.raise_for_status()
                    for chunk in r.iter_content(chunk_size=64 * 1024):
                        if chunk:
                            tmp.write(chunk)

            duration_ok, duration = video_processing_service.validate_duration_from_path(tmp_path)
            if not duration_ok:
                try:
                    supabase.storage.from_(bucket).remove([storage_path])
                except Exception:
                    logger.debug("failed to clean up too-long video", exc_info=True)
                return {
                    '_error': (
                        f'Video is too long ({duration:.0f}s). '
                        f'Maximum duration is {MAX_VIDEO_DURATION_SECONDS // 60} minutes.'
                    ),
                    '_error_code': 'VIDEO_TOO_LONG',
                }

            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            file_uuid = str(uuid.uuid4())

            def upload_thumbnail(thumb_bytes, thumb_name):
                thumb_template = THUMBNAIL_PATH_TEMPLATES.get(context_type)
                if not thumb_template:
                    return None
                thumb_path = thumb_template.format(
                    user_id=user_id,
                    context_id=context_id,
                    sub_id=sub_id or '',
                    timestamp=timestamp,
                    file_uuid=file_uuid,
                    thumb_name=thumb_name,
                )
                supabase.storage.from_(bucket).upload(
                    path=thumb_path,
                    file=thumb_bytes,
                    file_options={"content-type": "image/jpeg"},
                )
                return fix_storage_url(supabase.storage.from_(bucket).get_public_url(thumb_path))

            meta = video_processing_service.process_video_from_path(
                tmp_path, storage_upload_fn=upload_thumbnail
            )
            video_metadata = {
                'thumbnail_url': meta.thumbnail_url,
                'duration_seconds': meta.duration_seconds,
                'width': meta.width,
                'height': meta.height,
            }
        except Exception as e:
            logger.error(f"[MediaUpload] Video finalize failed for {bucket}/{storage_path}: {e}")
            # Thumbnail/metadata is nice-to-have; don't fail the upload over it.
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except Exception:
                    logger.debug("failed to unlink video temp file", exc_info=True)

        try:
            video_processing_service.process_video_background(
                public_url=public_url,
                storage_path=storage_path,
                bucket_name=bucket,
                user_id=notify_user_id,
            )
        except Exception as e:
            logger.error(f"[MediaUpload] Failed to kick off background transcode: {e}")

        return video_metadata

    def validate_file(
        self,
        filename: str,
        file_size: int,
        block_type: str,
    ) -> MediaUploadResult:
        """
        Pre-flight validation without uploading.
        Returns a result with success=True if valid, or error details if not.
        """
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        allowed_exts = EVIDENCE_ALLOWED_EXTENSIONS.get(block_type)
        if not allowed_exts or ext not in allowed_exts:
            label = EVIDENCE_FORMAT_LABELS.get(block_type, 'supported files')
            return MediaUploadResult(
                success=False,
                error_message=f'"{filename}" is not a supported {block_type} format. Supported: {label}',
                error_code='INVALID_TYPE',
            )

        max_size = EVIDENCE_SIZE_LIMITS.get(block_type, MAX_IMAGE_SIZE)
        if file_size > max_size:
            max_mb = max_size // (1024 * 1024)
            file_mb = file_size / (1024 * 1024)
            return MediaUploadResult(
                success=False,
                error_message=f'File is too large ({file_mb:.1f}MB). Maximum for {block_type}s is {max_mb}MB.',
                error_code='FILE_TOO_LARGE',
            )

        return MediaUploadResult(success=True)

    def delete_storage_file(self, file_url: str, bucket: str = 'quest-evidence') -> bool:
        """Delete a file from Supabase storage given its public URL."""
        try:
            # Extract storage path from public URL
            marker = f'/storage/v1/object/public/{bucket}/'
            if marker in file_url:
                path = file_url.split(marker)[1].split('?')[0]
                supabase = self._get_client()
                supabase.storage.from_(bucket).remove([path])
                return True
        except Exception as e:
            logger.warning(f"[MediaUpload] Failed to delete file: {e}")
        return False

    @staticmethod
    def _convert_heif_to_jpeg(file_content: bytes, filename: str):
        """
        Convert HEIF/HEIC image to JPEG for browser compatibility.
        Returns (file_content, filename, ext, content_type) or None on failure.
        """
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
            from PIL import Image, ImageOps
            import io

            img = Image.open(io.BytesIO(file_content))
            img = ImageOps.exif_transpose(img)
            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')

            output = io.BytesIO()
            img.save(output, format='JPEG', quality=90)
            new_content = output.getvalue()
            new_filename = filename.rsplit('.', 1)[0] + '.jpg'
            logger.info(f"[MediaUpload] Converted HEIF to JPEG: {filename} -> {new_filename} ({len(file_content)} -> {len(new_content)} bytes)")
            return new_content, new_filename, 'jpg', 'image/jpeg'
        except ImportError:
            logger.warning("[MediaUpload] pillow-heif not installed, HEIF images will not be converted")
            return None
        except Exception as e:
            logger.error(f"[MediaUpload] HEIF conversion failed for {filename}: {e}")
            return None

    def _detect_media_type(self, ext: str) -> str:
        """Detect media type from file extension."""
        if ext in ALLOWED_VIDEO_EXTENSIONS:
            return 'video'
        if ext in ALLOWED_IMAGE_EXTENSIONS:
            return 'image'
        if ext in ALLOWED_DOCUMENT_EXTENSIONS:
            return 'document'
        return 'document'

    def _generate_storage_path(
        self,
        context_type: str,
        context_id: str,
        user_id: str,
        filename: str,
        ext: str,
        sub_id: Optional[str] = None,
    ) -> str:
        """Generate the storage path based on context type."""
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        file_uuid = str(uuid.uuid4())

        template = STORAGE_PATH_TEMPLATES.get(context_type)
        if not template:
            # Fallback to simple path
            return f"{user_id}/{file_uuid}.{ext}"

        return template.format(
            user_id=user_id,
            context_id=context_id,
            sub_id=sub_id or '',
            timestamp=timestamp,
            filename=filename,
            file_uuid=file_uuid,
            ext=ext,
        )
