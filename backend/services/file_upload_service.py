"""
File Upload Service

Centralized file upload handling for curriculum attachments and images.
Handles validation, resizing, bucket management, and storage operations.

Usage:
    from services.file_upload_service import FileUploadService

    upload_service = FileUploadService(supabase_client)

    # Upload an attachment
    result = upload_service.upload_attachment(
        file_data=file.read(),
        filename=file.filename,
        content_type=file.content_type,
        quest_id=quest_id,
        user_id=user_id,
        organization_id=org_id
    )

    # Upload and resize an image
    result = upload_service.upload_image(
        file_data=file.read(),
        filename=file.filename,
        content_type=file.content_type,
        quest_id=quest_id,
        max_width=2000
    )
"""

import io
import uuid
from typing import Optional, Dict, Any, Set, Tuple
from dataclasses import dataclass
from werkzeug.utils import secure_filename
from services.base_service import BaseService, ValidationError
from utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class UploadResult:
    """Result of a file upload operation."""
    success: bool
    url: Optional[str] = None
    filename: Optional[str] = None
    file_size: int = 0
    error_message: Optional[str] = None


class FileUploadService(BaseService):
    """
    Service for handling file uploads to Supabase storage.

    Consolidates file upload logic from curriculum.py:
    - Attachment uploads (documents, images, videos, audio)
    - Image uploads with PIL resizing
    """

    # Allowed extensions for curriculum attachments
    ATTACHMENT_EXTENSIONS: Set[str] = {
        # Documents
        'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
        # Images
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'heif',
        # Videos
        'mp4', 'mov', 'avi', 'webm',
        # Audio
        'mp3', 'wav', 'm4a',
        # Other
        'zip', 'txt', 'csv'
    }

    # Allowed extensions for curriculum images
    IMAGE_EXTENSIONS: Set[str] = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'}

    # Storage buckets
    ATTACHMENT_BUCKET = 'curriculum'
    IMAGE_BUCKET = 'curriculum-images'

    # Size limits
    MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024  # 50MB
    MAX_IMAGE_SIZE = 25 * 1024 * 1024  # 25MB
    DEFAULT_MAX_IMAGE_WIDTH = 2000

    def __init__(self, supabase_client):
        """
        Initialize with Supabase client.

        Args:
            supabase_client: Supabase admin client for storage operations
        """
        super().__init__()
        self.client = supabase_client
        self._pil_available = None

    @property
    def pil_available(self) -> bool:
        """Check if PIL is available for image processing."""
        if self._pil_available is None:
            try:
                from PIL import Image
                self._pil_available = True
            except ImportError:
                self._pil_available = False
                logger.warning("PIL not available - images will be uploaded without resizing")
        return self._pil_available

    def validate_file(
        self,
        file_data: bytes,
        filename: str,
        allowed_extensions: Set[str],
        max_size_bytes: int
    ) -> Tuple[bool, Optional[str], str]:
        """
        Validate a file for upload.

        Args:
            file_data: File content as bytes
            filename: Original filename
            allowed_extensions: Set of allowed file extensions
            max_size_bytes: Maximum file size in bytes

        Returns:
            Tuple of (is_valid, error_message, file_extension)
        """
        if not file_data:
            return False, "No file data provided", ""

        if not filename:
            return False, "No filename provided", ""

        # Get file extension
        file_extension = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        if not file_extension:
            return False, "File must have an extension", ""

        if file_extension not in allowed_extensions:
            ext_list = ', '.join(sorted(allowed_extensions))
            return False, f'Invalid file type ".{file_extension}". Allowed: {ext_list}', file_extension

        # Check file size
        if len(file_data) > max_size_bytes:
            size_mb = max_size_bytes / (1024 * 1024)
            return False, f"File size exceeds {size_mb:.0f}MB limit", file_extension

        # Sanitize filename
        safe_filename = secure_filename(filename)
        if not safe_filename or '..' in safe_filename:
            return False, "Invalid filename", file_extension

        return True, None, file_extension

    def _ensure_bucket_exists(self, bucket_name: str, public: bool = True) -> bool:
        """
        Ensure a storage bucket exists, creating if needed.

        Args:
            bucket_name: Name of the bucket
            public: Whether bucket should be public

        Returns:
            True if bucket exists/created successfully
        """
        try:
            # Try to get the bucket first
            bucket = self.client.storage.get_bucket(bucket_name)
            if bucket:
                return True
        except Exception:
            pass

        # Bucket doesn't exist, try to create it
        try:
            self.client.storage.create_bucket(
                bucket_name,
                options={"public": public}
            )
            logger.info(f"Created '{bucket_name}' storage bucket")
            return True
        except Exception as create_err:
            error_str = str(create_err).lower()
            if 'already exists' in error_str or 'duplicate' in error_str:
                return True
            logger.warning(f"Bucket creation note: {create_err}")
            return True  # Assume it exists and continue

    def upload_attachment(
        self,
        file_data: bytes,
        filename: str,
        content_type: str,
        quest_id: str,
        user_id: str,
        organization_id: Optional[str] = None,
        curriculum_service=None
    ) -> UploadResult:
        """
        Upload a curriculum attachment file.

        Args:
            file_data: File content as bytes
            filename: Original filename
            content_type: MIME type of the file
            quest_id: Quest ID for path organization
            user_id: Uploading user ID
            organization_id: Organization ID (optional)
            curriculum_service: CurriculumService instance for recording attachment (optional)

        Returns:
            UploadResult with URL on success
        """
        try:
            # Validate file
            is_valid, error_msg, file_ext = self.validate_file(
                file_data,
                filename,
                self.ATTACHMENT_EXTENSIONS,
                self.MAX_ATTACHMENT_SIZE
            )

            if not is_valid:
                return UploadResult(success=False, error_message=error_msg)

            # Generate unique filename
            unique_filename = f"{quest_id}_{uuid.uuid4().hex[:12]}.{file_ext}"

            # Ensure bucket exists
            self._ensure_bucket_exists(self.ATTACHMENT_BUCKET, public=True)

            # Upload to storage
            file_path = f"quest_{quest_id}/{unique_filename}"
            try:
                self.client.storage.from_(self.ATTACHMENT_BUCKET).upload(
                    file_path,
                    file_data,
                    {'content-type': content_type or 'application/octet-stream'}
                )
            except Exception as upload_err:
                error_msg = str(upload_err)
                if 'not found' in error_msg.lower() or 'bucket' in error_msg.lower():
                    logger.error(f"Storage bucket '{self.ATTACHMENT_BUCKET}' not found.")
                    return UploadResult(
                        success=False,
                        error_message="Storage not configured. Please contact administrator."
                    )
                raise

            # Get public URL
            file_url = self.client.storage.from_(self.ATTACHMENT_BUCKET).get_public_url(file_path)

            # Record attachment in database if service provided
            attachment = None
            if curriculum_service:
                attachment = curriculum_service.add_attachment(
                    quest_id=quest_id,
                    filename=filename,
                    file_url=file_url,
                    file_size=len(file_data),
                    mime_type=content_type or 'application/octet-stream',
                    user_id=user_id,
                    organization_id=organization_id
                )

            return UploadResult(
                success=True,
                url=file_url,
                filename=filename,
                file_size=len(file_data)
            )

        except Exception as e:
            logger.error(f"Error uploading attachment: {str(e)}", exc_info=True)
            return UploadResult(success=False, error_message=f"Failed to upload file: {str(e)}")

    def _resize_image(self, file_data: bytes, file_ext: str, max_width: int) -> bytes:
        """
        Resize an image if it exceeds max_width.

        Args:
            file_data: Original image data
            file_ext: File extension
            max_width: Maximum width in pixels

        Returns:
            Resized image data (or original if no resize needed)
        """
        if not self.pil_available:
            return file_data

        try:
            from PIL import Image

            img = Image.open(io.BytesIO(file_data))

            # Resize if width > max_width
            if img.width > max_width:
                ratio = max_width / img.width
                new_height = int(img.height * ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

                # Save resized image
                output = io.BytesIO()
                img_format = 'PNG' if file_ext == 'png' else 'JPEG'
                img.save(output, format=img_format, quality=90, optimize=True)
                return output.getvalue()

            return file_data

        except Exception as img_error:
            logger.warning(f"Image processing skipped: {img_error}")
            return file_data

    def upload_image(
        self,
        file_data: bytes,
        filename: str,
        content_type: str,
        quest_id: str,
        max_width: int = DEFAULT_MAX_IMAGE_WIDTH
    ) -> UploadResult:
        """
        Upload an image for curriculum lesson blocks.
        Images are resized to max_width if larger.

        Args:
            file_data: Image content as bytes
            filename: Original filename
            content_type: MIME type of the file
            quest_id: Quest ID for path organization
            max_width: Maximum image width (default 2000px)

        Returns:
            UploadResult with URL on success
        """
        try:
            # Validate file
            is_valid, error_msg, file_ext = self.validate_file(
                file_data,
                filename,
                self.IMAGE_EXTENSIONS,
                self.MAX_IMAGE_SIZE
            )

            if not is_valid:
                return UploadResult(success=False, error_message=error_msg)

            # Resize image if needed
            processed_data = self._resize_image(file_data, file_ext, max_width)

            # Generate unique filename
            unique_filename = f"{uuid.uuid4().hex[:16]}.{file_ext}"

            # Ensure bucket exists
            self._ensure_bucket_exists(self.IMAGE_BUCKET, public=True)

            # Upload to storage
            file_path = f"quests/{quest_id}/images/{unique_filename}"
            try:
                self.client.storage.from_(self.IMAGE_BUCKET).upload(
                    file_path,
                    processed_data,
                    {'content-type': content_type or 'image/jpeg'}
                )
            except Exception as upload_err:
                error_msg = str(upload_err)
                if 'not found' in error_msg.lower() or 'bucket' in error_msg.lower():
                    logger.error(f"Storage bucket '{self.IMAGE_BUCKET}' not found.")
                    return UploadResult(
                        success=False,
                        error_message="Storage not configured. Please contact administrator."
                    )
                raise

            # Get public URL
            file_url = self.client.storage.from_(self.IMAGE_BUCKET).get_public_url(file_path)

            return UploadResult(
                success=True,
                url=file_url,
                filename=filename,
                file_size=len(processed_data)
            )

        except Exception as e:
            logger.error(f"Error uploading image: {str(e)}", exc_info=True)
            return UploadResult(success=False, error_message=f"Failed to upload image: {str(e)}")

    def upload_course_cover(
        self,
        file_data: bytes,
        filename: str,
        content_type: str,
        course_id: str,
        max_width: int = 1200
    ) -> UploadResult:
        """
        Upload a course cover image.

        Args:
            file_data: Image content as bytes
            filename: Original filename
            content_type: MIME type of the file
            course_id: Course ID for path organization
            max_width: Maximum image width (default 1200px)

        Returns:
            UploadResult with URL on success
        """
        try:
            # Validate file (same as image validation)
            is_valid, error_msg, file_ext = self.validate_file(
                file_data,
                filename,
                self.IMAGE_EXTENSIONS,
                self.MAX_IMAGE_SIZE
            )

            if not is_valid:
                return UploadResult(success=False, error_message=error_msg)

            # Resize image if needed
            processed_data = self._resize_image(file_data, file_ext, max_width)

            # Generate unique filename
            unique_filename = f"cover_{uuid.uuid4().hex[:12]}.{file_ext}"

            # Use course-covers bucket
            bucket_name = 'course-covers'
            self._ensure_bucket_exists(bucket_name, public=True)

            # Upload to storage
            file_path = f"courses/{course_id}/{unique_filename}"
            try:
                self.client.storage.from_(bucket_name).upload(
                    file_path,
                    processed_data,
                    {'content-type': content_type or 'image/jpeg'}
                )
            except Exception as upload_err:
                error_msg = str(upload_err)
                if 'not found' in error_msg.lower() or 'bucket' in error_msg.lower():
                    logger.error(f"Storage bucket '{bucket_name}' not found.")
                    return UploadResult(
                        success=False,
                        error_message="Storage not configured. Please contact administrator."
                    )
                raise

            # Get public URL
            file_url = self.client.storage.from_(bucket_name).get_public_url(file_path)

            return UploadResult(
                success=True,
                url=file_url,
                filename=filename,
                file_size=len(processed_data)
            )

        except Exception as e:
            logger.error(f"Error uploading course cover: {str(e)}", exc_info=True)
            return UploadResult(success=False, error_message=f"Failed to upload course cover: {str(e)}")

    def upload_quest_header(
        self,
        file_data: bytes,
        filename: str,
        content_type: str,
        quest_id: str,
        max_width: int = 1200
    ) -> UploadResult:
        """
        Upload a quest/project header image.

        Args:
            file_data: Image content as bytes
            filename: Original filename
            content_type: MIME type of the file
            quest_id: Quest ID for path organization
            max_width: Maximum image width (default 1200px)

        Returns:
            UploadResult with URL on success
        """
        try:
            # Validate file (same as image validation)
            is_valid, error_msg, file_ext = self.validate_file(
                file_data,
                filename,
                self.IMAGE_EXTENSIONS,
                self.MAX_IMAGE_SIZE
            )

            if not is_valid:
                return UploadResult(success=False, error_message=error_msg)

            # Resize image if needed
            processed_data = self._resize_image(file_data, file_ext, max_width)

            # Generate unique filename
            unique_filename = f"header_{uuid.uuid4().hex[:12]}.{file_ext}"

            # Use quest-headers bucket
            bucket_name = 'quest-headers'
            self._ensure_bucket_exists(bucket_name, public=True)

            # Upload to storage
            file_path = f"quests/{quest_id}/{unique_filename}"
            try:
                self.client.storage.from_(bucket_name).upload(
                    file_path,
                    processed_data,
                    {'content-type': content_type or 'image/jpeg'}
                )
            except Exception as upload_err:
                error_msg = str(upload_err)
                if 'not found' in error_msg.lower() or 'bucket' in error_msg.lower():
                    logger.error(f"Storage bucket '{bucket_name}' not found.")
                    return UploadResult(
                        success=False,
                        error_message="Storage not configured. Please contact administrator."
                    )
                raise

            # Get public URL
            file_url = self.client.storage.from_(bucket_name).get_public_url(file_path)

            return UploadResult(
                success=True,
                url=file_url,
                filename=filename,
                file_size=len(processed_data)
            )

        except Exception as e:
            logger.error(f"Error uploading quest header: {str(e)}", exc_info=True)
            return UploadResult(success=False, error_message=f"Failed to upload quest header: {str(e)}")

    def delete_file(self, bucket_name: str, file_path: str) -> bool:
        """
        Delete a file from storage.

        Args:
            bucket_name: Storage bucket name
            file_path: Path to file within bucket

        Returns:
            True if deleted successfully
        """
        try:
            self.client.storage.from_(bucket_name).remove([file_path])
            logger.info(f"Deleted file from {bucket_name}: {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error deleting file from {bucket_name}/{file_path}: {str(e)}")
            return False
