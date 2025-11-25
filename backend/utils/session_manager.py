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
        # Primary secret key for token signing
        self.secret_key = os.getenv('JWT_SECRET_KEY') or os.getenv('SECRET_KEY') or os.getenv('FLASK_SECRET_KEY')
        if not self.secret_key:
            raise ValueError("JWT_SECRET_KEY, SECRET_KEY, or FLASK_SECRET_KEY environment variable must be set")

        # Previous secret key for graceful rotation (optional)
        self.previous_secret_key = os.getenv('FLASK_SECRET_KEY_OLD')

        # Token version for tracking rotations
        self.token_version = os.getenv('TOKEN_VERSION', 'v1')

        self.access_token_expiry = timedelta(minutes=15)  # Short-lived access token
        self.refresh_token_expiry = timedelta(days=7)  # Longer-lived refresh token
        self.masquerade_token_expiry = timedelta(hours=1)  # Masquerade sessions expire faster

        # Log token versioning status
        if self.previous_secret_key:
            logger.info(f"[SessionManager] Token versioning enabled (version: {self.token_version}, supports old keys)")
        else:
            logger.info(f"[SessionManager] Token versioning enabled (version: {self.token_version})")

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
            'sub': user_id,  # CRITICAL: Supabase RLS expects 'sub' claim for auth.uid()
            'user_id': user_id,  # Keep for backward compatibility
            'type': 'access',
            'version': self.token_version,  # Add version for rotation tracking
            'exp': datetime.now(timezone.utc) + self.access_token_expiry,
            'iat': datetime.now(timezone.utc)
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')
    
    def generate_refresh_token(self, user_id: str) -> str:
        """Generate a JWT refresh token"""
        payload = {
            'sub': user_id,  # CRITICAL: Supabase RLS expects 'sub' claim for auth.uid()
            'user_id': user_id,  # Keep for backward compatibility
            'type': 'refresh',
            'version': self.token_version,  # Add version for rotation tracking
            'exp': datetime.now(timezone.utc) + self.refresh_token_expiry,
            'iat': datetime.now(timezone.utc)
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')

    def generate_masquerade_token(self, admin_id: str, target_user_id: str) -> str:
        """Generate a JWT masquerade token (admin viewing as another user)"""
        payload = {
            'sub': target_user_id,  # CRITICAL: Supabase RLS expects 'sub' for masqueraded user
            'user_id': admin_id,  # Keep admin ID for audit trail
            'masquerade_as': target_user_id,
            'type': 'masquerade',
            'version': self.token_version,  # Add version for rotation tracking
            'exp': datetime.now(timezone.utc) + self.masquerade_token_expiry,
            'iat': datetime.now(timezone.utc)
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')
    
    def verify_access_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode an access token (supports graceful key rotation)"""
        # Try current secret key first
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            if payload.get('type') == 'access':
                return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass

        # Fallback to previous secret key during rotation period
        if self.previous_secret_key:
            try:
                payload = jwt.decode(token, self.previous_secret_key, algorithms=['HS256'])
                if payload.get('type') == 'access':
                    logger.info(f"[SessionManager] Token validated with previous secret (version: {payload.get('version', 'unknown')})")
                    return payload
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                pass

        return None
    
    def verify_refresh_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode a refresh token (supports graceful key rotation)"""
        # Try current secret key first
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            if payload.get('type') == 'refresh':
                return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass

        # Fallback to previous secret key during rotation period
        if self.previous_secret_key:
            try:
                payload = jwt.decode(token, self.previous_secret_key, algorithms=['HS256'])
                if payload.get('type') == 'refresh':
                    logger.info(f"[SessionManager] Refresh token validated with previous secret (version: {payload.get('version', 'unknown')})")
                    return payload
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                pass

        return None

    def verify_masquerade_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode a masquerade token (supports graceful key rotation)"""
        # Try current secret key first
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            if payload.get('type') == 'masquerade':
                return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass

        # Fallback to previous secret key during rotation period
        if self.previous_secret_key:
            try:
                payload = jwt.decode(token, self.previous_secret_key, algorithms=['HS256'])
                if payload.get('type') == 'masquerade':
                    logger.info(f"[SessionManager] Masquerade token validated with previous secret (version: {payload.get('version', 'unknown')})")
                    return payload
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                pass

        return None
    
    def set_auth_cookies(self, response, user_id: str):
        """Set secure httpOnly cookies for authentication (works for both same-origin and cross-origin)"""
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

        mode = "cross-origin" if self.is_cross_origin else "same-origin"
        logger.info(f"[SessionManager] Auth cookies set ({mode} mode, SameSite={self.cookie_samesite}, Secure={self.cookie_secure})")
        return response
    
    def clear_auth_cookies(self, response):
        """Clear authentication cookies (works for both same-origin and cross-origin)"""
        response.set_cookie('access_token', '', expires=0, httponly=True, secure=self.cookie_secure, samesite=self.cookie_samesite)
        response.set_cookie('refresh_token', '', expires=0, httponly=True, secure=self.cookie_secure, samesite=self.cookie_samesite)

        mode = "cross-origin" if self.is_cross_origin else "same-origin"
        logger.info(f"[SessionManager] Auth cookies cleared ({mode} mode)")
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

        # Fallback to cookie (works in both same-origin and cross-origin with SameSite=None)
        access_token = request.cookies.get('access_token')
        if access_token:
            payload = self.verify_access_token(access_token)
            return payload.get('user_id') if payload else None

        return None

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

        # Cookie fallback (works in both same-origin and cross-origin)
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

    def get_access_token_string(self) -> Optional[str]:
        """Get the raw access token string from Authorization header or cookie"""
        # Prioritize Authorization header (works in all browsers including incognito)
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            return auth_header.replace('Bearer ', '')

        # Fallback to cookie (works in both same-origin and cross-origin with SameSite=None)
        return request.cookies.get('access_token')

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