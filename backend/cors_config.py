"""
CORS configuration for production and development
Reads from single source of truth in app_config.py
"""
from app_config import Config

from utils.logger import get_logger

logger = get_logger(__name__)

def configure_cors(app):
    """Configure CORS from centralized configuration"""
    from flask_cors import CORS

    # Get CORS configuration from single source
    allowed_origins = Config.ALLOWED_ORIGINS
    cors_config = Config.CORS_CONFIG


    # M6: Five identical {origins, supports_credentials} blocks collapsed into a
    # single regex. Note `/csrf-token` is the only non-wildcard route; the
    # alternation `/api/.*|/portfolio/.*|/spark/.*|/lti/.*|/csrf-token` keeps it
    # as an exact match (a `/csrf-token/anything` path doesn't exist).
    cors_resource_config = {
        "origins": allowed_origins,
        "supports_credentials": cors_config['supports_credentials'],
    }
    CORS(app,
         resources={
             r"/(api|portfolio|spark|lti)/.*": cors_resource_config,
             r"/csrf-token": cors_resource_config,
         },
         allow_headers=cors_config['allow_headers'],
         methods=cors_config['methods'],
         supports_credentials=cors_config['supports_credentials'],
         max_age=cors_config['max_age'])

    return app