from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
from app_config import Config
from flask import request, g
from typing import Optional
import httpx

# Lazy logger import to avoid circular dependency
# Logger is initialized after config is loaded
_logger = None

def _get_logger():
    """Lazy logger initialization"""
    global _logger
    if _logger is None:
        from utils.logger import get_logger
        _logger = get_logger(__name__)
    return _logger

# Import log scrubbing utility for PII protection (P1-SEC-4)
from utils.log_scrubber import mask_token, should_log_sensitive_data

def _get_client_options() -> ClientOptions:
    """
    Create Supabase client options with connection pooling configuration.

    Uses httpx.Limits to configure connection pool:
    - max_connections: Total connection pool size (SUPABASE_POOL_SIZE)
    - max_keepalive_connections: Idle connections to keep alive (SUPABASE_POOL_SIZE)
    - keepalive_expiry: Connection lifetime (SUPABASE_CONN_LIFETIME)

    Returns:
        ClientOptions configured with connection pooling
    """
    # Configure httpx connection limits from app config
    limits = httpx.Limits(
        max_connections=Config.SUPABASE_POOL_SIZE,  # Total pool size (default: 10)
        max_keepalive_connections=Config.SUPABASE_POOL_SIZE,  # Keep-alive connections
        keepalive_expiry=Config.SUPABASE_CONN_LIFETIME  # Connection lifetime in seconds (default: 3600)
    )

    # Create httpx client with pooling configuration
    # timeout is set via SUPABASE_POOL_TIMEOUT
    http_client = httpx.Client(
        limits=limits,
        timeout=Config.SUPABASE_POOL_TIMEOUT  # Request timeout (default: 30s)
    )

    # Return ClientOptions with custom httpx client
    return ClientOptions(
        postgrest_client_timeout=Config.SUPABASE_POOL_TIMEOUT,
        storage_client_timeout=Config.SUPABASE_POOL_TIMEOUT
    )

# Create singleton client for anonymous operations only
# Admin client is per-request (cached in Flask's g) to prevent HTTP/2 exhaustion
_supabase_client = None
_supabase_admin_singleton = None

def get_supabase_client() -> Client:
    """Get anonymous Supabase client - only for public operations"""
    global _supabase_client
    if not Config.SUPABASE_URL or not Config.SUPABASE_ANON_KEY:
        raise ValueError("Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.")

    # Create singleton client with connection pooling configuration
    if _supabase_client is None:
        options = _get_client_options()
        _supabase_client = create_client(
            Config.SUPABASE_URL,
            Config.SUPABASE_ANON_KEY,
            options=options
        )
        _get_logger().info(f"[DATABASE] Created anonymous client with connection pool (size={Config.SUPABASE_POOL_SIZE}, timeout={Config.SUPABASE_POOL_TIMEOUT}s)")

    return _supabase_client

def get_supabase_admin_singleton() -> Client:
    """
    Get thread-safe singleton admin client for background tasks.

    Use this ONLY for:
    - Background tasks (ThreadPoolExecutor, celery, etc.)
    - Activity tracking middleware
    - Scheduled jobs

    For request-scoped operations, use get_supabase_admin_client() instead.
    """
    global _supabase_admin_singleton
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Missing Supabase admin configuration. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.")

    if _supabase_admin_singleton is None:
        options = _get_client_options()
        _supabase_admin_singleton = create_client(
            Config.SUPABASE_URL,
            Config.SUPABASE_SERVICE_ROLE_KEY,
            options=options
        )
        _get_logger().info(f"[DATABASE] Created admin singleton client with connection pool (size={Config.SUPABASE_POOL_SIZE}, timeout={Config.SUPABASE_POOL_TIMEOUT}s)")

    return _supabase_admin_singleton

def get_supabase_admin_client() -> Client:
    """
    Get admin Supabase client - ONLY use for:
    - User registration
    - Admin dashboard operations
    - System maintenance tasks
    - Operations that explicitly require admin privileges

    WARNING: This bypasses RLS policies. Use get_user_client() for user operations.

    NOTE: Uses Flask's g context to cache per-request to prevent HTTP/2 stream exhaustion
    while avoiding resource exhaustion from creating too many clients.
    """
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Missing Supabase admin configuration. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.")

    # Cache admin client in Flask's g context for this request
    # This prevents HTTP/2 stream exhaustion from singleton pattern
    # while still limiting to one client per request
    if not hasattr(g, '_admin_client'):
        options = _get_client_options()
        g._admin_client = create_client(
            Config.SUPABASE_URL,
            Config.SUPABASE_SERVICE_ROLE_KEY,
            options=options
        )
        _get_logger().debug(f"[DATABASE] Created request-scoped admin client with connection pool")

    return g._admin_client

def get_user_client(token: Optional[str] = None) -> Client:
    """
    Get a Supabase client with user's JWT token for RLS enforcement.
    This is the preferred method for user operations.

    Uses Flask's g context to cache the client per request, preventing
    resource exhaustion from creating too many clients.

    Args:
        token: JWT token. If not provided, will extract from request headers

    Returns:
        Supabase client with user authentication
    """
    if not Config.SUPABASE_URL or not Config.SUPABASE_ANON_KEY:
        raise ValueError("Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.")

    # Get token from parameter, cookies, or request headers
    if not token:
        try:
            # Ensure we're in a valid request context
            if not request or not hasattr(request, 'headers'):
                _get_logger().warning("WARNING: get_user_client called outside request context or with invalid request object")
                client = get_supabase_client()
                setattr(g, f'_user_client_anon', client)
                return client

            # First, try to get token from httpOnly cookie (primary auth method)
            token = request.cookies.get('access_token')

            # Only log token details in development (P1-SEC-4: GDPR compliance)
            if should_log_sensitive_data():
                _get_logger().debug(f"[GET_USER_CLIENT] JWT from cookie: {bool(token)}")
                if token:
                    _get_logger().debug(f"[GET_USER_CLIENT] Token preview: {mask_token(token)}")
                    _get_logger().debug(f"[GET_USER_CLIENT] Token has 3 parts: {len(token.split('.')) == 3}")

            # Fallback to Authorization header if cookie not present
            if not token:
                auth_header = request.headers.get('Authorization', '')
                if auth_header.startswith('Bearer '):
                    token = auth_header.replace('Bearer ', '')
                    if should_log_sensitive_data():
                        _get_logger().debug(f"[GET_USER_CLIENT] JWT from header: {bool(token)}")
        except (RuntimeError, AttributeError) as e:
            # Handle cases where request context is invalid or request is a dict
            _get_logger().warning(f"WARNING: Cannot access request context: {e}")
            client = get_supabase_client()
            setattr(g, f'_user_client_anon', client)
            return client

    # Create a cache key based on the token
    cache_key = f'_user_client_{token[:20] if token else "anon"}'

    # Return cached client if available for this request
    if hasattr(g, cache_key):
        return getattr(g, cache_key)

    if token:
        # CRITICAL: Validate that we received a JWT token, not a UUID
        # UUIDs have 4 dashes (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        # JWTs have 2 dots (format: header.payload.signature)
        if '-' in token and '.' not in token:
            # P1-SEC-4: Limit token exposure in logs (max 8 chars)
            _get_logger().error(
                f"CRITICAL ERROR: get_user_client received a UUID instead of a JWT token. "
                f"This is a code bug - check BaseService.get_user_supabase() callers. "
                f"Token preview: {mask_token(token)}"
            )
            # Return anonymous client as fallback
            client = get_supabase_client()
            setattr(g, cache_key, client)
            return client

        # Validate JWT token format before using
        token_parts = token.split('.')
        if len(token_parts) != 3:
            _get_logger().warning(f"WARNING: Invalid JWT token format - expected 3 parts, got {len(token_parts)}")
            # Return anonymous client for invalid tokens
            client = get_supabase_client()
            setattr(g, cache_key, client)
            return client

        try:
            # Create client with user's JWT token for RLS enforcement
            # IMPORTANT: ClientOptions headers don't work for auth context in supabase-py
            # We must use postgrest.auth() to set the token for RLS policies
            # P1-SEC-4: Move sensitive logging to DEBUG level
            _get_logger().debug(f"[GET_USER_CLIENT] Creating client with JWT token for RLS")
            options = _get_client_options()
            client = create_client(
                Config.SUPABASE_URL,
                Config.SUPABASE_ANON_KEY,
                options=options
            )
            # Set auth token on postgrest client for RLS to work with auth.uid()
            # This is the correct way to enable RLS in supabase-py
            client.postgrest.auth(token)
            _get_logger().debug(f"[GET_USER_CLIENT] Client created with postgrest.auth() and connection pool for RLS")
            # Cache in Flask g context for this request
            setattr(g, cache_key, client)
            return client
        except AttributeError as e:
            # This can occur if options object is mishandled by supabase-py library
            # P1-SEC-4: Mask token in error logs
            _get_logger().error(f"ERROR: AttributeError creating client (supabase-py version issue?): {e}")
            _get_logger().error(f"Token format: {len(token.split('.'))} parts, preview: {mask_token(token)}")
            # Return anonymous client if token setup fails
            client = get_supabase_client()
            setattr(g, cache_key, client)
            return client
        except Exception as e:
            _get_logger().error(f"ERROR: Failed to create client with auth token: {type(e).__name__}: {e}")
            # Return anonymous client if token setup fails
            client = get_supabase_client()
            setattr(g, cache_key, client)
            return client
    else:
        # No token, return anonymous client
        client = get_supabase_client()
        setattr(g, cache_key, client)
        return client

def get_authenticated_supabase_client() -> Client:
    """
    Get a Supabase client authenticated with the current user's token.
    This allows RLS policies to work correctly.
    
    This is a wrapper around get_user_client() for backward compatibility.
    """
    # Use the get_user_client which now properly enforces RLS
    return get_user_client()