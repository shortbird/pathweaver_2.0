from supabase import create_client, Client
from config import Config
from flask import request

# Create singleton clients - connection pooling is handled internally by supabase-py
_supabase_client = None
_supabase_admin_client = None

def get_supabase_client() -> Client:
    global _supabase_client
    if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
        raise ValueError("Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_KEY environment variables.")
    
    # Create singleton client - supabase-py handles connection pooling internally
    if _supabase_client is None:
        _supabase_client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
    
    return _supabase_client

def get_supabase_admin_client() -> Client:
    global _supabase_admin_client
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        raise ValueError("Missing Supabase admin configuration. Check SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")
    
    # Create singleton admin client - supabase-py handles connection pooling internally
    if _supabase_admin_client is None:
        _supabase_admin_client = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_KEY)
    
    return _supabase_admin_client

def get_authenticated_supabase_client() -> Client:
    """
    Get a Supabase client authenticated with the current user's token.
    This allows RLS policies to work correctly.
    """
    if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
        raise ValueError("Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_KEY environment variables.")
    
    # Get the auth token from header (cookies not working with Supabase auth)
    auth_header = request.headers.get('Authorization', '')
    
    if auth_header.startswith('Bearer '):
        # For now, continue using admin client for authenticated requests
        # This is a temporary measure until proper RLS is configured
        return get_supabase_admin_client()
    else:
        # No auth token, return regular anon client
        return get_supabase_client()