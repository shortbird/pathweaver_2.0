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

NOTE: Admin client usage justified throughout this file for consent management.
Managing parental consent requires cross-user operations and system-level privileges.
"""
from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import (
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
from middleware.error_handler import ValidationError, NotFoundError
from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_auth, require_role
from services.email_service import email_service
from werkzeug.utils import secure_filename
import secrets
import hashlib
from datetime import datetime, timedelta
import logging
import os
import mimetypes

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

bp = Blueprint('parental_consent', __name__)

def generate_consent_token():
    """Generate a secure random token for parental consent verification"""
    return secrets.token_urlsafe(32)

def hash_token(token):
    """Hash the token for secure storage"""
    return hashlib.sha256(token.encode()).hexdigest()

# Using repository pattern for database access
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

@bp.route('/parental-consent/submit-documents', methods=['POST'])
@require_auth
@rate_limit(max_requests=5, window_seconds=3600)  # 5 attempts per hour
def submit_consent_documents(user_id: str):
    """
    Parent submits ID document for identity verification
    Required before creating dependent profiles or linking to children
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user info to verify they are a parent
        user_response = supabase.table('users').select(
            'id, display_name, email, role, parental_consent_status, parental_consent_verified'
        ).eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User account not found")

        user = user_response.data[0]

        # Verify user is a parent
        if user.get('role') != 'parent':
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
                        'review_url': f"{os.getenv('FRONTEND_URL')}/admin/parental-consent",
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

@bp.route('/admin/parental-consent/pending', methods=['GET'])
@require_role('admin')
def get_pending_consent_reviews(user_id: str):
    """
    Admin endpoint: Get all pending parental consent reviews
    """
    try:
        supabase = get_supabase_admin_client()

        # Get all users with pending consent reviews
        pending_response = supabase.table('users').select(
            'id, display_name, email, parental_consent_email, parental_consent_submitted_at, '
            'parental_consent_id_document_url, parental_consent_signed_form_url, '
            'parental_consent_status, date_of_birth'
        ).eq('parental_consent_status', 'pending_review').order('parental_consent_submitted_at').execute()

        pending_reviews = []
        for user in pending_response.data:
            # Calculate age for context
            age = None
            if user.get('date_of_birth'):
                dob = datetime.fromisoformat(user['date_of_birth'].replace('Z', '+00:00'))
                age = (datetime.now() - dob).days // 365

            pending_reviews.append({
                'child_id': user['id'],
                'child_name': user.get('display_name', 'Unknown'),
                'child_email': user.get('email'),
                'parent_email': user.get('parental_consent_email'),
                'submitted_at': user.get('parental_consent_submitted_at'),
                'id_document_url': user.get('parental_consent_id_document_url'),
                'consent_form_url': user.get('parental_consent_signed_form_url'),
                'child_age': age,
                'status': user.get('parental_consent_status')
            })

        return jsonify({
            'pending_reviews': pending_reviews,
            'count': len(pending_reviews)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching pending consent reviews: {str(e)}")
        return jsonify({'error': 'Failed to fetch pending reviews'}), 500

@bp.route('/admin/parental-consent/approve/<child_id>', methods=['POST'])
@require_role('admin')
def approve_parental_consent(user_id: str, child_id):
    """
    Admin endpoint: Approve parental consent after reviewing ID documents
    """
    try:
        admin_id = user_id
        data = request.json or {}
        review_notes = data.get('notes', '')

        supabase = get_supabase_admin_client()

        # Get child info
        child_response = supabase.table('users').select(
            'id, display_name, parental_consent_email, parental_consent_status'
        ).eq('id', child_id).execute()

        if not child_response.data:
            raise NotFoundError("Child account not found")

        child = child_response.data[0]

        if child.get('parental_consent_status') != 'pending_review':
            return jsonify({'error': 'Consent is not pending review'}), 400

        # Approve consent
        supabase.table('users').update({
            'parental_consent_verified': True,
            'parental_consent_verified_at': datetime.utcnow().isoformat(),
            'parental_consent_verified_by': admin_id,
            'parental_consent_status': 'approved',
            'parental_consent_token': None  # Clear any old tokens
        }).eq('id', child_id).execute()

        # Log admin action
        supabase.table('parental_consent_log').insert({
            'user_id': child_id,
            'child_email': child.get('email', ''),
            'parent_email': child.get('parental_consent_email', ''),
            'reviewed_by_admin_id': admin_id,
            'review_action': 'approved',
            'review_notes': review_notes,
            'reviewed_at': datetime.utcnow().isoformat(),
            'ip_address': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', '')
        }).execute()

        # Send approval email to parent
        if child.get('parental_consent_email'):
            email_service.send_templated_email(
                to_email=child.get('parental_consent_email'),
                subject='Parental Consent Approved',
                template_name='parent_consent_approved',
                context={
                    'child_name': child.get('display_name', 'Student'),
                    'login_url': f"{os.getenv('FRONTEND_URL')}/login"
                }
            )

        logger.info(f"Admin {admin_id} approved parental consent for child {child_id}")

        return jsonify({
            'message': 'Parental consent approved successfully',
            'child_id': child_id,
            'approved_by': admin_id,
            'status': 'approved'
        }), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error approving parental consent: {str(e)}")
        return jsonify({'error': 'Failed to approve parental consent'}), 500

@bp.route('/admin/parental-consent/reject/<child_id>', methods=['POST'])
@require_role('admin')
def reject_parental_consent(user_id: str, child_id):
    """
    Admin endpoint: Reject parental consent (e.g., unclear documents, fraudulent)
    """
    try:
        admin_id = user_id
        data = request.json or {}
        rejection_reason = data.get('reason', 'Documents did not meet verification requirements')

        if not rejection_reason:
            raise ValidationError("Rejection reason is required")

        supabase = get_supabase_admin_client()

        # Get child info
        child_response = supabase.table('users').select(
            'id, display_name, parental_consent_email, parental_consent_status'
        ).eq('id', child_id).execute()

        if not child_response.data:
            raise NotFoundError("Child account not found")

        child = child_response.data[0]

        if child.get('parental_consent_status') != 'pending_review':
            return jsonify({'error': 'Consent is not pending review'}), 400

        # Reject consent
        supabase.table('users').update({
            'parental_consent_verified': False,
            'parental_consent_status': 'rejected',
            'parental_consent_rejection_reason': rejection_reason,
            'parental_consent_id_document_url': None,  # Clear rejected documents
            'parental_consent_signed_form_url': None
        }).eq('id', child_id).execute()

        # Log admin action
        supabase.table('parental_consent_log').insert({
            'user_id': child_id,
            'child_email': child.get('email', ''),
            'parent_email': child.get('parental_consent_email', ''),
            'reviewed_by_admin_id': admin_id,
            'review_action': 'rejected',
            'review_notes': rejection_reason,
            'reviewed_at': datetime.utcnow().isoformat(),
            'ip_address': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', '')
        }).execute()

        # Send rejection email to parent with reason
        if child.get('parental_consent_email'):
            email_service.send_templated_email(
                to_email=child.get('parental_consent_email'),
                subject='Parental Consent - Additional Information Needed',
                template_name='parent_consent_rejected',
                context={
                    'child_name': child.get('display_name', 'Student'),
                    'rejection_reason': rejection_reason,
                    'resubmit_url': f"{os.getenv('FRONTEND_URL')}/parental-consent"
                }
            )

        logger.info(f"Admin {admin_id} rejected parental consent for child {child_id}: {rejection_reason}")

        return jsonify({
            'message': 'Parental consent rejected',
            'child_id': child_id,
            'rejected_by': admin_id,
            'reason': rejection_reason,
            'status': 'rejected'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error rejecting parental consent: {str(e)}")
        return jsonify({'error': 'Failed to reject parental consent'}), 500