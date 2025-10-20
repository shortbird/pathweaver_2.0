"""Token utility functions"""

from database import get_supabase_client
from utils.retry_handler import retry_database_operation
import jwt
import os
from datetime import datetime, timedelta

def verify_token(token):
    """
    Verify a JWT token and return the user ID
    Supports both Supabase tokens and custom JWT tokens (for incognito mode)

    Args:
        token: JWT token string

    Returns:
        user_id if valid, None otherwise
    """
    if not token:
        return None

    # First try to verify as custom JWT token (for incognito mode fallback)
    try:
        secret_key = os.getenv('JWT_SECRET_KEY') or os.getenv('SECRET_KEY') or os.getenv('FLASK_SECRET_KEY')
        if secret_key:
            payload = jwt.decode(token, secret_key, algorithms=['HS256'])
            # Check if this is our custom token format
            if payload.get('user_id') and payload.get('type') in ['access', 'refresh']:
                return payload['user_id']
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        # Not a valid custom JWT, try Supabase verification
        pass
    except Exception:
        # Any other error, continue to Supabase verification
        pass

    # Fallback to Supabase token verification (for regular mode)
    supabase = get_supabase_client()

    @retry_database_operation
    def get_user():
        return supabase.auth.get_user(token)

    try:
        user = get_user()
        return user.user.id if user.user else None
    except Exception as e:
        # Token verification failed - log internally only
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
    secret_key = os.getenv('JWT_SECRET_KEY') or os.getenv('SECRET_KEY')
    if not secret_key:
        raise ValueError("JWT_SECRET_KEY or SECRET_KEY environment variable must be set")
    
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
        # Token decode error - return None
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