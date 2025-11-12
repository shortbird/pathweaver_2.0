"""
Secure session management using httpOnly cookies
"""
import os
import jwt
from datetime import datetime, timedelta, timezone
from flask import make_response, request
from functools import wraps
from typing import Optional, Dict, Any

from utils.logger import get_logger

logger = get_logger(__name__)

class SessionManager:
    """Manages secure session tokens using httpOnly cookies"""
    
    def __init__(self):
        self.secret_key = os.getenv('JWT_SECRET_KEY') or os.getenv('SECRET_KEY') or os.getenv('FLASK_SECRET_KEY')
        if not self.secret_key:
            raise ValueError("JWT_SECRET_KEY, SECRET_KEY, or FLASK_SECRET_KEY environment variable must be set")
        self.access_token_expiry = timedelta(minutes=15)  # Short-lived access token
        self.refresh_token_expiry = timedelta(days=7)  # Longer-lived refresh token
        self.masquerade_token_expiry = timedelta(hours=1)  # Masquerade sessions expire faster

        # Detect cross-origin deployment (frontend and backend on different domains)
        frontend_url = os.getenv('FRONTEND_URL', '')
        backend_url = os.getenv('BACKEND_URL', request.host_url if request else '')
        is_on_render = 'onrender.com' in frontend_url
        is_production = os.getenv('FLASK_ENV') == 'production'

        # Cross-origin means different domains - cookies with SameSite=None are blocked in incognito
        self.is_cross_origin = is_on_render or is_production

        # Cookie settings (for same-origin deployments only)
        self.cookie_secure = is_production or is_on_render
        self.cookie_samesite = 'None' if (is_production or is_on_render) else 'Lax'
        
    def generate_access_token(self, user_id: str) -> str:
        """Generate a JWT access token"""
        payload = {
            'user_id': user_id,
            'type': 'access',
            'exp': datetime.now(timezone.utc) + self.access_token_expiry,
            'iat': datetime.now(timezone.utc)
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')
    
    def generate_refresh_token(self, user_id: str) -> str:
        """Generate a JWT refresh token"""
        payload = {
            'user_id': user_id,
            'type': 'refresh',
            'exp': datetime.now(timezone.utc) + self.refresh_token_expiry,
            'iat': datetime.now(timezone.utc)
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')

    def generate_masquerade_token(self, admin_id: str, target_user_id: str) -> str:
        """Generate a JWT masquerade token (admin viewing as another user)"""
        payload = {
            'user_id': admin_id,
            'masquerade_as': target_user_id,
            'type': 'masquerade',
            'exp': datetime.now(timezone.utc) + self.masquerade_token_expiry,
            'iat': datetime.now(timezone.utc)
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')
    
    def verify_access_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode an access token"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            if payload.get('type') != 'access':
                return None
            return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return None
    
    def verify_refresh_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode a refresh token"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            if payload.get('type') != 'refresh':
                return None
            return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return None

    def verify_masquerade_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode a masquerade token"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            if payload.get('type') != 'masquerade':
                return None
            return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return None
    
    def set_auth_cookies(self, response, user_id: str):
        """Set secure httpOnly cookies for authentication (same-origin only)"""
        # ✅ INCOGNITO FIX: Skip cookies in cross-origin mode (they'll be blocked anyway)
        if self.is_cross_origin:
            logger.info("[SessionManager] Skipping cookie set (cross-origin mode)")
            return response

        access_token = self.generate_access_token(user_id)
        refresh_token = self.generate_refresh_token(user_id)

        # Set access token cookie
        response.set_cookie(
            'access_token',
            access_token,
            max_age=int(self.access_token_expiry.total_seconds()),
            httponly=True,
            secure=self.cookie_secure,
            samesite=self.cookie_samesite,
            path='/'
        )

        # Set refresh token cookie
        response.set_cookie(
            'refresh_token',
            refresh_token,
            max_age=int(self.refresh_token_expiry.total_seconds()),
            httponly=True,
            secure=self.cookie_secure,
            samesite=self.cookie_samesite,
            path='/'  # Available to all paths
        )

        logger.info("[SessionManager] Auth cookies set (same-origin mode)")
        return response
    
    def clear_auth_cookies(self, response):
        """Clear authentication cookies (same-origin only)"""
        # ✅ INCOGNITO FIX: Skip cookie clearing in cross-origin mode
        if self.is_cross_origin:
            logger.info("[SessionManager] Skipping cookie clear (cross-origin mode)")
            return response

        response.set_cookie('access_token', '', expires=0, httponly=True, secure=self.cookie_secure, samesite=self.cookie_samesite)
        response.set_cookie('refresh_token', '', expires=0, httponly=True, secure=self.cookie_secure, samesite=self.cookie_samesite)
        logger.info("[SessionManager] Auth cookies cleared (same-origin mode)")
        return response
    
    def get_current_user_id(self) -> Optional[str]:
        """Get current user ID from Authorization header or cookie"""
        # Prioritize Authorization header (works in all browsers including incognito)
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            access_token = auth_header.replace('Bearer ', '')
            payload = self.verify_access_token(access_token)
            if payload:
                return payload.get('user_id')

        # ✅ INCOGNITO FIX: In cross-origin mode, only use Authorization header
        if self.is_cross_origin:
            logger.debug("[SessionManager] No Authorization header in cross-origin mode")
            return None

        # Fallback to cookie for same-origin deployments only
        access_token = request.cookies.get('access_token')
        if not access_token:
            return None

        payload = self.verify_access_token(access_token)
        return payload.get('user_id') if payload else None

    def get_effective_user_id(self) -> Optional[str]:
        """Get the effective user ID (masquerade target if masquerading, else actual user)"""
        # Check for masquerade token first
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')

            # Try masquerade token first
            masquerade_payload = self.verify_masquerade_token(token)
            if masquerade_payload:
                return masquerade_payload.get('masquerade_as')

            # Fallback to regular access token
            access_payload = self.verify_access_token(token)
            if access_payload:
                return access_payload.get('user_id')

        # Cookie fallback for same-origin deployments
        if not self.is_cross_origin:
            access_token = request.cookies.get('access_token')
            if access_token:
                payload = self.verify_access_token(access_token)
                if payload:
                    return payload.get('user_id')

        return None

    def get_actual_admin_id(self) -> Optional[str]:
        """Get the actual admin user ID (during masquerade, returns admin not target)"""
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')

            # Check if this is a masquerade token
            masquerade_payload = self.verify_masquerade_token(token)
            if masquerade_payload:
                return masquerade_payload.get('user_id')  # This is the admin ID

            # Regular access token - return user_id
            access_payload = self.verify_access_token(token)
            if access_payload:
                return access_payload.get('user_id')

        return self.get_current_user_id()

    def is_masquerading(self) -> bool:
        """Check if the current session is a masquerade session"""
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')
            masquerade_payload = self.verify_masquerade_token(token)
            return masquerade_payload is not None
        return False

    def get_masquerade_info(self) -> Optional[Dict[str, str]]:
        """Get masquerade session info (admin_id and target_user_id)"""
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')
            masquerade_payload = self.verify_masquerade_token(token)
            if masquerade_payload:
                return {
                    'admin_id': masquerade_payload.get('user_id'),
                    'target_user_id': masquerade_payload.get('masquerade_as'),
                    'is_masquerading': True
                }
        return None
    
    def refresh_session(self, refresh_token_override: Optional[str] = None) -> Optional[tuple]:
        """Refresh the session using refresh token from cookie or request body"""
        # Allow refresh token to be passed in request body for cross-origin
        refresh_token = refresh_token_override or request.cookies.get('refresh_token')

        if not refresh_token:
            return None

        payload = self.verify_refresh_token(refresh_token)
        if not payload:
            return None

        user_id = payload.get('user_id')
        if not user_id:
            return None

        # Generate new tokens
        new_access_token = self.generate_access_token(user_id)
        new_refresh_token = self.generate_refresh_token(user_id)

        return new_access_token, new_refresh_token, user_id

# Global session manager instance
session_manager = SessionManager()

def require_auth_cookie(f):
    """Decorator to require authentication via secure cookies"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session_manager.get_current_user_id()
        
        if not user_id:
            return make_response({'error': 'Authentication required'}), 401
        
        return f(user_id, *args, **kwargs)
    
    return decorated_function