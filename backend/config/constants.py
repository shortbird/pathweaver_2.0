"""
Centralized Constants - Single Source of Truth

All magic numbers, thresholds, and configuration values go here.
This eliminates duplicate constants across the codebase.
"""

# XP Progression Thresholds
XP_THRESHOLDS = {
    'explorer': 0,
    'builder': 250,
    'creator': 750,
    'scholar': 1500,
    'sage': 3000,
}

# File Upload Limits
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB (keep under Render memory budget; applies to legacy multipart POSTs)
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB for images
MAX_DOCUMENT_SIZE = 25 * 1024 * 1024  # 25MB for documents (PDFs, etc.)
# Legacy (multipart-through-backend) video cap — kept small to bound worker memory.
MAX_VIDEO_SIZE = 50 * 1024 * 1024  # 50MB for videos (was 100MB, caused OOM on Render)
# Signed-upload (direct-to-Supabase) video cap — payload never touches our workers,
# so we can accept larger videos. Must match the bucket-level file_size_limit
# configured in Supabase (supabase/migrations/20260417_raise_evidence_bucket_file_size_limit.sql).
MAX_VIDEO_SIZE_SIGNED = 500 * 1024 * 1024  # 500MB for videos via signed-upload
MAX_VIDEO_COMPRESSION_THRESHOLD = 25 * 1024 * 1024  # 25MB - compress videos above this
MAX_VIDEO_DURATION_SECONDS = 180  # 3 minutes

# Allowed File Extensions (by type)
ALLOWED_FILE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.pdf', '.mp4', '.doc', '.docx', '.txt', '.webp', '.mov', '.webm', '.mp3', '.wav', '.ogg', '.heic', '.heif', '.tiff', '.tif', '.bmp', '.avif', '.jfif'}
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tiff', 'tif', 'bmp', 'avif', 'jfif'}
ALLOWED_DOCUMENT_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt'}
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'mov'}
ALLOWED_VIDEO_MIME_TYPES = {'video/mp4', 'video/quicktime'}
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'mp4', 'mov'}  # Legacy compatibility

# Grouped evidence upload lookups (used by MediaUploadService).
# EVIDENCE_SIZE_LIMITS applies to the legacy multipart-through-backend flow
# (MediaUploadService.upload_evidence_file). SIGNED_EVIDENCE_SIZE_LIMITS applies
# to the signed-upload flow (create_upload_session / finalize_upload) where the
# payload goes directly to Supabase and we can afford bigger videos.
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

# Human-readable format labels for error messages
IMAGE_FORMAT_LABEL = 'JPG, JPEG, PNG, GIF, WebP, HEIC, HEIF, TIFF, BMP, AVIF'
DOCUMENT_FORMAT_LABEL = 'PDF, DOC, DOCX, TXT'
VIDEO_FORMAT_LABEL = 'MP4, MOV'

# Video thumbnail settings
VIDEO_THUMBNAIL_WIDTH = 480
VIDEO_THUMBNAIL_QUALITY = 85

# Rate Limiting
RATE_LIMITS = {
    'default': {'requests': 60, 'window': 60},  # 60 requests per minute
    'auth': {'requests': 3, 'window': 900},  # 3 per 15 minutes
    'upload': {'requests': 10, 'window': 300},  # 10 per 5 minutes
    'video_upload': {'requests': 5, 'window': 3600},  # 5 per hour (production)
    'api': {'requests': 100, 'window': 60},  # 100 per minute for general API
}

# Cache Timeouts (seconds)
CACHE_TIMES = {
    'user_profile': 5 * 60,  # 5 minutes
    'quest_list': 2 * 60,  # 2 minutes
    'badge_list': 10 * 60,  # 10 minutes
    'activity_feed': 60,  # 1 minute
    'diploma': 10 * 60,  # 10 minutes
}

# Password Policy
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
PASSWORD_REQUIREMENTS = {
    'min_length': MIN_PASSWORD_LENGTH,
    'max_length': MAX_PASSWORD_LENGTH,
    'require_uppercase': True,
    'require_lowercase': True,
    'require_digit': True,
    'require_special': True,
}

# Security Configuration
MIN_SECRET_KEY_LENGTH = 64  # Minimum length for Flask SECRET_KEY (for HS256 JWT)

# Session Configuration
SESSION_TIMEOUT = 24 * 60 * 60  # 24 hours in seconds
REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60  # 7 days in seconds
ACCESS_TOKEN_EXPIRY = 15 * 60  # 15 minutes in seconds

# Account Lockout
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION = 30 * 60  # 30 minutes in seconds
LOCKOUT_DURATION_MINUTES = 30  # Legacy compatibility (same as LOCKOUT_DURATION / 60)

# Default XP Values
DEFAULT_TASK_XP = 50
DEFAULT_QUEST_XP = 100
MAX_QUEST_XP = 1000

# Quest Validation
MIN_QUEST_TITLE_LENGTH = 3
MAX_QUEST_TITLE_LENGTH = 200
MIN_QUEST_DESCRIPTION_LENGTH = 10
MAX_QUEST_DESCRIPTION_LENGTH = 5000

# Pagination
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# AI Tutor Configuration
GEMINI_MODEL = "gemini-2.5-flash-lite"
MAX_TUTOR_TOKENS = 1000
TUTOR_SAFETY_THRESHOLD = 0.7

# Parent Dashboard
PARENT_INVITATION_EXPIRY = 48 * 60 * 60  # 48 hours in seconds
PARENT_FLOW_STATE_DAYS = 7  # Days to check for recent progress

# LMS Integration
LMS_SYNC_BATCH_SIZE = 100
LMS_GRADE_SYNC_MAX_ATTEMPTS = 3
LMS_SESSION_EXPIRY = 60 * 60  # 1 hour in seconds
