"""
Security middleware for input validation and request sanitization
"""
import re
import json
from flask import request, jsonify, abort
from functools import wraps
from typing import Dict, List, Any
from werkzeug.exceptions import BadRequest

# Try to import bleach, but don't fail if it's not available
try:
    import bleach
    HAS_BLEACH = True
except ImportError:
    HAS_BLEACH = False

# Maximum sizes for different input types
MAX_FIELD_LENGTH = {
    'default': 1000,
    'title': 100,
    'name': 50,
    'email': 255,
    'description': 5000,
    'text_content': 10000,
    'url': 2048
}

# Rate limiting configuration
RATE_LIMITS = {
    'auth': 5,  # 5 attempts per minute
    'api': 60,  # 60 requests per minute
    'admin': 30  # 30 requests per minute for admin endpoints
}

class SecurityMiddleware:
    """Comprehensive security middleware for the application"""
    
    def __init__(self, app=None):
        self.app = app
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize the middleware with the Flask app"""
        app.before_request(self.before_request)
        app.after_request(self.after_request)
    
    def before_request(self):
        """Process request before it reaches the route handler"""
        # Validate request size (11MB to account for image + form data overhead)
        if request.content_length and request.content_length > 11 * 1024 * 1024:  # 11MB max
            abort(413, description="Request payload too large")
        
        # Validate content type for POST/PUT/PATCH requests
        if request.method in ['POST', 'PUT', 'PATCH']:
            # Skip JSON validation for file uploads, task completions, logout, refresh, and collaboration endpoints
            skip_endpoints = ['upload', 'complete', 'auth.logout', 'auth.refresh', 'collaborations.accept_invitation', 'collaborations.decline_invitation']
            should_skip = request.endpoint and any(endpoint in request.endpoint for endpoint in skip_endpoints)
            
            if not should_skip:
                # Also skip if it's multipart/form-data (file upload)
                if request.content_type and 'multipart/form-data' in request.content_type:
                    pass  # Allow multipart/form-data
                elif not request.is_json and not (request.content_type and request.content_type.startswith('application/json')):
                    abort(400, description="Content-Type must be application/json")
        
        # Sanitize query parameters
        if request.args:
            self.sanitize_query_params()
        
        # Note: JSON body sanitization should be done in route handlers
        # since request.json is read-only. The sanitize_json method
        # is available for routes to use when needed.
    
    def after_request(self, response):
        """Add security headers to response"""
        # Security headers
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        # CSP header for additional XSS protection
        if not response.headers.get('Content-Security-Policy'):
            # Comprehensive CSP for React/Vite application
            csp_policy = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "  # React/Vite needs inline scripts
                "style-src 'self' 'unsafe-inline' fonts.googleapis.com; "  # Allow inline styles and Google Fonts
                "img-src 'self' data: blob: https:; "  # Allow images from various sources
                "font-src 'self' fonts.gstatic.com; "  # Google Fonts
                "connect-src 'self' https:; "  # API calls and WebSocket connections
                "media-src 'self' blob:; "  # Media content
                "object-src 'none'; "  # Disable plugins
                "base-uri 'self'; "  # Prevent base tag injection
                "form-action 'self'; "  # Forms can only submit to same origin
                "frame-ancestors 'none'"  # Prevent framing (clickjacking)
            )
            response.headers['Content-Security-Policy'] = csp_policy
        
        return response
    
    def sanitize_query_params(self):
        """Sanitize URL query parameters"""
        # Note: request.args is immutable in Flask, so we can't modify it directly
        # Instead, we'll just validate the parameters
        for key, value in request.args.items():
            # Check key length
            if len(key) > 50:
                abort(400, description=f"Query parameter key too long: {key}")
            
            # Validate value
            if isinstance(value, str):
                # Check for potential XSS attempts
                if '<script' in value.lower() or 'javascript:' in value.lower():
                    abort(400, description="Invalid characters in query parameters")
                # Check value length
                if len(value) > MAX_FIELD_LENGTH.get(key, MAX_FIELD_LENGTH['default']):
                    abort(400, description=f"Query parameter value too long: {key}")
    
    def sanitize_json(self, data: Any) -> Any:
        """Recursively sanitize JSON data"""
        if isinstance(data, dict):
            sanitized = {}
            for key, value in data.items():
                # Skip overly long keys
                if len(str(key)) > 50:
                    continue
                sanitized[key] = self.sanitize_json(value)
            return sanitized
        
        elif isinstance(data, list):
            # Limit array size to prevent DoS
            if len(data) > 1000:
                data = data[:1000]
            return [self.sanitize_json(item) for item in data]
        
        elif isinstance(data, str):
            # Remove HTML/script tags
            if HAS_BLEACH:
                data = bleach.clean(data, tags=[], strip=True)
            else:
                # Fallback: basic HTML tag removal
                data = re.sub(r'<[^>]*>', '', data)
            # Limit string length based on context
            max_length = MAX_FIELD_LENGTH['default']
            return data[:max_length] if len(data) > max_length else data
        
        else:
            # Return other types as-is (numbers, booleans, null)
            return data

def validate_json_schema(schema: Dict):
    """Decorator to validate JSON request against a schema"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not request.is_json:
                return jsonify({'error': 'Content-Type must be application/json'}), 400
            
            data = request.json
            errors = []
            
            # Check required fields
            for field in schema.get('required', []):
                if field not in data:
                    errors.append(f"Missing required field: {field}")
            
            # Validate field types and constraints
            for field, constraints in schema.get('properties', {}).items():
                if field in data:
                    value = data[field]
                    
                    # Type validation
                    expected_type = constraints.get('type')
                    if expected_type:
                        if expected_type == 'string' and not isinstance(value, str):
                            errors.append(f"{field} must be a string")
                        elif expected_type == 'number' and not isinstance(value, (int, float)):
                            errors.append(f"{field} must be a number")
                        elif expected_type == 'boolean' and not isinstance(value, bool):
                            errors.append(f"{field} must be a boolean")
                        elif expected_type == 'array' and not isinstance(value, list):
                            errors.append(f"{field} must be an array")
                        elif expected_type == 'object' and not isinstance(value, dict):
                            errors.append(f"{field} must be an object")
                    
                    # String constraints
                    if isinstance(value, str):
                        if 'minLength' in constraints and len(value) < constraints['minLength']:
                            errors.append(f"{field} must be at least {constraints['minLength']} characters")
                        if 'maxLength' in constraints and len(value) > constraints['maxLength']:
                            errors.append(f"{field} must be at most {constraints['maxLength']} characters")
                        if 'pattern' in constraints:
                            pattern = re.compile(constraints['pattern'])
                            if not pattern.match(value):
                                errors.append(f"{field} format is invalid")
                    
                    # Number constraints
                    if isinstance(value, (int, float)):
                        if 'minimum' in constraints and value < constraints['minimum']:
                            errors.append(f"{field} must be at least {constraints['minimum']}")
                        if 'maximum' in constraints and value > constraints['maximum']:
                            errors.append(f"{field} must be at most {constraints['maximum']}")
                    
                    # Array constraints
                    if isinstance(value, list):
                        if 'minItems' in constraints and len(value) < constraints['minItems']:
                            errors.append(f"{field} must have at least {constraints['minItems']} items")
                        if 'maxItems' in constraints and len(value) > constraints['maxItems']:
                            errors.append(f"{field} must have at most {constraints['maxItems']} items")
            
            if errors:
                return jsonify({'error': 'Validation failed', 'details': errors}), 400
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator

def sanitize_html(text: str) -> str:
    """Sanitize HTML content to prevent XSS"""
    # Allow only safe HTML tags
    allowed_tags = ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre']
    allowed_attributes = {'a': ['href', 'title']}
    
    if HAS_BLEACH:
        return bleach.clean(
            text,
            tags=allowed_tags,
            attributes=allowed_attributes,
            strip=True
        )
    else:
        # Fallback: basic HTML sanitization
        # Remove script tags and dangerous attributes
        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL)
        text = re.sub(r'on\w+\s*=\s*["\'][^"\'>]*["\']', '', text, flags=re.IGNORECASE)
        text = re.sub(r'javascript:', '', text, flags=re.IGNORECASE)
        return text

def validate_uuid(uuid_string: str) -> bool:
    """Validate UUID format"""
    uuid_pattern = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        re.IGNORECASE
    )
    return bool(uuid_pattern.match(uuid_string))

def validate_url(url: str) -> bool:
    """Validate URL format"""
    url_pattern = re.compile(
        r'^https?://'  # http:// or https://
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
        r'localhost|'  # localhost...
        r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
        r'(?::\d+)?'  # optional port
        r'(?:/?|[/?]\S+)$', re.IGNORECASE
    )
    return bool(url_pattern.match(url))

# Export middleware instance
security_middleware = SecurityMiddleware()