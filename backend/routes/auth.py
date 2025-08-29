from flask import Blueprint, request, jsonify, make_response
from database import get_supabase_client
from utils.auth.token_utils import verify_token
from utils.validation import validate_registration_data, sanitize_input
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from middleware.error_handler import ValidationError, AuthenticationError, ExternalServiceError, ConflictError
from utils.retry_handler import retry_database_operation
from config.legal_versions import CURRENT_TOS_VERSION, CURRENT_PRIVACY_POLICY_VERSION
import re
import os

bp = Blueprint('auth', __name__)

def generate_portfolio_slug(first_name, last_name):
    """Generate a unique portfolio slug from first and last name"""
    # Remove non-alphanumeric characters and convert to lowercase
    base_slug = re.sub(r'[^a-zA-Z0-9]', '', first_name + last_name).lower()
    return base_slug

def ensure_user_diploma_and_skills(supabase, user_id, first_name, last_name):
    """Ensure user has diploma and skill categories initialized - OPTIMIZED"""
    try:
        # Check if diploma exists for this user
        diploma_check = supabase.table('diplomas').select('id').eq('user_id', user_id).execute()
        
        if not diploma_check.data:
            # Generate unique slug with better collision handling
            base_slug = generate_portfolio_slug(first_name, last_name)
            slug = base_slug
            
            # Try to create diploma with increasingly unique slugs
            for counter in range(100):  # Increased attempts for common names
                try:
                    check_slug = base_slug if counter == 0 else f"{base_slug}{counter}"
                    
                    # Try to insert directly - let database handle uniqueness
                    supabase.table('diplomas').insert({
                        'user_id': user_id,
                        'portfolio_slug': check_slug
                    }).execute()
                    
                    # If successful, we're done
                    break
                    
                except Exception as insert_error:
                    # If it's a duplicate key error, try next slug
                    if '23505' in str(insert_error) or 'duplicate' in str(insert_error).lower():
                        continue
                    else:
                        # Some other error - log it but don't fail
                        print(f"Error creating diploma: {str(insert_error)}")
                        break
        
        # Batch insert all skill categories at once instead of checking each one
        skill_categories = ['creativity', 'critical_thinking', 'practical_skills', 
                           'communication', 'cultural_literacy']
        
        # Build all skill records to insert
        skill_records = [
            {
                'user_id': user_id,
                'pillar': pillar,
                'xp_amount': 0
            }
            for pillar in skill_categories
        ]
        
        # Try to insert all at once, ignore conflicts (if they already exist)
        try:
            supabase.table('user_skill_xp').upsert(skill_records, on_conflict='user_id,pillar').execute()
        except Exception as skill_error:
            # If batch insert fails, fall back to individual inserts
            print(f"Batch skill insert failed: {str(skill_error)}, trying individual inserts")
            for record in skill_records:
                try:
                    supabase.table('user_skill_xp').insert(record).execute()
                except:
                    pass  # Skill already exists
                
    except Exception as e:
        print(f"Error ensuring diploma and skills: {str(e)}")
        # Don't fail registration if this fails - the database trigger should handle it

@bp.route('/register', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=300)  # 5 registrations per 5 minutes
def register():
    try:
        print(f"[REGISTRATION] Starting registration process")
        data = request.json
        
        # Validate input data
        is_valid, error_message = validate_registration_data(data)
        if not is_valid:
            print(f"[REGISTRATION] Validation failed: {error_message}")
            raise ValidationError(error_message)
        
        # Check for Terms of Service and Privacy Policy acceptance
        if not data.get('acceptedTerms'):
            raise ValidationError("You must accept the Terms of Service to create an account")
        
        if not data.get('acceptedPrivacy'):
            raise ValidationError("You must accept the Privacy Policy to create an account")
        
        # Store original names for Supabase Auth (no HTML encoding)
        original_first_name = data['first_name'].strip()
        original_last_name = data['last_name'].strip()
        email = data['email'].strip().lower()  # Normalize email to lowercase
        
        print(f"[REGISTRATION] Processing registration for email: {email[:3]}***")
        
        # Log the registration attempt (without password or PII)
        # Only log in development mode
        if os.getenv('FLASK_ENV') == 'development':
            print(f"Registration attempt for email: {email[:3]}***")
        
        # Use admin client for registration to bypass RLS
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()
        
        # Sign up with Supabase Auth (use original names without HTML encoding)
        from config import Config
        try:
            auth_response = supabase.auth.sign_up({
                'email': email,
                'password': data['password'],
                'options': {
                    'data': {
                        'first_name': original_first_name,
                        'last_name': original_last_name
                    },
                    'email_redirect_to': f"{Config.FRONTEND_URL}/login"
                }
            })
        except Exception as auth_error:
            # Log error without exposing sensitive data
            if os.getenv('FLASK_ENV') == 'development':
                print(f"Supabase auth error: {auth_error}")
            
            # Check if the error is about rate limiting
            error_str = str(auth_error).lower()
            if 'email rate limit exceeded' in error_str or 'rate limit' in error_str:
                # When rate limit is hit, the user might have been created successfully
                # Return a more helpful message
                return jsonify({
                    'message': 'Registration may have succeeded. If you received a confirmation email, please verify your account. Otherwise, wait a minute and try again.',
                    'email_verification_required': True
                }), 201
            raise
        
        if auth_response.user:
            # If no session, email verification is required
            if not auth_response.session:
                return jsonify({
                    'message': 'Account created successfully! Please check your email to verify your account.',
                    'email_verification_required': True
                }), 201
                
            # Sanitize names for database storage (prevent XSS)
            sanitized_first_name = sanitize_input(original_first_name)
            sanitized_last_name = sanitize_input(original_last_name)
            
            # Create user profile in our users table
            # All new users start with free tier, can upgrade later
            user_data = {
                'id': auth_response.user.id,
                'first_name': sanitized_first_name,
                'last_name': sanitized_last_name,
                'subscription_tier': 'free',
                'subscription_status': 'active',  # Free tier is always active
                'tos_accepted_at': 'now()',
                'privacy_policy_accepted_at': 'now()',
                'tos_version': CURRENT_TOS_VERSION,
                'privacy_policy_version': CURRENT_PRIVACY_POLICY_VERSION,
                'created_at': 'now()'
            }
            
            # Note: username column has been removed from the database
            # Don't include it in the insert
            
            supabase.table('users').insert(user_data).execute()
            
            # Ensure diploma and skills are initialized (backup to database trigger)
            # This is now optimized to use batch operations
            ensure_user_diploma_and_skills(supabase, auth_response.user.id, sanitized_first_name, sanitized_last_name)
            
            # Fetch the complete user profile data to return to frontend
            user_profile = supabase.table('users').select('*').eq('id', auth_response.user.id).single().execute()
            
            # Skip welcome email to avoid timeout - Supabase sends its own
            
            return jsonify({
                'user': user_profile.data if user_profile.data else auth_response.user.model_dump(),
                'session': auth_response.session.model_dump() if auth_response.session else None
            }), 201
        else:
            return jsonify({'error': 'Registration failed - no user created'}), 400
            
    except ValidationError:
        raise  # Re-raise validation errors
    except Exception as e:
        # Log the full error for debugging
        print(f"Supabase registration error: {str(e)}")
        
        # Parse error message for specific cases
        error_str = str(e).lower()
        
        if 'already registered' in error_str or 'already exists' in error_str:
            raise ConflictError('This email is already registered')
        elif 'email signups are disabled' in error_str:
            raise ValidationError('Registration is temporarily disabled. Please contact support.')
        elif 'error sending confirmation email' in error_str or 'email' in error_str and 'error' in error_str:
            # SMTP configuration issue
            raise ValidationError('Registration is temporarily unavailable due to email service issues. Please try again later or contact support.')
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
        
        # Log unexpected errors in development only
        if os.getenv('FLASK_ENV') == 'development':
            print(f"Registration error: {str(e)}")
        raise ExternalServiceError('Supabase', 'Registration service is currently unavailable. Please try again later.', e)

@bp.route('/login', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=60)  # 5 login attempts per minute
def login():
    data = request.json
    supabase = get_supabase_client()
    
    # Validate input
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password are required'}), 400
    
    try:
        auth_response = supabase.auth.sign_in_with_password({
            'email': data['email'].strip().lower(),  # Normalize email
            'password': data['password']
        })
        
        if auth_response.user and auth_response.session:
            # Use admin client to fetch user data (bypasses RLS for login)
            from database import get_supabase_admin_client
            admin_client = get_supabase_admin_client()
            
            # Fetch user data with admin client
            try:
                user_data = admin_client.table('users').select('*').eq('id', auth_response.user.id).single().execute()
            except Exception as e:
                # If user profile doesn't exist, create it (for users who registered before profile creation)
                error_str = str(e)
                if 'rows' in error_str or 'single' in error_str:
                    # Create minimal user profile
                    user_data = admin_client.table('users').insert({
                        'id': auth_response.user.id,
                        'first_name': auth_response.user.user_metadata.get('first_name', 'User'),
                        'last_name': auth_response.user.user_metadata.get('last_name', ''),
                        'subscription_tier': 'free',
                        'subscription_status': 'active',
                        'created_at': 'now()'
                    }).execute()
                    
                    # Ensure diploma and skills
                    ensure_user_diploma_and_skills(
                        admin_client, 
                        auth_response.user.id,
                        auth_response.user.user_metadata.get('first_name', 'User'),
                        auth_response.user.user_metadata.get('last_name', '')
                    )
                else:
                    raise
            
            # Ensure user has diploma and skills initialized (for existing users)
            # This is non-blocking - if it fails, we still allow login
            try:
                ensure_user_diploma_and_skills(
                    admin_client,
                    auth_response.user.id,
                    user_data.data.get('first_name', 'User'),
                    user_data.data.get('last_name', '')
                )
            except Exception as diploma_error:
                print(f"Non-critical: Failed to ensure diploma/skills during login: {diploma_error}")
            
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
            return jsonify({'error': 'Invalid email or password. Please check your credentials and try again.'}), 401
            
    except Exception as e:
        error_message = str(e)
        print(f"Login error: {error_message}")
        
        # Parse error for specific cases
        error_lower = error_message.lower()
        
        if "invalid login credentials" in error_lower:
            return jsonify({'error': 'Invalid email or password. Please check your credentials and try again.'}), 401
        elif "email not confirmed" in error_lower:
            return jsonify({'error': 'Please verify your email address before logging in. Check your inbox for a confirmation email.'}), 401
        elif "user not found" in error_lower:
            return jsonify({'error': 'No account found with this email. Please register first or check your email address.'}), 401
        elif "rate limit" in error_lower or "too many requests" in error_lower:
            import re
            wait_match = re.search(r'after (\d+) seconds', error_message)
            if wait_match:
                wait_time = wait_match.group(1)
                return jsonify({'error': f'Too many login attempts. Please wait {wait_time} seconds before trying again.'}), 429
            else:
                return jsonify({'error': 'Too many login attempts. Please wait a minute before trying again.'}), 429
        elif "invalid api key" in error_lower:
            return jsonify({'error': 'Server configuration error. Please contact support.'}), 500
        elif "connection" in error_lower or "timeout" in error_lower:
            return jsonify({'error': 'Connection error. Please check your internet connection and try again.'}), 503
        elif "password" in error_lower:
            return jsonify({'error': 'Invalid password. Please check your password and try again.'}), 401
        else:
            # Generic error but still informative
            return jsonify({'error': 'Login failed. Please try again or contact support if the problem persists.'}), 400

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

@bp.route('/resend-verification', methods=['POST'])
@rate_limit(max_requests=3, window_seconds=600)  # 3 resends per 10 minutes
def resend_verification():
    """Resend verification email to user"""
    try:
        data = request.json
        email = data.get('email')
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        # Sanitize email input
        email = sanitize_input(email.lower().strip())
        
        supabase = get_supabase_client()
        
        # Check if user exists and is not already verified
        user_check = supabase.table('users').select('id, email_verified').eq('email', email).execute()
        
        if not user_check.data:
            # Don't reveal if user doesn't exist for security
            return jsonify({'message': 'If this email is registered, a verification email has been sent'}), 200
        
        user = user_check.data[0]
        
        if user.get('email_verified'):
            return jsonify({'error': 'Email is already verified'}), 400
        
        # Resend verification email using Supabase Auth
        try:
            # Use Supabase's resend functionality
            supabase.auth.resend(email=email, type='signup')
            
            return jsonify({'message': 'Verification email has been resent. Please check your inbox.'}), 200
        except Exception as auth_error:
            print(f"[RESEND_VERIFICATION] Supabase auth error: {str(auth_error)}")
            # If Supabase resend fails, still return success to avoid revealing user existence
            return jsonify({'message': 'If this email is registered, a verification email has been sent'}), 200
            
    except Exception as e:
        print(f"[RESEND_VERIFICATION] Error: {str(e)}")
        return jsonify({'error': 'Failed to resend verification email'}), 500

@bp.route('/check-tos-acceptance', methods=['GET'])
def check_tos_acceptance():
    """Check if the current user has accepted the latest ToS and Privacy Policy"""
    try:
        # Get user from token
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            token = request.cookies.get('access_token')
        
        if not token:
            return jsonify({'error': 'No authentication token provided'}), 401
        
        # Verify token and get user
        user_id = verify_token(token)
        if not user_id:
            return jsonify({'error': 'Invalid token'}), 401
        
        # Get user's current acceptance status
        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()
        
        user_data = admin_client.table('users').select(
            'tos_version, privacy_policy_version, tos_accepted_at, privacy_policy_accepted_at, role'
        ).eq('id', user_id).single().execute()
        
        if not user_data.data:
            return jsonify({'error': 'User not found'}), 404
        
        user = user_data.data
        
        # Admins don't need to accept ToS (they can still choose to)
        if user.get('role') == 'admin':
            return jsonify({
                'needs_acceptance': False,
                'is_admin': True,
                'current_tos_version': CURRENT_TOS_VERSION,
                'current_privacy_version': CURRENT_PRIVACY_POLICY_VERSION
            }), 200
        
        # Check if user needs to accept ToS
        needs_tos = (
            not user.get('tos_accepted_at') or 
            user.get('tos_version') != CURRENT_TOS_VERSION
        )
        
        needs_privacy = (
            not user.get('privacy_policy_accepted_at') or 
            user.get('privacy_policy_version') != CURRENT_PRIVACY_POLICY_VERSION
        )
        
        return jsonify({
            'needs_acceptance': needs_tos or needs_privacy,
            'needs_tos': needs_tos,
            'needs_privacy': needs_privacy,
            'current_tos_version': CURRENT_TOS_VERSION,
            'current_privacy_version': CURRENT_PRIVACY_POLICY_VERSION,
            'user_tos_version': user.get('tos_version'),
            'user_privacy_version': user.get('privacy_policy_version')
        }), 200
        
    except Exception as e:
        print(f"[CHECK_TOS] Error: {str(e)}")
        return jsonify({'error': 'Failed to check ToS acceptance status'}), 500

@bp.route('/accept-tos', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=60)
def accept_tos():
    """Accept the current Terms of Service and Privacy Policy"""
    try:
        # Get user from token
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            token = request.cookies.get('access_token')
        
        if not token:
            return jsonify({'error': 'No authentication token provided'}), 401
        
        # Verify token and get user
        user_id = verify_token(token)
        if not user_id:
            return jsonify({'error': 'Invalid token'}), 401
        
        data = request.json
        
        # Validate that both are accepted
        if not data.get('acceptedTerms'):
            return jsonify({'error': 'You must accept the Terms of Service'}), 400
        
        if not data.get('acceptedPrivacy'):
            return jsonify({'error': 'You must accept the Privacy Policy'}), 400
        
        # Update user's acceptance
        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()
        
        update_data = {
            'tos_accepted_at': 'now()',
            'privacy_policy_accepted_at': 'now()',
            'tos_version': CURRENT_TOS_VERSION,
            'privacy_policy_version': CURRENT_PRIVACY_POLICY_VERSION
        }
        
        result = admin_client.table('users').update(update_data).eq('id', user_id).execute()
        
        if not result.data:
            return jsonify({'error': 'Failed to update acceptance status'}), 500
        
        return jsonify({
            'message': 'Terms of Service and Privacy Policy accepted successfully',
            'tos_version': CURRENT_TOS_VERSION,
            'privacy_version': CURRENT_PRIVACY_POLICY_VERSION
        }), 200
        
    except Exception as e:
        print(f"[ACCEPT_TOS] Error: {str(e)}")
        return jsonify({'error': 'Failed to accept ToS'}), 500