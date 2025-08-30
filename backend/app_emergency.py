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

# Simple CORS for emergency
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = 'https://optioeducation.com'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

@app.before_request
def handle_preflight():
    from flask import request
    if request.method == "OPTIONS":
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = 'https://optioeducation.com'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    print(f"EMERGENCY: Starting ultra-minimal Flask app on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)