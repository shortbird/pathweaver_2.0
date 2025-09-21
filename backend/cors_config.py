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
    
    # Production domains (HTTPS only for security)
    production_domains = [
        # Current Render frontend URLs
        'https://optio-dev-frontend.onrender.com',
        'https://optio-prod-frontend.onrender.com',
        # Legacy Render URLs
        'https://optio-fe.onrender.com',
        'https://optio-frontend.onrender.com',
        'https://optio-frontend-dev.onrender.com',
        # Main production domains
        'https://www.optioeducation.com',
        'https://optioeducation.com'
    ]
    
    # Add HTTP variants only in development for local testing
    if is_development:
        http_variants = [
            'http://optioeducation.com',
            'http://www.optioeducation.com'
        ]
        production_domains.extend(http_variants)
    
    # Only add production domains if they're not already in the list
    for domain in production_domains:
        if domain not in allowed_origins:
            allowed_origins.append(domain)
    
    # In development, also allow localhost origins
    if is_development:
        dev_origins = [
            'http://localhost:3000',  # Primary React dev server
            'http://localhost:3001',  # Alternative React dev server port
            'http://localhost:5173',  # Vite dev server
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'http://127.0.0.1:5173'
        ]
        allowed_origins.extend(dev_origins)
    
    # Remove duplicates while preserving order
    allowed_origins = list(dict.fromkeys(allowed_origins))
    
    print(f"CORS Configuration - Environment: {'Development' if is_development else 'Production'}")
    print(f"Allowed origins: {allowed_origins}")
    
    CORS(app,
         resources={
             r"/api/*": {"origins": allowed_origins},
             r"/portfolio/*": {"origins": allowed_origins},
             r"/csrf-token": {"origins": allowed_origins}
         },
         allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token", "Cache-Control"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
         supports_credentials=True,
         max_age=3600)
    
    return app