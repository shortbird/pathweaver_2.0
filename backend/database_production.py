"""
Production Supabase database configuration
Clean implementation without temporary workarounds
"""

from supabase import create_client, Client
from config import Config
from flask import request
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Singleton clients for connection efficiency
_supabase_client = None
_supabase_admin_client = None

def get_supabase_client() -> Client:
    """Get standard Supabase client for public operations"""
    global _supabase_client
    
    if not Config.SUPABASE_URL or not Config.SUPABASE_ANON_KEY:
        raise ValueError("Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_ANON_KEY.")
    
    if _supabase_client is None:
        _supabase_client = create_client(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY)
        logger.info("Supabase client initialized")
    
    return _supabase_client

def get_supabase_admin_client() -> Client:
    """
    Get admin Supabase client for privileged operations
    Use sparingly - only for user registration, admin functions
    """
    global _supabase_admin_client
    
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Missing admin Supabase configuration.")
    
    if _supabase_admin_client is None:
        _supabase_admin_client = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)
        logger.info("Supabase admin client initialized")
    
    return _supabase_admin_client

def get_user_client(token: Optional[str] = None) -> Client:
    """
    Get Supabase client with user authentication for RLS compliance
    
    Args:
        token: JWT token (extracted from request if not provided)
    
    Returns:
        Authenticated Supabase client
    """
    if not Config.SUPABASE_URL or not Config.SUPABASE_ANON_KEY:
        raise ValueError("Missing Supabase configuration.")
    
    # Extract token from request if not provided
    if not token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')
    
    if token:
        # Create authenticated client for proper RLS enforcement
        client = create_client(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY)
        client.headers["Authorization"] = f"Bearer {token}"
        client.postgrest.headers["Authorization"] = f"Bearer {token}"
        return client
    else:
        # Return public client for unauthenticated requests
        return get_supabase_client()

def get_authenticated_supabase_client() -> Client:
    """
    Backward compatibility wrapper
    Returns properly authenticated client for current user
    """
    return get_user_client()