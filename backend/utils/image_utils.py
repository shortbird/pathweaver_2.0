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
