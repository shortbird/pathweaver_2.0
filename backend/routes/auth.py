from flask import Blueprint, request, jsonify, make_response
from database import get_supabase_client
from utils.auth.token_utils import verify_token
from utils.validation import validate_registration_data, sanitize_input
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from middleware.error_handler import ValidationError, AuthenticationError, ExternalServiceError, ConflictError
from utils.retry_handler import retry_database_operation
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
        
        # Initialize the 5 Diploma Pillars for V3
        skill_categories = ['creativity', 'critical_thinking', 'practical_skills', 
                           'communication', 'cultural_literacy']
        
        for pillar in skill_categories:
            existing_skill = supabase.table('user_skill_xp').select('id').eq('user_id', user_id).eq('pillar', pillar).execute()
            if not existing_skill.data:
                supabase.table('user_skill_xp').insert({
                    'user_id': user_id,
                    'pillar': pillar,
                    'xp_amount': 0
                }).execute()
                
    except Exception as e:
        print(f"Error ensuring diploma and skills: {str(e)}")
        # Don't fail registration if this fails - the database trigger should handle it

@bp.route('/register', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=300)  # 5 registrations per 5 minutes
def register():
    try:
        data = request.json
        
        # Validate input data
        is_valid, error_message = validate_registration_data(data)
        if not is_valid:
            raise ValidationError(error_message)
        
        # Store original names for Supabase Auth (no HTML encoding)
        original_first_name = data['first_name'].strip()
        original_last_name = data['last_name'].strip()
        email = data['email'].strip().lower()  # Normalize email to lowercase
        
        # Log the registration attempt (without password)
        print(f"Registration attempt for email: {email}")
        print(f"Name: {original_first_name} {original_last_name}")
        
        # Use admin client for registration to bypass RLS
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()
        
        # Sign up with Supabase Auth (use original names without HTML encoding)
        try:
            auth_response = supabase.auth.sign_up({
                'email': email,
                'password': data['password'],
                'options': {
                    'data': {
                        'first_name': original_first_name,
                        'last_name': original_last_name
                    }
                }
            })
        except Exception as auth_error:
            print(f"Supabase auth error: {auth_error}")
            raise
        
        if auth_response.user:
            # Sanitize names for database storage (prevent XSS)
            sanitized_first_name = sanitize_input(original_first_name)
            sanitized_last_name = sanitize_input(original_last_name)
            
            # Create user profile in our users table
            user_data = {
                'id': auth_response.user.id,
                'first_name': sanitized_first_name,
                'last_name': sanitized_last_name,
                'subscription_tier': 'explorer',
                'created_at': 'now()'
            }
            
            # Note: username column has been removed from the database
            # Don't include it in the insert
            
            supabase.table('users').insert(user_data).execute()
            
            # Ensure diploma and skills are initialized (backup to database trigger)
            ensure_user_diploma_and_skills(supabase, auth_response.user.id, sanitized_first_name, sanitized_last_name)
            
            return jsonify({
                'user': auth_response.user.model_dump(),
                'session': auth_response.session.model_dump() if auth_response.session else None
            }), 201
        else:
            return jsonify({'error': 'Registration failed - no user created'}), 400
            
    except ValidationError:
        raise  # Re-raise validation errors
    except Exception as e:
        # Parse error message for specific cases
        error_str = str(e).lower()
        print(f"Full registration error: {str(e)}")
        
        if 'already registered' in error_str or 'already exists' in error_str:
            raise ConflictError('This email is already registered')
        elif 'email signups are disabled' in error_str:
            raise ValidationError('Registration is temporarily disabled. Please contact support.')
        elif 'invalid' in error_str and 'email' in error_str:
            # Supabase might be rejecting certain email domains
            raise ValidationError('This email address cannot be used for registration. Please use a different email.')
        elif 'weak' in error_str and 'password' in error_str:
            raise ValidationError('Password is too weak. Please use at least 8 characters with a mix of letters and numbers')
        elif 'password' in error_str:
            # If Supabase rejects the password for any reason, provide our requirement message
            raise ValidationError('Password must be at least 8 characters and contain uppercase, lowercase, and numbers')
        elif 'rate limit' in error_str or 'too many requests' in error_str or 'security purposes' in error_str:
            # Extract wait time if available
            import re
            wait_match = re.search(r'after (\d+) seconds', str(e))
            if wait_match:
                wait_time = wait_match.group(1)
                raise ValidationError(f'Too many registration attempts. Please wait {wait_time} seconds and try again.')
            else:
                raise ValidationError('Too many registration attempts. Please wait a minute and try again.')
        
        # Log unexpected errors and raise as external service error
        print(f"Registration error: {str(e)}")
        raise ExternalServiceError('Supabase', 'Registration service is currently unavailable. Please try again later.', e)

@bp.route('/login', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=60)  # 5 login attempts per minute
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
            
            # Create response with user data
            response_data = {
                'user': user_data.data,
                'session': auth_response.session.model_dump()
            }
            response = make_response(jsonify(response_data), 200)
            
            # Set secure httpOnly cookies for new sessions
            # Keep returning tokens in response for backward compatibility
            session_manager.set_auth_cookies(response, auth_response.user.id)
            
            return response
        else:
            raise AuthenticationError('Invalid credentials')
            
    except AuthenticationError:
        raise  # Re-raise authentication errors
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
    # Get token from cookie or header
    token = request.cookies.get('access_token')
    if not token:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
    
    if not token:
        return jsonify({'error': 'No token provided'}), 401
    
    supabase = get_supabase_client()
    
    try:
        supabase.auth.sign_out()
        response = make_response(jsonify({'message': 'Logged out successfully'}), 200)
        # Clear authentication cookies
        session_manager.clear_auth_cookies(response)
        return response
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