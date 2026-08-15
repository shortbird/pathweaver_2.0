"""
Authentication Module: Password Management

Handles:
- Forgot password (send reset email)
- Reset password (validate token and update password)
- Change password (signed-in, requires the current password)
- Password strength validation
"""

from flask import Blueprint, request, jsonify
from app_config import Config
from database import get_supabase_client, get_supabase_admin_client
from utils.validation import (
    sanitize_input,
    validate_password,
    validate_password_not_breached
)
from utils.auth.decorators import require_auth
from utils.reset_tokens import hash_reset_token, lookup_values
from middleware.rate_limiter import rate_limit
from utils.log_scrubber import mask_email, mask_user_id, should_log_sensitive_data
from middleware.error_handler import ValidationError
from services.email_service import email_service
import re
import secrets
from datetime import datetime, timedelta, timezone

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('auth_password', __name__)

# Password reset token expiration time (1 hour for security)
PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def reset_login_attempts(email):
    """
    Reset login attempts after password reset.
    NOTE: lockout_count intentionally preserved (H7) so backoff survives reset.
    """
    try:
        # admin client justified: post-reset lockout clear; login_attempts is service-role-only
        admin_client = get_supabase_admin_client()

        admin_client.table('login_attempts').update({
            'attempt_count': 0,
            'locked_until': None,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('email', email.lower()).execute()

    except Exception as e:
        logger.error(f"Error resetting login attempts: {e}")


# ── H7: Per-email throttle for /forgot-password ───────────────────────────────
# Threat: IP-level @rate_limit (3/hr) doesn't stop a distributed attacker from
# flooding a specific account with reset emails. Track per-email requests in a
# sliding window; silently drop (still 200) when exceeded, with exponential
# backoff on `lockout_count` so repeat offenders are throttled harder.
# NOTE: response must be identical whether throttled or not — exposing lockout
# state would leak account existence.

RESET_WINDOW_SECONDS = Config.RATE_LIMIT_LOGIN_WINDOW  # default 900s (15m)
RESET_MAX_REQUESTS = 3  # per window before soft-lock
RESET_BASE_LOCKOUT_SECONDS = Config.RATE_LIMIT_LOCKOUT_DURATION  # default 3600
RESET_MAX_LOCKOUT_SECONDS = 24 * 60 * 60


def _compute_reset_lockout_seconds(lockout_count: int) -> int:
    if lockout_count < 1:
        return RESET_BASE_LOCKOUT_SECONDS
    return min(
        RESET_BASE_LOCKOUT_SECONDS * (2 ** (lockout_count - 1)),
        RESET_MAX_LOCKOUT_SECONDS,
    )


def should_throttle_password_reset(email: str) -> bool:
    """
    Returns True when the email is currently locked out OR the caller has
    exceeded RESET_MAX_REQUESTS within RESET_WINDOW_SECONDS. Side-effect:
    records the attempt and escalates lockout_count on threshold breach.
    """
    try:
        email_lc = email.lower()
        # admin client justified: pre-auth throttle write; password_reset_attempts is service-role-only
        admin_client = get_supabase_admin_client()
        now = datetime.now(timezone.utc)

        result = admin_client.table('password_reset_attempts')\
            .select('*')\
            .eq('email', email_lc)\
            .execute()

        if not result.data:
            admin_client.table('password_reset_attempts').insert({
                'email': email_lc,
                'attempt_count': 1,
                'lockout_count': 0,
                'locked_until': None,
                'last_attempt_at': now.isoformat(),
                'created_at': now.isoformat(),
                'updated_at': now.isoformat(),
            }).execute()
            return False

        record = result.data[0]

        # Currently locked? Throttle, don't increment further.
        locked_until = record.get('locked_until')
        if locked_until:
            locked_until_dt = datetime.fromisoformat(locked_until.replace('Z', '+00:00'))
            if now < locked_until_dt:
                return True

        # Reset the window if the last attempt was outside it.
        last_attempt_at = datetime.fromisoformat(
            record['last_attempt_at'].replace('Z', '+00:00')
        )
        gap_seconds = (now - last_attempt_at).total_seconds()
        if gap_seconds > RESET_WINDOW_SECONDS:
            window_reset = {
                'attempt_count': 1,
                'locked_until': None,
                'last_attempt_at': now.isoformat(),
                'updated_at': now.isoformat(),
            }
            # lockout_count previously only ever incremented, so every trip in
            # a user's LIFETIME escalated the next lockout toward 24 h. A full
            # quiet day is strong evidence the earlier trips weren't an attack
            # in progress — decay the escalation; attackers who burst more
            # often than daily keep escalating.
            if gap_seconds > 86400 and record.get('lockout_count'):
                window_reset['lockout_count'] = 0
            admin_client.table('password_reset_attempts').update(
                window_reset).eq('email', email_lc).execute()
            return False

        new_count = record.get('attempt_count', 0) + 1
        if new_count > RESET_MAX_REQUESTS:
            new_lockout_count = record.get('lockout_count', 0) + 1
            duration = _compute_reset_lockout_seconds(new_lockout_count)
            new_locked_until = now + timedelta(seconds=duration)
            admin_client.table('password_reset_attempts').update({
                'attempt_count': new_count,
                'lockout_count': new_lockout_count,
                'locked_until': new_locked_until.isoformat(),
                'last_attempt_at': now.isoformat(),
                'updated_at': now.isoformat(),
            }).eq('email', email_lc).execute()
            logger.warning(
                f"[RESET-THROTTLE] {mask_email(email)} soft-locked for "
                f"{duration // 60}m (lockout #{new_lockout_count})"
            )
            return True

        admin_client.table('password_reset_attempts').update({
            'attempt_count': new_count,
            'last_attempt_at': now.isoformat(),
            'updated_at': now.isoformat(),
        }).eq('email', email_lc).execute()
        return False

    except Exception as e:
        # Fail-open on the throttle: better to risk a duplicate email than to
        # lock legitimate users out due to a DB hiccup.
        logger.error(f"Error in should_throttle_password_reset: {e}")
        return False


# ============================================================================
# ENDPOINTS
# ============================================================================

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

        if should_log_sensitive_data():
            logger.debug(f"[FORGOT_PASSWORD] Received request for email: {mask_email(email)}")

        if not email:
            logger.warning("[FORGOT_PASSWORD] No email provided")
            return jsonify({'error': 'Email is required'}), 400

        # Sanitize email input
        email = sanitize_input(email.lower().strip())

        if should_log_sensitive_data():
            logger.debug(f"[FORGOT_PASSWORD] Sanitized email: {mask_email(email)}")

        # Validate email format
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, email):
            logger.warning(f"[FORGOT_PASSWORD] Invalid email format: {mask_email(email)}")
            return jsonify({'error': 'Invalid email format'}), 400

        # H7: Per-email throttle (supplements the per-IP @rate_limit decorator).
        # When throttled we still return the standard 200 message so callers can't
        # probe account state via lockout timing.
        if should_throttle_password_reset(email):
            logger.info(f"[FORGOT_PASSWORD] Soft-throttled (per-email limit): {mask_email(email)}")
            return jsonify({
                'message': 'If an account exists with this email, you will receive password reset instructions shortly.',
                'note': 'Please check your spam folder if you don\'t see the email within a few minutes.'
            }), 200

        # admin client justified: pre-auth password reset flow; needs auth.users access via Admin API and password_reset_tokens write
        admin_client = get_supabase_admin_client()
        logger.info("[FORGOT_PASSWORD] Got admin client")

        # Check if user exists in auth.users
        if should_log_sensitive_data():
            logger.debug(f"[FORGOT_PASSWORD] Looking up user in auth.users: {mask_email(email)}")

        try:
            # Use Admin API to find user by email
            if should_log_sensitive_data():
                logger.debug(f"[FORGOT_PASSWORD] Looking up user by email using Admin API: {mask_email(email)}")

            # First check public.users table for the user_id
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

            logger.info(f"[FORGOT_PASSWORD] Found user: {mask_user_id(user_id)}, name: {user_name}, auth email: {mask_email(matching_user.email)}")

            try:
                # Clean up expired tokens for this user before creating new one
                logger.info("[FORGOT_PASSWORD] Cleaning up expired tokens")
                now_utc = datetime.now(timezone.utc)
                admin_client.table('password_reset_tokens')\
                    .delete()\
                    .eq('user_id', user_id)\
                    .lt('expires_at', now_utc.isoformat())\
                    .execute()

                # Generate secure token
                logger.info("[FORGOT_PASSWORD] Generating reset token")
                reset_token = secrets.token_urlsafe(32)
                expires_at = now_utc + timedelta(hours=PASSWORD_RESET_TOKEN_EXPIRY_HOURS)
                logger.info(f"[FORGOT_PASSWORD] Token generated, expires at: {expires_at.isoformat()}")

                # Store the HASH, never the token. The row is a bearer credential:
                # anything that can read this table could otherwise reset every
                # account holding a live link. See utils/reset_tokens.py.
                logger.info("[FORGOT_PASSWORD] Storing token hash in database")
                admin_client.table('password_reset_tokens').insert({
                    'user_id': user_id,
                    'token': hash_reset_token(reset_token),
                    'expires_at': expires_at.isoformat(),
                    'used': False,
                    'created_at': now_utc.isoformat()
                }).execute()
                logger.info("[FORGOT_PASSWORD] Token stored successfully")

                # Generate reset link
                frontend_url = Config.FRONTEND_URL
                reset_link = f"{frontend_url}/reset-password?token={reset_token}"
                logger.info(f"[FORGOT_PASSWORD] Generated reset link: {reset_link[:50]}...")

                # Send email to the auth.users email (source of truth)
                auth_email = matching_user.email
                logger.info(f"[FORGOT_PASSWORD] Calling email_service.send_password_reset_email()")
                logger.info(f"[FORGOT_PASSWORD] Email params: user_email={auth_email}, user_name={user_name}, expiry_hours={PASSWORD_RESET_TOKEN_EXPIRY_HOURS}")

                email_sent = email_service.send_password_reset_email(
                    user_email=auth_email,
                    user_name=user_name,
                    reset_link=reset_link,
                    expiry_hours=PASSWORD_RESET_TOKEN_EXPIRY_HOURS
                )

                logger.info(f"[FORGOT_PASSWORD] Email send result: {email_sent}")

                if email_sent:
                    logger.info(f"[FORGOT_PASSWORD] ✓ Password reset email SUCCESSFULLY sent to {mask_email(auth_email)}")
                else:
                    logger.error(f"[FORGOT_PASSWORD] ✗ FAILED to send email to {mask_email(auth_email)}")

            except Exception as reset_error:
                logger.error(f"[FORGOT_PASSWORD] ✗ Exception during reset token generation or email send: {str(reset_error)}")
                logger.error(f"[FORGOT_PASSWORD] Exception type: {type(reset_error).__name__}")
                import traceback
                logger.error(f"[FORGOT_PASSWORD] Traceback: {traceback.format_exc()}")
                # Still return success to avoid revealing user existence
        else:
            logger.info(f"[FORGOT_PASSWORD] No user found with email: {mask_email(email)}")
    except Exception as lookup_error:
        logger.error(f"[FORGOT_PASSWORD] Error looking up user in auth.users: {str(lookup_error)}")

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


@bp.route('/staff-invite/<token>', methods=['GET'])
@bp.route('/invite-info/<token>', methods=['GET'])
@rate_limit(max_requests=30, window_seconds=600)
def staff_invite_info(token):
    """Public lookup for the invite welcome pages (/staff/welcome,
    /student/welcome): resolves a pending invite token to the inviting org's name
    + logo and the invitee's email, so the page brands itself from the server
    instead of trusting query params.

    No new capability is exposed: whoever holds the token can already set the
    account's password via /reset-password, so showing them the email/org the
    token belongs to reveals nothing extra.
    """
    if not token or len(token) < 20:
        return jsonify({'error': 'Invalid invite link'}), 404
    # admin client justified: pre-auth invite lookup (same posture as /reset-password)
    admin_client = get_supabase_admin_client()
    try:
        # Hashed form first, then the raw legacy form for links already in
        # inboxes (utils/reset_tokens.py).
        rows = None
        for stored in lookup_values(token):
            rows = admin_client.table('password_reset_tokens')\
                .select('user_id, expires_at, used')\
                .eq('token', stored).limit(1).execute().data
            if rows:
                break
        if not rows or rows[0].get('used'):
            return jsonify({'error': 'Invalid invite link'}), 404
        expires_at = datetime.fromisoformat(rows[0]['expires_at'].replace('Z', '+00:00'))
        if datetime.now(timezone.utc) > expires_at:
            return jsonify({'error': 'This invite link has expired'}), 410

        user_rows = admin_client.table('users')\
            .select('email, first_name, organization_id')\
            .eq('id', rows[0]['user_id']).limit(1).execute().data
        if not user_rows:
            return jsonify({'error': 'Invalid invite link'}), 404
        user = user_rows[0]

        org_name, logo_url = None, None
        if user.get('organization_id'):
            org_rows = admin_client.table('organizations')\
                .select('name, branding_config')\
                .eq('id', user['organization_id']).limit(1).execute().data
            if org_rows:
                org_name = org_rows[0].get('name')
                logo_url = (org_rows[0].get('branding_config') or {}).get('logo_url')

        return jsonify({
            'email': user.get('email'),
            'first_name': user.get('first_name'),
            'org_name': org_name,
            'logo_url': logo_url,
            # Invited by email alone, so the welcome page asks for their name.
            # A teacher whose account was created with a name (or claimed from a
            # placeholder) isn't asked again.
            'needs_profile': not (user.get('first_name') or '').strip(),
        }), 200
    except Exception as e:
        logger.error(f"[STAFF_INVITE_INFO] lookup failed: {e}")
        return jsonify({'error': 'Invalid invite link'}), 404


_MAX_NAME_LEN = 100
_MAX_BIO_LEN = 2000


def _apply_invite_profile(admin_client, user_id, data):
    """Let an invited staff member name themselves while setting their password.

    Admins add teachers by email alone, so the account starts with no name. The
    teacher fills it in on the welcome page and it arrives here with the
    password. Guarded two ways: the reset token already proves they own the
    address, and the write is skipped unless the profile is still nameless — so
    this can never rename an account that already has one.

    Best-effort: the password is already changed by this point, and a profile
    hiccup must not turn a successful reset into an error the user sees.
    """
    first = (data.get('first_name') or '').strip()[:_MAX_NAME_LEN]
    last = (data.get('last_name') or '').strip()[:_MAX_NAME_LEN]
    bio = (data.get('bio') or '').strip()[:_MAX_BIO_LEN]
    if not (first or last or bio):
        return
    try:
        rows = (admin_client.table('users')
                .select('first_name, last_name, bio')
                .eq('id', user_id).limit(1).execute()).data or []
        if not rows:
            return
        profile = rows[0]
        if profile.get('first_name') or profile.get('last_name'):
            return  # already named — not ours to change
        fields = {}
        if first or last:
            fields['first_name'] = first or None
            fields['last_name'] = last or None
            fields['display_name'] = f'{first} {last}'.strip()
        if bio and not (profile.get('bio') or '').strip():
            fields['bio'] = bio
        if fields:
            admin_client.table('users').update(fields).eq('id', user_id).execute()
            logger.info(f"[RESET_PASSWORD] Applied invited-staff profile for {user_id[:8]}")
    except Exception as e:  # noqa: BLE001
        logger.error(f"[RESET_PASSWORD] Could not apply invited-staff profile: {e}")


def _claim_reset_token(admin_client, reset_token: str, now_utc):
    """Atomically mark the token used, and return (row, stored_value).

    The claim has to happen as a conditional UPDATE (`used = false` in the WHERE)
    so two concurrent submits cannot both spend the same link — which means the
    comparison happens in the database and we cannot hash-and-compare in Python.
    Hence the loop: try the hashed form, then the raw legacy form for links
    already sitting in inboxes (see utils/reset_tokens.py).

    Returns (None, None) when no unused row matched.
    """
    for stored in lookup_values(reset_token):
        result = admin_client.table('password_reset_tokens')\
            .update({'used': True, 'used_at': now_utc.isoformat()})\
            .eq('token', stored)\
            .eq('used', False)\
            .execute()
        if result.data:
            return result.data[0], stored
    return None, None


def _release_reset_token(admin_client, stored_token: str) -> None:
    """Un-claim a token whose password update never actually landed.

    Takes the value as STORED (the hash for anything minted after 2026-08-15),
    not the token from the link — that is what _claim_reset_token matched on.

    /reset-password claims the token BEFORE touching auth.users so two
    concurrent submits can't both spend it. The cost of claiming first is that
    any failure downstream burns a link the user did nothing wrong with: they
    see a 500, hit submit again, and the retry reports "Invalid or already used
    reset token" — which sends them off to request another email that fails the
    same way. (Exactly how an iCreate teacher burned four links in an hour: a
    breached password, rejected by Supabase's leaked-password check, and no
    message anywhere saying so.) Releasing on failure keeps the race protection
    and gives the link back.
    """
    if not stored_token:
        return
    try:
        admin_client.table('password_reset_tokens')\
            .update({'used': False, 'used_at': None})\
            .eq('token', stored_token)\
            .execute()
    except Exception as e:  # noqa: BLE001
        logger.error(f"[RESET_PASSWORD] Could not release reset token: {e}")


# GoTrue rejects passwords found in the HaveIBeenPwned corpus with a 422 when
# leaked-password protection is on. That check lives in Supabase, not in
# validate_password(), so a password can pass every rule we enforce locally and
# still be refused here — the user has to be told which one it was.
_WEAK_PASSWORD_MESSAGE = (
    'That password has appeared in a known data breach, so it cannot be used. '
    'Please choose a different password — your reset link is still valid.'
)


def _is_weak_password_error(exc: Exception) -> bool:
    if getattr(exc, 'code', None) == 'weak_password':
        return True
    if getattr(exc, 'status', None) == 422:
        return True
    text = str(getattr(exc, 'message', '') or exc).lower()
    return 'password' in text and ('weak' in text or 'pwned' in text)


@bp.route('/reset-password', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=600)  # AUTH-H6: throttle reset-token consumption (10 / 10 min per IP)
def reset_password():
    """
    Reset password using custom token from email link.
    Validates new password and updates user account.

    Optionally accepts first_name / last_name / bio — used by the staff welcome
    page, where an invited teacher names themselves (see _apply_invite_profile).
    """
    try:
        data = request.json
        reset_token = data.get('token')  # Token from URL query param
        new_password = data.get('new_password')

        if not reset_token or not new_password:
            return jsonify({'error': 'Reset token and new password are required'}), 400

        # Validate password strength
        is_valid, error_message = validate_password(new_password)
        if not is_valid:
            return jsonify({'error': error_message}), 400

        # Before the token is claimed, so a breached password costs her nothing
        # but a retype. The _is_weak_password_error path below stays as the
        # backstop for whatever HIBP knows and this lookup missed.
        is_valid, error_message = validate_password_not_breached(new_password)
        if not is_valid:
            return jsonify({'error': error_message}), 400

        # admin client justified: token-gated password reset; updates auth.users via Admin API, no user session yet
        admin_client = get_supabase_admin_client()

        # Bound before the try so the release path in `except` can never raise a
        # NameError over a claim that failed before it returned.
        stored_token = None

        try:
            # Immediately mark token as used to prevent race condition (token reuse window)
            # Use atomic update that only succeeds if token is still unused
            now_utc = datetime.now(timezone.utc)

            token_data, stored_token = _claim_reset_token(
                admin_client, reset_token, now_utc)

            # Check if update succeeded (token was unused)
            if not token_data:
                return jsonify({
                    'error': 'Invalid or already used reset token. Please request a new password reset.'
                }), 400

            # Parse expiration timestamp with timezone awareness
            expires_at_str = token_data['expires_at'].replace('Z', '+00:00')
            expires_at = datetime.fromisoformat(expires_at_str)

            # Check if token is expired using timezone-aware comparison
            if now_utc > expires_at:
                return jsonify({
                    'error': 'Reset link has expired. Please request a new password reset.'
                }), 400

            user_id = token_data['user_id']

            # Get user from auth.users (source of truth for authentication)
            auth_user = admin_client.auth.admin.get_user_by_id(user_id)
            if not auth_user or not auth_user.user:
                _release_reset_token(admin_client, stored_token)
                return jsonify({'error': 'User not found'}), 404

            auth_email = auth_user.user.email
            logger.info(f"[RESET_PASSWORD] Found user in auth.users: {mask_email(auth_email)}")

            # Update password using Supabase Admin API
            # Also confirm email if not already confirmed - user has proven email access
            # by clicking the reset link
            update_data = {'password': new_password}
            if not auth_user.user.email_confirmed_at:
                update_data['email_confirm'] = True
                logger.info(f"[RESET_PASSWORD] Also confirming email for {mask_email(auth_email)}")

            try:
                auth_response = admin_client.auth.admin.update_user_by_id(
                    user_id,
                    update_data
                )
            except Exception as update_error:
                # The password never changed, so the link must survive.
                _release_reset_token(admin_client, stored_token)
                if _is_weak_password_error(update_error):
                    logger.info(
                        f"[RESET_PASSWORD] Rejected breached password for "
                        f"{mask_email(auth_email)}; token released"
                    )
                    return jsonify({'error': _WEAK_PASSWORD_MESSAGE}), 400
                raise

            if not auth_response:
                _release_reset_token(admin_client, stored_token)
                return jsonify({'error': 'Failed to update password'}), 500

            # Sync email in public.users to match auth.users (prevent future mismatches)
            try:
                profile_check = admin_client.table('users').select('email').eq('id', user_id).execute()
                if profile_check.data:
                    current_profile_email = profile_check.data[0]['email']
                    if current_profile_email.lower() != auth_email.lower():
                        logger.warning(f"[RESET_PASSWORD] Email mismatch detected: auth={mask_email(auth_email)}, profile={mask_email(current_profile_email)}")
                        logger.info(f"[RESET_PASSWORD] Syncing profile email to match auth.users")
                        admin_client.table('users').update({
                            'email': auth_email
                        }).eq('id', user_id).execute()
            except Exception as sync_error:
                # Don't fail password reset if email sync fails, just log it
                logger.error(f"[RESET_PASSWORD] Warning: Failed to sync email in public.users: {sync_error}")

            # Staff invited by email alone arrive here with no name on file and
            # supply it themselves on the welcome page, alongside their bio.
            # Applied ONLY when the profile has no name yet: a genuine password
            # reset must never be a route to renaming an established account.
            _apply_invite_profile(admin_client, user_id, data)

            # Token already marked as used atomically at the start (prevents race condition)

            # AUTH-H5 fix: stamp last_logout_at so every access/refresh token
            # issued BEFORE this reset is invalidated (the require_auth / refresh
            # path rejects tokens whose iat precedes last_logout_at). Without
            # this, a stolen refresh token survived a password reset for up to
            # 30 days.
            try:
                admin_client.table('users').update({
                    'last_logout_at': now_utc.isoformat()
                }).eq('id', user_id).execute()
            except Exception as invalidate_error:
                logger.error(f"[RESET_PASSWORD] Failed to stamp last_logout_at: {invalidate_error}")

            # And on the rotation side, so a stolen refresh token cannot ride out
            # the reset by refreshing before the users lookup catches up.
            from utils import refresh_families
            refresh_families.revoke_user_families(user_id, 'password_reset')

            # Clear any account lockouts for this user
            reset_login_attempts(auth_email)

            logger.info(f"[RESET_PASSWORD] Password successfully reset for {mask_email(auth_email)}")

            return jsonify({
                'message': 'Password reset successful. You can now login with your new password.',
                'redirect': '/login'
            }), 200

        except Exception as auth_error:
            # Anything that lands here failed before the password changed (every
            # step after the update swallows its own errors), so give the link
            # back rather than stranding the user on a burned token.
            _release_reset_token(admin_client, stored_token)
            logger.error(f"[RESET_PASSWORD] Error: {str(auth_error)}")
            return jsonify({
                'error': 'Failed to reset password. Please try again or request a new reset link.'
            }), 500

    except ValidationError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        logger.error(f"[RESET_PASSWORD] Error: {str(e)}")
        return jsonify({'error': 'An error occurred while resetting your password'}), 500


@bp.route('/change-password', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=900, per_user=True)
@require_auth
def change_password(user_id):
    """Change your own password while logged in (Account Settings).

    Requires the current password: a session alone must not be enough, or an
    unattended laptop becomes a permanent account takeover.

    Every OTHER session is invalidated (last_logout_at), and this one is
    re-issued fresh cookies so the person changing the password isn't logged
    out of the browser they're sitting at. That's the point of the stamp — if
    someone else has a stolen refresh token, changing the password ends it.
    """
    try:
        # @require_auth hands back the masquerade/acting-as TARGET. Changing
        # someone else's password needs their current password anyway, but the
        # intent is never right — refuse outright rather than rely on that.
        from utils.session_manager import session_manager
        actual_user_id = session_manager.get_actual_admin_id()
        if actual_user_id and actual_user_id != user_id:
            return jsonify({
                'error': 'Passwords can only be changed from your own account.'
            }), 403

        data = request.json or {}
        current_password = data.get('current_password') or ''
        new_password = data.get('new_password') or ''

        if not current_password or not new_password:
            return jsonify({'error': 'Current and new password are required'}), 400

        if current_password == new_password:
            return jsonify({'error': 'Your new password must be different from your current one'}), 400

        is_valid, error_message = validate_password(new_password)
        if not is_valid:
            return jsonify({'error': error_message}), 400

        is_valid, error_message = validate_password_not_breached(new_password)
        if not is_valid:
            return jsonify({'error': error_message}), 400

        # admin client justified: reads auth.users and writes the password via
        # the Admin API; the user's own session can't do either.
        admin_client = get_supabase_admin_client()

        auth_user = admin_client.auth.admin.get_user_by_id(user_id)
        if not auth_user or not auth_user.user:
            return jsonify({'error': 'User not found'}), 404
        auth_email = auth_user.user.email

        # Verify the current password by actually signing in with it.
        try:
            get_supabase_client().auth.sign_in_with_password({
                'email': auth_email,
                'password': current_password
            })
        except Exception:
            logger.info(f"[CHANGE_PASSWORD] Wrong current password for {mask_email(auth_email)}")
            return jsonify({'error': 'Your current password is incorrect'}), 400

        admin_client.auth.admin.update_user_by_id(user_id, {'password': new_password})

        # Truncate to whole seconds: JWT `iat` has second resolution, so a
        # sub-second stamp would sit *after* the iat of the tokens we mint
        # below and the refresh path would reject this very session.
        now_utc = datetime.now(timezone.utc).replace(microsecond=0)
        try:
            admin_client.table('users').update({
                'last_logout_at': now_utc.isoformat()
            }).eq('id', user_id).execute()
        except Exception as invalidate_error:
            logger.error(f"[CHANGE_PASSWORD] Failed to stamp last_logout_at: {invalidate_error}")

        # Same revocation, written where the refresh path can act on it. The
        # tokens minted below start a fresh family, so this session survives and
        # every other chain is dead — which is exactly what the message promises.
        from utils import refresh_families
        refresh_families.revoke_user_families(user_id, 'password_change')

        reset_login_attempts(auth_email)
        logger.info(f"[CHANGE_PASSWORD] Password changed for {mask_email(auth_email)}")

        from flask import make_response
        from utils.session_manager import session_manager as sm
        from . import token_delivery
        access_token = sm.generate_access_token(user_id)
        refresh_token = sm.generate_refresh_token(user_id)
        response = make_response(jsonify({
            'message': 'Password updated. You are still signed in here; other devices have been signed out.',
            **token_delivery.body_tokens(access_token, refresh_token),
        }), 200)
        sm.set_auth_cookies(response, user_id, access_token, refresh_token)
        return response

    except ValidationError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        logger.error(f"[CHANGE_PASSWORD] Error: {str(e)}")
        return jsonify({'error': 'An error occurred while changing your password'}), 500
