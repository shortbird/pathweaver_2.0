"""
CORS configuration for production and development
"""
import os

def configure_cors(app):
    """Configure CORS based on environment"""
    from flask_cors import CORS
    
    # Get allowed origins from environment or use defaults
    allowed_origins = os.getenv('ALLOWED_ORIGINS', '').split(',')
    
    if not allowed_origins or allowed_origins == ['']:
        # Default to allowing common origins
        allowed_origins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'https://pathweaver-2-0.vercel.app',
            'https://pathweaver20-production.up.railway.app'
        ]
    
    # Add any additional production URLs
    if os.getenv('FRONTEND_URL'):
        allowed_origins.append(os.getenv('FRONTEND_URL'))
    
    print(f"Configuring CORS with allowed origins: {allowed_origins}")
    
    CORS(app,
         resources={r"/api/*": {"origins": allowed_origins}},
         allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
         supports_credentials=True,
         max_age=3600)
    
    return app