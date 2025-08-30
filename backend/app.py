from flask import Flask, jsonify, request, make_response
from dotenv import load_dotenv
import os

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

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max request size

# Configure security middleware
security_middleware.init_app(app)

# Configure CSRF protection (disabled by default for API compatibility)
# Individual routes can enable it as needed
# init_csrf(app)  # Uncomment to enable CSRF globally

# Note: CORS is now handled by the after_request handler below
# Removed Flask-CORS to avoid conflicts

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
    """Root endpoint for health checks"""
    return jsonify({
        'name': 'Optio Quest Platform API',
        'status': 'healthy',
        'version': '3.0',
        'health_check': '/api/health'
    }), 200

@app.route('/api/health')
def health_check():
    return jsonify({'status': 'healthy'}), 200

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

@app.after_request
def after_request(response):
    """Add CORS headers to all responses"""
    origin = request.headers.get('Origin')
    
    # List of allowed origins
    allowed_origins = [
        'https://pathweaver-2-0.vercel.app',
        'https://pathweaver20-production.up.railway.app',
        'https://optioed.org',
        'https://www.optioed.org',
        'https://optioeducation.com',
        'https://www.optioeducation.com',
        'https://optioed.com',
        'https://www.optioed.com'
    ]
    
    # Add FRONTEND_URL from environment if available
    if os.getenv('FRONTEND_URL'):
        allowed_origins.append(os.getenv('FRONTEND_URL'))
    
    # Also allow localhost in development
    if os.getenv('FLASK_ENV', 'production').lower() == 'development':
        allowed_origins.extend([
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'http://127.0.0.1:5173'
        ])
    
    # Debug logging
    print(f"CORS Debug - Origin: {origin}, Path: {request.path}, Method: {request.method}")
    
    # Set CORS headers for allowed origins
    if origin and origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
        response.headers['Access-Control-Max-Age'] = '86400'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        print(f"CORS headers added for {origin}")
    else:
        print(f"CORS headers NOT added - origin {origin} not in allowed list")
    
    return response

# Error handlers are now managed by error_handler middleware

if __name__ == '__main__':
    app.run(debug=True, port=5001)