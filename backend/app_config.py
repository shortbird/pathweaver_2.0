"""Application configuration management"""

import os
from dotenv import load_dotenv
from typing import Optional

# NOTE: Cannot import logger here due to circular dependency
# Config is loaded before logging is initialized
# Use print() for startup warnings - logging happens after config is loaded

# Import centralized constants (relative imports for production compatibility)
from config.constants import (
    MAX_FILE_SIZE,
    MAX_CONTENT_LENGTH,
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_LENGTH,
    PASSWORD_REQUIREMENTS,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    DEFAULT_QUEST_XP,
    MAX_QUEST_XP,
    MIN_QUEST_TITLE_LENGTH,
    MAX_QUEST_TITLE_LENGTH,
    MIN_QUEST_DESCRIPTION_LENGTH,
    MAX_QUEST_DESCRIPTION_LENGTH,
    SESSION_TIMEOUT,
    ACCESS_TOKEN_EXPIRY,
    REFRESH_TOKEN_EXPIRY,
    MIN_SECRET_KEY_LENGTH,
    ALLOWED_EXTENSIONS,
)

# Load from current directory's .env file (backend/.env)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

class Config:
    """Base configuration class"""
    
    # Application Settings (define first as it's needed for validation)
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    
    # Flask Configuration
    import secrets
    SECRET_KEY = os.getenv('FLASK_SECRET_KEY') or os.getenv('SECRET_KEY')
    
    # Validate secret key security
    if not SECRET_KEY or SECRET_KEY in ['dev-secret-key', 'your-secret-key', 'dev-secret-key-change-in-production']:
        raise ValueError(
            "FLASK_SECRET_KEY environment variable is required. "
            "Generate a secure key with: python -c 'import secrets; print(secrets.token_hex(32))'"
        )

    # Ensure minimum length for security (from centralized constants)
    if len(SECRET_KEY) < MIN_SECRET_KEY_LENGTH:
        if FLASK_ENV == 'production':
            raise ValueError(f"FLASK_SECRET_KEY must be at least {MIN_SECRET_KEY_LENGTH} characters in production (current: {len(SECRET_KEY)})")
        else:
            # NOTE: print() used here due to circular dependency - logger not available yet
            print(f"[WARNING] FLASK_SECRET_KEY should be at least {MIN_SECRET_KEY_LENGTH} characters for production use (current: {len(SECRET_KEY)})")

    # Check for sufficient entropy (not just repeated characters)
    # Always validate entropy, just warn in dev
    unique_chars = len(set(SECRET_KEY))
    if unique_chars < 16:  # At least 16 different characters
        if FLASK_ENV == 'production':
            raise ValueError(f"FLASK_SECRET_KEY has insufficient entropy ({unique_chars} unique characters, need at least 16)")
        else:
            # NOTE: print() used here due to circular dependency - logger not available yet
            print(f"[WARNING] FLASK_SECRET_KEY has insufficient entropy ({unique_chars} unique characters, need at least 16) - dev only")
    DEBUG = FLASK_ENV == 'development'
    TESTING = False
    
    # API Configuration
    API_VERSION = 'v1'
    API_PREFIX = '/api'
    
    # Security Settings - imported from centralized constants
    MAX_CONTENT_LENGTH = MAX_CONTENT_LENGTH  # From backend.config.constants
    SESSION_COOKIE_SECURE = FLASK_ENV == 'production'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # CORS Configuration - SINGLE SOURCE OF TRUTH
    CORS_CONFIG = {
        'origins': [
            origin.strip()
            for origin in os.getenv('ALLOWED_ORIGINS', '').split(',')
            if origin.strip()
        ] or [
            'https://optio-dev-frontend.onrender.com',
            'https://optio-prod-frontend.onrender.com',
            'https://www.optioeducation.com',
            'https://optioeducation.com',
        ],
        'dev_origins': [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:5000',
        ],
        'methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
        'allow_headers': ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With', 'Cache-Control'],
        'supports_credentials': True,
        'max_age': 3600,
    }

    # Build final ALLOWED_ORIGINS list
    ALLOWED_ORIGINS = CORS_CONFIG['origins'].copy()
    if DEBUG:
        ALLOWED_ORIGINS.extend(CORS_CONFIG['dev_origins'])

    # Legacy FRONTEND_URL (for backward compatibility)
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')
    
    # Supabase Configuration - check multiple possible env var names
    SUPABASE_URL = (
        os.getenv('SUPABASE_URL') or
        os.getenv('VITE_SUPABASE_URL') or
        os.getenv('supabase_url')
    )
    SUPABASE_ANON_KEY = (
        os.getenv('SUPABASE_KEY') or  # Your Railway uses SUPABASE_KEY
        os.getenv('SUPABASE_ANON_KEY') or
        os.getenv('VITE_SUPABASE_ANON_KEY') or
        os.getenv('supabase_anon_key')
    )
    SUPABASE_SERVICE_ROLE_KEY = (
        os.getenv('SUPABASE_SERVICE_KEY') or  # Your Railway uses SUPABASE_SERVICE_KEY
        os.getenv('SUPABASE_SERVICE_ROLE_KEY') or
        os.getenv('supabase_service_role_key')
    )

    # Database Configuration - CONFIGURABLE
    SUPABASE_POOL_SIZE = int(os.getenv('DB_POOL_SIZE', '10'))
    SUPABASE_POOL_TIMEOUT = int(os.getenv('DB_POOL_TIMEOUT', '30'))
    SUPABASE_MAX_OVERFLOW = int(os.getenv('DB_POOL_OVERFLOW', '5'))
    SUPABASE_CONN_LIFETIME = int(os.getenv('DB_CONN_LIFETIME', '3600'))

    # Service Layer Configuration - CONFIGURABLE
    SERVICE_RETRY_ATTEMPTS = int(os.getenv('SERVICE_RETRY_ATTEMPTS', '3'))
    SERVICE_RETRY_DELAY = float(os.getenv('SERVICE_RETRY_DELAY', '0.5'))
    SERVICE_MAX_RETRY_DELAY = float(os.getenv('SERVICE_MAX_RETRY_DELAY', '5.0'))
    
    # Validate Supabase configuration (only in production)
    if FLASK_ENV == 'production':
        if not SUPABASE_URL:
            raise ValueError("SUPABASE_URL is required. Set it in your environment variables.")
        if not SUPABASE_ANON_KEY:
            raise ValueError("SUPABASE_ANON_KEY is required. Set it in your environment variables.")
        if not SUPABASE_SERVICE_ROLE_KEY:
            # NOTE: print() used here due to circular dependency - logger not available yet
            pass
    else:
        # Development mode - just warn (but suppress to reduce log clutter)
        # NOTE: print() used here due to circular dependency - logger not available yet
        pass
    
    # OpenAI Configuration
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4')
    
    # Google Gemini Configuration
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')
    
    # Stripe Configuration
    STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')

    # Rate Limiting - CONFIGURABLE
    RATE_LIMIT_ENABLED = os.getenv('RATE_LIMIT_ENABLED', 'true').lower() == 'true'
    RATE_LIMIT_DEFAULT = os.getenv('RATE_LIMIT_DEFAULT', '100 per hour')
    RATE_LIMIT_STORAGE_URL = os.getenv('REDIS_URL')  # Optional Redis for rate limiting
    RATE_LIMIT_LOGIN_ATTEMPTS = int(os.getenv('RATE_LIMIT_LOGIN_ATTEMPTS', '5'))
    RATE_LIMIT_LOGIN_WINDOW = int(os.getenv('RATE_LIMIT_LOGIN_WINDOW', '900'))  # 15 minutes
    RATE_LIMIT_LOCKOUT_DURATION = int(os.getenv('RATE_LIMIT_LOCKOUT_DURATION', '3600'))  # 1 hour
    
    # Caching
    CACHE_TYPE = os.getenv('CACHE_TYPE', 'simple')
    CACHE_DEFAULT_TIMEOUT = int(os.getenv('CACHE_DEFAULT_TIMEOUT', '300'))
    
    # File Upload Settings - CONFIGURABLE
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
    # ALLOWED_EXTENSIONS imported from config.constants
    # MAX_FILE_SIZE imported from config.constants (10MB)
    MAX_UPLOAD_SIZE = int(os.getenv('MAX_UPLOAD_SIZE', str(10 * 1024 * 1024)))  # 10MB default
    ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.mp4', '.mov']

    # Quest Settings - imported from centralized constants
    # MIN_QUEST_TITLE_LENGTH, MAX_QUEST_TITLE_LENGTH imported from config.constants
    # MIN_QUEST_DESCRIPTION_LENGTH, MAX_QUEST_DESCRIPTION_LENGTH imported from config.constants
    # DEFAULT_QUEST_XP, MAX_QUEST_XP imported from config.constants

    # User Settings - Strong password policy - imported from centralized constants
    # MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH imported from config.constants
    PASSWORD_REQUIRE_UPPERCASE = PASSWORD_REQUIREMENTS['require_uppercase']
    PASSWORD_REQUIRE_LOWERCASE = PASSWORD_REQUIREMENTS['require_lowercase']
    PASSWORD_REQUIRE_NUMBER = PASSWORD_REQUIREMENTS['require_digit']
    PASSWORD_REQUIRE_SPECIAL = PASSWORD_REQUIREMENTS['require_special']

    # Pagination - imported from centralized constants
    DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE  # From backend.config.constants
    MAX_PAGE_SIZE = MAX_PAGE_SIZE  # From backend.config.constants

    # API Configuration - CONFIGURABLE
    API_TIMEOUT = int(os.getenv('API_TIMEOUT', '30'))
    PEXELS_API_TIMEOUT = int(os.getenv('PEXELS_API_TIMEOUT', '5'))
    LTI_JWKS_TIMEOUT = int(os.getenv('LTI_JWKS_TIMEOUT', '5'))

    # Logging - CONFIGURABLE
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'WARNING')
    LOG_FORMAT = os.getenv('LOG_FORMAT', 'json')  # 'json' or 'text'

    # Platform Superadmin - SINGLE platform-wide admin
    SUPERADMIN_EMAIL = os.getenv('SUPERADMIN_EMAIL')
    if not SUPERADMIN_EMAIL and FLASK_ENV == 'production':
        raise ValueError("SUPERADMIN_EMAIL must be set in production")

    # Web Push Notifications (VAPID)
    VAPID_PUBLIC_KEY = os.getenv('VAPID_PUBLIC_KEY')
    VAPID_PRIVATE_KEY = os.getenv('VAPID_PRIVATE_KEY')
    VAPID_MAILTO = os.getenv('VAPID_MAILTO', 'mailto:support@optioeducation.com')

    @classmethod
    def validate(cls) -> None:
        """Validate required configuration on startup"""
        required_vars = [
            ('SUPABASE_URL', cls.SUPABASE_URL),
            ('SUPABASE_ANON_KEY', cls.SUPABASE_ANON_KEY),
            ('SUPABASE_SERVICE_KEY', cls.SUPABASE_SERVICE_ROLE_KEY),
        ]

        missing_vars = [name for name, value in required_vars if not value]

        if missing_vars:
            raise RuntimeError(
                f"Missing required environment variables: {', '.join(missing_vars)}\n"
                f"Set these in your .env file or environment"
            )

        # Production-specific validations
        if cls.FLASK_ENV == 'production':
            if cls.SECRET_KEY == 'dev-secret-key-CHANGE-IN-PRODUCTION':
                raise RuntimeError("FLASK_SECRET_KEY must be set in production")

            # Use centralized constant
            if len(cls.SECRET_KEY) < MIN_SECRET_KEY_LENGTH:
                raise RuntimeError(f"FLASK_SECRET_KEY must be at least {MIN_SECRET_KEY_LENGTH} characters (current: {len(cls.SECRET_KEY)})")

            # Check for sufficient entropy
            unique_chars = len(set(cls.SECRET_KEY))
            if unique_chars < 16:
                raise RuntimeError(f"FLASK_SECRET_KEY has insufficient entropy ({unique_chars} unique characters, need at least 16)")

    @classmethod
    def validate_config(cls) -> None:
        """Alias for validate() - backward compatibility"""
        return cls.validate()
    
    @classmethod
    def get_database_url(cls) -> Optional[str]:
        """Get database URL for direct database connections if needed"""
        return os.getenv('DATABASE_URL')
    
    @classmethod
    def is_production(cls) -> bool:
        """Check if running in production environment"""
        return cls.FLASK_ENV == 'production'
    
    @classmethod
    def is_development(cls) -> bool:
        """Check if running in development environment"""
        return cls.FLASK_ENV == 'development'

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False
    
class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
    SESSION_COOKIE_SECURE = True
    
class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    
# Configuration mapping
config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig
}

# Get configuration based on environment
def get_config():
    """Get configuration object based on environment"""
    env = os.getenv('FLASK_ENV', 'development')
    return config_map.get(env, DevelopmentConfig)