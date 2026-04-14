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
from datetime import datetime, timedelta
import logging
import mimetypes

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)



from routes.parental_consent import bp


@bp.route('/parental-consent/send', methods=['POST'])
@rate_limit(max_requests=3, window_seconds=3600)  # 3 requests per hour
def send_parental_consent():
    """
    Send parental consent verification email
    Called during registration when user is under 13
    """
    try:
        data = request.json
        user_id = data.get('user_id')
        parent_email = data.get('parent_email')
        child_email = data.get('child_email')

        if not all([user_id, parent_email, child_email]):
            raise ValidationError("Missing required fields: user_id, parent_email, child_email")

        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Verify user exists and requires parental consent
        user_response = supabase.table('users').select('id, first_name, last_name, requires_parental_consent').eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User not found")

        user = user_response.data[0]

        if not user.get('requires_parental_consent'):
            return jsonify({
                'error': 'User does not require parental consent',
                'requires_consent': False
            }), 400

        # Generate consent token
        consent_token = generate_consent_token()
        hashed_token = hash_token(consent_token)

        # Store token in user record
        supabase.table('users').update({
            'parental_consent_email': parent_email,
            'parental_consent_token': hashed_token,
            'parental_consent_verified': False
        }).eq('id', user_id).execute()

        # Log consent request
        supabase.table('parental_consent_log').insert({
            'user_id': user_id,
            'child_email': child_email,
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

        return jsonify({
            'message': 'Parental consent verification email sent',
            'parent_email': parent_email,
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

@bp.route('/parental-consent/status/<user_id>', methods=['GET'])
def check_consent_status(user_id):
    """
    Check parental consent status for a user
    """
    try:
        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        user_response = supabase.table('users').select(
            'requires_parental_consent, parental_consent_verified, parental_consent_email, parental_consent_verified_at'
        ).eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User not found")

        user = user_response.data[0]

        return jsonify({
            'requires_consent': user.get('requires_parental_consent', False),
            'consent_verified': user.get('parental_consent_verified', False),
            'parent_email': user.get('parental_consent_email'),
            'verified_at': user.get('parental_consent_verified_at')
        }), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error checking consent status: {str(e)}")
        return jsonify({'error': 'Failed to check consent status'}), 500

@bp.route('/parental-consent/resend', methods=['POST'])
@rate_limit(max_requests=2, window_seconds=3600)  # 2 requests per hour
def resend_parental_consent():
    """
    Resend parental consent verification email
    """
    try:
        data = request.json
        user_id = data.get('user_id')

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
            'parent_email': user.get('parental_consent_email'),
            'email_sent': email_sent
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error resending parental consent: {str(e)}")
        return jsonify({'error': 'Failed to resend parental consent'}), 500

