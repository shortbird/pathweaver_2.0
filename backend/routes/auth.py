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

        # Use standard redirect URL for email confirmation
        redirect_url = f"{Config.FRONTEND_URL}/login"

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
                    'email_redirect_to': redirect_url
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

            # Check if email already exists (SSO account or previous registration)
            if 'already registered' in error_str or 'already exists' in error_str or 'user already exists' in error_str:
                return jsonify({
                    'error': 'An account with this email already exists. If you created your account through single sign-on (SSO), you can set a password by clicking "Forgot Password" on the login page.'
                }), 400

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

            # Assign new users to default Optio organization
            # This is required because organization_id is NOT NULL
            DEFAULT_OPTIO_ORG_ID = 'e88b7aae-b9ad-4c71-bc3a-eef0701f5852'
            user_data['organization_id'] = DEFAULT_OPTIO_ORG_ID

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
        # ✅ MASQUERADE FIX: Use get_effective_user_id() to return masquerade target if masquerading
        # This ensures frontend sees the masqueraded user's role and data
        user_id = session_manager.get_effective_user_id()

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
        logger.warning("Login attempt with missing email or password")
        return jsonify({'error': 'Email and password are required'}), 400

    email = data['email'].strip().lower()

    # Log login attempt (without PII)
    logger.info(f"Login attempt for email: {email[:3]}***")

    # Check if account is locked due to too many failed attempts
    is_locked, retry_after, attempt_count = check_account_lockout(email)
    if is_locked:
        minutes_remaining = retry_after // 60
        logger.warning(f"Login blocked for locked account: {email[:3]}*** ({minutes_remaining} minutes remaining)")
        return jsonify({
            'error': f'Account temporarily locked due to too many failed login attempts. Please try again in {minutes_remaining} minutes or use "Forgot Password?" to reset your password.',
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

            # Welcome email temporarily disabled - requires SMTP configuration
            # TODO: Re-enable once SendGrid credentials are added to environment variables

            # Reset login attempts after successful login
            reset_login_attempts(email)

            # Log successful login
            logger.info(f"Successful login for {email[:3]}*** (user_id: {auth_response.user.id})")

            # Update last_active timestamp
            try:
                from datetime import datetime
                admin_client.table('users').update({
                    'last_active': datetime.utcnow().isoformat()
                }).eq('id', auth_response.user.id).execute()
            except Exception as update_error:
                logger.error(f"Warning: Failed to update last_active timestamp: {update_error}")

            # Trigger email_confirmed event for automation sequences (only once)
            # This happens when user logs in with a confirmed email for the first time
            if auth_response.user.email_confirmed_at and not user_response_data.get('welcome_email_sent'):
                try:
                    from services.campaign_automation_service import CampaignAutomationService
                    automation_service = CampaignAutomationService()
                    automation_service.process_event_trigger(
                        event_type='email_confirmed',
                        user_id=auth_response.user.id,
                        metadata={'email': auth_response.user.email}
                    )
                    # Mark welcome email as sent to prevent duplicate sends
                    admin_client.table('users').update({
                        'welcome_email_sent': True
                    }).eq('id', auth_response.user.id).execute()
                    logger.info(f"Triggered email_confirmed event for user {auth_response.user.id}")
                except Exception as automation_error:
                    logger.error(f"Warning: Failed to process email_confirmed event: {automation_error}")

            # Create response with user data

            # ✅ MOBILE SAFARI FIX (January 2025): Return tokens in response body
            # Mobile Safari (and other browsers with strict third-party cookie policies)
            # may block httpOnly cookies even with SameSite=None and Secure=true
            # Solution: Return tokens in response body so frontend can use Authorization headers
            # Tokens are ALSO set in httpOnly cookies as fallback for browsers that support them

            # Generate app tokens for Authorization header usage (mobile Safari compatibility)
            app_access_token = session_manager.generate_access_token(auth_response.user.id)
            app_refresh_token = session_manager.generate_refresh_token(auth_response.user.id)

            response_data = {
                'user': user_response_data,
                'app_access_token': app_access_token,
                'app_refresh_token': app_refresh_token,
                # Tokens in response body for Authorization headers (mobile Safari compatibility)
                # Also set in httpOnly cookies as fallback for desktop browsers
            }
            response = make_response(jsonify(response_data), 200)

            # Set httpOnly cookies for authentication (fallback for desktop browsers)
            session_manager.set_auth_cookies(response, auth_response.user.id)

            return response
        else:
            # Success = False but no exception thrown (shouldn't happen with Supabase)
            logger.warning(f"Login failed for {email} without exception - auth_response.user is None")
            return jsonify({'error': 'Incorrect email or password. Please check your credentials and try again.'}), 401
            
    except Exception as e:
        error_message = str(e)

        # Log with more context for debugging
        logger.error(f"Login error for {email[:3]}***: {error_message}", extra={
            'email_prefix': email[:3],
            'error_type': type(e).__name__,
            'has_response': hasattr(e, 'response') if hasattr(e, '__dict__') else False
        })

        # Parse error for specific cases
        error_lower = error_message.lower()

        if "invalid login credentials" in error_lower or "invalid credentials" in error_lower:
            # Record failed login attempt
            is_now_locked, attempts_remaining, lockout_minutes = record_failed_login(email)

            if is_now_locked:
                logger.warning(f"Account locked for {email[:3]}*** after too many failed attempts")
                return jsonify({
                    'error': f'Too many failed login attempts. Your account has been temporarily locked for {lockout_minutes} minutes. Please try again later or use "Forgot Password" to reset your password.',
                    'locked': True,
                    'lockout_duration': lockout_minutes
                }), 429
            else:
                logger.info(f"Invalid credentials for {email[:3]}***: {attempts_remaining} attempts remaining")
                # Provide more helpful error message based on attempts remaining
                if attempts_remaining <= 2:
                    return jsonify({
                        'error': f'Incorrect email or password. You have {attempts_remaining} {"attempt" if attempts_remaining == 1 else "attempts"} remaining before your account is temporarily locked. If you forgot your password, click "Forgot Password?" below.',
                        'attempts_remaining': attempts_remaining,
                        'warning': True
                    }), 401
                else:
                    return jsonify({
                        'error': f'Incorrect email or password. Please check your credentials and try again. ({attempts_remaining} {"attempt" if attempts_remaining == 1 else "attempts"} remaining)',
                        'attempts_remaining': attempts_remaining
                    }), 401
        elif "email not confirmed" in error_lower or "email confirmation" in error_lower:
            logger.info(f"Login attempt with unconfirmed email: {email[:3]}***")
            return jsonify({
                'error': 'Please verify your email address before logging in. Check your inbox (and spam folder) for a confirmation email. If you need a new verification email, contact support.',
                'email_not_confirmed': True
            }), 401
        elif "user not found" in error_lower:
            # Record failed login attempt even for non-existent users (prevent username enumeration)
            record_failed_login(email)
            logger.info(f"Login attempt with non-existent email: {email[:3]}***")
            return jsonify({
                'error': 'No account found with this email address. Please check your email spelling or create a new account.',
                'user_not_found': True
            }), 401
        elif "rate limit" in error_lower or "too many requests" in error_lower:
            logger.warning(f"Rate limit hit for {email[:3]}***")
            import re
            wait_match = re.search(r'after (\d+) seconds', error_message)
            if wait_match:
                wait_time = wait_match.group(1)
                return jsonify({'error': f'Too many login attempts. Please wait {wait_time} seconds before trying again.'}), 429
            else:
                return jsonify({'error': 'Too many login attempts. Please wait a minute before trying again.'}), 429
        elif "invalid api key" in error_lower:
            logger.error(f"Invalid API key error during login for {email[:3]}***")
            return jsonify({'error': 'Server configuration error. Please contact support.'}), 500
        elif "connection" in error_lower or "timeout" in error_lower:
            logger.error(f"Connection error during login for {email[:3]}***")
            return jsonify({'error': 'Connection error. Please check your internet connection and try again.'}), 503
        elif "password" in error_lower and "invalid" not in error_lower:
            logger.info(f"Password error for {email[:3]}***")
            return jsonify({'error': 'Incorrect password. Please check your password and try again, or click "Forgot Password?" below to reset it.'}), 401
        else:
            # Generic error but still informative
            logger.warning(f"Unhandled login error for {email[:3]}***: {error_message}")
            return jsonify({
                'error': 'Login failed. Please check your email and password. If you continue having trouble, try using "Forgot Password?" or contact support.',
                'generic_error': True
            }), 400

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
            response.set_cookie('supabase_access_token', '', expires=0, httponly=True, secure=session_manager.cookie_secure, samesite=session_manager.cookie_samesite, partitioned=session_manager.is_cross_origin)
            response.set_cookie('supabase_refresh_token', '', expires=0, httponly=True, secure=session_manager.cookie_secure, samesite=session_manager.cookie_samesite, partitioned=session_manager.is_cross_origin)

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
        logger.warning("Refresh token validation failed - token may be expired or invalid")
        return jsonify({'error': 'Your session has expired. Please log in again to continue.'}), 401

    new_access_token, new_refresh_token, user_id = refresh_result

    # Update last_active timestamp on token refresh
    try:
        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()
        admin_client.table('users').update({
            'last_active': datetime.utcnow().isoformat()
        }).eq('id', user_id).execute()
    except Exception as update_error:
        logger.error(f"Warning: Failed to update last_active on token refresh: {update_error}")

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
            path='/',
            partitioned=session_manager.is_cross_origin
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
        logger.info("[FORGOT_PASSWORD] === Starting password reset request ===")
        data = request.json
        email = data.get('email')
        logger.info(f"[FORGOT_PASSWORD] Received request for email: {email}")

        if not email:
            logger.warning("[FORGOT_PASSWORD] No email provided")
            return jsonify({'error': 'Email is required'}), 400

        # Sanitize email input
        email = sanitize_input(email.lower().strip())
        logger.info(f"[FORGOT_PASSWORD] Sanitized email: {email}")

        # Validate email format
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, email):
            logger.warning(f"[FORGOT_PASSWORD] Invalid email format: {email}")
            return jsonify({'error': 'Invalid email format'}), 400

        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()
        logger.info("[FORGOT_PASSWORD] Got admin client")

        # Check if user exists in auth.users (the source of truth for authentication)
        # Use admin client to query auth.users directly
        logger.info(f"[FORGOT_PASSWORD] Looking up user in auth.users: {email}")

        try:
            # Use Supabase Admin API to list users and find by email
            # Note: We can't query auth.users directly via PostgREST, must use Admin API
            logger.info(f"[FORGOT_PASSWORD] Looking up user by email using Admin API: {email}")

            # Use Admin API's list_users with pagination to find user by email
            # This is more efficient than list_users() without params
            try:
                # Try to get user directly if we know the ID, otherwise search
                # First check public.users table for the user_id (it references auth.users.id)
                public_user = admin_client.table('users').select('id').eq('email', email).execute()

                matching_user = None
                if public_user.data and len(public_user.data) > 0:
                    # Found in public.users, get full auth user object
                    user_id = public_user.data[0]['id']
                    logger.info(f"[FORGOT_PASSWORD] Found user_id in public.users: {user_id}")
                    auth_user_obj = admin_client.auth.admin.get_user_by_id(user_id)
                    if auth_user_obj and auth_user_obj.user:
                        matching_user = auth_user_obj.user
                        logger.info(f"[FORGOT_PASSWORD] Successfully retrieved auth user object")
            except Exception as lookup_err:
                logger.error(f"[FORGOT_PASSWORD] Error during user lookup: {str(lookup_err)}")
                matching_user = None

            logger.info(f"[FORGOT_PASSWORD] Auth user lookup result: {'Found' if matching_user else 'Not found'}")

            if matching_user:
                user_id = matching_user.id

                # Get display name from public.users for personalization
                profile_check = admin_client.table('users').select('display_name, first_name').eq('id', user_id).execute()
                if profile_check.data:
                    user_name = profile_check.data[0].get('display_name') or profile_check.data[0].get('first_name') or 'there'
                else:
                    user_name = 'there'

                logger.info(f"[FORGOT_PASSWORD] Found user: {user_id}, name: {user_name}, auth email: {matching_user.email}")

                try:
                    # Generate secure token
                    logger.info("[FORGOT_PASSWORD] Generating reset token")
                    reset_token = secrets.token_urlsafe(32)
                    expires_at = datetime.utcnow() + timedelta(hours=24)
                    logger.info(f"[FORGOT_PASSWORD] Token generated, expires at: {expires_at.isoformat()}")

                    # Store token in database
                    logger.info("[FORGOT_PASSWORD] Storing token in database")
                    token_result = admin_client.table('password_reset_tokens').insert({
                        'user_id': user_id,
                        'token': reset_token,
                        'expires_at': expires_at.isoformat(),
                        'used': False,
                        'created_at': datetime.utcnow().isoformat()
                    }).execute()
                    logger.info(f"[FORGOT_PASSWORD] Token stored successfully: {token_result.data}")

                    # Generate reset link
                    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
                    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
                    logger.info(f"[FORGOT_PASSWORD] Generated reset link: {reset_link[:50]}...")

                    # Send email to the auth.users email (source of truth)
                    # This ensures the email sent matches the email used for authentication
                    auth_email = matching_user.email
                    logger.info(f"[FORGOT_PASSWORD] Calling email_service.send_password_reset_email()")
                    logger.info(f"[FORGOT_PASSWORD] Email params: user_email={auth_email}, user_name={user_name}, expiry_hours=24")

                    email_sent = email_service.send_password_reset_email(
                        user_email=auth_email,
                        user_name=user_name,
                        reset_link=reset_link,
                        expiry_hours=24
                    )

                    logger.info(f"[FORGOT_PASSWORD] Email send result: {email_sent}")

                    if email_sent:
                        logger.info(f"[FORGOT_PASSWORD] ✓ Password reset email SUCCESSFULLY sent to {auth_email}")
                    else:
                        logger.error(f"[FORGOT_PASSWORD] ✗ FAILED to send email to {auth_email}")

                except Exception as reset_error:
                    logger.error(f"[FORGOT_PASSWORD] ✗ Exception during reset token generation or email send: {str(reset_error)}")
                    logger.error(f"[FORGOT_PASSWORD] Exception type: {type(reset_error).__name__}")
                    import traceback
                    logger.error(f"[FORGOT_PASSWORD] Traceback: {traceback.format_exc()}")
                    # Still return success to avoid revealing user existence
            else:
                logger.info(f"[FORGOT_PASSWORD] No user found with email: {email}")
        except Exception as lookup_error:
            logger.error(f"[FORGOT_PASSWORD] Error looking up user in auth.users: {str(lookup_error)}")
            # Continue to return generic success message

        # Always return success message (don't reveal if email exists or not)
        logger.info("[FORGOT_PASSWORD] === Returning success response ===")
        return jsonify({
            'message': 'If an account exists with this email, you will receive password reset instructions shortly.',
            'note': 'Please check your spam folder if you don\'t see the email within a few minutes.'
        }), 200

    except Exception as e:
        logger.error(f"[FORGOT_PASSWORD] ✗ Top-level exception: {str(e)}")
        logger.error(f"[FORGOT_PASSWORD] Exception type: {type(e).__name__}")
        import traceback
        logger.error(f"[FORGOT_PASSWORD] Traceback: {traceback.format_exc()}")
        # Always return success message (don't reveal if email exists or not)
        logger.info("[FORGOT_PASSWORD] === Returning success response ===")
        return jsonify({
            'message': 'If an account exists with this email, you will receive password reset instructions shortly.',
            'note': 'Please check your spam folder if you don\'t see the email within a few minutes.'
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
        from utils.validation import validate_password

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

            # Get user from auth.users (source of truth for authentication)
            auth_user = admin_client.auth.admin.get_user_by_id(user_id)
            if not auth_user or not auth_user.user:
                return jsonify({'error': 'User not found'}), 404

            auth_email = auth_user.user.email
            logger.info(f"[RESET_PASSWORD] Found user in auth.users: {auth_email}")

            # Update password using Supabase Admin API
            supabase_client = get_supabase_client()
            auth_response = admin_client.auth.admin.update_user_by_id(
                user_id,
                {'password': new_password}
            )

            if not auth_response:
                return jsonify({'error': 'Failed to update password'}), 500

            # Sync email in public.users to match auth.users (prevent future mismatches)
            try:
                profile_check = admin_client.table('users').select('email').eq('id', user_id).execute()
                if profile_check.data:
                    current_profile_email = profile_check.data[0]['email']
                    if current_profile_email.lower() != auth_email.lower():
                        logger.warning(f"[RESET_PASSWORD] Email mismatch detected: auth={auth_email}, profile={current_profile_email}")
                        logger.info(f"[RESET_PASSWORD] Syncing profile email to match auth.users")
                        admin_client.table('users').update({
                            'email': auth_email
                        }).eq('id', user_id).execute()
            except Exception as sync_error:
                # Don't fail password reset if email sync fails, just log it
                logger.error(f"[RESET_PASSWORD] Warning: Failed to sync email in public.users: {sync_error}")

            # Mark token as used
            admin_client.table('password_reset_tokens')\
                .update({'used': True, 'used_at': datetime.utcnow().isoformat()})\
                .eq('token', reset_token)\
                .execute()

            # Clear any account lockouts for this user
            reset_login_attempts(auth_email)

            logger.info(f"[RESET_PASSWORD] Password successfully reset for {auth_email}")

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


@bp.route('/token-health', methods=['GET'])
def token_health():
    """
    Check if current tokens are compatible with server secret.
    Used by frontend to detect token incompatibility after deployments.
    """
    try:
        # Check for Authorization header
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            # No token provided - not an error, just not authenticated
            return jsonify({
                'compatible': False,
                'reason': 'No token provided',
                'authenticated': False
            }), 200

        # Extract token
        token = auth_header.replace('Bearer ', '')

        # Verify token with current and previous keys
        payload = session_manager.verify_access_token(token)

        if payload:
            # Token is valid
            token_version = payload.get('version', 'unknown')
            return jsonify({
                'compatible': True,
                'authenticated': True,
                'token_version': token_version,
                'server_version': session_manager.token_version,
                'using_old_key': False  # If we got here, current key worked
            }), 200
        else:
            # Token is invalid (expired or wrong secret)
            return jsonify({
                'compatible': False,
                'reason': 'Token invalid or expired',
                'authenticated': False,
                'server_version': session_manager.token_version
            }), 200

    except Exception as e:
        logger.error(f"[TOKEN_HEALTH] Error checking token health: {str(e)}")
        return jsonify({
            'compatible': False,
            'reason': 'Server error',
            'authenticated': False
        }), 200  # Return 200 even on error so frontend can handle gracefully

@bp.route('/cookie-debug', methods=['GET'])
def cookie_debug():
    """
    Debug endpoint to help diagnose cookie issues (especially Safari).
    Returns information about received cookies and headers.
    SECURITY: This endpoint does NOT expose cookie values, only metadata.
    """
    try:
        # Get all cookie names (not values for security)
        received_cookies = list(request.cookies.keys())

        # Check for auth cookies specifically
        has_access_token = 'access_token' in request.cookies
        has_refresh_token = 'refresh_token' in request.cookies
        has_csrf_token = 'csrf_token' in request.cookies

        # Get Authorization header status
        auth_header = request.headers.get('Authorization', '')
        has_auth_header = auth_header.startswith('Bearer ')

        # Get browser info from User-Agent
        user_agent = request.headers.get('User-Agent', 'Unknown')
        is_safari = 'Safari' in user_agent and 'Chrome' not in user_agent
        is_mobile = 'Mobile' in user_agent or 'iPhone' in user_agent or 'iPad' in user_agent

        # Check if user is authenticated via either method
        user_id = session_manager.get_current_user_id()
        is_authenticated = user_id is not None
        auth_method = None
        if is_authenticated:
            if has_auth_header:
                auth_method = 'Authorization header'
            elif has_access_token:
                auth_method = 'httpOnly cookie'

        # Server configuration
        server_config = {
            'cross_origin_mode': session_manager.is_cross_origin,
            'cookie_secure': session_manager.cookie_secure,
            'cookie_samesite': session_manager.cookie_samesite,
            'cookie_domain': session_manager.cookie_domain,
            'frontend_url': os.getenv('FRONTEND_URL', 'Not configured')
        }

        return jsonify({
            'cookies_received': {
                'count': len(received_cookies),
                'names': received_cookies,
                'has_access_token': has_access_token,
                'has_refresh_token': has_refresh_token,
                'has_csrf_token': has_csrf_token
            },
            'headers': {
                'has_authorization': has_auth_header,
                'origin': request.headers.get('Origin', 'Not present'),
                'referer': request.headers.get('Referer', 'Not present')
            },
            'browser': {
                'user_agent': user_agent,
                'is_safari': is_safari,
                'is_mobile': is_mobile
            },
            'authentication': {
                'is_authenticated': is_authenticated,
                'auth_method': auth_method,
                'user_id_present': user_id is not None
            },
            'server_config': server_config,
            'recommendations': get_safari_recommendations(
                is_safari,
                has_access_token,
                has_auth_header,
                is_authenticated
            )
        }), 200

    except Exception as e:
        logger.error(f"[COOKIE_DEBUG] Error: {str(e)}")
        return jsonify({
            'error': 'Failed to generate debug info',
            'message': str(e)
        }), 500

def get_safari_recommendations(is_safari, has_cookie, has_header, is_authenticated):
    """Generate Safari-specific troubleshooting recommendations"""
    recommendations = []

    if is_safari and not has_cookie and not has_header:
        recommendations.append({
            'issue': 'Safari is blocking cookies and no Authorization header detected',
            'solution': 'Frontend should automatically use Authorization headers. Check browser console for errors.',
            'action': 'Try logging out and logging back in to refresh authentication method.'
        })
    elif is_safari and not has_cookie and has_header:
        recommendations.append({
            'issue': 'Safari is blocking cookies (expected behavior)',
            'solution': 'Using Authorization header fallback - this is working correctly!',
            'action': 'No action needed. System is functioning normally with Safari.'
        })
    elif is_safari and has_cookie:
        recommendations.append({
            'issue': 'None - cookies are working in Safari',
            'solution': 'Your Safari browser is accepting cookies. System is functioning normally.',
            'action': 'No action needed.'
        })
    elif not is_authenticated:
        recommendations.append({
            'issue': 'Not authenticated',
            'solution': 'Please log in to access protected resources.',
            'action': 'Navigate to the login page.'
        })
    else:
        recommendations.append({
            'issue': 'None detected',
            'solution': 'System is functioning normally.',
            'action': 'No action needed.'
        })

    return recommendations


