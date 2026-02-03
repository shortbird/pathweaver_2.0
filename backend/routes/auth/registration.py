"""
Authentication Module: User Registration & Verification

Handles:
- User registration with email verification
- Resending verification emails
- User profile creation
- Diploma and skill initialization
"""

from flask import Blueprint, request, jsonify, make_response
from database import get_supabase_client, get_supabase_admin_client
from utils.validation import validate_registration_data, sanitize_input
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from utils.log_scrubber import mask_email, should_log_sensitive_data
from middleware.error_handler import ValidationError, ExternalServiceError, ConflictError
from legal_versions import CURRENT_TOS_VERSION, CURRENT_PRIVACY_POLICY_VERSION
from utils.api_response_v1 import success_response, error_response, created_response
import re
import os
from datetime import datetime, date

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('auth_registration', __name__)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

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

        # Batch insert all skill categories at once
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
                except Exception as individual_error:
                    # Skill record may already exist (expected in some cases)
                    logger.debug(f"Skill record insert skipped for user (may already exist): {individual_error}")

    except Exception as e:
        logger.error(f"Error ensuring diploma and skills: {str(e)}")
        # Don't fail registration if this fails - the database trigger should handle it


# ============================================================================
# ENDPOINTS
# ============================================================================

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

        # Check for Terms of Service and Privacy Policy acceptance
        if not data.get('acceptedLegalTerms') and not (data.get('acceptedTerms') and data.get('acceptedPrivacy')):
            raise ValidationError("You must accept the Terms of Service and Privacy Policy to create an account")

        # Store original names for Supabase Auth
        original_first_name = data['first_name'].strip()
        original_last_name = data['last_name'].strip()
        email = data['email'].strip().lower()  # Normalize email to lowercase
        date_of_birth = data.get('date_of_birth')  # Optional
        parent_email = data.get('parent_email')  # Deprecated: under-13 now blocked entirely
        org_slug = data.get('org_slug')  # Optional organization slug for signup

        # Mask email in logs
        logger.debug(f"[REGISTRATION] Processing registration for email: {mask_email(email)}")

        if should_log_sensitive_data():
            logger.debug(f"Registration attempt for email: {mask_email(email)}")

        # COPPA Compliance: Check age BEFORE creating auth user
        requires_parental_consent = False
        if date_of_birth:
            try:
                dob = datetime.strptime(date_of_birth, '%Y-%m-%d').date()
                age = (date.today() - dob).days / 365.25
                requires_parental_consent = age < 13

                # Block all under-13 self-registration - parent must create account first
                if requires_parental_consent:
                    logger.info(f"[REGISTRATION] User under 13 - blocking self-registration (COPPA)")
                    return jsonify({
                        'error': 'under_13_registration_blocked',
                        'message': 'Users under 13 cannot create their own account. A parent or guardian must create an account first, then add you as a child profile.',
                        'action_required': 'parent_registration'
                    }), 403
            except ValueError:
                raise ValidationError("Invalid date of birth format. Use YYYY-MM-DD")

        # Use admin client for registration to bypass RLS
        supabase = get_supabase_admin_client()

        # Sign up with Supabase Auth
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
                # Return legacy format for frontend compatibility
                # TODO: Migrate to standardized format after updating frontend
                return jsonify({
                    'message': 'Registration may have succeeded. If you received a confirmation email, please verify your account. Otherwise, wait a minute and try again.',
                    'email_verification_required': True
                }), 201

            # Check if email already exists
            if 'already registered' in error_str or 'already exists' in error_str or 'user already exists' in error_str:
                return error_response(
                    code='EMAIL_ALREADY_EXISTS',
                    message='An account with this email already exists. If you created your account through single sign-on (SSO), you can set a password by clicking "Forgot Password" on the login page.',
                    status=400
                )

            raise

        if auth_response.user:
            # Sanitize names for database storage (prevent XSS)
            sanitized_first_name = sanitize_input(original_first_name)
            sanitized_last_name = sanitize_input(original_last_name)

            # Note: Age verification already performed earlier (COPPA compliance)
            # requires_parental_consent variable is already set

            # Create user profile in our users table
            user_data = {
                'id': auth_response.user.id,
                'first_name': sanitized_first_name,
                'last_name': sanitized_last_name,
                'email': email,
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

            # Check for observer invitation code
            invitation_code = data.get('invitation_code')
            is_observer_registration = False
            if invitation_code:
                # Validate the invitation
                invitation = supabase.table('observer_invitations') \
                    .select('id, student_id, status') \
                    .eq('invitation_code', invitation_code) \
                    .eq('status', 'pending') \
                    .execute()

                if invitation.data:
                    # Valid invitation - set role to observer
                    user_data['role'] = 'observer'
                    is_observer_registration = True
                    logger.info(f"[REGISTRATION] Observer registration via invitation code")
                else:
                    logger.warning(f"[REGISTRATION] Invalid or expired invitation code provided")

            # Check for promo code (first month free, etc.)
            promo_code = data.get('promo_code')
            valid_promo = None
            if promo_code and not is_observer_registration:
                # Don't override observer role with promo code role
                promo_code = promo_code.strip().upper()
                promo_result = supabase.table('promo_codes') \
                    .select('*') \
                    .eq('code', promo_code) \
                    .eq('status', 'pending') \
                    .execute()

                if promo_result.data:
                    promo = promo_result.data[0]
                    # Check expiration
                    expires_at = datetime.fromisoformat(promo['expires_at'].replace('Z', '+00:00'))
                    if datetime.now(expires_at.tzinfo) <= expires_at:
                        # Valid promo code - set role to target_role (usually 'parent')
                        user_data['role'] = promo['target_role']
                        valid_promo = promo
                        logger.info(f"[REGISTRATION] Promo code {promo_code} applied, role set to {promo['target_role']}")
                    else:
                        logger.warning(f"[REGISTRATION] Promo code {promo_code} is expired")
                else:
                    logger.warning(f"[REGISTRATION] Invalid or already used promo code: {promo_code}")

            # Assign user to organization (if org_slug provided) or make them a platform user
            # Role model:
            #   - Platform users: organization_id = NULL, direct role (student, parent, observer, etc.)
            #   - Organization users: organization_id set, role = 'org_managed', org_role = actual role
            if org_slug:
                from services.organization_service import OrganizationService
                org_service = OrganizationService()
                org = org_service.get_organization_by_slug(org_slug)

                if not org:
                    raise ValidationError(f"Organization with slug '{org_slug}' not found or inactive")

                user_data['organization_id'] = org['id']
                # Organization users get role='org_managed' with their actual role in org_role
                # Preserve observer role from invitation if set
                actual_role = user_data.get('role', 'student')
                user_data['role'] = 'org_managed'
                user_data['org_role'] = actual_role
                logger.info(f"[REGISTRATION] Assigning user to organization: {org['name']} (slug: {org_slug}) with org_role: {actual_role}")
            else:
                # Platform user - no organization
                # organization_id stays NULL (not set)
                # Role is set directly (observer from invitation, or default 'student')
                logger.info(f"[REGISTRATION] Creating platform user (no organization)")

            # Use upsert to handle cases where auth user exists but profile doesn't
            # Retry logic for FK constraint errors (auth user may not be immediately visible)
            import time
            max_retries = 3
            retry_delay = 0.5  # seconds
            profile_created = False

            for attempt in range(max_retries):
                try:
                    supabase.table('users').upsert(user_data, on_conflict='id').execute()
                    profile_created = True
                    break
                except Exception as profile_error:
                    error_str = str(profile_error).lower()
                    if ('foreign key' in error_str or '23503' in error_str) and attempt < max_retries - 1:
                        # FK constraint error - auth user may not be visible yet, retry
                        logger.warning(f"[REGISTRATION] Profile creation FK error, retrying in {retry_delay}s (attempt {attempt + 1}/{max_retries})")
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                    elif 'foreign key' in error_str or '23503' in error_str:
                        # Final attempt failed - auth user doesn't exist
                        logger.error(f"Profile creation failed after {max_retries} attempts: {profile_error}")
                        raise ValidationError("Registration failed. Please try again in a few moments.")
                    else:
                        # Re-raise other errors
                        raise

            if not profile_created:
                raise ValidationError("Failed to create user profile. Please try again.")

            # Ensure diploma and skills are initialized (backup to database trigger)
            ensure_user_diploma_and_skills(supabase, auth_response.user.id, sanitized_first_name, sanitized_last_name)

            # Mark promo code as redeemed if one was used
            if valid_promo:
                try:
                    supabase.table('promo_codes').update({
                        'status': 'redeemed',
                        'redeemed_at': datetime.utcnow().isoformat(),
                        'redeemed_by_user_id': auth_response.user.id
                    }).eq('id', valid_promo['id']).execute()
                    logger.info(f"[REGISTRATION] Promo code {valid_promo['code']} marked as redeemed by user {auth_response.user.id}")
                except Exception as promo_update_error:
                    logger.error(f"[REGISTRATION] Failed to mark promo code as redeemed: {promo_update_error}")

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

                # Return legacy format for frontend compatibility
                # TODO: Migrate to standardized format after updating frontend
                return jsonify(response_data), 201

            # Fetch the complete user profile data to return to frontend
            user_profile = supabase.table('users').select('*').eq('id', auth_response.user.id).single().execute()

            # Extract session data
            session_data = auth_response.session.model_dump() if auth_response.session else None

            response_data = {
                'user': user_profile.data if user_profile.data else auth_response.user.model_dump(),
                'session': session_data,
            }

            # Add parental consent flag if user requires it
            if requires_parental_consent:
                response_data['requires_parental_consent'] = True
                response_data['parent_email'] = parent_email

            # Generate custom JWT tokens for Authorization headers
            app_access_token = session_manager.generate_access_token(auth_response.user.id)
            app_refresh_token = session_manager.generate_refresh_token(auth_response.user.id)

            # Add app tokens to response
            response_data['app_access_token'] = app_access_token
            response_data['app_refresh_token'] = app_refresh_token

            # Create response (legacy format for frontend compatibility)
            # TODO: Migrate to standardized format after updating frontend
            response = make_response(jsonify(response_data), 201)

            # Set httpOnly cookies for authentication (fallback method)
            # CRITICAL: Pass the same tokens to ensure consistency between cookies and response body
            session_manager.set_auth_cookies(response, auth_response.user.id, app_access_token, app_refresh_token)

            return response
        else:
            return error_response(
                code='REGISTRATION_FAILED',
                message='Registration failed - no user created',
                status=400
            )

    except ValidationError:
        raise  # Re-raise validation errors
    except Exception as e:
        # Log the full error for debugging
        try:
            logger.error(f"Supabase registration error: {str(e)}")
        except (TypeError, ValueError, UnicodeEncodeError) as log_error:
            # Error converting exception to string for logging
            logger.error(f"Supabase registration error occurred (unable to format: {type(e).__name__})")

        # Parse error message for specific cases
        error_str = str(e).lower()

        if 'already registered' in error_str or 'already exists' in error_str:
            raise ConflictError('This email is already registered')
        elif 'email signups are disabled' in error_str:
            raise ValidationError('Registration is temporarily disabled. Please contact support.')
        elif 'error sending confirmation email' in error_str or 'email' in error_str and 'error' in error_str:
            raise ValidationError('Registration is temporarily unavailable due to email service issues. Please try again later or contact support.')
        elif 'invalid' in error_str and 'email' in error_str:
            raise ValidationError('This email address cannot be used for registration. Please use a different email.')
        elif 'weak' in error_str and 'password' in error_str:
            raise ValidationError('Password is too common or easy to guess. Please choose a more unique password (6+ characters)')
        elif 'password' in error_str:
            raise ValidationError('Password must be at least 6 characters long')
        elif 'rate limit' in error_str or 'too many requests' in error_str or 'security purposes' in error_str:
            # Extract wait time if available
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


@bp.route('/resend-verification', methods=['POST'])
@rate_limit(max_requests=3, window_seconds=600)  # 3 resends per 10 minutes
def resend_verification():
    """Resend verification email to user"""
    try:
        data = request.json
        email = data.get('email')

        if not email:
            return error_response(
                code='EMAIL_REQUIRED',
                message='Email is required',
                status=400
            )

        # Sanitize email input
        email = sanitize_input(email.lower().strip())

        # Use admin client since this is unauthenticated - avoids RLS infinite recursion
        supabase = get_supabase_admin_client()

        # Check if user exists in our users table
        user_check = supabase.table('users').select('id').eq('email', email).execute()

        if not user_check.data:
            # Don't reveal if user doesn't exist for security
            # Return legacy format for frontend compatibility
            # TODO: Migrate to standardized format after updating frontend
            return jsonify({'message': 'If this email is registered, a verification email has been sent'}), 200

        # Note: email_verified is tracked in auth.users, not public.users
        # Supabase handles verification status internally

        # Resend verification email using Supabase Auth
        try:
            logger.info(f"[RESEND_VERIFICATION] Attempting to resend for {mask_email(email)}")
            result = supabase.auth.resend({"type": "signup", "email": email})

            logger.info(f"[RESEND_VERIFICATION] Result: {result}")

            # Return legacy format for frontend compatibility
            # TODO: Migrate to standardized format after updating frontend
            return jsonify({
                'message': 'Verification email request processed. Please check your inbox and spam folder.',
                'note': 'Supabase free tier allows 4 emails per hour. If you don\'t receive an email, you may have hit the rate limit.'
            }), 200
        except Exception as auth_error:
            error_str = str(auth_error).lower()
            logger.error(f"[RESEND_VERIFICATION] Supabase auth error: {str(auth_error)}")

            # Provide helpful error messages
            if 'rate limit' in error_str or 'too many' in error_str:
                return error_response(
                    code='EMAIL_RATE_LIMIT',
                    message='Email rate limit reached. Supabase free tier allows 4 emails per hour. Please wait before trying again.',
                    details={'suggestion': 'Check your spam folder for previous emails, or wait an hour for the limit to reset.'},
                    status=429
                )
            elif 'not found' in error_str:
                return error_response(
                    code='ACCOUNT_NOT_FOUND',
                    message='No account found with this email address. Please register first.',
                    status=404
                )
            else:
                # Don't reveal too much about errors for security
                # Return legacy format for frontend compatibility
                # TODO: Migrate to standardized format after updating frontend
                return jsonify({
                    'message': 'Verification email request processed. If an account exists, an email will be sent.',
                    'note': 'Check spam folder. Supabase free tier has a 4 email/hour limit.'
                }), 200

    except Exception as e:
        logger.error(f"[RESEND_VERIFICATION] Error: {str(e)}")
        return error_response(
            code='RESEND_FAILED',
            message='Failed to resend verification email',
            status=500
        )
