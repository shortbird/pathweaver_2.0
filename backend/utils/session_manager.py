"""
Secure session management using httpOnly cookies
"""
import os
import jwt
from datetime import datetime, timedelta, timezone
from flask import make_response, request
from functools import wraps
from typing import Optional, Dict, Any

class SessionManager:
    """Manages secure session tokens using httpOnly cookies"""
    
    def __init__(self):
        self.secret_key = os.getenv('JWT_SECRET_KEY') or os.getenv('SECRET_KEY') or os.getenv('FLASK_SECRET_KEY')
        if not self.secret_key:
            raise ValueError("JWT_SECRET_KEY, SECRET_KEY, or FLASK_SECRET_KEY environment variable must be set")
        self.access_token_expiry = timedelta(minutes=15)  # Short-lived access token
        self.refresh_token_expiry = timedelta(days=7)  # Longer-lived refresh token
        self.cookie_secure = os.getenv('FLASK_ENV') == 'production'
        self.cookie_samesite = 'None' if os.getenv('FLASK_ENV') == 'production' else 'Lax'
        
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
    
    def set_auth_cookies(self, response, user_id: str):
        """Set secure httpOnly cookies for authentication"""
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
        
        return response
    
    def clear_auth_cookies(self, response):
        """Clear authentication cookies"""
        response.set_cookie('access_token', '', expires=0, httponly=True, secure=self.cookie_secure, samesite=self.cookie_samesite)
        response.set_cookie('refresh_token', '', expires=0, httponly=True, secure=self.cookie_secure, samesite=self.cookie_samesite)
        return response
    
    def get_current_user_id(self) -> Optional[str]:
        """Get current user ID from cookie or Authorization header"""
        # First try to get from cookie
        access_token = request.cookies.get('access_token')
        
        # Fallback to Authorization header for backward compatibility
        if not access_token:
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                access_token = auth_header.replace('Bearer ', '')
        
        if not access_token:
            return None
        
        payload = self.verify_access_token(access_token)
        return payload.get('user_id') if payload else None
    
    def refresh_session(self) -> Optional[tuple]:
        """Refresh the session using refresh token"""
        refresh_token = request.cookies.get('refresh_token')
        
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
        
        return new_access_token, new_refresh_token

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