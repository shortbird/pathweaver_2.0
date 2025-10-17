from flask import Blueprint, request, jsonify, make_response
from database import get_supabase_client
from utils.auth.token_utils import verify_token
from utils.validation import validate_registration_data, sanitize_input
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from middleware.error_handler import ValidationError, AuthenticationError, ExternalServiceError, ConflictError
from middleware.csrf_protection import get_csrf_token
from utils.retry_handler import retry_database_operation
from legal_versions import CURRENT_TOS_VERSION, CURRENT_PRIVACY_POLICY_VERSION
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
        skill_categories = ['Arts & Creativity', 'STEM & Logic', 'Life & Wellness', 
                           'Language & Communication', 'Society & Culture']
        
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
        
        # Check for Terms of Service and Privacy Policy acceptance (combined)
        if not data.get('acceptedLegalTerms') and not (data.get('acceptedTerms') and data.get('acceptedPrivacy')):
            raise ValidationError("You must accept the Terms of Service and Privacy Policy to create an account")
        
        # Store original names for Supabase Auth (no HTML encoding)
        original_first_name = data['first_name'].strip()
        original_last_name = data['last_name'].strip()
        email = data['email'].strip().lower()  # Normalize email to lowercase
        date_of_birth = data.get('date_of_birth')  # Optional date of birth for age verification
        parent_email = data.get('parent_email')  # Required if user is under 13

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
            # Supabase Python client v2.x API
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
            import sys
            print(f"[DEBUG] Full Supabase auth error: {auth_error}", file=sys.stderr)
            print(f"[DEBUG] Error type: {type(auth_error)}", file=sys.stderr)
            if hasattr(auth_error, 'args'):
                print(f"[DEBUG] Error args: {auth_error.args}", file=sys.stderr)
            
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
            # Sanitize names for database storage (prevent XSS)
            sanitized_first_name = sanitize_input(original_first_name)
            sanitized_last_name = sanitize_input(original_last_name)

            # Calculate age if date of birth is provided
            requires_parental_consent = False
            if date_of_birth:
                from datetime import datetime, date
                try:
                    dob = datetime.strptime(date_of_birth, '%Y-%m-%d').date()
                    age = (date.today() - dob).days // 365
                    requires_parental_consent = age < 13

                    # If user is under 13, parent email is required
                    if requires_parental_consent and not parent_email:
                        raise ValidationError("Parent/guardian email is required for users under 13")
                except ValueError:
                    raise ValidationError("Invalid date of birth format. Use YYYY-MM-DD")

            # Create user profile in our users table
            # All new users start with free tier, can upgrade later
            # IMPORTANT: Create profile even if email verification is required
            # so that ToS acceptance is recorded
            user_data = {
                'id': auth_response.user.id,
                'first_name': sanitized_first_name,
                'last_name': sanitized_last_name,
                'email': email,
                'subscription_tier': 'Free',  # Must match database constraint (capitalized)
                'subscription_status': 'active',  # Free tier is always active
                'tos_accepted_at': 'now()',
                'privacy_policy_accepted_at': 'now()',
                'tos_version': CURRENT_TOS_VERSION,
                'privacy_policy_version': CURRENT_PRIVACY_POLICY_VERSION,
                'created_at': 'now()'
            }

            # Add optional phone number
            if data.get('phone_number'):
                user_data['phone_number'] = sanitize_input(data['phone_number'].strip())

            # Add optional address fields
            if data.get('address_line1'):
                user_data['address_line1'] = sanitize_input(data['address_line1'].strip())
            if data.get('address_line2'):
                user_data['address_line2'] = sanitize_input(data['address_line2'].strip())
            if data.get('city'):
                user_data['city'] = sanitize_input(data['city'].strip())
            if data.get('state'):
                user_data['state'] = sanitize_input(data['state'].strip())
            if data.get('postal_code'):
                user_data['postal_code'] = sanitize_input(data['postal_code'].strip())
            if data.get('country'):
                user_data['country'] = sanitize_input(data['country'].strip())

            # Add date of birth and parental consent fields if provided
            if date_of_birth:
                user_data['date_of_birth'] = date_of_birth
                user_data['requires_parental_consent'] = requires_parental_consent
                if requires_parental_consent and parent_email:
                    user_data['parental_consent_email'] = parent_email.strip().lower()
                    user_data['parental_consent_verified'] = False
            
            # Note: username column has been removed from the database
            # Don't include it in the insert
            
            # Use upsert to handle cases where auth user exists but profile doesn't
            # This fixes the foreign key constraint issue
            try:
                supabase.table('users').upsert(user_data, on_conflict='id').execute()
            except Exception as profile_error:
                # If we can't create the profile, check if it's a constraint issue
                error_str = str(profile_error).lower()
                if 'foreign key' in error_str or 'constraint' in error_str:
                    # The auth user wasn't created properly, try to clean up
                    print(f"Profile creation failed with constraint error: {profile_error}")
                    # Don't fail the registration - the auth user was created
                    # Just log the error and continue
                else:
                    # Re-raise other errors
                    raise
            
            # Ensure diploma and skills are initialized (backup to database trigger)
            # This is now optimized to use batch operations
            # Do this for ALL users, even those requiring email verification
            ensure_user_diploma_and_skills(supabase, auth_response.user.id, sanitized_first_name, sanitized_last_name)
            
            # If no session, email verification is required
            if not auth_response.session:
                # Send branded welcome email (Supabase sends verification separately)
                try:
                    from services.email_service import EmailService
                    email_service = EmailService()
                    email_service.send_welcome_email(
                        user_email=email,
                        user_name=sanitized_first_name
                    )
                except Exception as email_error:
                    # Don't fail registration if welcome email fails
                    print(f"Warning: Failed to send welcome email: {email_error}")

                response_data = {
                    'message': 'Account created successfully! Please check your email to verify your account.',
                    'email_verification_required': True
                }

                # Add parental consent information if applicable
                if requires_parental_consent:
                    response_data['requires_parental_consent'] = True
                    response_data['parent_email'] = parent_email
                    response_data['message'] = 'Account created! Please verify your email and have your parent/guardian verify consent.'

                return jsonify(response_data), 201

            # Fetch the complete user profile data to return to frontend
            user_profile = supabase.table('users').select('*').eq('id', auth_response.user.id).single().execute()

            # NOTE: Supabase Auth automatically sends plain verification email
            # Send our own branded welcome email as well (with BCC to support)
            try:
                from services.email_service import EmailService
                email_service = EmailService()
                email_service.send_welcome_email(
                    user_email=email,
                    user_name=sanitized_first_name
                )
            except Exception as email_error:
                # Don't fail registration if welcome email fails
                print(f"Warning: Failed to send welcome email: {email_error}")

            response_data = {
                'user': user_profile.data if user_profile.data else auth_response.user.model_dump(),
                'session': auth_response.session.model_dump() if auth_response.session else None
            }

            # Add parental consent flag if user requires it
            if requires_parental_consent:
                response_data['requires_parental_consent'] = True
                response_data['parent_email'] = parent_email

            return jsonify(response_data), 201
        else:
            return jsonify({'error': 'Registration failed - no user created'}), 400
            
    except ValidationError:
        raise  # Re-raise validation errors
    except Exception as e:
        # Log the full error for debugging (handle encoding issues)
        try:
            print(f"Supabase registration error: {str(e)}")
        except:
            print("Supabase registration error occurred but could not be printed")
        
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
            raise ValidationError('Password is too common or easy to guess. Please choose a more unique password (6+ characters)')
        elif 'password' in error_str:
            # If Supabase rejects the password for any reason, provide our requirement message
            raise ValidationError('Password must be at least 6 characters long')
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

@bp.route('/me', methods=['GET'])
def get_current_user():
    """Get current user profile with fresh data"""
    try:
        # First try to get user ID from secure httpOnly cookies
        user_id = session_manager.get_current_user_id()

        # Fallback to Authorization header for backward compatibility
        if not user_id:
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                return jsonify({'error': 'Authentication required'}), 401

            token = auth_header.split(' ')[1]

            # Verify token with Supabase
            supabase = get_supabase_client()
            try:
                # Get user from token
                user_response = supabase.auth.get_user(token)
                if not user_response.user:
                    return jsonify({'error': 'Invalid token'}), 401

                user_id = user_response.user.id
            except Exception as e:
                print(f"Token verification failed: {e}")
                return jsonify({'error': 'Invalid or expired token'}), 401

        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        # Use admin client to bypass RLS and get fresh data
        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()

        try:
            # Fetch complete user profile
            user_data = admin_client.table('users').select('*').eq('id', user_id).single().execute()

            if user_data.data:
                return jsonify(user_data.data), 200
            else:
                return jsonify({'error': 'User profile not found'}), 404

        except Exception as e:
            print(f"Error fetching user data: {e}")
            return jsonify({'error': 'Failed to fetch user profile'}), 500

    except Exception as e:
        print(f"Unexpected error in /me endpoint: {e}")
        return jsonify({'error': 'Internal server error'}), 500

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
                    # Check if this is a recently created user (within last hour)
                    # If so, they likely accepted ToS during registration
                    user_created_at = auth_response.user.created_at if hasattr(auth_response.user, 'created_at') else None
                    is_new_user = False
                    if user_created_at:
                        from datetime import datetime, timedelta, timezone
                        try:
                            # Parse the created_at timestamp
                            if isinstance(user_created_at, str):
                                created_time = datetime.fromisoformat(user_created_at.replace('Z', '+00:00'))
                            else:
                                created_time = user_created_at
                            # Check if user was created within the last hour
                            is_new_user = (datetime.now(timezone.utc) - created_time) < timedelta(hours=1)
                        except:
                            pass
                    
                    profile_data = {
                        'id': auth_response.user.id,
                        'first_name': auth_response.user.user_metadata.get('first_name', 'User'),
                        'last_name': auth_response.user.user_metadata.get('last_name', ''),
                        'email': auth_response.user.email,
                        'subscription_tier': 'Free',  # Must match database constraint (capitalized)
                        'subscription_status': 'active',
                        'created_at': 'now()'
                    }
                    
                    # If this is a new user, assume they accepted ToS during registration
                    if is_new_user:
                        profile_data['tos_accepted_at'] = 'now()'
                        profile_data['privacy_policy_accepted_at'] = 'now()'
                        profile_data['tos_version'] = CURRENT_TOS_VERSION
                        profile_data['privacy_policy_version'] = CURRENT_PRIVACY_POLICY_VERSION
                    
                    user_data = admin_client.table('users').insert(profile_data).execute()
                    
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
                # Handle both single record and list response formats
                if user_data.data:
                    if isinstance(user_data.data, list):
                        user_record = user_data.data[0] if user_data.data else {}
                    else:
                        user_record = user_data.data
                    
                    ensure_user_diploma_and_skills(
                        admin_client,
                        auth_response.user.id,
                        user_record.get('first_name', 'User'),
                        user_record.get('last_name', '')
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
            # Ensure user data is a single record, not a list
            user_response_data = user_data.data
            if isinstance(user_response_data, list):
                user_response_data = user_response_data[0] if user_response_data else None

            # Extract session data
            session_data = auth_response.session.model_dump() if auth_response.session else {}

            response_data = {
                'user': user_response_data,
                'session': session_data,
                # Include tokens at top level for incognito mode fallback
                # Incognito browsers block SameSite=None cookies
                'access_token': session_data.get('access_token'),
                'refresh_token': session_data.get('refresh_token')
            }
            response = make_response(jsonify(response_data), 200)

            # Set secure httpOnly cookies for new sessions (preferred method)
            # These will work in normal browsing but may be blocked in incognito
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
    # Try to refresh using httpOnly cookies first
    refresh_result = session_manager.refresh_session()

    if refresh_result:
        new_access_token, new_refresh_token, user_id = refresh_result

        # Create response with new tokens in cookies
        response = make_response(jsonify({
            'message': 'Tokens refreshed successfully'
        }), 200)

        # Set new secure cookies
        session_manager.set_auth_cookies(response, user_id)

        return response

    # Fallback to legacy refresh token method for backward compatibility
    data = request.json if request.json else {}
    refresh_token = data.get('refresh_token')

    if not refresh_token:
        return jsonify({'error': 'No refresh token provided'}), 401

    supabase = get_supabase_client()

    try:
        auth_response = supabase.auth.refresh_session(refresh_token)

        if auth_response.session:
            session_data = auth_response.session.model_dump()
            response = make_response(jsonify({
                'session': session_data,
                'access_token': session_data.get('access_token'),
                'refresh_token': session_data.get('refresh_token')
            }), 200)

            # Also set cookies if we have user_id
            if auth_response.user:
                session_manager.set_auth_cookies(response, auth_response.user.id)

            return response
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
            print(f"[RESEND_VERIFICATION] Attempting to resend for {email}")
            result = supabase.auth.resend(email=email, type='signup')
            
            # Log the result for debugging
            print(f"[RESEND_VERIFICATION] Result: {result}")
            
            return jsonify({
                'message': 'Verification email request processed. Please check your inbox and spam folder.',
                'note': 'Supabase free tier allows 4 emails per hour. If you don\'t receive an email, you may have hit the rate limit.'
            }), 200
        except Exception as auth_error:
            error_str = str(auth_error).lower()
            print(f"[RESEND_VERIFICATION] Supabase auth error: {str(auth_error)}")
            
            # Provide helpful error messages
            if 'rate limit' in error_str or 'too many' in error_str:
                return jsonify({
                    'error': 'Email rate limit reached. Supabase free tier allows 4 emails per hour. Please wait before trying again.',
                    'suggestion': 'Check your spam folder for previous emails, or wait an hour for the limit to reset.'
                }), 429
            elif 'not found' in error_str:
                return jsonify({'error': 'No account found with this email address. Please register first.'}), 404
            else:
                # Don't reveal too much about errors for security
                return jsonify({
                    'message': 'Verification email request processed. If an account exists, an email will be sent.',
                    'note': 'Check spam folder. Supabase free tier has a 4 email/hour limit.'
                }), 200
            
    except Exception as e:
        print(f"[RESEND_VERIFICATION] Error: {str(e)}")
        return jsonify({'error': 'Failed to resend verification email'}), 500

@bp.route('/csrf-token', methods=['GET'])
def get_csrf_token_endpoint():
    """Get CSRF token for frontend requests"""
    try:
        token = get_csrf_token()

        if not token:
            # If CSRF is not available, generate a simple token for compatibility
            import secrets
            token = secrets.token_urlsafe(32)

        response = make_response(jsonify({
            'csrf_token': token
        }), 200)

        # Set CSRF token in cookie for double-submit pattern
        response.set_cookie(
            'csrf_token',
            token,
            max_age=3600,  # 1 hour
            httponly=False,  # JavaScript needs to read this
            secure=os.getenv('FLASK_ENV') == 'production',
            samesite='Lax',  # Use Lax for incognito mode compatibility
            path='/'
        )

        return response

    except Exception as e:
        print(f"Error generating CSRF token: {str(e)}")
        return jsonify({'error': 'Failed to generate CSRF token'}), 500


