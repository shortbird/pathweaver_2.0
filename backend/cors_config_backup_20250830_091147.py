"""
CORS configuration for production and development
"""
import os

def configure_cors(app):
    """Configure CORS based on environment"""
    from flask_cors import CORS
    
    # Determine environment
    is_development = os.getenv('FLASK_ENV', 'production').lower() == 'development'
    
    # Get allowed origins from environment
    allowed_origins = []
    
    if os.getenv('ALLOWED_ORIGINS'):
        # Use explicitly configured origins
        allowed_origins = [origin.strip() for origin in os.getenv('ALLOWED_ORIGINS').split(',') if origin.strip()]
    
    # Add production URLs if configured
    if os.getenv('FRONTEND_URL'):
        allowed_origins.append(os.getenv('FRONTEND_URL'))
    
    # Production domains - HTTPS only for security
    production_domains = [
        'https://pathweaver-2-0.vercel.app',
        'https://pathweaver20-production.up.railway.app',
        # Optio Education domains - HTTPS only
        'https://optioed.org',
        'https://www.optioed.org',
        'https://optioeducation.com',
        'https://www.optioeducation.com',
        'https://optioed.com',
        'https://www.optioed.com'
    ]
    
    # Emergency CORS check - force Railway URL inclusion
    if 'pathweaver20-production.up.railway.app' not in str(allowed_origins):
        production_domains.append('https://pathweaver20-production.up.railway.app')
    
    # Only add production domains if they're not already in the list
    for domain in production_domains:
        if domain not in allowed_origins:
            allowed_origins.append(domain)
    
    # In development, also allow localhost origins
    if is_development:
        dev_origins = [
            'http://localhost:3000',  # Primary React dev server
            'http://localhost:3001',  # Alternative React dev server port
            'http://localhost:3002',  # Alternative React dev server port
            'http://localhost:3003',  # Alternative React dev server port
            'http://localhost:5173',  # Vite dev server
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'http://127.0.0.1:3002',
            'http://127.0.0.1:3003',
            'http://127.0.0.1:5173'
        ]
        allowed_origins.extend(dev_origins)
    
    # Remove duplicates while preserving order
    allowed_origins = list(dict.fromkeys(allowed_origins))
    
    print(f"CORS Configuration - Environment: {'Development' if is_development else 'Production'}")
    print(f"Allowed origins: {allowed_origins}")
    
    CORS(app,
         resources={
             r"/*": {
                 "origins": allowed_origins,
                 "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
                 "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
                 "supports_credentials": True,
                 "max_age": 86400
             }
         })
    
    return app