"""Admin-side consent review: pending, approve, reject.

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


@bp.route('/admin/parental-consent/pending', methods=['GET'])
@require_role('admin')
def get_pending_consent_reviews(user_id: str):
    """
    Admin endpoint: Get all pending parent identity verification reviews

    Parents submit ID documents and signed consent forms to verify their identity
    before they can create dependent profiles or link to children under 13.
    """
    try:
        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Get all PARENTS with pending identity verification
        pending_response = supabase.table('users').select(
            'id, display_name, email, parental_consent_submitted_at, '
            'parental_consent_id_document_url, parental_consent_signed_form_url, '
            'parental_consent_status, date_of_birth, role'
        ).eq('parental_consent_status', 'pending_review').eq('role', 'parent').order('parental_consent_submitted_at').execute()

        pending_reviews = []
        for parent in pending_response.data:
            # Calculate age for context
            age = None
            if parent.get('date_of_birth'):
                dob = datetime.fromisoformat(parent['date_of_birth'].replace('Z', '+00:00'))
                age = (datetime.now() - dob).days // 365

            pending_reviews.append({
                'parent_id': parent['id'],
                'parent_name': parent.get('display_name', 'Unknown'),
                'parent_email': parent.get('email'),
                'submitted_at': parent.get('parental_consent_submitted_at'),
                'id_document_url': parent.get('parental_consent_id_document_url'),
                'consent_form_url': parent.get('parental_consent_signed_form_url'),
                'parent_age': age,
                'status': parent.get('parental_consent_status')
            })

        return jsonify({
            'pending_reviews': pending_reviews,
            'count': len(pending_reviews)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching pending consent reviews: {str(e)}")
        return jsonify({'error': 'Failed to fetch pending reviews'}), 500

@bp.route('/admin/parental-consent/approve/<parent_id>', methods=['POST'])
@require_role('admin')
def approve_parental_consent(user_id: str, parent_id):
    """
    Admin endpoint: Approve parent identity verification after reviewing ID documents

    Verifies that the parent is an adult with valid ID and has signed the consent form.
    After approval, the parent can create dependent profiles or link to children under 13.
    """
    try:
        admin_id = user_id
        data = request.json or {}
        review_notes = data.get('notes', '')

        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Get parent info
        parent_response = supabase.table('users').select(
            'id, display_name, email, parental_consent_status, role'
        ).eq('id', parent_id).execute()

        if not parent_response.data:
            raise NotFoundError("Parent account not found")

        parent = parent_response.data[0]

        if parent.get('role') != 'parent':
            return jsonify({'error': 'User is not a parent account'}), 400

        if parent.get('parental_consent_status') != 'pending_review':
            return jsonify({'error': 'Identity verification is not pending review'}), 400

        # Approve parent identity
        supabase.table('users').update({
            'parental_consent_verified': True,
            'parental_consent_verified_at': datetime.utcnow().isoformat(),
            'parental_consent_verified_by': admin_id,
            'parental_consent_status': 'approved',
            'parental_consent_token': None  # Clear any old tokens
        }).eq('id', parent_id).execute()

        # Log admin action
        supabase.table('parental_consent_log').insert({
            'user_id': parent_id,
            'child_email': '',  # Not applicable for parent identity verification
            'parent_email': parent.get('email', ''),
            'reviewed_by_admin_id': admin_id,
            'review_action': 'approved',
            'review_notes': review_notes,
            'reviewed_at': datetime.utcnow().isoformat(),
            'ip_address': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', '')
        }).execute()

        # Send approval email to parent
        email_service.send_templated_email(
            to_email=parent.get('email'),
            subject='Identity Verification Approved - Optio Education',
            template_name='parent_consent_approved',
            context={
                'parent_name': parent.get('display_name', 'Parent'),
                'login_url': f"{Config.FRONTEND_URL}/login"
            }
        )

        logger.info(f"Admin {admin_id} approved parent identity verification for {parent_id}")

        return jsonify({
            'message': 'Parent identity verification approved successfully',
            'parent_id': parent_id,
            'approved_by': admin_id,
            'status': 'approved'
        }), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error approving parent identity: {str(e)}")
        return jsonify({'error': 'Failed to approve parent identity verification'}), 500

@bp.route('/admin/parental-consent/reject/<parent_id>', methods=['POST'])
@require_role('admin')
def reject_parental_consent(user_id: str, parent_id):
    """
    Admin endpoint: Reject parent identity verification (e.g., unclear documents, fraudulent)

    Rejects the parent's identity verification if documents don't meet requirements.
    Parent can resubmit with clearer documents.
    """
    try:
        admin_id = user_id
        data = request.json or {}
        rejection_reason = data.get('reason', 'Documents did not meet verification requirements')

        if not rejection_reason:
            raise ValidationError("Rejection reason is required")

        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Get parent info
        parent_response = supabase.table('users').select(
            'id, display_name, email, parental_consent_status, role'
        ).eq('id', parent_id).execute()

        if not parent_response.data:
            raise NotFoundError("Parent account not found")

        parent = parent_response.data[0]

        if parent.get('role') != 'parent':
            return jsonify({'error': 'User is not a parent account'}), 400

        if parent.get('parental_consent_status') != 'pending_review':
            return jsonify({'error': 'Identity verification is not pending review'}), 400

        # Reject parent identity verification
        supabase.table('users').update({
            'parental_consent_verified': False,
            'parental_consent_status': 'rejected',
            'parental_consent_rejection_reason': rejection_reason,
            'parental_consent_id_document_url': None,  # Clear rejected documents
            'parental_consent_signed_form_url': None
        }).eq('id', parent_id).execute()

        # Log admin action
        supabase.table('parental_consent_log').insert({
            'user_id': parent_id,
            'child_email': '',  # Not applicable for parent identity verification
            'parent_email': parent.get('email', ''),
            'reviewed_by_admin_id': admin_id,
            'review_action': 'rejected',
            'review_notes': rejection_reason,
            'reviewed_at': datetime.utcnow().isoformat(),
            'ip_address': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', '')
        }).execute()

        # Send rejection email to parent with reason
        email_service.send_templated_email(
            to_email=parent.get('email'),
            subject='Identity Verification - Additional Information Needed',
            template_name='parent_consent_rejected',
            context={
                'parent_name': parent.get('display_name', 'Parent'),
                'rejection_reason': rejection_reason,
                'resubmit_url': f"{Config.FRONTEND_URL}/parental-consent"
            }
        )

        logger.info(f"Admin {admin_id} rejected parent identity verification for {parent_id}: {rejection_reason}")

        return jsonify({
            'message': 'Parent identity verification rejected',
            'parent_id': parent_id,
            'rejected_by': admin_id,
            'reason': rejection_reason,
            'status': 'rejected'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error rejecting parent identity: {str(e)}")
        return jsonify({'error': 'Failed to reject parent identity verification'}), 500


# =============================================================================
# FERPA COMPLIANCE: Portfolio Visibility Approval (Added 2026-01-02)
# Parents must approve before minors can make their portfolios public
# =============================================================================

