"""Token utility functions"""

from database import get_supabase_client
from utils.retry_handler import retry_database_operation
import jwt
import os
from datetime import datetime, timedelta

def verify_token(token):
    """
    Verify a JWT token and return the user ID
    
    Args:
        token: JWT token string
    
    Returns:
        user_id if valid, None otherwise
    """
    if not token:
        return None
    
    supabase = get_supabase_client()
    
    @retry_database_operation
    def get_user():
        return supabase.auth.get_user(token)
    
    try:
        user = get_user()
        return user.user.id if user.user else None
    except Exception as e:
        print(f"Token verification error: {str(e)}")
        return None

def generate_token(user_id: str, expires_in: int = 3600) -> str:
    """
    Generate a JWT token for a user
    
    Args:
        user_id: User ID to generate token for
        expires_in: Expiration time in seconds (default 1 hour)
    
    Returns:
        JWT token string
    """
    secret_key = os.getenv('JWT_SECRET_KEY', os.getenv('SECRET_KEY', 'dev-secret-key'))
    
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(seconds=expires_in),
        'iat': datetime.utcnow()
    }
    
    token = jwt.encode(payload, secret_key, algorithm='HS256')
    return token

def decode_token(token: str) -> dict:
    """
    Decode a JWT token without verification (for debugging)
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded token payload or None if invalid
    """
    try:
        # Decode without verification for debugging purposes
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload
    except Exception as e:
        print(f"Token decode error: {str(e)}")
        return None

def refresh_token(old_token: str) -> str:
    """
    Refresh an existing token
    
    Args:
        old_token: Current JWT token
    
    Returns:
        New JWT token or None if refresh failed
    """
    user_id = verify_token(old_token)
    
    if not user_id:
        return None
    
    return generate_token(user_id)