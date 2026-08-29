"""
Secure session management using httpOnly cookies
"""
import jwt
import hashlib
import re
from datetime import datetime, timedelta, timezone
from flask import make_response, request
from functools import wraps
from typing import Optional, Dict, Any

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

class SessionManager:
    """Manages secure session tokens using httpOnly cookies"""
    
    def __init__(self):
        # Primary secret key for token signing
        self.secret_key = Config.JWT_SECRET_KEY
        if not self.secret_key:
            raise ValueError("JWT_SECRET_KEY or FLASK_SECRET_KEY must be set (see Config.JWT_SECRET_KEY)")

        # Previous secret key for graceful rotation (optional)
        self.previous_secret_key = Config.JWT_PREVIOUS_SECRET_KEY

        # Token version for tracking rotations
        self.token_version = Config.TOKEN_VERSION

        self.access_token_expiry = timedelta(minutes=15)  # Short-lived access token
        self.refresh_token_expiry = timedelta(days=Config.REFRESH_TOKEN_EXPIRY_DAYS)
        self.masquerade_token_expiry = timedelta(hours=1)  # Masquerade sessions expire faster
        self.acting_as_token_expiry = timedelta(hours=24)  # Acting as dependent sessions (longer for parents)

        # Absolute ceilings on an impersonation session, measured from the
        # ORIGINAL grant (`iat0`) rather than the current token's `iat`. The
        # per-token expiries above cap one token; these cap the chain. Without
        # them a refresh re-stamps `iat` and slides the deadline forward on every
        # call, so a one-hour masquerade renews itself forever.
        #
        # The two differ because the grants differ. A superadmin masquerading is
        # a support action inside one sitting, so it gets a working day and then
        # has to be re-granted through @require_admin. A parent acting as their
        # own dependent is an ongoing custodial relationship, and expiring it
        # every few hours would just train families to re-authenticate reflexively.
        self.masquerade_max_lifetime = timedelta(hours=8)
        self.acting_as_max_lifetime = timedelta(days=30)

        # Session timeout configuration (independent of token expiry)
        # This provides an additional layer of security by enforcing absolute session timeouts
        self.SESSION_TIMEOUT = Config.SESSION_TIMEOUT_HOURS

        # A refresh token that outlives the session-timeout window is a silent
        # logout machine: verify_refresh_token() runs is_session_expired() on the
        # `iat` claim, so the token is rejected while its own `exp` — and the
        # Set-Cookie Max-Age derived from it — still say it is good. The client
        # sees a 401 on the first refresh after a break and shows the login
        # screen, which is indistinguishable from "the app logged me out".
        # The defaults line up (720h == 30d); an env override on only one of the
        # two silently breaks it, so say so loudly at boot rather than leaving it
        # to be rediscovered from user reports.
        refresh_hours = Config.REFRESH_TOKEN_EXPIRY_DAYS * 24
        if refresh_hours > self.SESSION_TIMEOUT:
            logger.error(
                f"[SessionManager] MISCONFIGURED SESSION LIFETIME: "
                f"REFRESH_TOKEN_EXPIRY_DAYS={Config.REFRESH_TOKEN_EXPIRY_DAYS} ({refresh_hours}h) "
                f"exceeds SESSION_TIMEOUT_HOURS={self.SESSION_TIMEOUT}. Refresh tokens will be "
                f"rejected after {self.SESSION_TIMEOUT}h even though the cookie lives "
                f"{Config.REFRESH_TOKEN_EXPIRY_DAYS}d — users will be logged out early. "
                f"Raise SESSION_TIMEOUT_HOURS to at least {refresh_hours}."
            )

        # Log token versioning status
        if self.previous_secret_key:
            logger.info(f"[SessionManager] Token versioning enabled (version: {self.token_version}, supports old keys)")
        else:
            logger.info(f"[SessionManager] Token versioning enabled (version: {self.token_version})")

        # Detect cross-origin deployment (frontend and backend on different domains)
        frontend_url = Config.FRONTEND_URL
        backend_url = Config.BACKEND_URL or (request.host_url if request else '')
        is_on_render = 'onrender.com' in frontend_url
        is_production = Config.FLASK_ENV == 'production'

        # Check if frontend and backend are on same root domain (e.g., www.optioeducation.com and api.optioeducation.com)
        # Same-site means cookies work with SameSite=Lax (more secure, no third-party cookie issues)
        is_same_site = False
        if frontend_url and backend_url:
            try:
                from urllib.parse import urlparse
                frontend_host = urlparse(frontend_url).hostname or ''
                backend_host = urlparse(backend_url).hostname or ''
                # Extract root domains (last 2 parts)
                frontend_root = '.'.join(frontend_host.split('.')[-2:]) if '.' in frontend_host else frontend_host
                backend_root = '.'.join(backend_host.split('.')[-2:]) if '.' in backend_host else backend_host
                is_same_site = frontend_root == backend_root and 'onrender.com' not in frontend_root
                if is_same_site:
                    logger.info(f"[SessionManager] Same-site deployment detected: {frontend_root}")
            except Exception as e:
                logger.warning(f"[SessionManager] Failed to detect same-site: {e}")

        # Cross-origin means different domains - cookies with SameSite=None are blocked in incognito
        # IMPORTANT: Same-site deployments (e.g., www.example.com + api.example.com) are NOT cross-origin
        self.is_cross_origin = (is_on_render or is_production) and not is_same_site

        # Cookie settings
        # Same-site: Use Lax (secure, works without third-party cookie issues)
        # Cross-origin: Use None (required for cross-origin, but blocked by some browsers)
        self.cookie_secure = is_production or is_on_render
        self.cookie_samesite = 'Lax' if is_same_site else ('None' if (is_production or is_on_render) else 'Lax')

        # Safari cookie domain attribute (Safari is strict about domain matching)
        # Extract domain from frontend URL for production
        self.cookie_domain = None
        if is_production and frontend_url:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(frontend_url)
                hostname = parsed.hostname
                if hostname and '.' in hostname:
                    # For onrender.com, use the full subdomain (e.g., optio-dev-frontend-r3v8.onrender.com)
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

    # Every run of digits in a User-Agent is a version number: the browser's,
    # the engine's, the OS build's. Hashing them made the fingerprint change on
    # every Chrome release, so it could only ever be logged, never enforced --
    # enforcing it would have signed out every Chrome user roughly monthly.
    # Stripping them leaves the part that actually identifies the device class
    # (platform, browser family, engine), which is the thing worth binding to.
    _UA_VERSION_DIGITS = re.compile(r'\d+')

    def _get_device_fingerprint(self) -> str:
        """
        Version-insensitive device fingerprint from the User-Agent header.

        Returns:
            str: First 16 characters of SHA-256 hash of the normalized UA
        """
        ua = request.headers.get('User-Agent', '')
        normalized = self._UA_VERSION_DIGITS.sub('', ua)
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    def _check_device_fingerprint(self, payload: Dict[str, Any], token_type: str,
                                  enforce: bool = False) -> bool:
        """
        Check the token's device fingerprint against the current request.

        Args:
            payload: Decoded JWT payload
            token_type: Type of token (access, refresh, etc.) — for logging
            enforce: whether a mismatch should reject. Refresh enforces; access
                observes. A stolen access token dies in 15 minutes on its own,
                while a refresh token is the one worth binding to a device, and
                keeping access permissive means a fingerprint bug degrades to
                noisy logs rather than a platform-wide sign-out.

        Returns:
            bool: True if the token may be used on this device.

        Two claims exist on purpose:

          `dfp2` — the version-insensitive fingerprint above. Enforceable.
          `dfp`  — the old raw-UA hash. Tokens carrying it are already in the
                   wild and their value changes on the user's next browser
                   update, so it is observed and NEVER rejected. Enforcing it
                   at deploy would sign out everyone holding a live session.

        Legacy tokens age out on their own; once every live token carries
        `dfp2`, the `dfp` branch can go.
        """
        stored = payload.get('dfp2')
        if not stored:
            if payload.get('dfp'):
                logger.debug(
                    f"[SessionManager] Legacy dfp-only {token_type} token; "
                    f"fingerprint not enforced"
                )
            # Either a legacy token or one predating fingerprinting entirely.
            return True

        current = self._get_device_fingerprint()
        if stored == current:
            return True

        user_id = str(payload.get('user_id', 'unknown'))
        logger.warning(
            f"[SessionManager] Device fingerprint mismatch for {token_type} token | "
            f"User: {user_id[:8]}... | "
            f"Token DFP: {stored} | "
            f"Request DFP: {current} | "
            f"Enforcing: {enforce} | "
            f"UA: {request.headers.get('User-Agent', 'unknown')[:50]}..."
        )
        return not enforce

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
            'dfp2': self._get_device_fingerprint(),  # Version-insensitive device binding
            'exp': datetime.now(timezone.utc) + self.access_token_expiry,
            'iat': datetime.now(timezone.utc)
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')
    
    def generate_refresh_token(self, user_id: str,
                               family_id: Optional[str] = None,
                               jti: Optional[str] = None) -> str:
        """Generate a JWT refresh token.

        `fam` names the rotation chain this token belongs to and `jti` names this
        single token within it. Together they are what makes a refresh token
        one-time: /api/auth/refresh checks the presented `jti` against the one
        the family says is live, and treats any other member of the family as a
        replay of a token that was already spent
        (utils/refresh_families.py).

        Both are minted here as plain UUIDs and NOT written to the database --
        this method is on the login path and stays pure crypto. The family row is
        created on the chain's first refresh, which is the first moment the
        distinction between "current" and "spent" can matter.
        """
        from utils import refresh_families
        payload = {
            'sub': user_id,  # CRITICAL: Supabase RLS expects 'sub' claim for auth.uid()
            'user_id': user_id,  # Keep for backward compatibility
            'type': 'refresh',
            'version': self.token_version,  # Add version for rotation tracking
            'dfp2': self._get_device_fingerprint(),  # Version-insensitive device binding
            'fam': family_id or refresh_families.new_family_id(),
            'jti': jti or refresh_families.new_jti(),
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

    def generate_role_view_token(self, user_id: str, role: str,
                                 organization_id: Optional[str] = None) -> str:
        """Generate a role-view token: this user's session narrowed to ONE role
        ("View as teacher"). Privilege can only go down — the role is re-checked
        against the user's real roles at every application
        (utils.roles.apply_role_view), so a stale or stolen token can never
        grant a role the account does not hold. organization_id pins a
        superadmin (who has no org of their own) to the org being viewed."""
        payload = {
            'user_id': user_id,
            'act_as_role': role,
            'organization_id': organization_id,
            'type': 'role_view',
            'version': self.token_version,
            'exp': datetime.now(timezone.utc) + timedelta(hours=12),
            'iat': datetime.now(timezone.utc),
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')

    def verify_role_view_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode a role-view token (supports graceful key rotation)."""
        for key in filter(None, (self.secret_key, self.previous_secret_key)):
            try:
                payload = jwt.decode(token, key, algorithms=['HS256'])
                if payload.get('type') == 'role_view':
                    return payload
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                continue
        return None

    def get_role_view(self) -> Optional[Dict[str, str]]:
        """The active role view on this request: {'user_id', 'role'} or None.

        Reads the X-Role-View header first (header-auth fallback browsers),
        then the httpOnly role_view_token cookie. Verification only — whether
        the view applies to a given user dict is decided in utils.roles with
        the id match and the real-roles re-check.
        """
        try:
            token = request.headers.get('X-Role-View') or request.cookies.get('role_view_token')
        except RuntimeError:
            return None
        if not token:
            return None
        payload = self.verify_role_view_token(token)
        if not payload:
            return None
        return {'user_id': payload.get('user_id'), 'role': payload.get('act_as_role'),
                'organization_id': payload.get('organization_id')}

    def set_role_view_cookie(self, response, token: str):
        """Set the httpOnly role_view_token cookie (same shape as masquerade)."""
        partitioned = self.is_cross_origin
        cookie_kwargs = {
            'httponly': True,
            'secure': self.cookie_secure,
            'samesite': self.cookie_samesite,
            'path': '/',
            'partitioned': partitioned,
        }
        if self.cookie_domain:
            cookie_kwargs['domain'] = self.cookie_domain
        response.set_cookie('role_view_token', token,
                            max_age=int(timedelta(hours=12).total_seconds()),
                            **cookie_kwargs)
        return response

    def clear_role_view_cookie(self, response):
        """Clear only the role_view_token cookie."""
        partitioned = self.is_cross_origin
        cookie_kwargs = {
            'expires': 0,
            'httponly': True,
            'secure': self.cookie_secure,
            'samesite': self.cookie_samesite,
            'path': '/',
            'partitioned': partitioned,
        }
        if self.cookie_domain:
            domain_kwargs = cookie_kwargs.copy()
            domain_kwargs['domain'] = self.cookie_domain
            response.set_cookie('role_view_token', '', **domain_kwargs)
        response.set_cookie('role_view_token', '', **cookie_kwargs)
        return response

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

    def generate_masquerade_refresh_token(self, admin_id: str, target_user_id: str,
                                          origin_iat: Optional[int] = None) -> str:
        """Generate a refresh token for a masquerade session.

        Native clients have no httpOnly cookie to anchor the masquerade identity,
        so without a dedicated refresh token the 401-refresh path would mint a
        regular admin access token and silently drop the admin back into their own
        identity. This refresh token lets /api/auth/refresh re-mint a masquerade
        access token instead, preserving the target user across refreshes.

        `origin_iat` carries the moment the masquerade was FIRST granted, and is
        passed through unchanged by every subsequent refresh. `iat` re-stamps on
        each renewal, so it cannot answer "how long has this been going on" --
        which is the only question an absolute cap can be built on. Omit it when
        the grant is being made for the first time.
        """
        now = datetime.now(timezone.utc)
        payload = {
            'sub': target_user_id,
            'user_id': admin_id,  # admin identity, mirrors generate_masquerade_token
            'masquerade_as': target_user_id,
            'type': 'masquerade_refresh',
            'version': self.token_version,
            'exp': now + self.refresh_token_expiry,
            'iat': now,
            'iat0': origin_iat if origin_iat is not None else int(now.timestamp()),
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')

    def generate_acting_as_refresh_token(self, parent_id: str, dependent_id: str,
                                         origin_iat: Optional[int] = None) -> str:
        """Generate a refresh token for a parent acting-as-dependent session.

        Same rationale as generate_masquerade_refresh_token: keeps the dependent
        identity stable across token refreshes on native (no cookie anchor), and
        `origin_iat` pins the original grant so refreshing cannot extend it
        indefinitely.
        """
        now = datetime.now(timezone.utc)
        payload = {
            'sub': dependent_id,
            'user_id': parent_id,  # parent identity, mirrors generate_acting_as_token
            'acting_as': dependent_id,
            'type': 'acting_as_refresh',
            'version': self.token_version,
            'exp': now + self.refresh_token_expiry,
            'iat': now,
            'iat0': origin_iat if origin_iat is not None else int(now.timestamp()),
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
                # Observed, not enforced: a stolen access token dies in
                # minutes on its own, and rejecting here would turn any
                # fingerprint bug into a platform-wide sign-out.
                self._check_device_fingerprint(payload, 'access', enforce=False)
                return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            logger.debug("intentional swallow", exc_info=True)

        # Fallback to previous secret key during rotation period
        if self.previous_secret_key:
            try:
                payload = jwt.decode(token, self.previous_secret_key, algorithms=['HS256'])
                if payload.get('type') == 'access':
                    # Check session timeout
                    if self.is_session_expired(payload):
                        logger.info(f"[SessionManager] Access token (old key) rejected: session timeout exceeded")
                        return None
                    self._check_device_fingerprint(payload, 'access', enforce=False)
                    logger.info(f"[SessionManager] Token validated with previous secret (version: {payload.get('version', 'unknown')})")
                    return payload
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                logger.debug("intentional swallow", exc_info=True)

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
                # A refresh token is the long-lived one, so it is the one worth
                # binding to a device. Legacy `dfp`-only tokens are exempt
                # inside the check, so this does not sign out live sessions.
                if not self._check_device_fingerprint(payload, 'refresh', enforce=True):
                    logger.warning("[SessionManager] Refresh token rejected: device fingerprint mismatch")
                    return None
                return payload
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            logger.debug("intentional swallow", exc_info=True)

        # Fallback to previous secret key during rotation period
        if self.previous_secret_key:
            try:
                payload = jwt.decode(token, self.previous_secret_key, algorithms=['HS256'])
                if payload.get('type') == 'refresh':
                    # Check session timeout
                    if self.is_session_expired(payload):
                        logger.info(f"[SessionManager] Refresh token (old key) rejected: session timeout exceeded")
                        return None
                    if not self._check_device_fingerprint(payload, 'refresh', enforce=True):
                        logger.warning("[SessionManager] Refresh token (old key) rejected: device fingerprint mismatch")
                        return None
                    logger.info(f"[SessionManager] Refresh token validated with previous secret (version: {payload.get('version', 'unknown')})")
                    return payload
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                logger.debug("intentional swallow", exc_info=True)

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
            logger.debug("intentional swallow", exc_info=True)

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
                logger.debug("intentional swallow", exc_info=True)

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
            logger.debug("intentional swallow", exc_info=True)

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
                logger.debug("intentional swallow", exc_info=True)

        return None

    def _verify_impersonation_refresh_token(self, token: str, expected_type: str) -> Optional[Dict[str, Any]]:
        """Verify a masquerade/acting-as refresh token (supports key rotation)."""
        for key, label in ((self.secret_key, 'current'), (self.previous_secret_key, 'previous')):
            if not key:
                continue
            try:
                payload = jwt.decode(token, key, algorithms=['HS256'])
                if payload.get('type') == expected_type:
                    if self.is_session_expired(payload):
                        logger.info(f"[SessionManager] {expected_type} rejected: session timeout exceeded")
                        return None
                    if label == 'previous':
                        logger.info(f"[SessionManager] {expected_type} validated with previous secret (version: {payload.get('version', 'unknown')})")
                    return payload
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                logger.debug("intentional swallow", exc_info=True)
        return None

    def verify_masquerade_refresh_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode a masquerade refresh token."""
        return self._verify_impersonation_refresh_token(token, 'masquerade_refresh')

    def verify_acting_as_refresh_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode an acting-as refresh token."""
        return self._verify_impersonation_refresh_token(token, 'acting_as_refresh')

    def set_auth_cookies(self, response, user_id: str, access_token: str = None, refresh_token: str = None):
        """Set secure httpOnly cookies for authentication (works for both same-origin and cross-origin)

        Args:
            response: Flask response object
            user_id: User ID for token generation (if tokens not provided)
            access_token: Optional pre-generated access token (to ensure consistency with response body)
            refresh_token: Optional pre-generated refresh token (to ensure consistency with response body)
        """
        # Use provided tokens or generate new ones
        if not access_token:
            access_token = self.generate_access_token(user_id)
        if not refresh_token:
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

    def set_masquerade_cookie(self, response, masquerade_token: str):
        """Set the httpOnly masquerade_token cookie. Used so masquerade survives
        page reloads under the in-memory-only token model (C2)."""
        partitioned = self.is_cross_origin
        cookie_kwargs = {
            'httponly': True,
            'secure': self.cookie_secure,
            'samesite': self.cookie_samesite,
            'path': '/',
            'partitioned': partitioned,
        }
        if self.cookie_domain:
            cookie_kwargs['domain'] = self.cookie_domain
        response.set_cookie(
            'masquerade_token',
            masquerade_token,
            max_age=int(self.masquerade_token_expiry.total_seconds()),
            **cookie_kwargs,
        )
        logger.info(f"[SessionManager] Masquerade cookie set | TTL: {int(self.masquerade_token_expiry.total_seconds())}s")
        return response

    def clear_masquerade_cookie(self, response):
        """Clear only the masquerade_token cookie (leaves admin auth intact)."""
        partitioned = self.is_cross_origin
        cookie_kwargs = {
            'expires': 0,
            'httponly': True,
            'secure': self.cookie_secure,
            'samesite': self.cookie_samesite,
            'path': '/',
            'partitioned': partitioned,
        }
        if self.cookie_domain:
            domain_kwargs = cookie_kwargs.copy()
            domain_kwargs['domain'] = self.cookie_domain
            response.set_cookie('masquerade_token', '', **domain_kwargs)
        response.set_cookie('masquerade_token', '', **cookie_kwargs)
        logger.info("[SessionManager] Masquerade cookie cleared")
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
            response.set_cookie('role_view_token', '', **cookie_kwargs_with_domain)

        # Then clear without domain (for current hostname)
        response.set_cookie('access_token', '', **cookie_kwargs)
        response.set_cookie('refresh_token', '', **cookie_kwargs)
        response.set_cookie('masquerade_token', '', **cookie_kwargs)
        response.set_cookie('role_view_token', '', **cookie_kwargs)

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

        # Cookie fallback. Check masquerade cookie first so an active masquerade
        # session takes precedence over the admin's own access cookie.
        masquerade_cookie = request.cookies.get('masquerade_token')
        if masquerade_cookie:
            mq_payload = self.verify_masquerade_token(masquerade_cookie)
            if mq_payload:
                admin_id = mq_payload.get('user_id')
                logger.debug(f"[SessionManager] Masquerade cookie auth for admin {admin_id[:8]}...")
                return admin_id

        access_token = request.cookies.get('access_token')
        if access_token:
            payload = self.verify_access_token(access_token)
            if payload:
                user_id = payload.get('user_id')
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

            # CRITICAL FIX: If Authorization header is present but verification failed,
            # do NOT fall back to cookies. This prevents masquerade bypass where the
            # cookie still contains the admin's token.
            logger.warning(f"[SessionManager] Authorization header present but token verification failed")
            return None

        # Cookie fallback. Masquerade cookie wins so the effective user is the target.
        masquerade_cookie = request.cookies.get('masquerade_token')
        if masquerade_cookie:
            mq_payload = self.verify_masquerade_token(masquerade_cookie)
            if mq_payload:
                return mq_payload.get('masquerade_as')

        access_token = request.cookies.get('access_token')
        if access_token:
            payload = self.verify_access_token(access_token)
            if payload:
                return payload.get('user_id')

        return None

    def get_actual_admin_id(self) -> Optional[str]:
        """Get the actual admin/parent user ID (during masquerade or acting-as, returns admin/parent not target)"""
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')

            # Check if this is an acting-as token (parent acting as dependent)
            acting_as_payload = self.verify_acting_as_token(token)
            if acting_as_payload:
                return acting_as_payload.get('user_id')  # This is the parent ID

            # Check if this is a masquerade token
            masquerade_payload = self.verify_masquerade_token(token)
            if masquerade_payload:
                return masquerade_payload.get('user_id')  # This is the admin ID

            # Regular access token - return user_id
            access_payload = self.verify_access_token(token)
            if access_payload:
                return access_payload.get('user_id')

        return self.get_current_user_id()

    def _resolve_masquerade_payload(self) -> Optional[Dict[str, Any]]:
        """Find an active masquerade JWT in the Authorization header or cookie."""
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')
            payload = self.verify_masquerade_token(token)
            if payload:
                return payload
        cookie_token = request.cookies.get('masquerade_token')
        if cookie_token:
            return self.verify_masquerade_token(cookie_token)
        return None

    def is_masquerading(self) -> bool:
        """Check if the current session is a masquerade session"""
        return self._resolve_masquerade_payload() is not None

    def get_masquerade_info(self) -> Optional[Dict[str, str]]:
        """Get masquerade session info (admin_id and target_user_id)"""
        payload = self._resolve_masquerade_payload()
        if payload:
            return {
                'admin_id': payload.get('user_id'),
                'target_user_id': payload.get('masquerade_as'),
                'is_masquerading': True
            }
        return None
    
    def _refresh_impersonation_session(self, refresh_token: str) -> Optional[tuple]:
        """If the refresh token is an impersonation refresh token, re-mint a fresh
        impersonation access + refresh token pair preserving the target identity.

        Returns the same tuple shape as refresh_session
        (access_token, refresh_token, effective_user_id, token_issued_at), or None
        if the token is not an impersonation refresh token.
        """
        mq = self.verify_masquerade_refresh_token(refresh_token)
        if mq:
            admin_id = mq.get('user_id')
            target_id = mq.get('masquerade_as')
            if not admin_id or not target_id:
                return None

            origin_iat, issued_at = self._impersonation_timestamps(mq)
            if self._impersonation_grant_expired(origin_iat, self.masquerade_max_lifetime):
                logger.info(
                    f"[SessionManager] Masquerade refresh refused: grant older than "
                    f"{self.masquerade_max_lifetime} (admin {admin_id[:8]}...)")
                return None

            # Imported as a module, not by name, so the call resolves through
            # utils.token_authority at call time -- these are the two checks a
            # test needs to be able to stand in for.
            from utils import token_authority
            if not token_authority.is_masquerade_still_authorized(admin_id):
                logger.warning(
                    f"[SessionManager] Masquerade refresh refused: {admin_id[:8]}... "
                    f"is no longer a superadmin")
                return None
            if token_authority.session_revoked_since(admin_id, issued_at):
                logger.info(
                    f"[SessionManager] Masquerade refresh refused: sessions revoked "
                    f"for admin {admin_id[:8]}...")
                return None

            new_access = self.generate_masquerade_token(admin_id, target_id)
            new_refresh = self.generate_masquerade_refresh_token(
                admin_id, target_id, origin_iat=origin_iat)
            logger.debug(f"[SessionManager] Re-minted masquerade tokens for admin {admin_id[:8]}... as {target_id[:8]}...")
            return new_access, new_refresh, target_id, issued_at

        aa = self.verify_acting_as_refresh_token(refresh_token)
        if aa:
            parent_id = aa.get('user_id')
            dependent_id = aa.get('acting_as')
            if not parent_id or not dependent_id:
                return None

            origin_iat, issued_at = self._impersonation_timestamps(aa)
            if self._impersonation_grant_expired(origin_iat, self.acting_as_max_lifetime):
                logger.info(
                    f"[SessionManager] Acting-as refresh refused: grant older than "
                    f"{self.acting_as_max_lifetime} (parent {parent_id[:8]}...)")
                return None

            from utils import token_authority
            if not token_authority.is_acting_as_still_authorized(parent_id, dependent_id):
                logger.warning(
                    f"[SessionManager] Acting-as refresh refused: {dependent_id[:8]}... "
                    f"is no longer a dependent of {parent_id[:8]}...")
                return None
            if token_authority.session_revoked_since(parent_id, issued_at):
                logger.info(
                    f"[SessionManager] Acting-as refresh refused: sessions revoked "
                    f"for parent {parent_id[:8]}...")
                return None

            new_access = self.generate_acting_as_token(parent_id, dependent_id)
            new_refresh = self.generate_acting_as_refresh_token(
                parent_id, dependent_id, origin_iat=origin_iat)
            logger.debug(f"[SessionManager] Re-minted acting-as tokens for parent {parent_id[:8]}... as {dependent_id[:8]}...")
            return new_access, new_refresh, dependent_id, issued_at

        return None

    @staticmethod
    def _impersonation_timestamps(payload: Dict[str, Any]):
        """(origin_iat, issued_at) for an impersonation refresh token.

        `iat0` is absent on tokens minted before the absolute cap existed; those
        fall back to `iat`, which starts their clock at the first refresh after
        deploy rather than at the original grant. That is the generous reading,
        and it is deliberate: the alternative is signing out every live
        impersonation session the moment this ships.
        """
        raw_iat = payload.get('iat')
        origin_iat = payload.get('iat0') or raw_iat
        issued_at = (datetime.fromtimestamp(raw_iat, tz=timezone.utc)
                     if raw_iat else None)
        return origin_iat, issued_at

    @staticmethod
    def _impersonation_grant_expired(origin_iat, max_lifetime: timedelta) -> bool:
        """Has the original grant outlived the cap? Unknown origin => no."""
        if not origin_iat:
            return False
        try:
            granted = datetime.fromtimestamp(int(origin_iat), tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            return False
        return datetime.now(timezone.utc) - granted > max_lifetime

    def refresh_session(self, refresh_token_override: Optional[str] = None) -> Optional[tuple]:
        """Refresh the session using refresh token from cookie or request body"""
        # Allow refresh token to be passed in request body for cross-origin
        refresh_token = refresh_token_override or request.cookies.get('refresh_token')

        if not refresh_token:
            return None

        # Impersonation refresh tokens (masquerade / acting-as) re-mint an
        # impersonation access token so the session keeps the TARGET identity
        # across refreshes. Without this, the 401-refresh path would mint a plain
        # access token for the admin/parent and silently revert the session.
        # Checked before verify_refresh_token, which only accepts type='refresh'.
        impersonation = self._refresh_impersonation_session(refresh_token)
        if impersonation:
            return impersonation

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

        # Rotation: this refresh token is single-use from here. The presented
        # `jti` must be the one its family says is live; anything else is a
        # replay of a token that was already spent, which kills the family.
        # Imported as a module so a test can stand in for the database layer.
        from utils import refresh_families
        outcome, family_id, next_jti = refresh_families.rotate(
            user_id, payload.get('fam'), payload.get('jti'),
            self.refresh_token_expiry)
        if outcome in refresh_families.DENY:
            logger.warning(
                f"[SessionManager] Refresh refused ({outcome}) for user "
                f"{str(user_id)[:8]}...")
            return None
        refresh_families.maybe_cleanup()

        # Generate new tokens
        new_access_token = self.generate_access_token(user_id)
        new_refresh_token = self.generate_refresh_token(
            user_id, family_id=family_id, jti=next_jti)

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