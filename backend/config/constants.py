"""
Centralized Constants - Single Source of Truth

All magic numbers, thresholds, and configuration values go here.
This eliminates duplicate constants across the codebase.
"""
from utils.logger import get_logger

logger = get_logger(__name__)


# XP Progression Thresholds
XP_THRESHOLDS = {
    'explorer': 0,
    'builder': 250,
    'creator': 750,
    'scholar': 1500,
    'sage': 3000,
}

# File Upload Limits
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB
ALLOWED_FILE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.pdf', '.mp4', '.doc', '.docx', '.txt', '.webp', '.mov', '.webm', '.mp3', '.wav', '.ogg'}

# Rate Limiting
RATE_LIMITS = {
    'default': {'requests': 60, 'window': 60},  # 60 requests per minute
    'auth': {'requests': 3, 'window': 900},  # 3 per 15 minutes
    'upload': {'requests': 10, 'window': 300},  # 10 per 5 minutes
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
PASSWORD_REQUIREMENTS = {
    'min_length': MIN_PASSWORD_LENGTH,
    'require_uppercase': True,
    'require_lowercase': True,
    'require_digit': True,
    'require_special': True,
}

# Session Configuration
SESSION_TIMEOUT = 24 * 60 * 60  # 24 hours in seconds
REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60  # 7 days in seconds
ACCESS_TOKEN_EXPIRY = 15 * 60  # 15 minutes in seconds

# Account Lockout
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION = 30 * 60  # 30 minutes in seconds

# Default XP Values
DEFAULT_TASK_XP = 50
DEFAULT_QUEST_XP = 100
MAX_QUEST_XP = 1000

# Bonus XP (marked for Phase 2 removal)
COMPLETION_BONUS_MULTIPLIER = 0.5  # 50% bonus for completing all tasks
COLLABORATION_BONUS_MULTIPLIER = 2.0  # 2x bonus (DEPRECATED - to be removed)
BADGE_BONUS_XP = 500  # (DEPRECATED - to be removed)

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
