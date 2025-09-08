"""Authentication decorators"""

from functools import wraps
from flask import request, jsonify
from database import get_authenticated_supabase_client
from middleware.error_handler import AuthenticationError, AuthorizationError
from .token_utils import verify_token

def require_auth(f):
    """Decorator to require authentication for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            raise AuthenticationError('No token provided')
        
        user_id = verify_token(token)
        
        if not user_id:
            raise AuthenticationError('Invalid or expired token')
        
        # Store user_id in request context for error logging
        request.user_id = user_id
        
        return f(user_id, *args, **kwargs)
    
    return decorated_function

def require_admin(f):
    """Decorator to require admin access for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            raise AuthenticationError('No token provided')
        
        user_id = verify_token(token)
        
        if not user_id:
            raise AuthenticationError('Invalid or expired token')
        
        # Store user_id in request context
        request.user_id = user_id
        
        # Verify admin status
        supabase = get_authenticated_supabase_client()
        
        try:
            user = supabase.table('users').select('role').eq('id', user_id).single().execute()
            
            if not user.data or user.data.get('role') not in ['admin', 'educator']:
                raise AuthorizationError('Admin access required')
            
            return f(user_id, *args, **kwargs)
            
        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            print(f"Error verifying admin status: {str(e)}")
            raise AuthorizationError('Failed to verify admin status')
    
    return decorated_function

def require_role(*allowed_roles):
    """Decorator to require specific roles for routes"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            
            if not token:
                raise AuthenticationError('No token provided')
            
            user_id = verify_token(token)
            
            if not user_id:
                raise AuthenticationError('Invalid or expired token')
            
            # Store user_id in request context
            request.user_id = user_id
            
            # Verify user role
            supabase = get_authenticated_supabase_client()
            
            try:
                user = supabase.table('users').select('role').eq('id', user_id).single().execute()
                
                if not user.data or user.data.get('role') not in allowed_roles:
                    raise AuthorizationError(f'Required role: {", ".join(allowed_roles)}')
                
                return f(user_id, *args, **kwargs)
                
            except (AuthenticationError, AuthorizationError):
                raise
            except Exception as e:
                print(f"Error verifying user role: {str(e)}")
                raise AuthorizationError('Failed to verify user role')
        
        return decorated_function
    return decorator

def require_paid_tier(f):
    """Decorator to require a paid subscription tier (supported or academy)"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            raise AuthenticationError('No token provided')
        
        user_id = verify_token(token)
        
        if not user_id:
            raise AuthenticationError('Invalid or expired token')
        
        # Store user_id in request context
        request.user_id = user_id
        
        # Check subscription tier
        supabase = get_authenticated_supabase_client()
        
        try:
            user = supabase.table('users').select('subscription_tier').eq('id', user_id).single().execute()
            
            if not user.data:
                raise AuthorizationError('User not found')
            
            subscription_tier = user.data.get('subscription_tier', 'free')
            
            # Allow paid tiers based on actual database schema
            # Database schema: ['explorer', 'creator', 'visionary', 'enterprise']
            # Where: creator = Supported tier, visionary = Academy tier, enterprise = Academy tier
            allowed_tiers = ['creator', 'visionary', 'enterprise']
            import sys
            print(f"[REQUIRE_PAID_TIER] User {user_id} has tier: '{subscription_tier}', allowed tiers: {allowed_tiers}", file=sys.stderr, flush=True)
            if subscription_tier not in allowed_tiers:
                return jsonify({
                    'error': 'subscription_required',
                    'message': 'This feature requires a Supported or Academy subscription',
                    'required_tier': 'supported',
                    'current_tier': subscription_tier,
                    'upgrade_url': '/subscription'
                }), 403
            
            return f(*args, **kwargs)
            
        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            import traceback
            print(f"Error verifying subscription tier: {str(e)}", file=sys.stderr, flush=True)
            print(f"Full traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
            raise AuthorizationError('Failed to verify subscription tier')
    
    return decorated_function