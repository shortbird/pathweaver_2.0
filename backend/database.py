from supabase import create_client, Client
from config import Config
from flask import request
from typing import Optional
import httpx

# Create singleton clients - connection pooling is handled internally by supabase-py
_supabase_client = None
_supabase_admin_client = None

# Custom HTTPX limits to prevent HTTP/2 stream exhaustion
# When multiple parallel requests hit the same singleton client, we need higher limits
_httpx_limits = httpx.Limits(
    max_connections=100,         # Allow up to 100 concurrent connections
    max_keepalive_connections=50, # Keep up to 50 connections alive in pool
    keepalive_expiry=60.0        # Keep connections alive for 60 seconds
)

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

    Configured with custom HTTPX limits to prevent connection exhaustion when
    multiple parallel requests use the singleton client.
    """
    global _supabase_admin_client
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Missing Supabase admin configuration. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.")

    # Create singleton admin client with custom HTTPX configuration
    if _supabase_admin_client is None:
        # Create custom HTTPX client with increased connection limits
        http_client = httpx.Client(
            limits=_httpx_limits,
            timeout=30.0,  # 30 second timeout
            http2=True     # Enable HTTP/2
        )

        # Create Supabase client
        _supabase_admin_client = create_client(
            Config.SUPABASE_URL,
            Config.SUPABASE_SERVICE_ROLE_KEY
        )

        # Inject custom HTTP client into postgrest (main API client)
        _supabase_admin_client.postgrest.session = http_client

    return _supabase_admin_client

def get_user_client(token: Optional[str] = None) -> Client:
    """
    Get a Supabase client with user's JWT token for RLS enforcement.
    This is the preferred method for user operations.
    
    Args:
        token: JWT token. If not provided, will extract from request headers
        
    Returns:
        Supabase client with user authentication
    """
    if not Config.SUPABASE_URL or not Config.SUPABASE_ANON_KEY:
        raise ValueError("Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.")
    
    # Get token from parameter or request headers
    if not token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')
    
    if token:
        # Validate JWT token format before using
        token_parts = token.split('.')
        if len(token_parts) != 3:
            print(f"WARNING: Invalid JWT token format - expected 3 parts, got {len(token_parts)}")
            # Return anonymous client for invalid tokens
            return get_supabase_client()

        try:
            # Create client with user's token for proper RLS enforcement
            client = create_client(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY)
            # Set the auth header with the user's token
            client.auth.set_session(access_token=token, refresh_token="")
            return client
        except Exception as e:
            print(f"ERROR: Failed to set auth session with token: {e}")
            # Return anonymous client if token setup fails
            return get_supabase_client()
    else:
        # No token, return anonymous client
        return get_supabase_client()

def get_authenticated_supabase_client() -> Client:
    """
    Get a Supabase client authenticated with the current user's token.
    This allows RLS policies to work correctly.
    
    This is a wrapper around get_user_client() for backward compatibility.
    """
    # Use the get_user_client which now properly enforces RLS
    return get_user_client()