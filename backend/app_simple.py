"""
Simplified Flask app with bulletproof CORS
"""

from flask import Flask, jsonify, request, make_response
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)

# CRITICAL: Apply CORS to EVERY response, no exceptions
@app.after_request
def after_request(response):
    """Add CORS headers to EVERY response"""
    origin = request.headers.get('Origin')
    
    # List of allowed origins
    allowed = [
        'https://www.optioeducation.com',
        'https://optioeducation.com',
        'https://www.optioed.org',
        'https://optioed.org',
        'http://localhost:3000',
        'http://localhost:5173'
    ]
    
    # Always add CORS headers if origin is in allowed list
    if origin in allowed:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Max-Age'] = '3600'
    
    return response

# Handle OPTIONS preflight
@app.route('/', defaults={'path': ''}, methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    """Handle preflight requests"""
    response = make_response()
    return response

@app.route('/')
def root():
    return jsonify({'status': 'running', 'app': 'Simple CORS Test'})

@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy'})

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Test login endpoint"""
    data = request.get_json()
    # For testing, just echo back
    return jsonify({
        'success': True,
        'message': 'Test login endpoint',
        'received': data
    })

# Import all the routes from main app
try:
    # Register existing blueprints
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    
    from routes import auth, quests, users, admin
    app.register_blueprint(auth.bp)
    app.register_blueprint(quests.bp)
    app.register_blueprint(users.bp)
    app.register_blueprint(admin.bp)
    print("Routes imported successfully")
except Exception as e:
    print(f"Could not import routes: {e}")

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    app.run(host='0.0.0.0', port=port)