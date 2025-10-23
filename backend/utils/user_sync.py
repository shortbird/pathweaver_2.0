"""
Utility functions for syncing user data between auth and users table.
"""

from database import get_supabase_admin_client
from typing import Optional, Dict

from utils.logger import get_logger

logger = get_logger(__name__)


def ensure_user_exists(user_id: str) -> Optional[Dict]:
    """
    Ensure a user exists in the users table, creating from auth if needed.
    
    Args:
        user_id: The user ID to check/create
        
    Returns:
        User data dict if found/created, None otherwise
    """
    try:
        admin_client = get_supabase_admin_client()
        
        # First check if user exists in users table
        user_result = admin_client.table('users')\
            .select('*')\
            .eq('id', user_id)\
            .execute()
        
        if user_result.data and len(user_result.data) > 0:
            logger.info(f"[USER_SYNC] User {user_id[:8]} already exists in users table")
            return user_result.data[0]
        
        # User doesn't exist in users table, try to get from auth
        logger.info(f"[USER_SYNC] User {user_id[:8]} not in users table, checking auth")
        
        try:
            # Get user from auth system
            auth_user = admin_client.auth.admin.get_user_by_id(user_id)
            
            if auth_user:
                logger.info(f"[USER_SYNC] Found user {user_id[:8]} in auth: {auth_user.user.email}")
                
                # Extract name from email or metadata
                email = auth_user.user.email or ""
                first_name = "User"
                last_name = "Account"
                
                # Try to get names from user metadata if available
                if auth_user.user.user_metadata:
                    first_name = auth_user.user.user_metadata.get('first_name', first_name)
                    last_name = auth_user.user.user_metadata.get('last_name', last_name)
                
                # If no metadata, try to extract from email
                if first_name == "User" and email:
                    email_parts = email.split('@')[0].split('.')
                    if len(email_parts) >= 2:
                        first_name = email_parts[0].capitalize()
                        last_name = email_parts[1].capitalize()
                    elif len(email_parts) == 1:
                        first_name = email_parts[0].capitalize()
                
                # Create user in users table
                # UPDATED - Phase 3 refactoring (January 2025)
                # Removed subscription_tier and subscription_status (columns deleted)
                new_user = {
                    'id': user_id,
                    'first_name': first_name,
                    'last_name': last_name,
                    'created_at': auth_user.user.created_at
                }
                
                create_result = admin_client.table('users')\
                    .insert(new_user)\
                    .execute()
                
                if create_result.data:
                    logger.info(f"[USER_SYNC] Created user {user_id[:8]} in users table: {first_name} {last_name}")
                    return create_result.data[0]
                else:
                    logger.error(f"[USER_SYNC] Failed to create user {user_id[:8]} in users table")
                    return None
                    
        except Exception as auth_error:
            logger.error(f"[USER_SYNC] Error getting user from auth: {str(auth_error)}")
            # Return a fallback user data
            return {
                'id': user_id,
                'first_name': 'User',
                'last_name': 'Account'
            }
            
    except Exception as e:
        logger.error(f"[USER_SYNC] Error in ensure_user_exists: {str(e)}")
        return None


def get_user_name(user_id: str) -> tuple[str, str]:
    """
    Get user's first and last name, ensuring the user exists first.
    
    Args:
        user_id: The user ID
        
    Returns:
        Tuple of (first_name, last_name)
    """
    user_data = ensure_user_exists(user_id)
    
    if user_data:
        return (
            user_data.get('first_name', 'User'),
            user_data.get('last_name', 'Account')
        )
    
    return ('User', 'Account')