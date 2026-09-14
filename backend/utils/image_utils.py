"""
Image utilities - HEIC/HEIF to JPEG conversion for browser compatibility.

Call convert_heif_if_needed() on any image upload to ensure browser compatibility.
iPhones default to HEIC format which only Safari supports natively.
"""

from utils.logger import get_logger

logger = get_logger(__name__)

HEIF_EXTENSIONS = {'heic', 'heif'}


def convert_heif_if_needed(file_content: bytes, filename: str, content_type: str = None):
    """
    If the file is HEIC/HEIF, convert it to JPEG. Otherwise return as-is.

    Args:
        file_content: Raw file bytes
        filename: Original filename (e.g. "photo.heic")
        content_type: Optional MIME type

    Returns:
        (file_content, filename, content_type) - converted if HEIF, unchanged otherwise
    """
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    is_heif = ext in HEIF_EXTENSIONS or (content_type and 'heif' in content_type.lower()) or (content_type and 'heic' in content_type.lower())

    if not is_heif:
        return file_content, filename, content_type

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

        logger.info(f"[ImageUtils] Converted HEIF to JPEG: {filename} -> {new_filename} ({len(file_content)} -> {len(new_content)} bytes)")
        return new_content, new_filename, 'image/jpeg'

    except ImportError:
        logger.warning("[ImageUtils] pillow-heif not installed, HEIF images will not be converted")
        return file_content, filename, content_type
    except Exception as e:
        logger.error(f"[ImageUtils] HEIF conversion failed for {filename}: {e}")
        return file_content, filename, content_type


IMAGE_UPLOAD_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'}


def store_image_upload(supabase, file, path_prefix: str, *, max_bytes: int = 5 * 1024 * 1024,
                       bucket: str = 'user-uploads') -> str:
    """Validate an uploaded image, convert HEIC, put it in the private bucket.

    Returns the canonical pointer to store (utils.storage_urls.public_object_url);
    the caller signs it for the browser. One recipe for the pictures a family
    uploads -- a child's avatar (routes/parent/child_overview) and the family
    photo (routes/parent/family_cover) -- where each route used to carry its
    own copy of the type list, the size check and the storage call.

    Raises middleware.error_handler.ValidationError with the message the
    parent should read.
    """
    from middleware.error_handler import ValidationError
    from utils.storage_urls import public_object_url
    import uuid as uuid_module

    if file is None or not file.filename:
        raise ValidationError('No file selected')
    if file.content_type not in IMAGE_UPLOAD_TYPES:
        raise ValidationError('Invalid file type. Allowed: JPEG, PNG, GIF, WebP, HEIC')

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > max_bytes:
        raise ValidationError(f'File too large. Maximum size is {max_bytes // (1024 * 1024)}MB')

    content, filename, content_type = convert_heif_if_needed(file.read(), file.filename, file.content_type)
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    path = f"{path_prefix.strip('/')}/{uuid_module.uuid4()}.{ext}"
    try:
        supabase.storage.from_(bucket).upload(
            path=path, file=content, file_options={'content-type': content_type or 'image/jpeg'},
        )
    except Exception as storage_err:
        logger.error(f"Storage upload failed for {path}: {storage_err}")
        raise ValidationError(f"Failed to upload file to storage: {str(storage_err)}") from storage_err
    return public_object_url(bucket, path)
