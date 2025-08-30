"""
Ultra-minimal Flask application for Railway deployment
This version prioritizes startup reliability over features
"""

from flask import Flask, jsonify
import os
import logging

# Basic logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Flask app with minimal configuration
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', os.getenv('SECRET_KEY', 'minimal-fallback-key'))

# Ultra-simple health check that will always work
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'message': 'Optio backend is running',
        'port': os.getenv('PORT', 'not-set'),
        'env': os.getenv('FLASK_ENV', 'production')
    })

# Simple CORS handling - just return headers for all OPTIONS requests
@app.before_request
def handle_cors():
    from flask import request
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers.add('Access-Control-Allow-Origin', 'https://optioeducation.com')
        response.headers.add('Access-Control-Allow-Origin', 'https://www.optioeducation.com')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

@app.after_request
def after_request(response):
    from flask import request
    origin = request.headers.get('Origin')
    allowed_origins = [
        'https://optioeducation.com',
        'https://www.optioeducation.com',
        'https://pathweaver-2-0.vercel.app'
    ]
    
    if origin in allowed_origins:
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
    
    return response

# Import and register routes only after basic app is configured
try:
    # Start with just the most critical routes
    from routes.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    logger.info("Auth routes loaded")
    
    from routes.portfolio import portfolio_bp  
    app.register_blueprint(portfolio_bp, url_prefix='/api/portfolio')
    logger.info("Portfolio routes loaded")
    
    # Add other routes gradually
    from routes.quests_v3 import quests_v3_bp
    app.register_blueprint(quests_v3_bp, url_prefix='/api/v3/quests')
    logger.info("Quest V3 routes loaded")
    
except ImportError as e:
    logger.error(f"Route import failed: {e}")
    # Continue anyway - health check will still work

@app.errorhandler(500)
def handle_500(e):
    logger.error(f"500 error: {e}")
    return jsonify({'error': 'Internal server error', 'details': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    logger.info(f"Starting minimal Flask app on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)