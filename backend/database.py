from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
from app_config import Config
from flask import request, g
from typing import Optional
import httpx
import atexit

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

# Module-level singleton httpx.Client to prevent memory leaks
# Each httpx.Client holds ~50-70MB (connection pools, SSL contexts, buffers)
# Creating one per request causes memory exhaustion
_shared_http_client: Optional[httpx.Client] = None


def _get_shared_http_client() -> httpx.Client:
    """
    Get or create the singleton httpx.Client for all Supabase connections.

    This prevents the memory leak where each request created a new httpx.Client
    that was never properly closed. Connection pools don't release memory on GC -
    they need explicit .close() calls.
    """
    global _shared_http_client
    if _shared_http_client is None:
        # CRITICAL FIX: Use 30s keepalive instead of Config.SUPABASE_CONN_LIFETIME (3600s)
        # Network intermediaries (Render load balancers, Supabase infrastructure, NAT gateways)
        # typically close idle connections after 30-60 seconds. When a connection sits idle
        # for 1+ minutes then gets reused, the remote has already closed it, causing
        # "Connection reset by peer" errors (errno 104) that cause random auth failures.
        # Setting keepalive_expiry to 30s ensures stale connections are dropped from the pool
        # before network intermediaries close them.
        limits = httpx.Limits(
            max_connections=Config.SUPABASE_POOL_SIZE + getattr(Config, 'SUPABASE_MAX_OVERFLOW', 5),
            max_keepalive_connections=Config.SUPABASE_POOL_SIZE,
            keepalive_expiry=30  # 30 seconds - shorter than typical NAT/firewall timeouts
        )
        _shared_http_client = httpx.Client(
            limits=limits,
            timeout=Config.SUPABASE_POOL_TIMEOUT
        )
        _get_logger().info(
            f"[DATABASE] Created shared httpx.Client (pool_size={Config.SUPABASE_POOL_SIZE}, "
            f"timeout={Config.SUPABASE_POOL_TIMEOUT}s, keepalive=30s)"
        )
    return _shared_http_client


def _shutdown_http_client():
    """Close the shared httpx.Client on application shutdown."""
    global _shared_http_client
    if _shared_http_client is not None:
        _get_logger().info("[DATABASE] Closing shared httpx.Client")
        _shared_http_client.close()
        _shared_http_client = None


atexit.register(_shutdown_http_client)


def _get_client_options() -> ClientOptions:
    """
    Create Supabase client options using the shared httpx.Client.

    CRITICAL FIX: Previous implementation created a new httpx.Client per call
    but never passed it to ClientOptions (httpx_client parameter was missing).
    This caused 50-70MB memory leak per request as orphaned clients weren't closed.

    Now uses a singleton httpx.Client shared across all Supabase clients.

    Returns:
        ClientOptions configured with the shared httpx.Client
    """
    # Use shared httpx.Client to prevent memory leaks
    # The httpx_client parameter MUST be passed - this was the bug!
    return ClientOptions(
        postgrest_client_timeout=Config.SUPABASE_POOL_TIMEOUT,
        storage_client_timeout=Config.SUPABASE_POOL_TIMEOUT,
        httpx_client=_get_shared_http_client()  # FIX: Actually pass the client!
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