"""Consent request lifecycle: send, verify, status, resend.

Split from routes/parental_consent.py on 2026-04-14 (Q1).
"""

"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- 20+ direct database calls for COPPA compliance workflow
- Token generation, validation, and email verification logic
- Could create ParentalConsentRepository with methods:
  - send_consent_request(user_id, parent_email, child_email)
  - verify_consent_token(token)
  - check_consent_status(user_id)
  - resend_consent_request(user_id)
  - log_consent_attempt(user_id, parent_email, ip, user_agent)
- Complex consent workflow suitable for repository abstraction

Parental Consent API routes.
Handles COPPA compliance for users under 13.

ADMIN CLIENT USAGE: Every endpoint in this file uses get_supabase_admin_client()
because the consent flow operates on data the child user (under 13) cannot
authenticate to themselves: the workflow runs with either no session (parent
clicking an emailed link) or a child's session writing parent-owned consent
records. Each call site is annotated `# admin client justified` to satisfy the
H1 audit; access control comes from (a) one-time hashed consent tokens,
(b) email verification of the parent address, and (c) explicit user_id matching
on every update. Parental consent and child user records cannot be exposed to
arbitrary callers from these endpoints.
"""
from flask import Blueprint, request, jsonify
from app_config import Config
from database import get_supabase_admin_client
from repositories import (
    UserRepository,
    QuestRepository,
    EvidenceRepository,
    ParentRepository,
    TutorRepository,
    AnalyticsRepository
)
from middleware.error_handler import ValidationError, NotFoundError
from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_auth, require_role
from utils.roles import get_effective_role  # A2: org_managed users have actual role in org_role
from services.email_service import email_service
from werkzeug.utils import secure_filename
import secrets
import hashlib
import uuid
from datetime import datetime, timedelta
import logging
import mimetypes

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)



# generate_consent_token / hash_token were called at four sites in this module
# but never imported, so every request to /parental-consent/send, /verify and
# /resend died with "name 'generate_consent_token' is not defined" and returned
# 500 -- the whole COPPA consent flow, in production. Found 2026-08-13 by the
# ported integration tests the first time they were ever able to run.
from routes.parental_consent import bp, generate_consent_token, hash_token


def _mask_email(address):
    """`p****t@example.com` -- enough for a parent to recognise their own
    address, not enough for a stranger to learn it."""
    if not address or '@' not in address:
        return None
    local, _, domain = address.partition('@')
    if len(local) <= 2:
        masked = local[0] + '*' if local else '*'
    else:
        masked = f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}"
    return f"{masked}@{domain}"


@bp.route('/parental-consent/send', methods=['POST'])
@rate_limit(max_requests=3, window_seconds=3600)  # 3 requests per hour
def send_parental_consent():
    """
    Send parental consent verification email
    Called during registration when user is under 13

    The destination address is bound to the record, not to the request body
    (2026-08-15). Previously this endpoint was unauthenticated, took both a
    `user_id` and a `parent_email` from the body, and mailed whatever address
    it was given -- so anyone holding a child's UUID could have Optio send a
    branded "consent request for <child's first name>" to an address of their
    choosing. Registration already writes parental_consent_email, so for every
    child registered through the normal flow that address is on file and now
    wins over anything the caller supplies.

    Where no address is on file yet (the first send of a registration still in
    flight), the body may still establish one -- but only when `child_email`
    matches the account's own address. An attacker must therefore already know
    the child's email, not merely a UUID, and the child gets a copy of the
    trail in parental_consent_log either way.
    """
    try:
        data = request.json
        user_id = data.get('user_id')
        requested_parent_email = data.get('parent_email')
        child_email = data.get('child_email')

        if not all([user_id, requested_parent_email, child_email]):
            raise ValidationError("Missing required fields: user_id, parent_email, child_email")

        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Verify user exists and requires parental consent
        user_response = supabase.table('users').select(
            'id, first_name, last_name, email, requires_parental_consent, '
            'parental_consent_email'
        ).eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User not found")

        user = user_response.data[0]

        if not user.get('requires_parental_consent'):
            return jsonify({
                'error': 'User does not require parental consent',
                'requires_consent': False
            }), 400

        # The destination is the address already on the record. The body can
        # only establish one where none exists, and only for a caller who can
        # name the child's own email.
        parent_email = (user.get('parental_consent_email') or '').strip().lower()
        if not parent_email:
            account_email = (user.get('email') or '').strip().lower()
            if not account_email or account_email != str(child_email).strip().lower():
                logger.warning(
                    "Refusing consent send: child_email does not match the "
                    f"account on file for user {user_id}"
                )
                # Same shape as a genuine mismatch of any other field -- this
                # must not become an oracle for "is this UUID a real child".
                raise NotFoundError("User not found")
            parent_email = str(requested_parent_email).strip().lower()
        elif str(requested_parent_email).strip().lower() != parent_email:
            logger.warning(
                f"Consent send for user {user_id} requested a different parent "
                "address than the one on file; using the address on file."
            )

        # Generate consent token
        consent_token = generate_consent_token()
        hashed_token = hash_token(consent_token)

        # Store token in user record
        supabase.table('users').update({
            'parental_consent_email': parent_email,
            'parental_consent_token': hashed_token,
            'parental_consent_verified': False
        }).eq('id', user_id).execute()

        # Log consent request. Both addresses come from the record, never from
        # the body -- an audit row that records what the caller *claimed* is
        # not an audit row.
        supabase.table('parental_consent_log').insert({
            'user_id': user_id,
            'child_email': user.get('email') or child_email,
            'parent_email': parent_email,
            'consent_token': hashed_token,
            'ip_address': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', '')
        }).execute()

        # Send email to parent with verification link
        verification_link = f"{request.host_url}verify-parental-consent?token={consent_token}"

        email_sent = email_service.send_parental_consent_email(
            parent_email=parent_email,
            parent_name='Parent/Guardian',  # Generic name since we don't collect it
            child_name=user.get('first_name', 'Student'),
            verification_link=verification_link
        )

        if email_sent:
            logger.info(f"Parental consent email sent to {parent_email}")
        else:
            logger.warning(f"Failed to send parental consent email to {parent_email}")

        # Masked, not raw: this endpoint is unauthenticated, and echoing the
        # address on file would let a caller who guessed a child's UUID and
        # posted any address at all read back the real guardian's email.
        return jsonify({
            'message': 'Parental consent verification email sent',
            'parent_email_masked': _mask_email(parent_email),
            'email_sent': email_sent
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error sending parental consent: {str(e)}")
        return jsonify({'error': 'Failed to send parental consent verification'}), 500

@bp.route('/parental-consent/verify', methods=['POST'])
def verify_parental_consent():
    """
    Verify parental consent token
    Called when parent clicks verification link in email
    """
    try:
        data = request.json
        token = data.get('token')

        if not token:
            raise ValidationError("Consent token is required")

        # Hash the provided token
        hashed_token = hash_token(token)

        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Find user with this token
        user_response = supabase.table('users').select('id, first_name, parental_consent_verified').eq('parental_consent_token', hashed_token).execute()

        if not user_response.data:
            return jsonify({'error': 'Invalid or expired consent token'}), 400

        user = user_response.data[0]

        # Check if already verified
        if user.get('parental_consent_verified'):
            return jsonify({
                'message': 'Parental consent already verified',
                'already_verified': True
            }), 200

        # Mark as verified
        supabase.table('users').update({
            'parental_consent_verified': True,
            'parental_consent_verified_at': datetime.utcnow().isoformat(),
            'parental_consent_token': None  # Clear token after use
        }).eq('id', user['id']).execute()

        # Update consent log
        supabase.table('parental_consent_log').update({
            'consent_verified_at': datetime.utcnow().isoformat()
        }).eq('consent_token', hashed_token).execute()

        return jsonify({
            'message': 'Parental consent verified successfully',
            'child_name': user.get('first_name', 'Student'),
            'verified': True
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error verifying parental consent: {str(e)}")
        return jsonify({'error': 'Failed to verify parental consent'}), 500

def _may_read_consent_status(viewer_id: str, subject_id: str) -> bool:
    """May this caller see whether that child's consent is on file?

    Deliberately narrower than can_view_portfolio: consent state is a record
    ABOUT the guardian relationship, not schoolwork, so a connected peer or a
    class teacher has no business in it. The grants are the child themselves,
    their guardian by either linking mechanism, an assigned advisor, an org
    admin over them, and Optio platform staff.
    """
    if not viewer_id or not subject_id:
        return False
    if viewer_id == subject_id:
        return True

    try:
        from utils.portfolio_access import (
            is_parent_of, is_advisor_of, is_org_admin_over, _fetch_user,
        )
        from utils.platform_staff import is_optio_platform_user

        viewer = _fetch_user(
            viewer_id, 'id, email, role, org_role, org_roles, organization_id'
        )
        if not viewer:
            return False
        if is_optio_platform_user(viewer):
            return True
        if is_parent_of(viewer_id, subject_id):
            return True
        if is_advisor_of(viewer_id, subject_id):
            return True
        subject = _fetch_user(subject_id, 'id, organization_id')
        return is_org_admin_over(viewer, subject)
    except Exception as e:
        # Fail closed. An authorization check that errors is a "no".
        logger.error(f"Consent-status authorization check failed: {e}")
        return False


@bp.route('/parental-consent/status/<user_id>', methods=['GET'])
def check_consent_status(user_id):
    """Check parental consent status for a user.

    Until 2026-08-15 this endpoint carried no auth decorator at all and
    returned `parental_consent_email` -- a named guardian's address -- for any
    UUID handed to it. That is a phishing seed with a child attached ("Hi,
    about your child's Optio account..."), served to anyone who could guess or
    scrape a user id.

    It now follows the model routes/public.py::get_public_transcript was
    hardened to: the caller must be the child, their guardian, or somebody with
    an existing legitimate relationship, and a caller who is not gets a 404
    indistinguishable from "no such user" -- so the endpoint cannot be used to
    confirm that a UUID belongs to a real child, or that a real child is under
    13.

    The guardian's email is no longer returned at all. Nothing needed it here:
    the consent screens tell the child a request went to their parent, and the
    parent already knows their own address.
    """
    # Linked from consent emails, so scanners hit it with mangled ids. A
    # non-UUID is a clean 404, not a Postgres 22P02.
    try:
        uuid.UUID(str(user_id))
    except (ValueError, AttributeError, TypeError):
        return jsonify({'error': 'Consent status not found'}), 404

    from utils.session_manager import session_manager

    viewer_id = session_manager.get_effective_user_id()
    if not _may_read_consent_status(viewer_id, user_id):
        return jsonify({'error': 'Consent status not found'}), 404

    try:
        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        user_response = supabase.table('users').select(
            'requires_parental_consent, parental_consent_verified, parental_consent_verified_at'
        ).eq('id', user_id).execute()

        if not user_response.data:
            return jsonify({'error': 'Consent status not found'}), 404

        user = user_response.data[0]

        return jsonify({
            'requires_consent': user.get('requires_parental_consent', False),
            'consent_verified': user.get('parental_consent_verified', False),
            'verified_at': user.get('parental_consent_verified_at')
        }), 200

    except Exception as e:
        logger.error(f"Error checking consent status: {str(e)}")
        return jsonify({'error': 'Failed to check consent status'}), 500

@bp.route('/parental-consent/resend', methods=['POST'])
@rate_limit(max_requests=2, window_seconds=3600)  # 2 requests per hour
def resend_parental_consent():
    """
    Resend parental consent verification email

    Acts on a body-supplied user_id with no session, so the only thing keeping
    this from being a mailer for arbitrary addresses is that the destination is
    read from `users.parental_consent_email` -- never from the request. That
    was already true here; what is new (2026-08-15) is that it is now the
    stated contract rather than an accident of the implementation, that the
    endpoint refuses a caller who cannot name the child's own email, and that
    the response no longer echoes the guardian's address back.

    A caller who knows a real child's UUID and email can still cause a resend
    to that child's real guardian; that is a nuisance bounded by the 2/hour
    rate limit, not a disclosure.
    """
    try:
        data = request.json or {}
        user_id = data.get('user_id')
        child_email = data.get('child_email')

        if not user_id:
            raise ValidationError("user_id is required")

        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Get user details
        user_response = supabase.table('users').select(
            'id, first_name, email, parental_consent_email, requires_parental_consent, parental_consent_verified'
        ).eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User not found")

        user = user_response.data[0]

        # Two ways to be entitled to press "resend": be the signed-in child (or
        # their guardian/advisor -- the consent screens are reachable by both),
        # or name the child's own email address. The signed-in path is what the
        # web app actually uses; the email path keeps the unauthenticated
        # registration flow working without accepting a bare UUID.
        from utils.session_manager import session_manager
        viewer_id = session_manager.get_effective_user_id()
        account_email = (user.get('email') or '').strip().lower()
        entitled = (
            _may_read_consent_status(viewer_id, user_id)
            or (account_email and str(child_email or '').strip().lower() == account_email)
        )
        if not entitled:
            logger.warning(f"Refusing consent resend for user {user_id}: caller not entitled")
            raise NotFoundError("User not found")

        if not user.get('requires_parental_consent'):
            return jsonify({'error': 'User does not require parental consent'}), 400

        if user.get('parental_consent_verified'):
            return jsonify({'error': 'Parental consent already verified'}), 400

        if not user.get('parental_consent_email'):
            return jsonify({'error': 'No parent email on file'}), 400

        # Generate new token
        consent_token = generate_consent_token()
        hashed_token = hash_token(consent_token)

        # Update token
        supabase.table('users').update({
            'parental_consent_token': hashed_token
        }).eq('id', user_id).execute()

        # Log resend
        supabase.table('parental_consent_log').insert({
            'user_id': user_id,
            'child_email': user.get('email'),
            'parent_email': user.get('parental_consent_email'),
            'consent_token': hashed_token,
            'ip_address': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', '')
        }).execute()

        verification_link = f"{request.host_url}verify-parental-consent?token={consent_token}"

        # Send email to parent
        email_sent = email_service.send_parental_consent_email(
            parent_email=user.get('parental_consent_email'),
            parent_name='Parent/Guardian',
            child_name=user.get('first_name', 'Student'),
            verification_link=verification_link
        )

        if email_sent:
            logger.info(f"Parental consent email resent to {user.get('parental_consent_email')}")
        else:
            logger.warning(f"Failed to resend parental consent email to {user.get('parental_consent_email')}")

        return jsonify({
            'message': 'Parental consent verification email resent',
            'parent_email_masked': _mask_email(user.get('parental_consent_email')),
            'email_sent': email_sent
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error resending parental consent: {str(e)}")
        return jsonify({'error': 'Failed to resend parental consent'}), 500

