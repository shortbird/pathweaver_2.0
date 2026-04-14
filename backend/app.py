from flask import Flask, jsonify, request, make_response
from dotenv import load_dotenv
import os
import uuid

# Initialize logging FIRST before any other imports
load_dotenv()
from utils.logger import setup_logging, get_logger
setup_logging()
logger = get_logger(__name__)
logger.info("Starting Optio Backend API - Session persistence test #2")

# Initialize Swagger/OpenAPI documentation
from swagger_config import init_swagger

# M1: All blueprint registration moved to routes/register_all() — failed
# imports now crash startup instead of silently degrading the API surface.
from routes import register_all
from cors_config import configure_cors
from middleware.security import security_middleware
from middleware.error_handler import error_handler
from middleware.memory_monitor import memory_monitor
from middleware.activity_tracker import activity_tracker

# CSRF protection is mandatory in production. In development we still tolerate
# a missing Flask-WTF install so contributors don't hit hard failures before
# their venv is fully provisioned, but a missing module in prod is a hard fail.
try:
    from middleware.csrf_protection import init_csrf, get_csrf_token
    CSRF_AVAILABLE = True
except ImportError as _csrf_import_err:
    if os.environ.get('FLASK_ENV', 'development') == 'production':
        raise ImportError(
            "Flask-WTF is required in production for CSRF protection. "
            "Install it (it is pinned in requirements.txt) and redeploy."
        ) from _csrf_import_err
    CSRF_AVAILABLE = False
    logger.warning("Warning: Flask-WTF not installed. CSRF protection unavailable (development only).")

# Set Flask environment (development or production)
if not os.getenv('FLASK_ENV'):
    os.environ['FLASK_ENV'] = 'development'  # Default to development for local

# Validate configuration before constructing the app — Config.SECRET_KEY raises
# at import time if FLASK_SECRET_KEY is missing/weak/sentinel, which means we
# never bring up Flask with an insecure key (no silent 'dev-secret-key' fallback).
try:
    from app_config import Config
    Config.validate()
except RuntimeError as e:
    logger.error(f"Configuration validation failed: {e}")
    raise

app = Flask(__name__)
app.config['SECRET_KEY'] = Config.SECRET_KEY
app.config['MAX_CONTENT_LENGTH'] = Config.MAX_CONTENT_LENGTH

# Add correlation ID middleware
@app.before_request
def add_correlation_id():
    request.correlation_id = request.headers.get('X-Correlation-ID', str(uuid.uuid4()))

# Configure security middleware
security_middleware.init_app(app)

# Configure CSRF protection for enhanced security
if CSRF_AVAILABLE:
    init_csrf(app)

# Configure CORS with proper settings - MUST come before error handler
configure_cors(app)

# Configure error handling middleware - MUST come after CORS
error_handler.init_app(app)

# Configure memory monitoring
memory_monitor.init_app(app)

# Configure activity tracking middleware
activity_tracker.init_app(app)

# Configure rate limit headers for all responses
from middleware.rate_limiter import add_rate_limit_headers
app.after_request(add_rate_limit_headers)

# Register all route blueprints. This is intentionally one call: failed
# imports inside register_all() will crash startup, which is what we want
# in production. Swagger (below) is the only optional integration.
register_all(app)

@app.route('/', methods=['GET', 'HEAD'])
def root():
    # L2: 204 No Content (was a JSON greeting). The root path on an API host
    # is a liveness probe target — no body needed; saves a few bytes per ping.
    # /api/health is the real DB-backed check.
    return '', 204

@app.route('/api/health')
def health_check():
    """M7: Real health check. Returns 503 (transient unhealthy → LB pulls
    instance out of rotation) when the DB is unreachable, 200 otherwise.
    Helper lives in `health.py` so it's unit-testable without booting the app.
    """
    from health import ping_database
    ok, err = ping_database()
    if ok:
        return jsonify({'status': 'healthy', 'db': 'ok'}), 200
    logger.error(f"[HEALTH] DB ping failed: {err}")
    return jsonify({'status': 'unhealthy', 'db': 'unreachable'}), 503

@app.route('/csrf-token', methods=['GET'])
def get_csrf():
    """Get a CSRF token for the session.

    In production, CSRF must be available — return 500 if it isn't, rather
    than the previous 200 that silently disabled CSRF on the client.
    """
    if CSRF_AVAILABLE:
        token = get_csrf_token()
        return jsonify({'csrf_token': token, 'csrf_enabled': True}), 200

    if os.environ.get('FLASK_ENV', 'development') == 'production':
        logger.error("[CSRF] /csrf-token requested in production but Flask-WTF is unavailable")
        return jsonify({
            'error': 'CSRF protection is unavailable',
            'csrf_enabled': False,
        }), 500

    return jsonify({'csrf_token': None, 'csrf_enabled': False, 'module_available': False}), 200

# Initialize Swagger documentation (must be after all blueprints are registered).
# M2: Gated to non-production environments. /api/docs exposes route signatures
# and schema details that we don't want public on prod; superadmins can run a
# dev/staging instance for API exploration.
if Config.FLASK_ENV != 'production':
    try:
        swagger = init_swagger(app)
        logger.info("Swagger API documentation initialized at /api/docs")
    except ImportError as e:
        logger.warning(f"Warning: Swagger module not available: {e}")
    except (ValueError, AttributeError, KeyError) as e:
        logger.error(f"Error: Swagger configuration error: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Error: Swagger documentation initialization failed: {e}", exc_info=True)
else:
    logger.info("Swagger /api/docs disabled in production (M2)")

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)