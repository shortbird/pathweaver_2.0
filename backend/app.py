"""
Railway-optimized Flask Backend for Optio Quest Platform
Clean rebuild focused on stability and proper deployment
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import os
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', os.getenv('FLASK_SECRET_KEY', 'development-secret-key'))

# Configure CORS for production domains
CORS(app, 
     origins=[
         "https://optioeducation.com",
         "https://www.optioeducation.com", 
         "http://localhost:3000",
         "http://localhost:5173"
     ],
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'message': 'Optio backend is running',
        'timestamp': str(os.times())
    }), 200

# Settings endpoint (needed by frontend)
@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify({
        'success': True,
        'settings': {
            'site_name': 'Optio Quest Platform',
            'maintenance_mode': False,
            'version': '2.0.0',
            'features': {
                'registration_enabled': True,
                'demo_mode': False
            }
        }
    })

# Test endpoint
@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({'message': 'Backend is responding', 'port': os.getenv('PORT', 'unknown')})

# Import routes with error handling
try:
    # Import database
    from database import get_supabase_client
    logger.info("Database module loaded successfully")
    
    # Test database connection
    @app.route('/api/db-test', methods=['GET'])
    def db_test():
        try:
            client = get_supabase_client()
            return jsonify({'database': 'connected'})
        except Exception as e:
            return jsonify({'database': 'error', 'message': str(e)}), 500
    
except Exception as e:
    logger.error(f"Could not import database: {e}")

# Try to import routes one by one with error handling
routes_status = {}

# Auth routes
try:
    from routes.auth import bp as auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    routes_status['auth'] = 'loaded'
    logger.info("Auth routes loaded")
except Exception as e:
    routes_status['auth'] = f'failed: {str(e)}'
    logger.error(f"Auth routes failed: {e}")

# Portfolio routes  
try:
    from routes.portfolio import portfolio_bp
    app.register_blueprint(portfolio_bp, url_prefix='/api/portfolio')
    routes_status['portfolio'] = 'loaded'
    logger.info("Portfolio routes loaded")
except Exception as e:
    routes_status['portfolio'] = f'failed: {str(e)}'
    logger.error(f"Portfolio routes failed: {e}")

# Quests V3 routes
try:
    from routes.quests_v3 import quests_v3_bp
    app.register_blueprint(quests_v3_bp, url_prefix='/api/v3/quests')
    routes_status['quests_v3'] = 'loaded'
    logger.info("Quests V3 routes loaded")
except Exception as e:
    routes_status['quests_v3'] = f'failed: {str(e)}'
    logger.error(f"Quests V3 routes failed: {e}")

# Status endpoint to show what's loaded
@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({
        'status': 'running',
        'routes': routes_status,
        'environment': {
            'PORT': os.getenv('PORT', 'not set'),
            'SUPABASE_URL': 'set' if os.getenv('SUPABASE_URL') else 'missing',
            'SUPABASE_KEY': 'set' if os.getenv('SUPABASE_KEY') else 'missing'
        }
    })

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    logger.info(f"Starting Optio backend on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)