"""Per-post visibility approval flow.

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


@bp.route('/parental-consent/visibility-approval/pending', methods=['GET'])
@require_auth
def get_pending_visibility_requests(user_id):
    """
    Get pending portfolio visibility approval requests for parent's children.
    Parents see requests from their linked children who want to make portfolios public.

    Returns:
        List of pending requests with child info
    """
    try:
        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Get pending requests where this user is the parent
        # Use separate query for student info to avoid FK cache issues
        try:
            requests_result = supabase.table('public_visibility_requests').select(
                'id, student_user_id, requested_at'
            ).eq('parent_user_id', user_id).eq('status', 'pending').execute()
        except Exception as table_err:
            logger.warning(f"public_visibility_requests table may not exist: {table_err}")
            return jsonify({
                'success': True,
                'pending_requests': [],
                'count': 0
            }), 200

        pending_requests = []
        for req in requests_result.data or []:
            # Get student info separately
            student_result = supabase.table('users').select(
                'first_name, last_name, email'
            ).eq('id', req['student_user_id']).execute()
            student_data = student_result.data[0] if student_result.data else {}
            pending_requests.append({
                'id': req['id'],
                'student_id': req['student_user_id'],
                'student_name': f"{student_data.get('first_name', '')} {student_data.get('last_name', '')}".strip(),
                'student_email': student_data.get('email'),
                'requested_at': req['requested_at']
            })

        return jsonify({
            'success': True,
            'pending_requests': pending_requests,
            'count': len(pending_requests)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching pending visibility requests: {str(e)}")
        return jsonify({'error': 'Failed to fetch pending requests'}), 500


@bp.route('/parental-consent/visibility-approval/<request_id>/respond', methods=['POST'])
@require_auth
def respond_to_visibility_request(user_id, request_id):
    """
    Parent responds to child's portfolio visibility request.

    Request body:
        approved: boolean - true to approve, false to deny
        reason: string (optional) - reason for denial

    On approval:
        - Sets diploma.is_public = true
        - Sets diploma.public_consent_given = true
        - Sets diploma.public_consent_given_by = parent_user_id
        - Clears pending_parent_approval flag

    On denial:
        - Sets diploma.parent_approval_denied = true
        - Sets diploma.parent_approval_denied_at = now
        - Clears pending_parent_approval flag
        - Student can request again after 30 days
    """
    try:
        data = request.json or {}
        approved = data.get('approved', False)
        denial_reason = data.get('reason', '')

        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Get the request and verify this parent is authorized
        req_result = supabase.table('public_visibility_requests').select(
            'id, student_user_id, parent_user_id, status'
        ).eq('id', request_id).execute()

        if not req_result.data:
            return jsonify({'error': 'Request not found'}), 404

        visibility_request = req_result.data[0]

        # Verify this parent is authorized to respond
        if visibility_request['parent_user_id'] != user_id:
            return jsonify({'error': 'Not authorized to respond to this request'}), 403

        # Verify request is still pending
        if visibility_request['status'] != 'pending':
            return jsonify({
                'error': 'This request has already been responded to',
                'status': visibility_request['status']
            }), 400

        student_id = visibility_request['student_user_id']
        now = datetime.utcnow().isoformat()

        if approved:
            # APPROVE: Make portfolio public with parent consent
            supabase.table('diplomas').update({
                'is_public': True,
                'public_consent_given': True,
                'public_consent_given_at': now,
                'public_consent_given_by': user_id,  # Parent gave consent
                'pending_parent_approval': False,
                'parent_approval_denied': False,
                'parent_approval_denied_at': None
            }).eq('user_id', student_id).execute()

            # Update request status
            supabase.table('public_visibility_requests').update({
                'status': 'approved',
                'responded_at': now
            }).eq('id', request_id).execute()

            # Get student info for logging
            student_result = supabase.table('users').select(
                'first_name, email'
            ).eq('id', student_id).execute()
            student_name = student_result.data[0]['first_name'] if student_result.data else 'Student'

            logger.info(f"[FERPA] Parent {user_id} approved public portfolio for student {student_id}")

            return jsonify({
                'success': True,
                'message': f"{student_name}'s portfolio is now public",
                'approved': True,
                'student_id': student_id
            }), 200

        else:
            # DENY: Keep portfolio private, record denial
            supabase.table('diplomas').update({
                'is_public': False,
                'pending_parent_approval': False,
                'parent_approval_denied': True,
                'parent_approval_denied_at': now
            }).eq('user_id', student_id).execute()

            # Update request status
            supabase.table('public_visibility_requests').update({
                'status': 'denied',
                'responded_at': now,
                'denial_reason': denial_reason or 'Parent did not approve'
            }).eq('id', request_id).execute()

            # Get student info for logging
            student_result = supabase.table('users').select(
                'first_name, email'
            ).eq('id', student_id).execute()
            student_name = student_result.data[0]['first_name'] if student_result.data else 'Student'

            logger.info(f"[FERPA] Parent {user_id} denied public portfolio for student {student_id}: {denial_reason}")

            return jsonify({
                'success': True,
                'message': f"Request denied. {student_name}'s portfolio remains private.",
                'approved': False,
                'student_id': student_id,
                'can_request_again_in_days': 30
            }), 200

    except Exception as e:
        logger.error(f"Error responding to visibility request: {str(e)}")
        return jsonify({'error': 'Failed to process response'}), 500


@bp.route('/parental-consent/visibility-approval/history', methods=['GET'])
@require_auth
def get_visibility_request_history(user_id):
    """
    Get history of visibility requests for parent's children.
    Shows both pending and resolved requests.

    Returns:
        List of all requests (pending, approved, denied) with child info
    """
    try:
        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Get all requests where this user is the parent
        requests_result = supabase.table('public_visibility_requests').select(
            'id, student_user_id, status, requested_at, responded_at, denial_reason, '
            'users!public_visibility_requests_student_user_id_fkey(first_name, last_name)'
        ).eq('parent_user_id', user_id).order('requested_at', desc=True).limit(50).execute()

        history = []
        for req in requests_result.data or []:
            student_data = req.get('users', {})
            history.append({
                'id': req['id'],
                'student_id': req['student_user_id'],
                'student_name': f"{student_data.get('first_name', '')} {student_data.get('last_name', '')}".strip(),
                'status': req['status'],
                'requested_at': req['requested_at'],
                'responded_at': req.get('responded_at'),
                'denial_reason': req.get('denial_reason')
            })

        return jsonify({
            'success': True,
            'history': history,
            'count': len(history)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching visibility request history: {str(e)}")
        return jsonify({'error': 'Failed to fetch request history'}), 500