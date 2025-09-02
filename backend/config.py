"""Application configuration management"""

import os
from dotenv import load_dotenv
from typing import Optional

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
            print("WARNING: Using insecure SECRET_KEY. Set FLASK_SECRET_KEY in production!")
            SECRET_KEY = 'dev-secret-key-change-in-production'
    
    # Ensure minimum length for security
    if len(SECRET_KEY) < 32:
        if FLASK_ENV == 'production':
            raise ValueError("FLASK_SECRET_KEY must be at least 32 characters in production!")
        else:
            print("WARNING: SECRET_KEY is too short. Use at least 32 characters in production!")
    DEBUG = FLASK_ENV == 'development'
    TESTING = False
    
    # API Configuration
    API_VERSION = 'v1'
    API_PREFIX = '/api'
    
    # Security Settings
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max request size
    SESSION_COOKIE_SECURE = FLASK_ENV == 'production'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # CORS Settings
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')
    ALLOWED_ORIGINS = [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://optioed.org',
        'https://www.optioed.org',
        'https://optio-frontend.onrender.com',
        'https://optioeducation.com',
        'https://www.optioeducation.com'
    ]
    
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
    
    # Validate Supabase configuration (only in production)
    if FLASK_ENV == 'production':
        if not SUPABASE_URL:
            raise ValueError("SUPABASE_URL is required. Set it in your environment variables.")
        if not SUPABASE_ANON_KEY:
            raise ValueError("SUPABASE_ANON_KEY is required. Set it in your environment variables.")
        if not SUPABASE_SERVICE_ROLE_KEY:
            print("WARNING: SUPABASE_SERVICE_ROLE_KEY not set. Some admin functions may not work.")
    else:
        # Development mode - just warn
        if not SUPABASE_URL:
            print("WARNING: SUPABASE_URL not set")
        if not SUPABASE_ANON_KEY:
            print("WARNING: SUPABASE_ANON_KEY not set")
    
    # OpenAI Configuration
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4')
    
    # Google Gemini Configuration
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-pro')
    
    # Stripe Configuration
    STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
    
    # Subscription tier price IDs - Monthly
    STRIPE_FREE_PRICE_ID = None  # Free tier has no Stripe price
    STRIPE_SUPPORTED_MONTHLY_PRICE_ID = os.getenv('STRIPE_SUPPORTED_MONTHLY_PRICE_ID', os.getenv('STRIPE_SUPPORTED_PRICE_ID'))  # $39.99/month
    STRIPE_ACADEMY_MONTHLY_PRICE_ID = os.getenv('STRIPE_ACADEMY_MONTHLY_PRICE_ID', os.getenv('STRIPE_ACADEMY_PRICE_ID'))  # $499.99/month
    
    # Subscription tier price IDs - Yearly (with discount)
    STRIPE_SUPPORTED_YEARLY_PRICE_ID = os.getenv('STRIPE_SUPPORTED_YEARLY_PRICE_ID')  # $399.99/year (~17% off)
    STRIPE_ACADEMY_YEARLY_PRICE_ID = os.getenv('STRIPE_ACADEMY_YEARLY_PRICE_ID')  # $4999.99/year (~17% off)
    
    # Legacy price IDs (kept for backwards compatibility)
    STRIPE_PRICE_ID_MONTHLY = os.getenv('STRIPE_PRICE_ID_MONTHLY')
    STRIPE_PRICE_ID_YEARLY = os.getenv('STRIPE_PRICE_ID_YEARLY')
    STRIPE_SUPPORTED_PRICE_ID = STRIPE_SUPPORTED_MONTHLY_PRICE_ID  # Backwards compatibility
    STRIPE_ACADEMY_PRICE_ID = STRIPE_ACADEMY_MONTHLY_PRICE_ID  # Backwards compatibility
    
    # Stripe configuration mapping with billing periods
    STRIPE_TIER_PRICES = {
        'free': {'monthly': None, 'yearly': None},
        'supported': {
            'monthly': STRIPE_SUPPORTED_MONTHLY_PRICE_ID,
            'yearly': STRIPE_SUPPORTED_YEARLY_PRICE_ID
        },
        'academy': {
            'monthly': STRIPE_ACADEMY_MONTHLY_PRICE_ID,
            'yearly': STRIPE_ACADEMY_YEARLY_PRICE_ID
        }
    }
    
    # Tier features and limits
    TIER_FEATURES = {
        'free': {
            'name': 'Free',
            'price_monthly': 0,
            'max_quests': 5,
            'features': ['Basic quest access', 'Public diploma page', 'Community support']
        },
        'supported': {
            'name': 'Supported',
            'price_monthly': 39.99,
            'max_quests': None,  # Unlimited
            'features': ['Unlimited quests', 'Priority support', 'Advanced analytics', 'Custom quest submissions']
        },
        'academy': {
            'name': 'Academy',
            'price_monthly': 499.99,
            'max_quests': None,  # Unlimited
            'features': ['Everything in Supported', '1-on-1 mentorship', 'Custom learning paths', 'Verified certificates']
        }
    }
    
    # Rate Limiting
    RATE_LIMIT_ENABLED = os.getenv('RATE_LIMIT_ENABLED', 'true').lower() == 'true'
    RATE_LIMIT_DEFAULT = os.getenv('RATE_LIMIT_DEFAULT', '100 per hour')
    RATE_LIMIT_STORAGE_URL = os.getenv('REDIS_URL')  # Optional Redis for rate limiting
    
    # Caching
    CACHE_TYPE = os.getenv('CACHE_TYPE', 'simple')
    CACHE_DEFAULT_TIMEOUT = int(os.getenv('CACHE_DEFAULT_TIMEOUT', '300'))
    
    # File Upload Settings
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'mp4', 'mov'}
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB per file
    
    # Quest Settings
    MIN_QUEST_TITLE_LENGTH = 3
    MAX_QUEST_TITLE_LENGTH = 200
    MIN_QUEST_DESCRIPTION_LENGTH = 10
    MAX_QUEST_DESCRIPTION_LENGTH = 5000
    DEFAULT_QUEST_XP = 100
    MAX_QUEST_XP = 1000
    
    # User Settings - Match Supabase requirements
    MIN_PASSWORD_LENGTH = 6  # Supabase requirement
    MAX_PASSWORD_LENGTH = 128
    PASSWORD_REQUIRE_UPPERCASE = True
    PASSWORD_REQUIRE_LOWERCASE = True
    PASSWORD_REQUIRE_NUMBER = True
    PASSWORD_REQUIRE_SPECIAL = False
    
    # Pagination
    DEFAULT_PAGE_SIZE = 20
    MAX_PAGE_SIZE = 100
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO' if DEBUG else 'WARNING')
    LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    
    @classmethod
    def validate_config(cls) -> None:
        """Validate required configuration values"""
        required_fields = [
            'SECRET_KEY',
            'SUPABASE_URL',
            'SUPABASE_ANON_KEY'
        ]
        
        missing = []
        for field in required_fields:
            if not getattr(cls, field, None):
                missing.append(field)
        
        if missing:
            raise ValueError(f"Missing required configuration: {', '.join(missing)}")
    
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