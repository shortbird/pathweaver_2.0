from flask import Blueprint, request, jsonify, make_response
from database import get_supabase_client
from backend.repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.token_utils import verify_token
from utils.validation import validate_registration_data, sanitize_input
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from middleware.error_handler import ValidationError, AuthenticationError, ExternalServiceError, ConflictError
from middleware.csrf_protection import get_csrf_token
from utils.retry_handler import retry_database_operation
from legal_versions import CURRENT_TOS_VERSION, CURRENT_PRIVACY_POLICY_VERSION
from services.email_service import email_service
import re
import os
import secrets
from datetime import datetime, timedelta

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('auth', __name__)

# Account lockout constants
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 30

def check_account_lockout(email):
    """
    Check if account is locked due to too many failed attempts.
    Returns (is_locked, retry_after_seconds, attempt_count)
    """
    try:
        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()

        # Get login attempt record
        result = admin_client.table('login_attempts')\
            .select('*')\
            .eq('email', email.lower())\
            .execute()

        if not result.data:
            return False, 0, 0

        record = result.data[0]
        locked_until = record.get('locked_until')
        attempt_count = record.get('attempt_count', 0)

        # Check if account is currently locked
        if locked_until:
            locked_until_dt = datetime.fromisoformat(locked_until.replace('Z', '+00:00'))
            now = datetime.now(locked_until_dt.tzinfo)

            if now < locked_until_dt:
                retry_after = int((locked_until_dt - now).total_seconds())
                return True, retry_after, attempt_count

        return False, 0, attempt_count

    except Exception as e:
        logger.error(f"Error checking account lockout: {e}")
        return False, 0, 0

def record_failed_login(email):
    """
    Record a failed login attempt and lock account if threshold is reached.
    Returns (is_now_locked, attempts_remaining, lockout_duration_minutes)
    """
    try:
        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()

        # Get current record
        result = admin_client.table('login_attempts')\
            .select('*')\
            .eq('email', email.lower())\
            .execute()

        if not result.data:
            # Create new record
            admin_client.table('login_attempts').insert({
                'email': email.lower(),
                'attempt_count': 1,
                'locked_until': None,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }).execute()
            return False, MAX_LOGIN_ATTEMPTS - 1, 0

        record = result.data[0]
        attempt_count = record.get('attempt_count', 0) + 1

        # Check if we should lock the account
        if attempt_count >= MAX_LOGIN_ATTEMPTS:
            locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            admin_client.table('login_attempts').update({
                'attempt_count': attempt_count,
                'locked_until': locked_until.isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }).eq('email', email.lower()).execute()
            return True, 0, LOCKOUT_DURATION_MINUTES
        else:
            # Increment attempt count
            admin_client.table('login_attempts').update({
                'attempt_count': attempt_count,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('email', email.lower()).execute()
            return False, MAX_LOGIN_ATTEMPTS - attempt_count, 0

    except Exception as e:
        logger.error(f"Error recording failed login: {e}")
        return False, 0, 0

def reset_login_attempts(email):
    """
    Reset login attempts after successful login.
    """
    try:
        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()

        admin_client.table('login_attempts').update({
            'attempt_count': 0,
            'locked_until': None,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('email', email.lower()).execute()

    except Exception as e:
        logger.error(f"Error resetting login attempts: {e}")

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
                        logger.error(f"Error creating diploma: {str(insert_error)}")
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
            logger.error(f"Batch skill insert failed: {str(skill_error)}, trying individual inserts")
            for record in skill_records:
                try:
                    supabase.table('user_skill_xp').insert(record).execute()
                except:
                    pass  # Skill already exists
                
    except Exception as e:
        logger.error(f"Error ensuring diploma and skills: {str(e)}")
        # Don't fail registration if this fails - the database trigger should handle it

# Using repository pattern for database access
@bp.route('/register', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=300)  # 5 registrations per 5 minutes
def register():
    try:
        logger.info(f"[REGISTRATION] Starting registration process")
        data = request.json
        
        # Validate input data
        is_valid, error_message = validate_registration_data(data)
        if not is_valid:
            logger.error(f"[REGISTRATION] Validation failed: {error_message}")
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

        logger.debug(f"[REGISTRATION] Processing registration for email: {email[:3]}***")
        
        # Log the registration attempt (without password or PII)
        # Only log in development mode
        if os.getenv('FLASK_ENV') == 'development':
            logger.info(f"Registration attempt for email: {email[:3]}***")
        
        # Use admin client for registration to bypass RLS
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()
        
        # Sign up with Supabase Auth (use original names without HTML encoding)
        from app_config import Config
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
                # subscription_tier and subscription_status removed in Phase 1 refactoring
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
                    logger.error(f"Profile creation failed with constraint error: {profile_error}")
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

            # Extract session data (but remove tokens for security)
            session_data = auth_response.session.model_dump() if auth_response.session else None

            # Prepare session data
            # For incognito mode compatibility, we include tokens in response body
            # Tokens are ALSO set in httpOnly cookies as a fallback
            if session_data:
                # Keep access_token and refresh_token in session data for Authorization header usage
                pass  # Don't delete tokens - needed for incognito mode

            response_data = {
                'user': user_profile.data if user_profile.data else auth_response.user.model_dump(),
                'session': session_data,
                # ✅ DUAL AUTH STRATEGY: Tokens in response body for Authorization headers
                # AND in httpOnly cookies for fallback
                # This ensures compatibility with incognito mode (where cookies may be blocked)
            }

            # Add parental consent flag if user requires it
            if requires_parental_consent:
                response_data['requires_parental_consent'] = True
                response_data['parent_email'] = parent_email

            # ✅ INCOGNITO MODE FIX: Generate custom JWT tokens for Authorization headers
            # These are our application tokens (NOT Supabase tokens)
            app_access_token = session_manager.generate_access_token(auth_response.user.id)
            app_refresh_token = session_manager.generate_refresh_token(auth_response.user.id)

            # Add app tokens to response
            response_data['app_access_token'] = app_access_token
            response_data['app_refresh_token'] = app_refresh_token

            # Create response and set httpOnly cookies for authentication
            response = make_response(jsonify(response_data), 201)

            # Set httpOnly cookies for authentication (fallback method)
            session_manager.set_auth_cookies(response, auth_response.user.id)

            return response
        else:
            return jsonify({'error': 'Registration failed - no user created'}), 400
            
    except ValidationError:
        raise  # Re-raise validation errors
    except Exception as e:
        # Log the full error for debugging (handle encoding issues)
        try:
            logger.error(f"Supabase registration error: {str(e)}")
        except:
            logger.error("Supabase registration error occurred but could not be printed")
        
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
            logger.error(f"Registration error: {str(e)}")
        raise ExternalServiceError('Supabase', 'Registration service is currently unavailable. Please try again later.', e)

@bp.route('/me', methods=['GET'])
def get_current_user():
    """Get current user profile with fresh data"""
    try:
        # ✅ INCOGNITO MODE FIX: Prioritize Authorization header (works in incognito)
        # session_manager.get_current_user_id() already checks Authorization header first
        user_id = session_manager.get_current_user_id()

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
            logger.error(f"Error fetching user data: {e}")
            return jsonify({'error': 'Failed to fetch user profile'}), 500

    except Exception as e:
        logger.error(f"Unexpected error in /me endpoint: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/login', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=60)  # 5 login attempts per minute
def login():
    data = request.json
    supabase = get_supabase_client()

    # Validate input
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password are required'}), 400

    email = data['email'].strip().lower()

    # Check if account is locked due to too many failed attempts
    is_locked, retry_after, attempt_count = check_account_lockout(email)
    if is_locked:
        minutes_remaining = retry_after // 60
        return jsonify({
            'error': f'Account temporarily locked due to too many failed login attempts. Please try again in {minutes_remaining} minutes.',
            'retry_after': retry_after,
            'locked': True
        }), 429

    try:
        auth_response = supabase.auth.sign_in_with_password({
            'email': email,
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
                        # subscription_tier and subscription_status removed in Phase 1 refactoring
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
                logger.error(f"Non-critical: Failed to ensure diploma/skills during login: {diploma_error}")
            
            # Normalize user data before using it
            user_response_data = user_data.data
            if isinstance(user_response_data, list):
                user_response_data = user_response_data[0] if user_response_data else None

            # Send welcome email on first login (when welcome_email_sent is False/NULL)
            # This happens after user verifies their email and logs in for the first time
            try:
                welcome_sent = user_response_data.get('welcome_email_sent') if user_response_data else True
                is_first_login = user_response_data and not welcome_sent

                if is_first_login:
                    from services.email_service import EmailService
                    email_service = EmailService()
                    email_service.send_welcome_email(
                        user_email=auth_response.user.email,
                        user_name=user_response_data.get('first_name', 'there')
                    )
                    logger.info(f"[LOGIN] Sent welcome email to {auth_response.user.email[:3]}*** on first login")

                    # Mark welcome email as sent
                    try:
                        admin_client.table('users').update({
                            'welcome_email_sent': True
                        }).eq('id', auth_response.user.id).execute()
                    except Exception as update_error:
                        logger.error(f"Warning: Failed to update welcome_email_sent flag: {update_error}")
            except Exception as welcome_error:
                # Don't fail login if welcome email fails
                logger.error(f"Warning: Failed to send welcome email on first login: {welcome_error}")

            # Try to log activity, but don't fail login if it doesn't work
            try:
                admin_client.table('activity_log').insert({
                    'user_id': auth_response.user.id,
                    'event_type': 'user_login',
                    'event_details': {'ip': request.remote_addr}
                }).execute()
            except Exception as log_error:
                logger.error(f"Failed to log activity: {log_error}")

            # Reset login attempts after successful login
            reset_login_attempts(email)

            # Create response with user data

            # Extract session data
            session_data = auth_response.session.model_dump() if auth_response.session else {}

            # For incognito mode compatibility, we include tokens in response body
            # Tokens are ALSO set in httpOnly cookies as a fallback
            # Keep access_token and refresh_token for Authorization header usage

            # ✅ INCOGNITO MODE FIX: Generate custom JWT tokens for Authorization headers
            app_access_token = session_manager.generate_access_token(auth_response.user.id)
            app_refresh_token = session_manager.generate_refresh_token(auth_response.user.id)

            response_data = {
                'user': user_response_data,
                'session': session_data,
                'app_access_token': app_access_token,
                'app_refresh_token': app_refresh_token,
                # ✅ DUAL AUTH STRATEGY: App tokens in response body for Authorization headers
                # AND in httpOnly cookies for fallback
                # This ensures compatibility with incognito mode (where cookies may be blocked)
            }
            response = make_response(jsonify(response_data), 200)

            # Set httpOnly cookies for authentication (same-origin only)
            # In cross-origin mode, session_manager skips cookie operations
            session_manager.set_auth_cookies(response, auth_response.user.id)

            # ✅ INCOGNITO FIX: Skip Supabase cookies in cross-origin mode (blocked anyway)
            # Supabase tokens are in response body for frontend to use if needed
            if not session_manager.is_cross_origin and auth_response.session:
                if auth_response.session.access_token:
                    response.set_cookie(
                        'supabase_access_token',
                        auth_response.session.access_token,
                        max_age=3600,  # 1 hour (matches Supabase default)
                        httponly=True,
                        secure=session_manager.cookie_secure,
                        samesite=session_manager.cookie_samesite,
                        path='/'
                    )

                if auth_response.session.refresh_token:
                    response.set_cookie(
                        'supabase_refresh_token',
                        auth_response.session.refresh_token,
                        max_age=2592000,  # 30 days (matches Supabase default)
                        httponly=True,
                        secure=session_manager.cookie_secure,
                        samesite=session_manager.cookie_samesite,
                        path='/'
                    )

            return response
        else:
            return jsonify({'error': 'Invalid email or password. Please check your credentials and try again.'}), 401
            
    except Exception as e:
        error_message = str(e)
        logger.error(f"Login error: {error_message}")
        
        # Parse error for specific cases
        error_lower = error_message.lower()
        
        if "invalid login credentials" in error_lower:
            # Record failed login attempt
            is_now_locked, attempts_remaining, lockout_minutes = record_failed_login(email)

            if is_now_locked:
                return jsonify({
                    'error': f'Too many failed login attempts. Your account has been temporarily locked for {lockout_minutes} minutes.',
                    'locked': True,
                    'lockout_duration': lockout_minutes
                }), 429
            else:
                return jsonify({
                    'error': f'Invalid email or password. {attempts_remaining} attempts remaining before account lockout.',
                    'attempts_remaining': attempts_remaining
                }), 401
        elif "email not confirmed" in error_lower:
            return jsonify({'error': 'Please verify your email address before logging in. Check your inbox for a confirmation email.'}), 401
        elif "user not found" in error_lower:
            # Record failed login attempt even for non-existent users (prevent username enumeration)
            record_failed_login(email)
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

        # Clear authentication cookies (same-origin only, skipped in cross-origin)
        session_manager.clear_auth_cookies(response)

        # ✅ INCOGNITO FIX: Clear Supabase cookies only in same-origin mode
        if not session_manager.is_cross_origin:
            response.set_cookie('supabase_access_token', '', expires=0, httponly=True, secure=session_manager.cookie_secure, samesite=session_manager.cookie_samesite)
            response.set_cookie('supabase_refresh_token', '', expires=0, httponly=True, secure=session_manager.cookie_secure, samesite=session_manager.cookie_samesite)

        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/refresh', methods=['POST'])
def refresh_token():
    # Try to get refresh token from request body (primary method for cross-origin)
    data = request.json if request.json else {}
    refresh_token_input = data.get('refresh_token')

    # Use session manager with override if provided
    refresh_result = session_manager.refresh_session(refresh_token_override=refresh_token_input)

    if not refresh_result:
        return jsonify({'error': 'Invalid or expired refresh token'}), 401

    new_access_token, new_refresh_token, user_id = refresh_result

    # CRITICAL: Also refresh Supabase session to get new Supabase access token
    # Get Supabase refresh token from cookie
    supabase_refresh_token = request.cookies.get('supabase_refresh_token')
    supabase_access_token = None

    if supabase_refresh_token:
        try:
            supabase = get_supabase_client()
            # Refresh the Supabase session
            auth_response = supabase.auth.refresh_session(supabase_refresh_token)
            if auth_response.session and auth_response.session.access_token:
                supabase_access_token = auth_response.session.access_token
        except Exception as e:
            logger.error(f"Failed to refresh Supabase session: {str(e)}")

    # Return new tokens in response body for incognito mode compatibility
    # Tokens are ALSO set in httpOnly cookies as a fallback
    response = make_response(jsonify({
        'message': 'Tokens refreshed successfully',
        'access_token': new_access_token,
        'refresh_token': new_refresh_token,
        # ✅ DUAL AUTH STRATEGY: Tokens in response for Authorization headers
        # AND in httpOnly cookies for fallback (incognito mode compatibility)
    }), 200)

    # Set httpOnly cookies for authentication (ONLY method now)
    session_manager.set_auth_cookies(response, user_id)

    # Also refresh Supabase access token cookie if we got one
    if supabase_access_token:
        response.set_cookie(
            'supabase_access_token',
            supabase_access_token,
            max_age=3600,  # 1 hour
            httponly=True,
            secure=session_manager.cookie_secure,
            samesite=session_manager.cookie_samesite,
            path='/'
        )

    return response

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
            logger.info(f"[RESEND_VERIFICATION] Attempting to resend for {email}")
            result = supabase.auth.resend(email=email, type='signup')
            
            # Log the result for debugging
            logger.info(f"[RESEND_VERIFICATION] Result: {result}")
            
            return jsonify({
                'message': 'Verification email request processed. Please check your inbox and spam folder.',
                'note': 'Supabase free tier allows 4 emails per hour. If you don\'t receive an email, you may have hit the rate limit.'
            }), 200
        except Exception as auth_error:
            error_str = str(auth_error).lower()
            logger.error(f"[RESEND_VERIFICATION] Supabase auth error: {str(auth_error)}")
            
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
        logger.error(f"[RESEND_VERIFICATION] Error: {str(e)}")
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
        logger.error(f"Error generating CSRF token: {str(e)}")
        return jsonify({'error': 'Failed to generate CSRF token'}), 500

@bp.route('/forgot-password', methods=['POST'])
@rate_limit(max_requests=3, window_seconds=3600)  # 3 requests per hour per IP
def forgot_password():
    """
    Request password reset email using custom EmailService.
    Returns success message regardless of whether email exists (security best practice).
    """
    try:
        data = request.json
        email = data.get('email')

        if not email:
            return jsonify({'error': 'Email is required'}), 400

        # Sanitize email input
        email = sanitize_input(email.lower().strip())

        # Validate email format
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, email):
            return jsonify({'error': 'Invalid email format'}), 400

        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()

        # Check if user exists (for internal logging only)
        user_check = admin_client.table('users').select('id, display_name, first_name, email').eq('email', email).execute()

        if user_check.data:
            user = user_check.data[0]
            user_id = user.get('id')
            user_name = user.get('display_name') or user.get('first_name') or 'there'

            try:
                # Generate secure token
                reset_token = secrets.token_urlsafe(32)
                expires_at = datetime.utcnow() + timedelta(hours=24)

                # Store token in database
                admin_client.table('password_reset_tokens').insert({
                    'user_id': user_id,
                    'token': reset_token,
                    'expires_at': expires_at.isoformat(),
                    'used': False,
                    'created_at': datetime.utcnow().isoformat()
                }).execute()

                # Generate reset link
                frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
                reset_link = f"{frontend_url}/reset-password?token={reset_token}"

                # Send email using our EmailService
                email_sent = email_service.send_password_reset_email(
                    user_email=email,
                    user_name=user_name,
                    reset_link=reset_link,
                    expiry_hours=24
                )

                if email_sent:
                    logger.info(f"[FORGOT_PASSWORD] Password reset email sent to {email}")
                else:
                    logger.error(f"[FORGOT_PASSWORD] Failed to send email to {email}")

            except Exception as reset_error:
                logger.error(f"[FORGOT_PASSWORD] Error generating reset token: {str(reset_error)}")
                # Still return success to avoid revealing user existence

        # Always return success message (don't reveal if email exists or not)
        return jsonify({
            'message': 'If an account exists with this email, you will receive password reset instructions shortly.',
            'note': 'Please check your spam folder if you don\'t see the email within a few minutes.'
        }), 200

    except Exception as e:
        logger.error(f"[FORGOT_PASSWORD] Error: {str(e)}")
        # Return generic success message to avoid revealing system errors
        return jsonify({
            'message': 'Password reset request processed. If an account exists, an email will be sent.'
        }), 200

@bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Reset password using custom token from email link.
    Validates new password and updates user account.
    """
    try:
        data = request.json
        reset_token = data.get('token')  # Token from URL query param
        new_password = data.get('new_password')

        if not reset_token or not new_password:
            return jsonify({'error': 'Reset token and new password are required'}), 400

        # Validate password strength
        from utils.validation.password_validator import validate_password

        is_valid, error_message = validate_password(new_password)
        if not is_valid:
            return jsonify({'error': error_message}), 400

        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()

        try:
            # Verify token exists and is not expired or used
            token_check = admin_client.table('password_reset_tokens')\
                .select('*')\
                .eq('token', reset_token)\
                .eq('used', False)\
                .execute()

            if not token_check.data:
                return jsonify({
                    'error': 'Invalid or already used reset token. Please request a new password reset.'
                }), 400

            token_data = token_check.data[0]
            expires_at = datetime.fromisoformat(token_data['expires_at'].replace('Z', '+00:00'))

            # Check if token is expired
            if datetime.now(expires_at.tzinfo) > expires_at:
                return jsonify({
                    'error': 'Reset link has expired. Please request a new password reset.'
                }), 400

            user_id = token_data['user_id']

            # Get user email
            user_check = admin_client.table('users').select('email').eq('id', user_id).execute()
            if not user_check.data:
                return jsonify({'error': 'User not found'}), 404

            user_email = user_check.data[0]['email']

            # Update password using Supabase Admin API
            supabase_client = get_supabase_client()
            auth_response = admin_client.auth.admin.update_user_by_id(
                user_id,
                {'password': new_password}
            )

            if not auth_response:
                return jsonify({'error': 'Failed to update password'}), 500

            # Mark token as used
            admin_client.table('password_reset_tokens')\
                .update({'used': True, 'used_at': datetime.utcnow().isoformat()})\
                .eq('token', reset_token)\
                .execute()

            # Clear any account lockouts for this user
            reset_login_attempts(user_email)

            logger.info(f"[RESET_PASSWORD] Password successfully reset for {user_email}")

            return jsonify({
                'message': 'Password reset successful. You can now login with your new password.',
                'redirect': '/login'
            }), 200

        except Exception as auth_error:
            logger.error(f"[RESET_PASSWORD] Error: {str(auth_error)}")
            return jsonify({
                'error': 'Failed to reset password. Please try again or request a new reset link.'
            }), 500

    except ValidationError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        logger.error(f"[RESET_PASSWORD] Error: {str(e)}")
        return jsonify({'error': 'An error occurred while resetting your password'}), 500


