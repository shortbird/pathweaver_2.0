"""
Clean Flask application for production deployment
Optio Quest Platform Backend - Rebuilt for production stability
"""

from flask import Flask, jsonify, request
from dotenv import load_dotenv
import os
import logging

# Load environment variables
load_dotenv()

# Configure logging for production
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)

# Basic configuration
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', os.getenv('SECRET_KEY', 'fallback-secret'))
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB

# Import and configure CORS
from cors_production import configure_cors
configure_cors(app)

# Import database configuration
from database_production import get_supabase_client, get_supabase_admin_client

# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    """Production health check endpoint"""
    try:
        # Test database connection
        supabase = get_supabase_client()
        # Simple query to verify connection
        result = supabase.table('users').select('id').limit(1).execute()
        
        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'environment': os.getenv('FLASK_ENV', 'production'),
            'timestamp': str(os.times())
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'environment': os.getenv('FLASK_ENV', 'production')
        }), 500

# Import all route blueprints
logger.info("Loading route blueprints...")

# Authentication routes
from routes.auth import auth_bp
app.register_blueprint(auth_bp, url_prefix='/api/auth')

# V3 Quest routes (primary)
from routes.quests_v3 import quests_v3_bp
app.register_blueprint(quests_v3_bp, url_prefix='/api/v3/quests')

# Task completion routes
from routes.tasks import tasks_bp
app.register_blueprint(tasks_bp, url_prefix='/api/v3/tasks')

# Collaboration routes
from routes.collaborations import collaborations_bp
app.register_blueprint(collaborations_bp, url_prefix='/api/v3/collaborations')

# Learning logs V3
from routes.learning_logs_v3 import learning_logs_v3_bp
app.register_blueprint(learning_logs_v3_bp, url_prefix='/api/v3/logs')

# Portfolio/Diploma routes (CORE FEATURE)
from routes.portfolio import portfolio_bp
app.register_blueprint(portfolio_bp, url_prefix='/api/portfolio')

# Admin routes
from routes.admin_v3 import admin_v3_bp
app.register_blueprint(admin_v3_bp, url_prefix='/api/v3/admin')

# File upload routes
from routes.uploads import uploads_bp
app.register_blueprint(uploads_bp, url_prefix='/api/uploads')

# Legacy support routes
from routes.quests import quests_bp
app.register_blueprint(quests_bp, url_prefix='/api/quests')

from routes.subscriptions import subscriptions_bp
app.register_blueprint(subscriptions_bp, url_prefix='/api/subscriptions')

from routes.community import community_bp
app.register_blueprint(community_bp, url_prefix='/api/community')

from routes.sources import sources_bp
app.register_blueprint(sources_bp, url_prefix='/api/sources')

# Additional feature routes
from routes.quest_ideas import quest_ideas_bp
app.register_blueprint(quest_ideas_bp, url_prefix='/api/quest-ideas')

from routes.ratings import ratings_bp
app.register_blueprint(ratings_bp, url_prefix='/api/ratings')

from routes.settings import settings_bp
app.register_blueprint(settings_bp, url_prefix='/api/settings')

# Global error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'File too large. Maximum size is 50MB.'}), 413

# CORS preflight handler
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        return jsonify({}), 200

# Production startup
if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    logger.info(f"Starting Optio Quest Platform on port {port}")
    logger.info(f"Environment: {os.getenv('FLASK_ENV', 'production')}")
    logger.info(f"CORS configured for production domains")
    
    app.run(host='0.0.0.0', port=port, debug=False)