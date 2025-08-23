from functools import wraps
from flask import request, jsonify
from database import get_supabase_client

def verify_token(token):
    if not token:
        return None
    
    supabase = get_supabase_client()
    
    try:
        user = supabase.auth.get_user(token)
        return user.user.id if user.user else None
    except Exception:
        return None

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            return jsonify({'error': 'No token provided'}), 401
        
        user_id = verify_token(token)
        
        if not user_id:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        return f(user_id, *args, **kwargs)
    
    return decorated_function

def require_admin(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            return jsonify({'error': 'No token provided'}), 401
        
        user_id = verify_token(token)
        
        if not user_id:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        supabase = get_supabase_client()
        
        try:
            user = supabase.table('users').select('role').eq('id', user_id).single().execute()
            
            if not user.data or user.data.get('role') not in ['admin', 'educator']:
                return jsonify({'error': 'Admin access required'}), 403
            
            return f(user_id, *args, **kwargs)
            
        except Exception:
            return jsonify({'error': 'Failed to verify admin status'}), 500
    
    return decorated_function