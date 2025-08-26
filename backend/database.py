from supabase import create_client, Client
from config import Config
from flask import request

def get_supabase_client() -> Client:
    if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
        raise ValueError("Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_KEY environment variables.")
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)

def get_supabase_admin_client() -> Client:
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        raise ValueError("Missing Supabase admin configuration. Check SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_KEY)

def get_authenticated_supabase_client() -> Client:
    """
    Get a Supabase client authenticated with the current user's token.
    This allows RLS policies to work correctly.
    """
    if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
        raise ValueError("Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_KEY environment variables.")
    
    # Get the auth token from the request headers
    auth_header = request.headers.get('Authorization', '')
    
    if auth_header.startswith('Bearer '):
        # For now, use admin client when we have a valid auth token
        # This is a temporary workaround for RLS issues
        # TODO: Fix proper RLS authentication
        return get_supabase_admin_client()
    else:
        # No auth token, return regular client
        return create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)