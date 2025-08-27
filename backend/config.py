"""Application configuration management"""

import os
from dotenv import load_dotenv
from typing import Optional

# Load from current directory's .env file (backend/.env)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

class Config:
    """Base configuration class"""
    
    # Flask Configuration
    SECRET_KEY = os.getenv('FLASK_SECRET_KEY') or os.getenv('SECRET_KEY')
    if not SECRET_KEY or SECRET_KEY == 'dev-secret-key':
        print("WARNING: Using insecure SECRET_KEY. Set FLASK_SECRET_KEY in production!")
        SECRET_KEY = 'dev-secret-key-change-in-production'
    
    # Application Settings
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
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
        'https://www.optioed.org'
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
    
    # Validate Supabase configuration
    if not SUPABASE_URL:
        raise ValueError("SUPABASE_URL is required. Set it in your .env file.")
    if not SUPABASE_ANON_KEY:
        raise ValueError("SUPABASE_ANON_KEY is required. Set it in your .env file.")
    if not SUPABASE_SERVICE_ROLE_KEY:
        print("WARNING: SUPABASE_SERVICE_ROLE_KEY not set. Some admin functions may not work.")
    
    # OpenAI Configuration
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4')
    
    # Google Gemini Configuration
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-pro')
    
    # Stripe Configuration
    STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
    STRIPE_PRICE_ID_MONTHLY = os.getenv('STRIPE_PRICE_ID_MONTHLY')
    STRIPE_PRICE_ID_YEARLY = os.getenv('STRIPE_PRICE_ID_YEARLY')
    
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
    
    # User Settings
    MIN_PASSWORD_LENGTH = 8
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