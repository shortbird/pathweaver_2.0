from flask import Blueprint, request, jsonify
from database import get_supabase_client
from utils.auth_utils import verify_token
import re

bp = Blueprint('auth', __name__)

def generate_portfolio_slug(first_name, last_name):
    """Generate a unique portfolio slug from first and last name"""
    # Remove non-alphanumeric characters and convert to lowercase
    base_slug = re.sub(r'[^a-zA-Z0-9]', '', first_name + last_name).lower()
    return base_slug

def ensure_user_diploma_and_skills(supabase, user_id, first_name, last_name):
    """Ensure user has diploma and skill categories initialized"""
    try:
        # Check if diploma exists
        diploma_check = supabase.table('diplomas').select('id').eq('user_id', user_id).execute()
        
        if not diploma_check.data:
            # Generate unique slug
            slug = generate_portfolio_slug(first_name, last_name)
            counter = 0
            while True:
                check_slug = slug if counter == 0 else f"{slug}{counter}"
                existing = supabase.table('diplomas').select('id').eq('portfolio_slug', check_slug).execute()
                if not existing.data:
                    slug = check_slug
                    break
                counter += 1
            
            # Create diploma
            supabase.table('diplomas').insert({
                'user_id': user_id,
                'portfolio_slug': slug
            }).execute()
        
        # Initialize skill categories if they don't exist
        skill_categories = ['reading_writing', 'thinking_skills', 'personal_growth', 
                           'life_skills', 'making_creating', 'world_understanding']
        
        for category in skill_categories:
            existing_skill = supabase.table('user_skill_xp').select('id').eq('user_id', user_id).eq('skill_category', category).execute()
            if not existing_skill.data:
                supabase.table('user_skill_xp').insert({
                    'user_id': user_id,
                    'skill_category': category,
                    'total_xp': 0
                }).execute()
                
    except Exception as e:
        print(f"Error ensuring diploma and skills: {str(e)}")
        # Don't fail registration if this fails - the database trigger should handle it

@bp.route('/register', methods=['POST'])
def register():
    try:
        data = request.json
        
        # Log the incoming data for debugging
        print(f"Registration attempt for email: {data.get('email')}")
        
        # Validate required fields
        required_fields = ['email', 'password', 'first_name', 'last_name']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Use admin client for registration to bypass RLS
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()
        
        # Sign up with Supabase Auth
        auth_response = supabase.auth.sign_up({
            'email': data['email'],
            'password': data['password'],
            'options': {
                'data': {
                    'first_name': data['first_name'],
                    'last_name': data['last_name']
                }
            }
        })
        
        if auth_response.user:
            # Create user profile in our users table
            user_data = {
                'id': auth_response.user.id,
                'first_name': data['first_name'],
                'last_name': data['last_name'],
                'subscription_tier': 'explorer',
                'created_at': 'now()'
            }
            
            # Temporarily add username for backward compatibility until migration is run
            # This will be ignored if the column doesn't exist
            if 'username' in data:
                user_data['username'] = data['username']
            else:
                # Generate a temporary username from first and last name
                user_data['username'] = (data['first_name'] + data['last_name']).lower()[:20]
            
            supabase.table('users').insert(user_data).execute()
            
            # Ensure diploma and skills are initialized (backup to database trigger)
            ensure_user_diploma_and_skills(supabase, auth_response.user.id, data['first_name'], data['last_name'])
            
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
        
        if auth_response.user and auth_response.session:
            # Use admin client to fetch user data (bypasses RLS for login)
            from database import get_supabase_admin_client
            admin_client = get_supabase_admin_client()
            
            # Fetch user data with admin client
            user_data = admin_client.table('users').select('*').eq('id', auth_response.user.id).single().execute()
            
            # Try to log activity, but don't fail login if it doesn't work
            try:
                admin_client.table('activity_log').insert({
                    'user_id': auth_response.user.id,
                    'event_type': 'user_login',
                    'event_details': {'ip': request.remote_addr}
                }).execute()
            except Exception as log_error:
                print(f"Failed to log activity: {log_error}")
            
            return jsonify({
                'user': user_data.data,
                'session': auth_response.session.model_dump()
            }), 200
        else:
            return jsonify({'error': 'Invalid credentials'}), 401
            
    except Exception as e:
        error_message = str(e)
        print(f"Login error: {error_message}")
        
        # Provide more helpful error messages
        if "Invalid login credentials" in error_message:
            return jsonify({'error': 'Invalid email or password'}), 401
        elif "Invalid API key" in error_message:
            return jsonify({'error': 'Server configuration error - invalid API key'}), 500
        else:
            return jsonify({'error': error_message}), 400

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