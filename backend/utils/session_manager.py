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
        self.acting_as_token_expiry = timedelta(hours=24)  # Acting as dependent sessions (longer for parents)

        # Session timeout configuration (independent of token expiry)
        # This provides an additional layer of security by enforcing absolute session timeouts
        self.SESSION_TIMEOUT = int(os.getenv('SESSION_TIMEOUT_HOURS', '24'))

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

        # Safari cookie domain attribute (Safari is strict about domain matching)
        # Extract domain from frontend URL for production
        self.cookie_domain = None
        if is_production and frontend_url:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(frontend_url)
                hostname = parsed.hostname
                if hostname and '.' in hostname:
                    # For onrender.com, use the full subdomain (e.g., optio-dev-frontend.onrender.com)
                    # For custom domains, use the root domain (e.g., .optioeducation.com)
                    if 'onrender.com' in hostname:
                        self.cookie_domain = hostname
                    else:
                        # Extract root domain for custom domains (e.g., .optioeducation.com)
                        parts = hostname.split('.')
                        if len(parts) >= 2:
                            self.cookie_domain = f".{'.'.join(parts[-2:])}"
            except Exception as e:
                logger.warning(f"[SessionManager] Failed to extract cookie domain: {e}")
                self.cookie_domain = None

    def is_session_expired(self, session_data: Dict[str, Any]) -> bool:
        """Check if session has exceeded timeout period

        Args:
            session_data: JWT payload containing 'iat' (issued at) claim

        Returns:
            bool: True if session is expired, False otherwise
        """
        if not session_data:
            return True

        # Use JWT's 'iat' (issued at) claim as session creation time
        created_at = session_data.get('iat')
        if not created_at:
            return True

        # Convert Unix timestamp to datetime
        session_created_at = datetime.fromtimestamp(created_at, tz=timezone.utc)
        session_age = datetime.now(timezone.utc) - session_created_at

        # Check if session age exceeds configured timeout
        timeout_exceeded = session_age.total_seconds() > (self.SESSION_TIMEOUT * 3600)

        if timeout_exceeded:
            logger.info(
                f"[SessionManager] Session timeout exceeded | "
                f"Age: {session_age.total_seconds() / 3600:.2f} hours | "
                f"Limit: {self.SESSION_TIMEOUT} hours"
            )

        return timeout_exceeded

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

    def generate_acting_as_token(self, parent_id: str, dependent_id: str) -> str:
        """Generate a JWT acting-as token (parent acting as dependent)"""
        payload = {
            'sub': dependent_id,  # CRITICAL: Supabase RLS expects 'sub' for dependent user
            'user_id': parent_id,  # Keep parent ID for audit trail
            'acting_as': dependent_id,
            'type': 'acting_as_dependent',
            'version': self.token_version,  # Add version for rotation tracking
            'exp': datetime.now(timezone.utc) + self.acting_as_token_expiry,
            'iat': datetime.now(timezone.utc)
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')
    
    def verify_access_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode an access token (supports graceful key rotation)"""
        # Try current secret key first
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            if payload.get('type') == 'access':
                # Check session timeout
                if self.is_session_expired(payload):
                    logger.info(f"[SessionManager] Access token rejected: session timeout exceeded")
                    return None
                return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass

        # Fallback to previous secret key during rotation period
        if self.previous_secret_key:
            try:
                payload = jwt.decode(token, self.previous_secret_key, algorithms=['HS256'])
                if payload.get('type') == 'access':
                    # Check session timeout
                    if self.is_session_expired(payload):
                        logger.info(f"[SessionManager] Access token (old key) rejected: session timeout exceeded")
                        return None
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
                # Check session timeout
                if self.is_session_expired(payload):
                    logger.info(f"[SessionManager] Refresh token rejected: session timeout exceeded")
                    return None
                return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass

        # Fallback to previous secret key during rotation period
        if self.previous_secret_key:
            try:
                payload = jwt.decode(token, self.previous_secret_key, algorithms=['HS256'])
                if payload.get('type') == 'refresh':
                    # Check session timeout
                    if self.is_session_expired(payload):
                        logger.info(f"[SessionManager] Refresh token (old key) rejected: session timeout exceeded")
                        return None
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
                # Check session timeout
                if self.is_session_expired(payload):
                    logger.info(f"[SessionManager] Masquerade token rejected: session timeout exceeded")
                    return None
                return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass

        # Fallback to previous secret key during rotation period
        if self.previous_secret_key:
            try:
                payload = jwt.decode(token, self.previous_secret_key, algorithms=['HS256'])
                if payload.get('type') == 'masquerade':
                    # Check session timeout
                    if self.is_session_expired(payload):
                        logger.info(f"[SessionManager] Masquerade token (old key) rejected: session timeout exceeded")
                        return None
                    logger.info(f"[SessionManager] Masquerade token validated with previous secret (version: {payload.get('version', 'unknown')})")
                    return payload
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                pass

        return None

    def verify_acting_as_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode an acting-as token (supports graceful key rotation)"""
        # Try current secret key first
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            if payload.get('type') == 'acting_as_dependent':
                # Check session timeout
                if self.is_session_expired(payload):
                    logger.info(f"[SessionManager] Acting-as token rejected: session timeout exceeded")
                    return None
                return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass

        # Fallback to previous secret key during rotation period
        if self.previous_secret_key:
            try:
                payload = jwt.decode(token, self.previous_secret_key, algorithms=['HS256'])
                if payload.get('type') == 'acting_as_dependent':
                    # Check session timeout
                    if self.is_session_expired(payload):
                        logger.info(f"[SessionManager] Acting-as token (old key) rejected: session timeout exceeded")
                        return None
                    logger.info(f"[SessionManager] Acting-as token validated with previous secret (version: {payload.get('version', 'unknown')})")
                    return payload
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                pass

        return None
    
    def set_auth_cookies(self, response, user_id: str):
        """Set secure httpOnly cookies for authentication (works for both same-origin and cross-origin)"""
        access_token = self.generate_access_token(user_id)
        refresh_token = self.generate_refresh_token(user_id)

        # Safari ITP Fix: Add Partitioned attribute for cross-origin cookies
        # This enables CHIPS (Cookies Having Independent Partitioned State)
        # which bypasses Safari's Intelligent Tracking Prevention
        partitioned = self.is_cross_origin

        # Safari Domain Fix: Explicitly set domain for better compatibility
        # Safari is stricter about domain matching than other browsers
        cookie_kwargs = {
            'httponly': True,
            'secure': self.cookie_secure,
            'samesite': self.cookie_samesite,
            'path': '/',
            'partitioned': partitioned
        }

        # Add domain attribute if configured (Safari compatibility)
        if self.cookie_domain:
            cookie_kwargs['domain'] = self.cookie_domain

        # Set access token cookie
        response.set_cookie(
            'access_token',
            access_token,
            max_age=int(self.access_token_expiry.total_seconds()),
            **cookie_kwargs
        )

        # Set refresh token cookie
        response.set_cookie(
            'refresh_token',
            refresh_token,
            max_age=int(self.refresh_token_expiry.total_seconds()),
            **cookie_kwargs
        )

        mode = "cross-origin" if self.is_cross_origin else "same-origin"
        domain_info = f", Domain={self.cookie_domain}" if self.cookie_domain else ""

        # Enhanced logging for Safari debugging
        logger.info(
            f"[SessionManager] Auth cookies set for user {user_id[:8]}... | "
            f"Mode: {mode} | SameSite: {self.cookie_samesite} | "
            f"Secure: {self.cookie_secure} | Partitioned: {partitioned}{domain_info} | "
            f"Access TTL: {int(self.access_token_expiry.total_seconds())}s | "
            f"Refresh TTL: {int(self.refresh_token_expiry.total_seconds())}s"
        )

        # Safari-specific warning if domain not set in production
        if self.is_cross_origin and not self.cookie_domain:
            logger.warning(
                f"[SessionManager] SAFARI WARNING: Cross-origin mode enabled but cookie_domain not set. "
                f"Safari/iOS users may experience cookie blocking. Check FRONTEND_URL environment variable."
            )

        return response
    
    def clear_auth_cookies(self, response):
        """Clear authentication cookies (works for both same-origin and cross-origin)"""
        # Safari ITP Fix: Include Partitioned attribute when clearing cookies
        partitioned = self.is_cross_origin

        # Safari Domain Fix: Use same domain attribute when clearing
        # CRITICAL: Must match the path used when setting cookies
        cookie_kwargs = {
            'expires': 0,
            'httponly': True,
            'secure': self.cookie_secure,
            'samesite': self.cookie_samesite,
            'path': '/',  # CRITICAL: Must match path used in set_auth_cookies
            'partitioned': partitioned
        }

        # CRITICAL FIX: Clear cookies BOTH with and without domain attribute
        # This ensures cookies are cleared regardless of how they were set
        # First try with domain (if configured)
        if self.cookie_domain:
            cookie_kwargs_with_domain = cookie_kwargs.copy()
            cookie_kwargs_with_domain['domain'] = self.cookie_domain
            response.set_cookie('access_token', '', **cookie_kwargs_with_domain)
            response.set_cookie('refresh_token', '', **cookie_kwargs_with_domain)
            response.set_cookie('masquerade_token', '', **cookie_kwargs_with_domain)

        # Then clear without domain (for current hostname)
        response.set_cookie('access_token', '', **cookie_kwargs)
        response.set_cookie('refresh_token', '', **cookie_kwargs)
        response.set_cookie('masquerade_token', '', **cookie_kwargs)

        mode = "cross-origin" if self.is_cross_origin else "same-origin"
        domain_info = f", domain={self.cookie_domain}" if self.cookie_domain else ""

        # Enhanced logging
        logger.info(
            f"[SessionManager] Auth cookies cleared ({mode} mode{domain_info}) | "
            f"Cleared with AND without domain | "
            f"Secure: {self.cookie_secure} | SameSite: {self.cookie_samesite} | "
            f"Partitioned: {partitioned} | Path: /"
        )

        return response
    
    def get_current_user_id(self) -> Optional[str]:
        """Get current user ID from Authorization header or cookie

        For masquerade sessions, returns the admin's user ID (not the target user).
        Use get_effective_user_id() to get the masqueraded user ID.
        """
        # Prioritize Authorization header (works in all browsers including incognito)
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')

            # Try access token first
            payload = self.verify_access_token(token)
            if payload:
                user_id = payload.get('user_id')
                # Log Safari/iOS/Firefox header usage for debugging
                user_agent = request.headers.get('User-Agent', '')
                is_safari_ios = ('Safari' in user_agent and 'Chrome' not in user_agent) or 'iPhone' in user_agent or 'iPad' in user_agent
                is_firefox = 'Firefox' in user_agent
                if is_safari_ios:
                    logger.debug(f"[SessionManager] Safari/iOS auth via header for user {user_id[:8]}...")
                elif is_firefox:
                    logger.debug(f"[SessionManager] Firefox auth via header for user {user_id[:8]}...")
                return user_id

            # Try masquerade token (admin masquerading as another user)
            masquerade_payload = self.verify_masquerade_token(token)
            if masquerade_payload:
                # Return the admin's user_id, not the target
                admin_id = masquerade_payload.get('user_id')
                logger.debug(f"[SessionManager] Masquerade token auth for admin {admin_id[:8]}...")
                return admin_id

            # Try acting-as token (parent acting as dependent)
            acting_as_payload = self.verify_acting_as_token(token)
            if acting_as_payload:
                # Return the parent's user_id, not the dependent
                parent_id = acting_as_payload.get('user_id')
                logger.debug(f"[SessionManager] Acting-as token auth for parent {parent_id[:8]}...")
                return parent_id

        # Fallback to cookie (works in both same-origin and cross-origin with SameSite=None)
        access_token = request.cookies.get('access_token')
        if access_token:
            payload = self.verify_access_token(access_token)
            if payload:
                user_id = payload.get('user_id')
                # Log cookie auth for Safari/Firefox debugging (unexpected on these browsers)
                user_agent = request.headers.get('User-Agent', '')
                is_safari_ios = ('Safari' in user_agent and 'Chrome' not in user_agent) or 'iPhone' in user_agent or 'iPad' in user_agent
                is_firefox = 'Firefox' in user_agent
                if is_safari_ios:
                    logger.info(f"[SessionManager] Safari/iOS auth via COOKIE for user {user_id[:8]}... (unexpected - cookies usually blocked)")
                elif is_firefox:
                    logger.info(f"[SessionManager] Firefox auth via COOKIE for user {user_id[:8]}... (unexpected - cookies usually blocked with ETP)")
                return user_id
            return None

        # No auth method found
        user_agent = request.headers.get('User-Agent', '')[:50]
        is_safari_ios = ('Safari' in user_agent and 'Chrome' not in user_agent) or 'iPhone' in user_agent or 'iPad' in user_agent
        is_firefox = 'Firefox' in user_agent
        if is_safari_ios:
            logger.debug(f"[SessionManager] Safari/iOS request with no auth: {request.path}")
        elif is_firefox:
            logger.debug(f"[SessionManager] Firefox request with no auth: {request.path}")

        return None

    def get_effective_user_id(self) -> Optional[str]:
        """Get the effective user ID (masquerade/acting-as target if applicable, else actual user)"""
        # Check Authorization header first
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')

            # Try acting-as token first (parent acting as dependent)
            acting_as_payload = self.verify_acting_as_token(token)
            if acting_as_payload:
                return acting_as_payload.get('acting_as')

            # Try masquerade token second (admin masquerading as user)
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

        # Get token issued at timestamp (iat claim)
        token_issued_at = payload.get('iat')
        if token_issued_at:
            # Convert Unix timestamp to datetime
            token_issued_at = datetime.fromtimestamp(token_issued_at, tz=timezone.utc)
        else:
            # If no iat, use current time (should never happen)
            token_issued_at = datetime.now(timezone.utc)

        # Generate new tokens
        new_access_token = self.generate_access_token(user_id)
        new_refresh_token = self.generate_refresh_token(user_id)

        return new_access_token, new_refresh_token, user_id, token_issued_at

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