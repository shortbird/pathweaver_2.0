"""
Updated configuration for Render PostgreSQL database
Replace backend/config.py with this after migration
"""

import os
from datetime import timedelta

class Config:
    """Configuration for Render-hosted PostgreSQL"""
    
    # Database Configuration - Render PostgreSQL
    DATABASE_URL = os.environ.get('DATABASE_URL')  # Render provides this automatically
    
    # Parse DATABASE_URL for individual components if needed
    if DATABASE_URL:
        import urllib.parse
        result = urllib.parse.urlparse(DATABASE_URL)
        DATABASE_HOST = result.hostname
        DATABASE_PORT = result.port
        DATABASE_NAME = result.path[1:]  # Remove leading '/'
        DATABASE_USER = result.username
        DATABASE_PASSWORD = result.password
    else:
        # Fallback for local development
        DATABASE_HOST = os.environ.get('DB_HOST', 'localhost')
        DATABASE_PORT = os.environ.get('DB_PORT', 5432)
        DATABASE_NAME = os.environ.get('DB_NAME', 'optio_db')
        DATABASE_USER = os.environ.get('DB_USER', 'postgres')
        DATABASE_PASSWORD = os.environ.get('DB_PASSWORD', '')
    
    # Application Configuration
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')
    DEBUG = os.environ.get('FLASK_ENV') == 'development'
    
    # JWT Configuration
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', SECRET_KEY)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    
    # CORS Configuration
    FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://optioeducation.com')
    CORS_ORIGINS = [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000']
    
    # File Upload Configuration
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB max file size
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', '/tmp/uploads')
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'mp4', 'mov'}
    
    # External Services
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
    STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY')
    STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')
    
    # Rate Limiting
    RATELIMIT_STORAGE_URL = os.environ.get('REDIS_URL', 'memory://')
    RATELIMIT_DEFAULT = "100 per hour"
    
    # Session Configuration
    SESSION_TYPE = 'filesystem'
    SESSION_FILE_DIR = '/tmp/flask_session'
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    
    # Security
    BCRYPT_LOG_ROUNDS = 12
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None
    
    @classmethod
    def get_database_uri(cls):
        """Get the database URI for SQLAlchemy"""
        if cls.DATABASE_URL:
            # Render uses postgresql:// but SQLAlchemy needs postgresql+psycopg2://
            if cls.DATABASE_URL.startswith('postgres://'):
                return cls.DATABASE_URL.replace('postgres://', 'postgresql+psycopg2://')
            return cls.DATABASE_URL
        else:
            return f'postgresql+psycopg2://{cls.DATABASE_USER}:{cls.DATABASE_PASSWORD}@{cls.DATABASE_HOST}:{cls.DATABASE_PORT}/{cls.DATABASE_NAME}'
    
    @classmethod
    def init_app(cls, app):
        """Initialize application with configuration"""
        # Set all config values
        for key in dir(cls):
            if key.isupper():
                app.config[key] = getattr(cls, key)
        
        # Set SQLAlchemy URI
        app.config['SQLALCHEMY_DATABASE_URI'] = cls.get_database_uri()
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        
        # Ensure upload folder exists
        os.makedirs(cls.UPLOAD_FOLDER, exist_ok=True)
        
        # Configure logging for production
        if not cls.DEBUG:
            import logging
            from logging.handlers import RotatingFileHandler
            
            if not os.path.exists('logs'):
                os.mkdir('logs')
                
            file_handler = RotatingFileHandler('logs/optio.log', maxBytes=10240000, backupCount=10)
            file_handler.setFormatter(logging.Formatter(
                '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
            ))
            file_handler.setLevel(logging.INFO)
            app.logger.addHandler(file_handler)
            app.logger.setLevel(logging.INFO)
            app.logger.info('Optio startup')

# Development configuration
class DevelopmentConfig(Config):
    DEBUG = True
    TESTING = False

# Production configuration
class ProductionConfig(Config):
    DEBUG = False
    TESTING = False

# Testing configuration
class TestingConfig(Config):
    TESTING = True
    DATABASE_NAME = 'optio_test'

# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': ProductionConfig if os.environ.get('RENDER') else DevelopmentConfig
}