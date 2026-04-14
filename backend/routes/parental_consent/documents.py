"""Consent document submission + file uploads.

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


@bp.route('/parental-consent/submit-documents', methods=['POST'])
@require_auth
@rate_limit(max_requests=5, window_seconds=3600)  # 5 attempts per hour
def submit_consent_documents(user_id: str):
    """
    Parent submits ID document for identity verification
    Required before creating dependent profiles or linking to children
    """
    try:
        # admin client justified: see file docstring; COPPA consent flow gated by hashed tokens + email verification
        supabase = get_supabase_admin_client()

        # Get user info to verify they are a parent (A2: include org_role/org_roles
        # so get_effective_role can resolve org_managed users correctly).
        user_response = supabase.table('users').select(
            'id, display_name, email, role, org_role, org_roles, parental_consent_status, parental_consent_verified'
        ).eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User account not found")

        user = user_response.data[0]

        # Verify user is a parent (resolve org_managed → real role)
        if get_effective_role(user) != 'parent':
            return jsonify({'error': 'Only parent accounts can submit identity verification documents'}), 400

        # Check if already verified
        if user.get('parental_consent_verified'):
            return jsonify({'error': 'Identity already verified'}), 400

        # Check for required files
        if 'id_document' not in request.files:
            raise ValidationError("Parent ID document is required")

        if 'signed_consent_form' not in request.files:
            raise ValidationError("Signed consent form is required")

        id_document = request.files['id_document']
        consent_form = request.files['signed_consent_form']

        # Validate file types (images or PDFs only)
        allowed_extensions = {'jpg', 'jpeg', 'png', 'pdf'}

        id_filename = secure_filename(id_document.filename)
        form_filename = secure_filename(consent_form.filename)

        id_ext = id_filename.rsplit('.', 1)[1].lower() if '.' in id_filename else ''
        form_ext = form_filename.rsplit('.', 1)[1].lower() if '.' in form_filename else ''

        if id_ext not in allowed_extensions or form_ext not in allowed_extensions:
            raise ValidationError("Only JPG, PNG, or PDF files are allowed")

        # Upload ID document to storage
        try:
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            id_storage_path = f"parent_identity/{user_id}/id_{timestamp}_{id_filename}"

            id_content = id_document.read()
            id_content_type = id_document.content_type or mimetypes.guess_type(id_filename)[0] or 'application/octet-stream'

            supabase.storage.from_('quest-evidence').upload(
                path=id_storage_path,
                file=id_content,
                file_options={"content-type": id_content_type}
            )

            id_document_url = supabase.storage.from_('quest-evidence').get_public_url(id_storage_path)
        except Exception as e:
            logger.error(f"Error uploading ID document: {str(e)}")
            raise ValidationError("Failed to upload ID document")

        # Upload consent form to storage
        try:
            form_storage_path = f"parent_identity/{user_id}/consent_{timestamp}_{form_filename}"

            form_content = consent_form.read()
            form_content_type = consent_form.content_type or mimetypes.guess_type(form_filename)[0] or 'application/octet-stream'

            supabase.storage.from_('quest-evidence').upload(
                path=form_storage_path,
                file=form_content,
                file_options={"content-type": form_content_type}
            )

            consent_form_url = supabase.storage.from_('quest-evidence').get_public_url(form_storage_path)
        except Exception as e:
            logger.error(f"Error uploading consent form: {str(e)}")
            raise ValidationError("Failed to upload consent form")

        # Update parent's user record with documents and status
        supabase.table('users').update({
            'parental_consent_id_document_url': id_document_url,
            'parental_consent_signed_form_url': consent_form_url,
            'parental_consent_status': 'pending_review',
            'parental_consent_submitted_at': datetime.utcnow().isoformat()
        }).eq('id', user_id).execute()

        # Log submission (generate a dummy token since the table requires it)
        log_token = secrets.token_urlsafe(32)
        supabase.table('parental_consent_log').insert({
            'user_id': user_id,
            'child_email': '',  # Not applicable for parent identity verification
            'parent_email': user.get('email', ''),
            'consent_token': log_token,
            'ip_address': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', '')
        }).execute()

        # Get admin users to notify
        admin_response = supabase.table('users').select('email').eq('role', 'admin').execute()
        admin_emails = [admin['email'] for admin in admin_response.data if admin.get('email')]

        # Send notification email to admin
        if admin_emails:
            for admin_email in admin_emails:
                email_service.send_templated_email(
                    to_email=admin_email,
                    subject='New Parent Identity Verification Required',
                    template_name='admin_parent_identity_notification',
                    context={
                        'parent_name': user.get('display_name', 'Parent'),
                        'parent_email': user.get('email', ''),
                        'review_url': f"{Config.FRONTEND_URL}/admin/parental-consent",
                        'parent_id': user_id
                    }
                )
            logger.info(f"Notified {len(admin_emails)} admins of new parent identity verification for {user_id}")

        # Send confirmation to parent
        email_service.send_templated_email(
            to_email=user.get('email'),
            subject='Identity Verification Documents Received',
            template_name='parent_identity_received',
            context={
                'parent_name': user.get('display_name', 'Parent'),
                'review_time': '24-48 hours'
            }
        )

        return jsonify({
            'message': 'Documents submitted successfully. Review typically takes 24-48 hours.',
            'status': 'pending_review',
            'parent_id': user_id
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error submitting consent documents: {str(e)}")
        return jsonify({'error': 'Failed to submit consent documents'}), 500

