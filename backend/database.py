from supabase import create_client, Client
from app_config import Config
from flask import request, g
from typing import Optional

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

# Create singleton client for anonymous operations only
# Admin client is per-request (cached in Flask's g) to prevent HTTP/2 exhaustion
_supabase_client = None

def get_supabase_client() -> Client:
    """Get anonymous Supabase client - only for public operations"""
    global _supabase_client
    if not Config.SUPABASE_URL or not Config.SUPABASE_ANON_KEY:
        raise ValueError("Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.")
    
    # Create singleton client - supabase-py handles connection pooling internally
    if _supabase_client is None:
        _supabase_client = create_client(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY)
    
    return _supabase_client

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
        g._admin_client = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)
        _get_logger().debug("Created new admin client for request")

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

    # Get token from parameter or request headers
    if not token:
        try:
            # Ensure we're in a valid request context before accessing request.headers
            if not request or not hasattr(request, 'headers'):
                _get_logger().warning("WARNING: get_user_client called outside request context or with invalid request object")
                client = get_supabase_client()
                setattr(g, f'_user_client_anon', client)
                return client

            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header.replace('Bearer ', '')
        except (RuntimeError, AttributeError) as e:
            # Handle cases where request context is invalid or request is a dict
            _get_logger().warning(f"WARNING: Cannot access request headers: {e}")
            client = get_supabase_client()
            setattr(g, f'_user_client_anon', client)
            return client

    # Create a cache key based on the token
    cache_key = f'_user_client_{token[:20] if token else "anon"}'

    # Return cached client if available for this request
    if hasattr(g, cache_key):
        return getattr(g, cache_key)

    if token:
        # Validate JWT token format before using
        token_parts = token.split('.')
        if len(token_parts) != 3:
            _get_logger().warning(f"WARNING: Invalid JWT token format - expected 3 parts, got {len(token_parts)}")
            # Return anonymous client for invalid tokens
            client = get_supabase_client()
            setattr(g, cache_key, client)
            return client

        try:
            # Create client with user's JWT token in Authorization header
            # This allows RLS policies to work with auth.uid()
            client = create_client(
                Config.SUPABASE_URL,
                Config.SUPABASE_ANON_KEY,
                options={
                    "headers": {
                        "Authorization": f"Bearer {token}"
                    }
                }
            )
            # Cache in Flask g context for this request
            setattr(g, cache_key, client)
            return client
        except Exception as e:
            _get_logger().error(f"ERROR: Failed to create client with auth token: {e}")
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