"""Application configuration management"""

import os
from dotenv import load_dotenv
from typing import Optional

from utils.logger import get_logger

logger = get_logger(__name__)

# Import centralized constants (relative imports for production compatibility)
from config.constants import (
    MAX_FILE_SIZE,
    MAX_CONTENT_LENGTH,
    MIN_PASSWORD_LENGTH,
    PASSWORD_REQUIREMENTS,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    DEFAULT_QUEST_XP,
    MAX_QUEST_XP,
    SESSION_TIMEOUT,
    ACCESS_TOKEN_EXPIRY,
    REFRESH_TOKEN_EXPIRY,
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
        if FLASK_ENV == 'production':
            raise ValueError("FLASK_SECRET_KEY must be set to a secure value in production!")
        else:
            logger.warning("WARNING: Using insecure SECRET_KEY. Set FLASK_SECRET_KEY in production!")
            SECRET_KEY = 'dev-secret-key-change-in-production'
    
    # Ensure minimum length for security
    if len(SECRET_KEY) < 32:
        if FLASK_ENV == 'production':
            raise ValueError("FLASK_SECRET_KEY must be at least 32 characters in production!")
        else:
            logger.warning("WARNING: SECRET_KEY is too short. Use at least 32 characters in production!")
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
            logger.warning("WARNING: SUPABASE_SERVICE_ROLE_KEY not set. Some admin functions may not work.")
    else:
        # Development mode - just warn
        if not SUPABASE_URL:
            logger.warning("WARNING: SUPABASE_URL not set")
        if not SUPABASE_ANON_KEY:
            logger.warning("WARNING: SUPABASE_ANON_KEY not set")
    
    # OpenAI Configuration
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4')
    
    # Google Gemini Configuration
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')
    
    # Stripe Configuration
    STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
    
    # Subscription tier price IDs - Monthly only (no yearly billing)
    STRIPE_FREE_PRICE_ID = None  # Free tier has no Stripe price
    STRIPE_PARENT_SUPPORTED_PRICE_ID = os.getenv('STRIPE_PARENT_SUPPORTED_MONTHLY_PRICE_ID', os.getenv('STRIPE_ACCELERATE_MONTHLY_PRICE_ID'))  # $50/month
    STRIPE_WEEKLY_PRICE_ID = os.getenv('STRIPE_WEEKLY_MONTHLY_PRICE_ID', os.getenv('STRIPE_ACHIEVE_MONTHLY_PRICE_ID'))  # $300/month
    STRIPE_DAILY_PRICE_ID = os.getenv('STRIPE_DAILY_MONTHLY_PRICE_ID', os.getenv('STRIPE_EXCEL_MONTHLY_PRICE_ID'))  # $600/month

    # Stripe configuration mapping (monthly only)
    STRIPE_TIER_PRICES = {
        'Free': None,
        'Parent Supported': STRIPE_PARENT_SUPPORTED_PRICE_ID,
        'Weekly': STRIPE_WEEKLY_PRICE_ID,
        'Daily': STRIPE_DAILY_PRICE_ID
    }

    # Tier features and limits (NOTE: Frontend uses database subscription_tiers as single source of truth)
    TIER_FEATURES = {
        'Free': {
            'name': 'Free',
            'price_monthly': 0,
            'max_quests': None,  # Unlimited
            'features': ['Quest library access', 'Portfolio tracking', 'Quest customization']
        },
        'Parent Supported': {
            'name': 'Parent Supported',
            'price_monthly': 50.00,
            'max_quests': None,  # Unlimited
            'features': ['Everything in Free', 'Badge library', 'Advanced parent tools', 'Priority support']
        },
        'Weekly': {
            'name': 'Weekly',
            'price_monthly': 300.00,
            'max_quests': None,  # Unlimited
            'features': ['Everything in Parent Supported', 'Weekly educator check-ins', 'Quarterly strategy sessions']
        },
        'Daily': {
            'name': 'Daily',
            'price_monthly': 600.00,
            'max_quests': None,  # Unlimited
            'features': ['Everything in Weekly', 'Daily educator availability', 'Near-immediate support']
        }
    }
    
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
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'mp4', 'mov'}
    MAX_FILE_SIZE = MAX_FILE_SIZE  # From backend.config.constants (10MB)
    MAX_UPLOAD_SIZE = int(os.getenv('MAX_UPLOAD_SIZE', str(10 * 1024 * 1024)))  # 10MB default
    ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.mp4', '.mov']
    
    # Quest Settings
    MIN_QUEST_TITLE_LENGTH = 3
    MAX_QUEST_TITLE_LENGTH = 200
    MIN_QUEST_DESCRIPTION_LENGTH = 10
    MAX_QUEST_DESCRIPTION_LENGTH = 5000
    DEFAULT_QUEST_XP = DEFAULT_QUEST_XP  # From backend.config.constants
    MAX_QUEST_XP = MAX_QUEST_XP  # From backend.config.constants
    
    # User Settings - Strong password policy - imported from centralized constants
    MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH  # From backend.config.constants (12 chars)
    MAX_PASSWORD_LENGTH = 128
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
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO' if DEBUG else 'WARNING')
    LOG_FORMAT = os.getenv('LOG_FORMAT', 'json')  # 'json' or 'text'
    
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

            if len(cls.SECRET_KEY) < 32:
                raise RuntimeError("FLASK_SECRET_KEY must be at least 32 characters")

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