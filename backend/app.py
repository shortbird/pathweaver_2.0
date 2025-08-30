"""
EMERGENCY: Ultra-minimal Flask app - NO ROUTE DEPENDENCIES
This version will start no matter what
"""

from flask import Flask, jsonify
import os

# Create Flask app with absolute minimal configuration
app = Flask(__name__)
app.config['SECRET_KEY'] = 'emergency-fallback-key'

# Single health check endpoint - no imports, no dependencies
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'message': 'Emergency Optio backend is running',
        'port': os.getenv('PORT', 'unknown'),
        'timestamp': 'emergency-startup'
    }), 200

# Simple test endpoint
@app.route('/api/test', methods=['GET'])  
def test():
    return jsonify({'message': 'Emergency backend responding'})

# Essential settings endpoint - no auth required
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

# CORS configuration for production domains
@app.after_request
def add_cors_headers(response):
    from flask import request
    origin = request.headers.get('Origin')
    allowed_origins = [
        'https://optioeducation.com',
        'https://www.optioeducation.com',
        'https://pathweaver-2-0.vercel.app'
    ]
    
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

@app.before_request
def handle_preflight():
    from flask import request
    if request.method == "OPTIONS":
        origin = request.headers.get('Origin')
        allowed_origins = [
            'https://optioeducation.com',
            'https://www.optioeducation.com',
            'https://pathweaver-2-0.vercel.app'
        ]
        
        response = jsonify({})
        if origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    print(f"EMERGENCY: Starting ultra-minimal Flask app on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)