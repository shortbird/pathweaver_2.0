"""
Emergency CORS fix - temporarily allow ALL origins
This is for debugging only - replace with proper CORS once working
"""

from flask import make_response

def add_cors_emergency(app):
    """Add emergency CORS that allows everything"""
    
    @app.after_request
    def after_request(response):
        # Allow ANY origin temporarily
        origin = request.headers.get('Origin')
        if origin:
            response.headers['Access-Control-Allow-Origin'] = origin
        else:
            response.headers['Access-Control-Allow-Origin'] = '*'
        
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Max-Age'] = '3600'
        
        print(f"[EMERGENCY CORS] Headers added for: {origin or '*'}")
        return response
    
    @app.before_request
    def handle_preflight():
        if request.method == 'OPTIONS':
            response = make_response()
            origin = request.headers.get('Origin')
            if origin:
                response.headers['Access-Control-Allow-Origin'] = origin
            else:
                response.headers['Access-Control-Allow-Origin'] = '*'
            
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Max-Age'] = '3600'
            
            print(f"[EMERGENCY CORS OPTIONS] Headers added for: {origin or '*'}")
            return response