"""
CORS configuration for production and development
Reads from single source of truth in config.py
"""
from backend.config import Config

def configure_cors(app):
    """Configure CORS from centralized configuration"""
    from flask_cors import CORS

    # Get CORS configuration from single source
    allowed_origins = Config.ALLOWED_ORIGINS
    cors_config = Config.CORS_CONFIG

    print(f"CORS Configuration - Environment: {'Development' if Config.DEBUG else 'Production'}")
    print(f"Allowed origins: {allowed_origins}")

    CORS(app,
         resources={
             r"/api/*": {
                 "origins": allowed_origins,
                 "supports_credentials": cors_config['supports_credentials']
             },
             r"/portfolio/*": {
                 "origins": allowed_origins,
                 "supports_credentials": cors_config['supports_credentials']
             },
             r"/csrf-token": {
                 "origins": allowed_origins,
                 "supports_credentials": cors_config['supports_credentials']
             }
         },
         allow_headers=cors_config['allow_headers'],
         methods=cors_config['methods'],
         supports_credentials=cors_config['supports_credentials'],
         max_age=cors_config['max_age'])

    return app