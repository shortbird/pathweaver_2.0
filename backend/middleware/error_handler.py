from flask import jsonify, request
from werkzeug.exceptions import HTTPException
import logging
import traceback
from datetime import datetime
import json

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

class AppError(Exception):
    """Base application error class"""
    def __init__(self, message, status_code=500, error_code=None, details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code or self.__class__.__name__
        self.details = details or {}

class ValidationError(AppError):
    """Validation error"""
    def __init__(self, message, details=None):
        super().__init__(message, 400, 'VALIDATION_ERROR', details)

class AuthenticationError(AppError):
    """Authentication error"""
    def __init__(self, message='Authentication required'):
        super().__init__(message, 401, 'AUTHENTICATION_ERROR')

class AuthorizationError(AppError):
    """Authorization error"""
    def __init__(self, message='Insufficient permissions'):
        super().__init__(message, 403, 'AUTHORIZATION_ERROR')

class NotFoundError(AppError):
    """Resource not found error"""
    def __init__(self, resource_type, resource_id=None):
        message = f"{resource_type} not found"
        if resource_id:
            message += f": {resource_id}"
        super().__init__(message, 404, 'NOT_FOUND')

class ConflictError(AppError):
    """Resource conflict error"""
    def __init__(self, message, details=None):
        super().__init__(message, 409, 'CONFLICT', details)

class ExternalServiceError(AppError):
    """External service error (Supabase, Stripe, etc.)"""
    def __init__(self, service, message, original_error=None):
        details = {'service': service}
        if original_error:
            details['original_error'] = str(original_error)
        super().__init__(message, 503, 'EXTERNAL_SERVICE_ERROR', details)

class RateLimitError(AppError):
    """Rate limit exceeded error"""
    def __init__(self, message='Rate limit exceeded', retry_after=None):
        details = {'retry_after': retry_after} if retry_after else {}
        super().__init__(message, 429, 'RATE_LIMIT_EXCEEDED', details)

def format_error_response(error):
    """Format error response in standardized format"""
    response = {
        'error': {
            'message': error.message if hasattr(error, 'message') else str(error),
            'code': getattr(error, 'error_code', 'INTERNAL_ERROR'),
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
    }
    
    if hasattr(error, 'details') and error.details:
        response['error']['details'] = error.details
    
    # Add request ID for tracking
    if hasattr(request, 'id'):
        response['error']['request_id'] = request.id
    
    return response

def log_error(error, request_info=None):
    """Log error with structured context"""
    error_data = {
        'error_type': type(error).__name__,
        'error_message': str(error),
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }
    
    if request_info:
        error_data.update({
            'method': request_info.get('method'),
            'path': request_info.get('path'),
            'ip': request_info.get('ip'),
            'user_id': request_info.get('user_id')
        })
    
    if isinstance(error, AppError):
        error_data['error_code'] = error.error_code
        error_data['status_code'] = error.status_code
        if error.details:
            error_data['details'] = error.details
    
    # Log at appropriate level
    if isinstance(error, (ValidationError, NotFoundError)):
        logger.warning(json.dumps(error_data))
    elif isinstance(error, AppError) and error.status_code < 500:
        logger.warning(json.dumps(error_data))
    else:
        error_data['traceback'] = traceback.format_exc()
        logger.error(json.dumps(error_data))

class ErrorHandler:
    """Error handling middleware"""
    
    def __init__(self, app=None):
        self.app = app
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize error handlers"""
        self.app = app
        
        # Configure logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
        # Register error handlers
        app.register_error_handler(AppError, self.handle_app_error)
        app.register_error_handler(HTTPException, self.handle_http_error)
        app.register_error_handler(Exception, self.handle_generic_error)
        
        # Add request ID middleware
        app.before_request(self.add_request_id)
    
    def add_request_id(self):
        """Add unique request ID for tracking"""
        import uuid
        request.id = str(uuid.uuid4())
    
    def get_request_info(self):
        """Get request information for logging"""
        return {
            'method': request.method,
            'path': request.path,
            'ip': request.remote_addr,
            'user_id': getattr(request, 'user_id', None)
        }
    
    def handle_app_error(self, error):
        """Handle application errors"""
        log_error(error, self.get_request_info())
        response = format_error_response(error)
        resp = jsonify(response)
        # Ensure CORS headers are set for error responses
        origin = request.headers.get('Origin')
        if origin:
            resp.headers['Access-Control-Allow-Origin'] = origin
            resp.headers['Access-Control-Allow-Credentials'] = 'true'
        return resp, error.status_code
    
    def handle_http_error(self, error):
        """Handle HTTP errors"""
        app_error = AppError(
            error.description or str(error),
            error.code,
            error.__class__.__name__
        )
        log_error(app_error, self.get_request_info())
        response = format_error_response(app_error)
        return jsonify(response), error.code
    
    def handle_generic_error(self, error):
        """Handle unexpected errors"""
        # Check for specific external service errors
        error_str = str(error).lower()
        
        if 'supabase' in error_str:
            app_error = ExternalServiceError('Supabase', 'Database service error', error)
        elif 'stripe' in error_str:
            app_error = ExternalServiceError('Stripe', 'Payment service error', error)
        elif 'connection' in error_str or 'timeout' in error_str:
            app_error = ExternalServiceError('Network', 'Network connection error', error)
        else:
            app_error = AppError('An unexpected error occurred', 500, 'INTERNAL_ERROR')
        
        log_error(error, self.get_request_info())
        
        # In production, hide internal error details
        if self.app.config.get('ENV') == 'production':
            response = {
                'error': {
                    'message': 'An internal error occurred. Please try again later.',
                    'code': 'INTERNAL_ERROR',
                    'timestamp': datetime.utcnow().isoformat() + 'Z',
                    'request_id': getattr(request, 'id', None)
                }
            }
        else:
            response = format_error_response(app_error)
            response['error']['debug'] = {
                'exception': type(error).__name__,
                'message': str(error),
                'traceback': traceback.format_exc()
            }
        
        return jsonify(response), 500

# Create singleton instance
error_handler = ErrorHandler()