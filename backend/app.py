from flask import Flask, jsonify, request, make_response
from dotenv import load_dotenv
import os
from datetime import datetime

from routes import auth, quests, subscriptions, users, admin, community, portfolio, learning_log, sources
from routes.quest_ideas import quest_ideas_bp
from routes.ratings import ratings_bp
from routes import uploads
from routes.settings import settings_bp

# Import V3 routes
from routes import quests_v3, tasks, collaborations, learning_logs_v3, admin_v3

from middleware.security import security_middleware
from middleware.error_handler import error_handler

# Optional CSRF protection (not critical for JWT-based auth)
try:
    from middleware.csrf_protection import init_csrf, get_csrf_token
    CSRF_AVAILABLE = True
except ImportError:
    CSRF_AVAILABLE = False
    print("Warning: Flask-WTF not installed. CSRF protection unavailable.")

load_dotenv()

# Set Flask environment (development or production)
if not os.getenv('FLASK_ENV'):
    os.environ['FLASK_ENV'] = 'development'  # Default to development for local

# Import config and validate early
try:
    from config import Config
    print(f"[STARTUP] Loading configuration...")
    print(f"[STARTUP] SUPABASE_URL configured: {bool(Config.SUPABASE_URL and Config.SUPABASE_URL != 'https://placeholder.supabase.co')}")
    print(f"[STARTUP] SUPABASE_KEY configured: {bool(Config.SUPABASE_ANON_KEY and Config.SUPABASE_ANON_KEY != 'placeholder-key')}")
    print(f"[STARTUP] Running on port: {os.getenv('PORT', '5001')}")
except Exception as e:
    print(f"[STARTUP ERROR] Failed to load config: {e}")
    import traceback
    traceback.print_exc()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max request size

# Define allowed origins for CORS
ALLOWED_ORIGINS = [
    'https://pathweaver-2-0.vercel.app',
    'https://pathweaver20-production.up.railway.app',
    'https://optioed.org',
    'https://www.optioed.org',
    'https://optioeducation.com',
    'https://www.optioeducation.com',
    'https://optioed.com',
    'https://www.optioed.com'
]

# Add environment-specific origins
if os.getenv('FRONTEND_URL'):
    frontend_url = os.getenv('FRONTEND_URL')
    if frontend_url not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(frontend_url)
    # Also add www version if it's not already there
    if frontend_url.startswith('https://') and not frontend_url.startswith('https://www.'):
        www_version = frontend_url.replace('https://', 'https://www.')
        if www_version not in ALLOWED_ORIGINS:
            ALLOWED_ORIGINS.append(www_version)

# Add localhost in development
if os.getenv('FLASK_ENV', 'production').lower() == 'development':
    ALLOWED_ORIGINS.extend([
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3002',
        'http://127.0.0.1:3003',
        'http://127.0.0.1:5173'
    ])

# Remove duplicates while preserving order
ALLOWED_ORIGINS = list(dict.fromkeys(ALLOWED_ORIGINS))

# Startup diagnostics
print("=" * 60)
print("APP STARTUP DIAGNOSTICS")
print("=" * 60)
print(f"CORS: Total allowed origins: {len(ALLOWED_ORIGINS)}")
print(f"CORS: Allowed origins: {ALLOWED_ORIGINS}")
print(f"CORS: www.optioeducation.com in list: {'https://www.optioeducation.com' in ALLOWED_ORIGINS}")
print(f"PORT from environment: {os.getenv('PORT', 'Not set')}")
print(f"Railway environment: {os.getenv('RAILWAY_ENVIRONMENT', 'Not on Railway')}")
print(f"Railway static URL: {os.getenv('RAILWAY_STATIC_URL', 'Not set')}")
print(f"Frontend URL: {os.getenv('FRONTEND_URL', 'Not set')}")
print(f"Supabase configured: {'SUPABASE_URL' in os.environ}")
print("=" * 60)

# Handle ALL requests - add CORS headers to everything
@app.before_request
def handle_cors_preflight():
    """Handle CORS for all requests including preflight"""
    origin = request.headers.get('Origin')
    print(f"[BEFORE_REQUEST] Method: {request.method}, Path: {request.path}, Origin: {origin}")
    
    # For OPTIONS requests, ALWAYS return with CORS headers for our domains
    if request.method == 'OPTIONS':
        response = make_response()
        
        # Force CORS for our production domains
        if origin and ('optioeducation.com' in origin or 'optioed.org' in origin or 'optioed.com' in origin):
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
            response.headers['Access-Control-Max-Age'] = '86400'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            print(f"[OPTIONS] CORS headers FORCED for {origin}")
        elif origin in ALLOWED_ORIGINS:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
            response.headers['Access-Control-Max-Age'] = '86400'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            print(f"[OPTIONS] CORS headers added for {origin}")
        else:
            print(f"[OPTIONS] Origin {origin} not allowed")
        return response

# Add CORS headers to all responses
@app.after_request
def add_cors_headers(response):
    """Add CORS headers to all responses"""
    origin = request.headers.get('Origin')
    
    # FORCE CORS for our production domains - don't rely on list checking
    if origin and ('optioeducation.com' in origin or 'optioed.org' in origin or 'optioed.com' in origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
        response.headers['Access-Control-Max-Age'] = '86400'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        print(f"CORS: Headers FORCED for domain: {origin}")
    elif origin in ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
        response.headers['Access-Control-Max-Age'] = '86400'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        print(f"CORS: Headers added for: {origin}")
    else:
        print(f"CORS: No headers - origin '{origin}' not recognized")
    
    return response

# CORS must be configured FIRST, before any other middleware
# This ensures CORS headers are added before any potential errors

# Configure security middleware AFTER CORS handlers are registered
security_middleware.init_app(app)

# Configure CSRF protection (disabled by default for API compatibility)
# Individual routes can enable it as needed
# init_csrf(app)  # Uncomment to enable CSRF globally

# Configure error handling middleware
error_handler.init_app(app)

# Register existing routes (will be deprecated)
app.register_blueprint(auth.bp, url_prefix='/api/auth')
app.register_blueprint(quests.bp, url_prefix='/api/quests')
app.register_blueprint(subscriptions.bp, url_prefix='/api/subscriptions')
app.register_blueprint(users.bp, url_prefix='/api/users')
app.register_blueprint(admin.bp, url_prefix='/api/admin')
app.register_blueprint(community.bp, url_prefix='/api/community')
app.register_blueprint(portfolio.bp, url_prefix='/api/portfolio')
app.register_blueprint(learning_log.bp, url_prefix='/api')
app.register_blueprint(quest_ideas_bp)
app.register_blueprint(ratings_bp)
app.register_blueprint(uploads.bp, url_prefix='/api/uploads')
app.register_blueprint(sources.bp)  # /api/sources
app.register_blueprint(settings_bp)  # /api/settings

# Register V3 routes
app.register_blueprint(quests_v3.bp)  # /api/v3/quests
app.register_blueprint(tasks.bp)      # /api/v3/tasks
app.register_blueprint(admin_v3.bp)   # /api/v3/admin
app.register_blueprint(collaborations.bp)  # /api/v3/collaborations
app.register_blueprint(learning_logs_v3.bp)  # /api/v3/logs

@app.route('/')
def root():
    """Root endpoint for health checks and deployment info"""
    origin = request.headers.get('Origin')
    return jsonify({
        'name': 'Optio Quest Platform API',
        'status': 'healthy',
        'version': '3.0',
        'health_check': '/api/health',
        'deployment': {
            'railway': 'RAILWAY_ENVIRONMENT' in os.environ,
            'port': os.getenv('PORT', 'not set'),
            'cors_test': '/api/cors-test',
            'request_origin': origin,
            'cors_configured': origin in ALLOWED_ORIGINS if origin else False
        },
        'timestamp': datetime.utcnow().isoformat()
    }), 200

@app.route('/api/health')
def health_check():
    """Simple health check endpoint that Railway will hit"""
    try:
        from config import Config
        has_supabase = bool(Config.SUPABASE_URL and Config.SUPABASE_URL != 'https://placeholder.supabase.co')
        has_key = bool(Config.SUPABASE_ANON_KEY and Config.SUPABASE_ANON_KEY != 'placeholder-key')
        
        health_status = {
            'status': 'healthy' if (has_supabase and has_key) else 'degraded',
            'timestamp': datetime.utcnow().isoformat(),
            'supabase_configured': has_supabase and has_key
        }
        
        print(f"[HEALTH CHECK] {health_status}")
        return jsonify(health_status), 200
    except Exception as e:
        print(f"[HEALTH CHECK ERROR] {str(e)}")
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 503

@app.route('/api/cors-test')
def cors_test():
    """Simple endpoint to test CORS"""
    origin = request.headers.get('Origin')
    return jsonify({
        'message': 'CORS test successful',
        'origin_received': origin,
        'cors_configured': True,
        'timestamp': datetime.utcnow().isoformat()
    }), 200

@app.route('/api/csrf-token', methods=['GET'])
def get_csrf():
    """
    Get a CSRF token for the session.
    Note: CSRF protection is currently disabled by default for API compatibility.
    This endpoint is provided for future use when CSRF is enabled.
    """
    if CSRF_AVAILABLE:
        # If CSRF is available but disabled, return status
        return jsonify({'csrf_token': None, 'csrf_enabled': False}), 200
    else:
        # CSRF module not installed
        return jsonify({'csrf_token': None, 'csrf_enabled': False, 'module_available': False}), 200

@app.route('/api/test-config')
def test_config():
    """Test endpoint to verify configuration"""
    from config import Config
    
    config_status = {
        'has_supabase_url': bool(Config.SUPABASE_URL),
        'has_supabase_key': bool(Config.SUPABASE_KEY),
        'has_supabase_service_key': bool(Config.SUPABASE_SERVICE_KEY),
        'has_stripe_key': bool(Config.STRIPE_SECRET_KEY),
        'frontend_url': Config.FRONTEND_URL,
        'supabase_url': Config.SUPABASE_URL[:30] + '...' if Config.SUPABASE_URL else None
    }
    
    # Try to connect to Supabase
    try:
        from database import get_supabase_client
        client = get_supabase_client()
        config_status['supabase_connection'] = 'success'
    except Exception as e:
        config_status['supabase_connection'] = f'failed: {str(e)}'
    
    return jsonify(config_status), 200

# CORS has been configured at app initialization

# Error handlers are now managed by error_handler middleware

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    print(f"[STARTUP] Starting Flask app on port {port}")
    app.run(debug=True, port=port, host='0.0.0.0')