# Security Implementation Plan - OptioQuest Platform

## Executive Summary
This document outlines a comprehensive security implementation plan addressing 22 identified vulnerabilities in the OptioQuest platform. The plan is organized by severity level with detailed implementation steps, testing procedures, and rollout strategies.

## Timeline Overview
- **Week 1-2**: Critical fixes (Issues #1-4)
- **Week 3-4**: High priority fixes (Issues #5-10)
- **Week 5-6**: Medium priority improvements (Issues #11-17)
- **Week 7-8**: Low priority enhancements and testing

---

## PHASE 1: CRITICAL FIXES (Week 1-2)

### 1. Weak Secret Key Configuration

**Files to Modify:**
- `backend/config.py`
- `backend/app.py`
- `backend/.env.example`

**Implementation Steps:**
```python
# backend/config.py
import secrets
import sys

class Config:
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY')
    
    @classmethod
    def validate_secret_key(cls):
        if not cls.SECRET_KEY:
            raise ValueError("FLASK_SECRET_KEY must be set in environment")
        if len(cls.SECRET_KEY) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        if cls.SECRET_KEY == 'dev-secret-key-change-in-production':
            raise ValueError("Default secret key detected - security risk!")
        return True
    
    @classmethod
    def generate_secret_key(cls):
        """Helper to generate secure secret key"""
        return secrets.token_hex(32)
```

**Testing:**
- Unit test for secret key validation
- Integration test for app startup with various key configurations
- Security scan for hardcoded secrets

**Rollout:**
1. Generate new secret key for each environment
2. Update environment variables in deployment platforms
3. Deploy with validation checks
4. Monitor for authentication issues

### 2. Information Disclosure via Debug Mode

**Files to Modify:**
- `backend/app.py`
- `backend/middleware/error_handler.py`
- `backend/config.py`

**Implementation Steps:**
```python
# backend/config.py
class Config:
    @property
    def DEBUG(self):
        # Only allow debug in development
        if self.ENVIRONMENT == 'production':
            return False
        return os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'

# backend/middleware/error_handler.py
def handle_error(error):
    """Sanitized error handler"""
    logger.error(f"Error occurred: {str(error)}", exc_info=True)
    
    if current_app.config.get('DEBUG'):
        # Development: return full error
        return jsonify({
            'error': str(error),
            'traceback': traceback.format_exc()
        }), 500
    else:
        # Production: return generic message
        error_id = str(uuid.uuid4())
        logger.error(f"Error ID {error_id}: {str(error)}")
        return jsonify({
            'error': 'An error occurred processing your request',
            'error_id': error_id,
            'message': 'Please contact support with this error ID'
        }), 500
```

**Testing:**
- Test error responses in both debug and production modes
- Verify no sensitive data leaks in production errors
- Load test error handling performance

### 3. Test Mode Authentication Bypass

**Files to Modify:**
- `backend/routes/auth.py`
- `backend/config.py`
- Remove all TEST_MODE references

**Implementation Steps:**
```python
# backend/config.py
class Config:
    # Remove TEST_MODE entirely
    
    @property
    def ALLOW_TEST_ENDPOINTS(self):
        # Only in development with explicit flag
        return (self.ENVIRONMENT == 'development' and 
                os.environ.get('ALLOW_TEST_ENDPOINTS') == 'true')

# backend/routes/auth.py
# Create separate test blueprint only loaded in development
if current_app.config.get('ALLOW_TEST_ENDPOINTS'):
    from .test_endpoints import test_bp
    app.register_blueprint(test_bp, url_prefix='/api/test')
```

**Testing:**
- Verify TEST_MODE code is completely removed
- Test authentication flow without any bypass
- Security scan for backdoors

### 4. Direct Database Admin Access

**Files to Modify:**
- `backend/database.py`
- All route files using admin client
- `backend/utils/auth/decorators.py`

**Implementation Steps:**
```python
# backend/database.py
class Database:
    def __init__(self):
        self.anon_client = self._create_anon_client()
        self.admin_client = self._create_admin_client()
    
    def get_user_client(self, access_token):
        """Get client with user's permissions"""
        return create_client(
            self.url,
            self.anon_key,
            options={
                'headers': {
                    'Authorization': f'Bearer {access_token}'
                }
            }
        )
    
    def with_user_context(self, access_token):
        """Context manager for user-scoped operations"""
        return UserContext(self.get_user_client(access_token))

# backend/routes/quests.py
@require_auth
def get_user_quests(user_id, access_token):
    with db.with_user_context(access_token) as client:
        # This respects RLS policies
        return client.table('user_quests').select('*').execute()
```

**Testing:**
- Test all endpoints with proper RLS enforcement
- Verify users cannot access other users' data
- Audit all admin client usage

---

## PHASE 2: HIGH PRIORITY FIXES (Week 3-4)

### 5. Missing CSRF Protection

**Files to Modify:**
- `backend/app.py`
- `backend/middleware/csrf.py` (new)
- All form templates and API endpoints

**Implementation Steps:**
```python
# backend/middleware/csrf.py
from flask_wtf.csrf import CSRFProtect, generate_csrf

csrf = CSRFProtect()

def init_csrf(app):
    csrf.init_app(app)
    
    @app.after_request
    def inject_csrf_token(response):
        response.set_cookie(
            'csrf_token',
            generate_csrf(),
            secure=True,
            httponly=False,  # Frontend needs to read it
            samesite='Strict'
        )
        return response

# frontend/src/services/api.js
const getCsrfToken = () => {
    return document.cookie
        .split('; ')
        .find(row => row.startsWith('csrf_token='))
        ?.split('=')[1];
};

const apiCall = async (url, options = {}) => {
    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'X-CSRF-Token': getCsrfToken()
        }
    });
};
```

**Testing:**
- Test CSRF token generation and validation
- Attempt CSRF attacks to verify protection
- Test token rotation on sensitive operations

### 6. Insecure Session Management (JWT in localStorage)

**Files to Modify:**
- `frontend/src/contexts/AuthContext.jsx`
- `frontend/src/services/api.js`
- `backend/routes/auth.py`
- `backend/middleware/auth.py`

**Implementation Steps:**
```python
# backend/routes/auth.py
@auth_bp.route('/login', methods=['POST'])
def login():
    # ... authentication logic ...
    
    response = make_response(jsonify({
        'user': user_data,
        'message': 'Login successful'
    }))
    
    # Set JWT in httpOnly cookie
    response.set_cookie(
        'access_token',
        access_token,
        max_age=86400,  # 24 hours
        secure=True,
        httponly=True,
        samesite='Strict',
        path='/'
    )
    
    response.set_cookie(
        'refresh_token',
        refresh_token,
        max_age=604800,  # 7 days
        secure=True,
        httponly=True,
        samesite='Strict',
        path='/api/auth/refresh'
    )
    
    return response

# frontend/src/services/api.js
// Remove localStorage token management
// Use fetch with credentials
const apiCall = async (url, options = {}) => {
    return fetch(url, {
        ...options,
        credentials: 'include',  // Include cookies
        headers: {
            ...options.headers,
            'Content-Type': 'application/json'
        }
    });
};
```

**Testing:**
- Test cookie-based authentication flow
- Verify XSS cannot access tokens
- Test cross-domain cookie handling
- Verify refresh token rotation

### 7. Inadequate File Upload Validation

**Files to Modify:**
- `backend/routes/uploads.py`
- `backend/utils/file_validator.py` (new)
- `backend/config.py`

**Implementation Steps:**
```python
# backend/utils/file_validator.py
import magic
import hashlib
from PIL import Image
import zipfile

class FileValidator:
    ALLOWED_EXTENSIONS = {
        'image': ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        'document': ['pdf', 'doc', 'docx', 'txt'],
        'archive': ['zip', '7z', 'tar.gz']
    }
    
    MIME_TYPES = {
        'image/jpeg': ['jpg', 'jpeg'],
        'image/png': ['png'],
        'application/pdf': ['pdf']
    }
    
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    
    @classmethod
    def validate_file(cls, file_stream, file_type='image'):
        # Check file size
        file_stream.seek(0, 2)
        size = file_stream.tell()
        file_stream.seek(0)
        
        if size > cls.MAX_FILE_SIZE:
            raise ValueError(f"File too large: {size} bytes")
        
        # Check magic number
        mime = magic.from_buffer(file_stream.read(2048), mime=True)
        file_stream.seek(0)
        
        if mime not in cls.MIME_TYPES:
            raise ValueError(f"Invalid file type: {mime}")
        
        # Additional validation for images
        if file_type == 'image':
            cls._validate_image(file_stream)
        
        # Generate secure filename
        hash_name = hashlib.sha256(file_stream.read()).hexdigest()
        file_stream.seek(0)
        
        return {
            'mime_type': mime,
            'size': size,
            'secure_name': hash_name[:16]
        }
    
    @classmethod
    def _validate_image(cls, file_stream):
        try:
            img = Image.open(file_stream)
            img.verify()
            
            # Check dimensions
            if img.width > 5000 or img.height > 5000:
                raise ValueError("Image dimensions too large")
                
        except Exception as e:
            raise ValueError(f"Invalid image: {str(e)}")
        finally:
            file_stream.seek(0)
```

**Testing:**
- Test with various malicious file types
- Test polyglot files
- Test file bombs (zip bombs, image bombs)
- Verify secure file storage paths

### 8. Weak Content Security Policy

**Files to Modify:**
- `backend/middleware/security.py`
- `backend/config.py`

**Implementation Steps:**
```python
# backend/middleware/security.py
def get_csp_header(nonce):
    """Generate strict CSP header"""
    directives = {
        'default-src': ["'self'"],
        'script-src': [
            "'self'",
            f"'nonce-{nonce}'",
            'https://cdn.jsdelivr.net',  # For specific CDNs
            "'strict-dynamic'"  # For dynamically loaded scripts
        ],
        'style-src': [
            "'self'",
            f"'nonce-{nonce}'",
            'https://fonts.googleapis.com'
        ],
        'font-src': [
            "'self'",
            'https://fonts.gstatic.com'
        ],
        'img-src': [
            "'self'",
            'data:',
            'https:',
            'blob:'
        ],
        'connect-src': [
            "'self'",
            'https://api.stripe.com',  # For Stripe
            'wss://*.supabase.co'  # For Supabase realtime
        ],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'upgrade-insecure-requests': [],
        'block-all-mixed-content': []
    }
    
    return '; '.join(
        f"{key} {' '.join(values)}" if values else key
        for key, values in directives.items()
    )

@app.before_request
def add_security_headers():
    g.csp_nonce = secrets.token_hex(16)

@app.after_request
def set_security_headers(response):
    response.headers['Content-Security-Policy'] = get_csp_header(g.csp_nonce)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    
    if not current_app.config.get('DEBUG'):
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
    
    return response
```

**Testing:**
- Test CSP violations with browser console
- Verify legitimate resources load correctly
- Test inline script/style blocking
- Security scan for CSP bypasses

### 9. Rate Limiting Bypass Mechanisms

**Files to Modify:**
- `backend/middleware/rate_limiter.py`
- `backend/config.py`
- Add Redis configuration

**Implementation Steps:**
```python
# backend/middleware/rate_limiter.py
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import redis

class SecureRateLimiter:
    def __init__(self, app=None):
        self.redis_client = redis.Redis(
            host=app.config.get('REDIS_HOST', 'localhost'),
            port=app.config.get('REDIS_PORT', 6379),
            decode_responses=True
        )
        
        self.limiter = Limiter(
            app,
            key_func=self._get_identifier,
            storage_uri=f"redis://{app.config.get('REDIS_HOST')}:6379",
            default_limits=["1000 per hour", "100 per minute"],
            headers_enabled=True,
            swallow_errors=False  # Don't bypass on Redis failure
        )
    
    def _get_identifier(self):
        """Get unique identifier for rate limiting"""
        # Use combination of IP and user ID if authenticated
        identifier = get_remote_address()
        
        if hasattr(g, 'user_id'):
            identifier = f"{identifier}:{g.user_id}"
        
        return identifier
    
    def strict_limit(self, limit_string):
        """Decorator for strict rate limiting"""
        def decorator(f):
            # Apply multiple rate limits
            f = self.limiter.limit(limit_string)(f)
            f = self.limiter.limit(f"{limit_string}/user")(f)
            return f
        return decorator

# Usage
rate_limiter = SecureRateLimiter(app)

@auth_bp.route('/login', methods=['POST'])
@rate_limiter.strict_limit("5 per minute")
def login():
    # ...
```

**Testing:**
- Load test rate limiting under stress
- Test distributed rate limiting across instances
- Verify no bypass methods exist
- Test graceful degradation on Redis failure

### 10. Information Disclosure in Error Messages

**Files to Modify:**
- All route files with error handling
- `backend/utils/error_messages.py` (new)
- `backend/middleware/error_handler.py`

**Implementation Steps:**
```python
# backend/utils/error_messages.py
class SecureErrorMessages:
    """Centralized error message management"""
    
    # Public-facing generic messages
    PUBLIC_MESSAGES = {
        'auth_failed': 'Authentication failed. Please check your credentials.',
        'not_found': 'The requested resource was not found.',
        'validation_error': 'Invalid input provided.',
        'server_error': 'An error occurred. Please try again later.',
        'permission_denied': 'You do not have permission to perform this action.',
        'rate_limited': 'Too many requests. Please try again later.'
    }
    
    @classmethod
    def get_public_message(cls, error_type, error_id=None):
        message = cls.PUBLIC_MESSAGES.get(error_type, cls.PUBLIC_MESSAGES['server_error'])
        if error_id:
            message += f" Error ID: {error_id}"
        return message
    
    @classmethod
    def log_detailed_error(cls, error_type, details, user_id=None):
        """Log detailed error for debugging"""
        logger.error(
            f"Error: {error_type}",
            extra={
                'user_id': user_id,
                'details': details,
                'timestamp': datetime.utcnow().isoformat()
            }
        )

# backend/routes/auth.py
@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        # ... authentication logic ...
    except InvalidCredentials as e:
        error_id = str(uuid.uuid4())
        SecureErrorMessages.log_detailed_error(
            'invalid_credentials',
            str(e),
            user_id=request.json.get('email')
        )
        return jsonify({
            'error': SecureErrorMessages.get_public_message('auth_failed', error_id)
        }), 401
```

**Testing:**
- Test all error paths for information leaks
- Verify error IDs are properly logged
- Test user experience with generic messages
- Security scan for error-based enumeration

---

## PHASE 3: MEDIUM PRIORITY IMPROVEMENTS (Week 5-6)

### 11. Missing Security Headers

**Implementation Steps:**
```python
# backend/middleware/security.py
SECURITY_HEADERS = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
}
```

### 12. Insufficient Input Sanitization

**Implementation Steps:**
```python
# backend/utils/sanitizer.py
import bleach
import re

class InputSanitizer:
    ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li']
    ALLOWED_ATTRIBUTES = {'a': ['href', 'title']}
    
    @classmethod
    def sanitize_html(cls, content):
        return bleach.clean(
            content,
            tags=cls.ALLOWED_TAGS,
            attributes=cls.ALLOWED_ATTRIBUTES,
            strip=True
        )
    
    @classmethod
    def sanitize_filename(cls, filename):
        # Remove any path components
        filename = os.path.basename(filename)
        # Remove special characters
        filename = re.sub(r'[^a-zA-Z0-9._-]', '', filename)
        return filename[:255]  # Limit length
```

### 13. Weak Password Requirements

**Implementation Steps:**
```python
# backend/utils/password_validator.py
import re
from zxcvbn import zxcvbn

class PasswordValidator:
    MIN_LENGTH = 12
    REQUIRE_UPPERCASE = True
    REQUIRE_LOWERCASE = True
    REQUIRE_NUMBERS = True
    REQUIRE_SPECIAL = True
    MIN_ENTROPY_SCORE = 3  # zxcvbn score (0-4)
    
    @classmethod
    def validate(cls, password, user_info=None):
        errors = []
        
        if len(password) < cls.MIN_LENGTH:
            errors.append(f"Password must be at least {cls.MIN_LENGTH} characters")
        
        if cls.REQUIRE_UPPERCASE and not re.search(r'[A-Z]', password):
            errors.append("Password must contain uppercase letters")
        
        if cls.REQUIRE_LOWERCASE and not re.search(r'[a-z]', password):
            errors.append("Password must contain lowercase letters")
        
        if cls.REQUIRE_NUMBERS and not re.search(r'\d', password):
            errors.append("Password must contain numbers")
        
        if cls.REQUIRE_SPECIAL and not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            errors.append("Password must contain special characters")
        
        # Check password strength
        result = zxcvbn(password, user_inputs=user_info or [])
        if result['score'] < cls.MIN_ENTROPY_SCORE:
            errors.append("Password is too weak. Try a longer, more complex password")
            errors.extend(result.get('feedback', {}).get('suggestions', []))
        
        return {'valid': len(errors) == 0, 'errors': errors, 'score': result['score']}
```

### 14. SQL Injection Protection Validation

**Implementation Steps:**
```python
# backend/utils/query_validator.py
class QueryValidator:
    FORBIDDEN_KEYWORDS = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'EXEC', 'EXECUTE']
    
    @classmethod
    def validate_parameter(cls, param, param_type='string'):
        if param_type == 'integer':
            if not str(param).isdigit():
                raise ValueError("Invalid integer parameter")
            return int(param)
        
        elif param_type == 'uuid':
            try:
                uuid.UUID(str(param))
                return str(param)
            except ValueError:
                raise ValueError("Invalid UUID parameter")
        
        elif param_type == 'string':
            # Check for SQL injection patterns
            param_upper = str(param).upper()
            for keyword in cls.FORBIDDEN_KEYWORDS:
                if keyword in param_upper:
                    raise ValueError(f"Forbidden keyword detected: {keyword}")
            return str(param)
        
        return param
```

### 15. Comprehensive Security Logging

**Implementation Steps:**
```python
# backend/utils/security_logger.py
import logging
from pythonjsonlogger import jsonlogger

class SecurityLogger:
    def __init__(self):
        self.logger = logging.getLogger('security')
        handler = logging.StreamHandler()
        formatter = jsonlogger.JsonFormatter()
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)
    
    def log_auth_attempt(self, email, success, ip_address, user_agent):
        self.logger.info('auth_attempt', extra={
            'event_type': 'auth_attempt',
            'email': email,
            'success': success,
            'ip_address': ip_address,
            'user_agent': user_agent,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    def log_suspicious_activity(self, user_id, activity_type, details):
        self.logger.warning('suspicious_activity', extra={
            'event_type': 'suspicious_activity',
            'user_id': user_id,
            'activity_type': activity_type,
            'details': details,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    def log_security_violation(self, violation_type, details, ip_address):
        self.logger.error('security_violation', extra={
            'event_type': 'security_violation',
            'violation_type': violation_type,
            'details': details,
            'ip_address': ip_address,
            'timestamp': datetime.utcnow().isoformat()
        })
```

### 16. Environment Variable Security

**Implementation Steps:**
```python
# backend/config.py
class SecureConfig:
    REQUIRED_ENV_VARS = [
        'FLASK_SECRET_KEY',
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'DATABASE_URL'
    ]
    
    @classmethod
    def validate_environment(cls):
        missing = []
        for var in cls.REQUIRED_ENV_VARS:
            if not os.environ.get(var):
                missing.append(var)
        
        if missing:
            raise EnvironmentError(f"Missing required environment variables: {', '.join(missing)}")
        
        # Validate format
        if not cls._validate_url(os.environ.get('SUPABASE_URL')):
            raise ValueError("Invalid SUPABASE_URL format")
        
        return True
```

### 17. API Versioning Security

**Implementation Steps:**
```python
# backend/utils/api_version.py
class APIVersioning:
    SUPPORTED_VERSIONS = ['v1', 'v2']
    DEPRECATED_VERSIONS = []
    DEFAULT_VERSION = 'v2'
    
    @classmethod
    def get_version(cls, request):
        # Check header first
        version = request.headers.get('API-Version')
        
        # Check URL path
        if not version:
            path = request.path
            for v in cls.SUPPORTED_VERSIONS:
                if f'/api/{v}/' in path:
                    version = v
                    break
        
        # Default version
        if not version:
            version = cls.DEFAULT_VERSION
        
        # Validate version
        if version in cls.DEPRECATED_VERSIONS:
            raise DeprecatedVersionError(f"API version {version} is deprecated")
        
        if version not in cls.SUPPORTED_VERSIONS:
            raise InvalidVersionError(f"API version {version} is not supported")
        
        return version
```

---

## PHASE 4: LOW PRIORITY ENHANCEMENTS (Week 7-8)

### 18. Request Validation Enhancement

**Implementation Steps:**
```python
# backend/middleware/request_validator.py
class StrictRequestValidator:
    ALLOWED_CONTENT_TYPES = {
        'POST': ['application/json', 'multipart/form-data'],
        'PUT': ['application/json'],
        'PATCH': ['application/json'],
        'GET': [None],
        'DELETE': [None]
    }
    
    @classmethod
    def validate_request(cls, request):
        method = request.method
        content_type = request.content_type
        
        if content_type:
            content_type = content_type.split(';')[0]
        
        allowed = cls.ALLOWED_CONTENT_TYPES.get(method, [])
        if content_type not in allowed and None not in allowed:
            raise ValueError(f"Invalid content type {content_type} for method {method}")
        
        # Validate JSON structure
        if content_type == 'application/json':
            try:
                data = request.get_json(force=True)
                if not isinstance(data, (dict, list)):
                    raise ValueError("Invalid JSON structure")
            except Exception as e:
                raise ValueError(f"Invalid JSON: {str(e)}")
        
        return True
```

### 19. Token Expiration UI

**Frontend Implementation:**
```javascript
// frontend/src/contexts/AuthContext.jsx
const AuthContext = React.createContext();

export const AuthProvider = ({ children }) => {
    const [tokenExpiry, setTokenExpiry] = useState(null);
    const [showExpiryWarning, setShowExpiryWarning] = useState(false);
    
    useEffect(() => {
        // Check token expiry every minute
        const interval = setInterval(() => {
            const expiry = getTokenExpiry();
            if (expiry) {
                const minutesLeft = (expiry - Date.now()) / 60000;
                
                if (minutesLeft < 5 && minutesLeft > 0) {
                    setShowExpiryWarning(true);
                } else if (minutesLeft <= 0) {
                    // Auto logout
                    logout();
                }
            }
        }, 60000);
        
        return () => clearInterval(interval);
    }, []);
    
    const refreshToken = async () => {
        try {
            const response = await api.post('/auth/refresh');
            setShowExpiryWarning(false);
            // Update token expiry
        } catch (error) {
            console.error('Failed to refresh token');
        }
    };
    
    return (
        <AuthContext.Provider value={{ 
            tokenExpiry, 
            showExpiryWarning, 
            refreshToken 
        }}>
            {children}
            {showExpiryWarning && (
                <TokenExpiryWarning onRefresh={refreshToken} />
            )}
        </AuthContext.Provider>
    );
};
```

### 20. Production CORS Configuration

**Implementation Steps:**
```python
# backend/cors_config.py
class ProductionCORS:
    @staticmethod
    def get_config(environment):
        if environment == 'production':
            return {
                'origins': [
                    'https://optioed.org',
                    'https://www.optioed.org'
                ],
                'methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                'allow_headers': ['Content-Type', 'Authorization', 'X-CSRF-Token'],
                'expose_headers': ['X-Total-Count', 'X-Page'],
                'supports_credentials': True,
                'max_age': 3600
            }
        elif environment == 'staging':
            return {
                'origins': ['https://staging.optioed.org'],
                'methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                'allow_headers': ['Content-Type', 'Authorization', 'X-CSRF-Token'],
                'supports_credentials': True
            }
        else:
            # Development - more permissive but still secure
            return {
                'origins': ['http://localhost:3000', 'http://localhost:5173'],
                'methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                'allow_headers': ['Content-Type', 'Authorization', 'X-CSRF-Token'],
                'supports_credentials': True
            }
```

### 21. Session Invalidation

**Implementation Steps:**
```python
# backend/utils/session_manager.py
class SessionManager:
    def __init__(self, redis_client):
        self.redis = redis_client
        self.SESSION_PREFIX = 'session:'
        self.BLACKLIST_PREFIX = 'blacklist:'
    
    def create_session(self, user_id, token, expiry=86400):
        session_key = f"{self.SESSION_PREFIX}{user_id}:{token[:16]}"
        self.redis.setex(session_key, expiry, json.dumps({
            'user_id': user_id,
            'created_at': datetime.utcnow().isoformat(),
            'token_hash': hashlib.sha256(token.encode()).hexdigest()
        }))
    
    def invalidate_session(self, user_id, token):
        # Add to blacklist
        blacklist_key = f"{self.BLACKLIST_PREFIX}{token[:16]}"
        self.redis.setex(blacklist_key, 86400, 'true')
        
        # Remove session
        session_pattern = f"{self.SESSION_PREFIX}{user_id}:*"
        for key in self.redis.scan_iter(match=session_pattern):
            session_data = json.loads(self.redis.get(key))
            if session_data['token_hash'] == hashlib.sha256(token.encode()).hexdigest():
                self.redis.delete(key)
    
    def is_session_valid(self, token):
        # Check blacklist first
        blacklist_key = f"{self.BLACKLIST_PREFIX}{token[:16]}"
        if self.redis.exists(blacklist_key):
            return False
        
        # Verify session exists
        session_pattern = f"{self.SESSION_PREFIX}*:{token[:16]}"
        return len(list(self.redis.scan_iter(match=session_pattern))) > 0
```

### 22. Dependency Scanning

**Implementation Steps:**
```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'  # Daily scan

jobs:
  python-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Safety check
        run: |
          pip install safety
          safety check --file backend/requirements.txt
      
      - name: Bandit security linter
        run: |
          pip install bandit
          bandit -r backend/ -f json -o bandit-report.json
      
      - name: pip-audit
        run: |
          pip install pip-audit
          pip-audit -r backend/requirements.txt

  javascript-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: NPM Audit
        run: |
          cd frontend
          npm audit --production
      
      - name: Snyk Security Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  docker-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'
      
      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
```

---

## Testing Strategy

### Unit Tests
```python
# tests/security/test_auth.py
def test_jwt_in_httponly_cookie():
    response = client.post('/api/auth/login', json={...})
    assert 'Set-Cookie' in response.headers
    assert 'httpOnly' in response.headers['Set-Cookie']
    assert 'access_token' not in response.json

def test_csrf_protection():
    # Without CSRF token
    response = client.post('/api/quests', json={...})
    assert response.status_code == 403
    
    # With CSRF token
    csrf_token = get_csrf_token()
    response = client.post('/api/quests', 
                          json={...},
                          headers={'X-CSRF-Token': csrf_token})
    assert response.status_code == 201
```

### Integration Tests
```python
def test_rate_limiting():
    for i in range(10):
        response = client.post('/api/auth/login', json={...})
        if i < 5:
            assert response.status_code != 429
        else:
            assert response.status_code == 429

def test_rls_enforcement():
    user1_token = authenticate_user('user1')
    user2_token = authenticate_user('user2')
    
    # User 1 creates data
    response = client.post('/api/data',
                          json={'private': 'data'},
                          headers={'Authorization': f'Bearer {user1_token}'})
    data_id = response.json['id']
    
    # User 2 tries to access
    response = client.get(f'/api/data/{data_id}',
                         headers={'Authorization': f'Bearer {user2_token}'})
    assert response.status_code == 403
```

### Security Tests
```python
def test_sql_injection():
    malicious_inputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "1; UPDATE users SET role='admin'"
    ]
    
    for payload in malicious_inputs:
        response = client.get(f'/api/users?id={payload}')
        assert response.status_code == 400
        assert 'error' in response.json

def test_xss_prevention():
    xss_payloads = [
        "<script>alert('XSS')</script>",
        "<img src=x onerror=alert('XSS')>",
        "javascript:alert('XSS')",
        "<svg onload=alert('XSS')>"
    ]
    
    for payload in xss_payloads:
        response = client.post('/api/comments',
                              json={'content': payload})
        assert response.status_code == 201
        
        # Verify sanitized output
        response = client.get('/api/comments')
        assert '<script>' not in response.text
        assert 'javascript:' not in response.text
```

---

## Rollout Plan

### Pre-deployment Checklist
- [ ] All critical fixes tested in staging
- [ ] Security scan passed
- [ ] Backup current production database
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] Team briefed on changes

### Deployment Sequence

#### Phase 1 Deployment (Critical)
1. **Maintenance mode** - Enable maintenance page
2. **Database backup** - Full backup of production database
3. **Deploy backend changes** - Critical security fixes
4. **Run migrations** - Database schema updates if needed
5. **Deploy frontend changes** - Updated authentication flow
6. **Smoke tests** - Basic functionality verification
7. **Monitor** - Watch for errors for 30 minutes
8. **Exit maintenance** - Resume normal operations

#### Phase 2 Deployment (High Priority)
1. **Deploy during low traffic** - 2 AM - 4 AM window
2. **Blue-green deployment** - Deploy to secondary environment first
3. **Gradual rollout** - 10% → 50% → 100% traffic
4. **Monitor metrics** - Watch for performance impact
5. **Quick rollback** if issues detected

#### Phase 3 & 4 Deployment
- Standard deployment process
- No downtime required
- Feature flags for gradual enablement

### Post-deployment Verification
- [ ] Security scan on production
- [ ] Penetration test scheduled
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify all features working
- [ ] Review security logs

---

## Monitoring & Alerting

### Security Metrics to Monitor
```python
# backend/monitoring/security_metrics.py
class SecurityMetrics:
    METRICS = {
        'failed_logins': {'threshold': 10, 'window': '5m'},
        'rate_limit_hits': {'threshold': 100, 'window': '1m'},
        'csrf_failures': {'threshold': 5, 'window': '5m'},
        'suspicious_requests': {'threshold': 20, 'window': '10m'},
        'error_rate': {'threshold': 5, 'window': '1m'}
    }
    
    @classmethod
    def check_thresholds(cls):
        alerts = []
        for metric, config in cls.METRICS.items():
            count = cls.get_metric_count(metric, config['window'])
            if count > config['threshold']:
                alerts.append({
                    'metric': metric,
                    'count': count,
                    'threshold': config['threshold'],
                    'severity': 'HIGH'
                })
        return alerts
```

### Alert Configuration
```yaml
# monitoring/alerts.yml
alerts:
  - name: security_violation
    condition: security_violations > 0
    channels: [email, slack, pagerduty]
    severity: critical
    
  - name: high_failed_login_rate
    condition: failed_logins > 50 in 5m
    channels: [slack]
    severity: high
    
  - name: rate_limit_spike
    condition: rate_limit_hits > 1000 in 5m
    channels: [slack]
    severity: medium
```

---

## Documentation Updates

### Security Documentation
- Update security policy document
- Create incident response playbook
- Document security architecture
- Update API documentation with security requirements
- Create security training materials

### Developer Guidelines
- Secure coding standards
- Security checklist for PRs
- Threat modeling templates
- Security testing guide
- Dependency update process

---

## Success Criteria

### Phase 1 Success
- No critical vulnerabilities in production
- All authentication flows secure
- No security-related downtime

### Phase 2 Success
- 50% reduction in security alerts
- Successful penetration test results
- No data breaches or incidents

### Phase 3 & 4 Success
- Full security compliance achieved
- Automated security testing in CI/CD
- Security metrics dashboard operational

---

## Risk Mitigation

### Potential Risks
1. **Authentication breaking changes** - Mitigate with gradual rollout
2. **Performance impact** - Load test all changes
3. **User experience degradation** - A/B test security features
4. **Integration failures** - Comprehensive integration tests
5. **Data migration issues** - Backup and rollback plans

### Rollback Procedures
```bash
# Quick rollback script
#!/bin/bash
echo "Rolling back to version $1"
kubectl set image deployment/backend backend=backend:$1
kubectl set image deployment/frontend frontend=frontend:$1
kubectl rollout status deployment/backend
kubectl rollout status deployment/frontend
echo "Rollback complete"
```

---

## Long-term Security Roadmap

### Q1 2024
- Complete all critical and high priority fixes
- Implement security monitoring
- Conduct penetration testing

### Q2 2024
- Complete medium priority improvements
- Implement WAF (Web Application Firewall)
- Security training for development team

### Q3 2024
- SOC 2 compliance preparation
- Implement SIEM (Security Information and Event Management)
- Regular security audits established

### Q4 2024
- Full security compliance achieved
- Bug bounty program launched
- Security champions program established

---

## Contact & Escalation

### Security Team
- Security Lead: security@optioed.org
- DevOps Lead: devops@optioed.org
- On-call: Use PagerDuty escalation

### Escalation Matrix
1. **Critical Security Incident**: Immediate - Security Lead + CTO
2. **High Priority Issue**: Within 1 hour - Security Lead
3. **Medium/Low Issues**: Next business day - Development Team

---

*Document Version: 1.0*
*Last Updated: [Current Date]*
*Next Review: [Quarterly]*