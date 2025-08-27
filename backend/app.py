from flask import Flask, jsonify, request, make_response
from dotenv import load_dotenv
import os

from routes import auth, quests, subscriptions, users, admin, community, portfolio, learning_log
from routes.quest_ideas import quest_ideas_bp
from routes.ratings import ratings_bp
from routes import uploads

# Import V3 routes
from routes import quests_v3, tasks, collaborations, learning_logs_v3, admin_v3
from cors_config import configure_cors
from middleware.security import security_middleware
from middleware.error_handler import error_handler

load_dotenv()

# Set Flask environment (development or production)
if not os.getenv('FLASK_ENV'):
    os.environ['FLASK_ENV'] = 'development'  # Default to development for local

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max request size

# Configure security middleware
security_middleware.init_app(app)

# Configure error handling middleware
error_handler.init_app(app)

# Configure CORS with proper settings
configure_cors(app)

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

# Register V3 routes
app.register_blueprint(quests_v3.bp)  # /api/v3/quests
app.register_blueprint(tasks.bp)      # /api/v3/tasks
app.register_blueprint(admin_v3.bp)   # /api/v3/admin
app.register_blueprint(collaborations.bp)  # /api/v3/collaborations
app.register_blueprint(learning_logs_v3.bp)  # /api/v3/logs

@app.route('/api/health')
def health_check():
    return jsonify({'status': 'healthy'}), 200

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

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add('Access-Control-Allow-Headers', "*")
        response.headers.add('Access-Control-Allow-Methods', "*")
        return response

# Error handlers are now managed by error_handler middleware

if __name__ == '__main__':
    app.run(debug=True, port=5001)