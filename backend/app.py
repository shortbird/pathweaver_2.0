from flask import Flask, jsonify, request, make_response
from dotenv import load_dotenv
import os

from routes import auth, subscriptions, users, community, portfolio, sources
from routes.quest_ideas import quest_ideas_bp
from routes.ratings import ratings_bp
from routes import uploads
from routes.settings import settings_bp
from routes.promo import promo_bp

# Import routes
from routes import quests, tasks, collaborations, admin_core, quest_sources, evidence_documents
from routes.admin import user_management, quest_management, quest_ideas, quest_sources as admin_quest_sources, analytics
from cors_config import configure_cors
from middleware.security import security_middleware
from middleware.error_handler import error_handler
from middleware.memory_monitor import memory_monitor

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
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB max request size (matches upload limit)

# Configure security middleware
security_middleware.init_app(app)

# Configure CSRF protection for enhanced security
if CSRF_AVAILABLE:
    init_csrf(app)
    print("CSRF protection enabled")

# Configure CORS with proper settings - MUST come before error handler
configure_cors(app)

# Configure error handling middleware - MUST come after CORS
error_handler.init_app(app)

# Configure memory monitoring
memory_monitor.init_app(app)

# Register existing routes
app.register_blueprint(auth.bp, url_prefix='/api/auth')
app.register_blueprint(subscriptions.bp, url_prefix='/api/subscriptions')
app.register_blueprint(users.bp, url_prefix='/api/users')
# Also register users blueprint under v3 for compatibility with unique name
app.register_blueprint(users.bp, url_prefix='/api/v3/users', name='users_v3')
app.register_blueprint(community.bp, url_prefix='/api/community')
app.register_blueprint(portfolio.bp, url_prefix='/api/portfolio')
app.register_blueprint(quest_ideas_bp, url_prefix='/api')
app.register_blueprint(ratings_bp)
app.register_blueprint(uploads.bp, url_prefix='/api/uploads')
app.register_blueprint(sources.bp, url_prefix='/api/sources')  # /api/sources
app.register_blueprint(settings_bp, url_prefix='/api')  # /api/settings
app.register_blueprint(promo_bp, url_prefix='/api/promo')  # /api/promo

# Register routes
app.register_blueprint(quests.bp)  # /api/quests (blueprint has url_prefix='/api/quests')
app.register_blueprint(tasks.bp)      # /api/tasks (blueprint has url_prefix='/api/tasks')
app.register_blueprint(evidence_documents.bp)  # /api/evidence (blueprint has url_prefix='/api/evidence')
app.register_blueprint(admin_core.bp)   # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(user_management.bp)  # /api/v3/admin (blueprint has url_prefix='/api/v3/admin')
app.register_blueprint(quest_management.bp)  # /api/v3/admin (blueprint has url_prefix='/api/v3/admin')
app.register_blueprint(quest_ideas.bp)  # /api/v3/admin (blueprint has url_prefix='/api/v3/admin')
app.register_blueprint(admin_quest_sources.bp)  # /api/v3/admin (blueprint has url_prefix='/api/v3/admin')
app.register_blueprint(analytics.bp)  # /api/v3/admin/analytics (blueprint has url_prefix='/api/v3/admin/analytics')
app.register_blueprint(quest_sources.bp)  # /api/v3/admin/quest-sources (blueprint has url_prefix='/api/v3/admin/quest-sources')
app.register_blueprint(collaborations.bp)  # /api/collaborations (blueprint has url_prefix='/api/collaborations')
# Conditionally import and register Quest AI blueprint
try:
    from routes import quest_ai
    app.register_blueprint(quest_ai.bp)  # /api/v3/quest-ai
    print("Quest AI routes registered successfully")
except Exception as e:
    print(f"Warning: Quest AI routes not available: {e}")

# Register AI Tutor blueprint
try:
    from routes import tutor
    app.register_blueprint(tutor.bp)  # /api/tutor
    print("AI Tutor routes registered successfully")
except Exception as e:
    print(f"Warning: AI Tutor routes not available: {e}")

# Register Badge System blueprints
try:
    from routes import badges, credits, ai_content
    app.register_blueprint(badges.bp)  # /api/badges
    app.register_blueprint(credits.bp)  # /api/credits
    app.register_blueprint(ai_content.bp)  # /api/v3/ai-generation
    print("Badge system routes registered successfully")
except Exception as e:
    print(f"Warning: Badge system routes not available: {e}")

# Register Parental Consent blueprint (COPPA compliance)
try:
    from routes import parental_consent
    app.register_blueprint(parental_consent.bp, url_prefix='/api/auth')  # /api/auth/parental-consent
    print("Parental Consent routes registered successfully")
except Exception as e:
    print(f"Warning: Parental Consent routes not available: {e}")

# Register Account Deletion blueprint (GDPR/CCPA compliance)
try:
    from routes import account_deletion
    app.register_blueprint(account_deletion.bp, url_prefix='/api')  # /api/users/delete-account
    print("Account Deletion routes registered successfully")
except Exception as e:
    print(f"Warning: Account Deletion routes not available: {e}")


@app.route('/', methods=['GET', 'HEAD'])
def root():
    return jsonify({'message': 'Optio API Server', 'status': 'running'}), 200

@app.route('/api/health')
def health_check():
    return jsonify({'status': 'healthy'}), 200

@app.route('/csrf-token', methods=['GET'])
def get_csrf():
    """
    Get a CSRF token for the session.
    """
    if CSRF_AVAILABLE:
        token = get_csrf_token()
        return jsonify({'csrf_token': token, 'csrf_enabled': True}), 200
    else:
        # CSRF module not installed
        return jsonify({'csrf_token': None, 'csrf_enabled': False, 'module_available': False}), 200

@app.route('/test-config')
def test_config():
    """Test endpoint to verify configuration"""
    from config import Config
    
    config_status = {
        'has_supabase_url': bool(Config.SUPABASE_URL),
        'has_supabase_anon_key': bool(Config.SUPABASE_ANON_KEY),
        'has_supabase_service_key': bool(Config.SUPABASE_SERVICE_ROLE_KEY),
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

@app.route('/debug-user-tier/<user_id>')
def debug_user_tier(user_id):
    """Debug endpoint to check user's subscription tier"""
    try:
        from database import get_supabase_client
        supabase = get_supabase_client()
        
        user = supabase.table('users').select('subscription_tier, first_name, last_name').eq('id', user_id).execute()
        
        if not user.data:
            return jsonify({'error': 'User not found'}), 404
        
        user_data = user.data[0]
        tier = user_data.get('subscription_tier', 'free')
        allowed_tiers = ['supported', 'academy', 'creator', 'visionary', 'enterprise']
        
        return jsonify({
            'user_id': user_id,
            'name': f"{user_data.get('first_name')} {user_data.get('last_name')}",
            'subscription_tier': tier,
            'allowed_tiers': allowed_tiers,
            'tier_allowed': tier in allowed_tiers,
            'is_enterprise': tier == 'enterprise'
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.after_request
def after_request(response):
    """Ensure CORS headers are set correctly for withCredentials"""
    origin = request.headers.get('Origin')

    # List of allowed origins
    allowed_origins = [
        'https://optio-dev-frontend.onrender.com',
        'https://optio-prod-frontend.onrender.com',
        'https://www.optioeducation.com',
        'https://optioeducation.com',
        'http://localhost:3000',
        'http://localhost:5173'
    ]

    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, Cache-Control'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD'

    return response

# Error handlers are now managed by error_handler middleware

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)