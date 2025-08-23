from flask import Blueprint, request, jsonify
from database import get_supabase_client
from utils.auth_utils import verify_token

bp = Blueprint('auth', __name__)

@bp.route('/register', methods=['POST'])
def register():
    try:
        data = request.json
        
        # Log the incoming data for debugging
        print(f"Registration attempt for email: {data.get('email')}")
        
        # Validate required fields
        required_fields = ['email', 'password', 'username', 'first_name', 'last_name']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        supabase = get_supabase_client()
        
        # Sign up with Supabase Auth
        auth_response = supabase.auth.sign_up({
            'email': data['email'],
            'password': data['password'],
            'options': {
                'data': {
                    'username': data['username'],
                    'first_name': data['first_name'],
                    'last_name': data['last_name']
                }
            }
        })
        
        if auth_response.user:
            # Create user profile in our users table
            user_data = {
                'id': auth_response.user.id,
                'username': data['username'],
                'first_name': data['first_name'],
                'last_name': data['last_name'],
                'subscription_tier': 'explorer',
                'created_at': 'now()'
            }
            
            supabase.table('users').insert(user_data).execute()
            
            return jsonify({
                'user': auth_response.user.model_dump(),
                'session': auth_response.session.model_dump() if auth_response.session else None
            }), 201
        else:
            return jsonify({'error': 'Registration failed - no user created'}), 400
            
    except Exception as e:
        print(f"Registration error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@bp.route('/login', methods=['POST'])
def login():
    data = request.json
    supabase = get_supabase_client()
    
    try:
        auth_response = supabase.auth.sign_in_with_password({
            'email': data['email'],
            'password': data['password']
        })
        
        if auth_response.user:
            user_data = supabase.table('users').select('*').eq('id', auth_response.user.id).single().execute()
            
            supabase.table('activity_log').insert({
                'user_id': auth_response.user.id,
                'event_type': 'user_login',
                'event_details': {'ip': request.remote_addr}
            }).execute()
            
            return jsonify({
                'user': user_data.data,
                'session': auth_response.session.model_dump()
            }), 200
        else:
            return jsonify({'error': 'Invalid credentials'}), 401
            
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/logout', methods=['POST'])
def logout():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    
    if not token:
        return jsonify({'error': 'No token provided'}), 401
    
    supabase = get_supabase_client()
    
    try:
        supabase.auth.sign_out()
        return jsonify({'message': 'Logged out successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/refresh', methods=['POST'])
def refresh_token():
    data = request.json
    refresh_token = data.get('refresh_token')
    
    if not refresh_token:
        return jsonify({'error': 'No refresh token provided'}), 401
    
    supabase = get_supabase_client()
    
    try:
        auth_response = supabase.auth.refresh_session(refresh_token)
        
        if auth_response.session:
            return jsonify({
                'session': auth_response.session.model_dump()
            }), 200
        else:
            return jsonify({'error': 'Failed to refresh token'}), 401
            
    except Exception as e:
        return jsonify({'error': str(e)}), 400