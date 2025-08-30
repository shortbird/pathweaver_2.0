"""
Production CORS configuration - Clean and simple
"""
import os
from flask_cors import CORS

def configure_cors(app):
    """Configure CORS for production deployment"""
    
    # Production-only origins - HTTPS only for security
    production_origins = [
        'https://optioeducation.com',
        'https://www.optioeducation.com',
        'https://pathweaver-2-0.vercel.app',
        'https://pathweaver20-production.up.railway.app'
    ]
    
    # Add any additional origins from environment
    if os.getenv('FRONTEND_URL'):
        frontend_url = os.getenv('FRONTEND_URL').strip()
        if frontend_url not in production_origins:
            production_origins.append(frontend_url)
    
    # Configure CORS with production settings
    CORS(app, 
         resources={
             r"/*": {
                 "origins": production_origins,
                 "allow_headers": [
                     "Content-Type", 
                     "Authorization", 
                     "X-Requested-With", 
                     "Accept"
                 ],
                 "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
                 "supports_credentials": True,
                 "max_age": 86400  # 24 hours
             }
         })
    
    print(f"CORS configured for production origins: {production_origins}")
    return app