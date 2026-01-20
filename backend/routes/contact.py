"""
Contact form handling for demo requests and general inquiries.
Stores submissions in database and optionally sends email notifications.
"""

from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from datetime import datetime
import os

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('contact', __name__)


@bp.route('/contact', methods=['POST'])
def submit_contact():
    """
    Handle contact form submissions (demo requests, sales inquiries, general contact).

    Request body:
    - name: string (required)
    - email: string (required)
    - organization: string (optional)
    - message: string (optional)
    - type: string (optional, defaults to 'general') - 'demo', 'sales', or 'general'

    Returns 200 on success, 400 on validation error, 500 on server error.
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body required'}), 400

        # Validate required fields
        name = data.get('name', '').strip()
        email = data.get('email', '').strip()

        if not name:
            return jsonify({'error': 'Name is required'}), 400
        if not email:
            return jsonify({'error': 'Email is required'}), 400

        # Basic email validation
        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Invalid email address'}), 400

        # Optional fields
        organization = data.get('organization', '').strip()
        message = data.get('message', '').strip()
        contact_type = data.get('type', 'general').strip()

        # Validate contact type
        valid_types = ['demo', 'sales', 'general']
        if contact_type not in valid_types:
            contact_type = 'general'

        # Store in database
        supabase = get_supabase_admin_client()

        submission_data = {
            'name': name,
            'email': email,
            'organization': organization if organization else None,
            'message': message if message else None,
            'contact_type': contact_type,
            'created_at': datetime.utcnow().isoformat(),
            'status': 'new'
        }

        result = supabase.table('contact_submissions').insert(submission_data).execute()

        if not result.data:
            logger.error('Failed to store contact submission')
            return jsonify({'error': 'Failed to submit form'}), 500

        logger.info(f"Contact form submitted: type={contact_type}, email={email}")

        # Optionally send email notification (if configured)
        # This could be enhanced with SendGrid, Resend, or other email service
        notification_email = os.environ.get('CONTACT_NOTIFICATION_EMAIL')
        if notification_email:
            try:
                _send_notification_email(notification_email, submission_data)
            except Exception as e:
                # Don't fail the request if email fails
                logger.warning(f"Failed to send notification email: {e}")

        return jsonify({
            'success': True,
            'message': 'Thank you for your submission. We will be in touch soon.'
        }), 200

    except Exception as e:
        logger.error(f"Contact form error: {e}")
        return jsonify({'error': 'An unexpected error occurred'}), 500


def _send_notification_email(to_email: str, submission: dict):
    """
    Send email notification about new contact form submission.
    Currently a placeholder - can be implemented with SendGrid, Resend, etc.
    """
    # TODO: Implement email sending
    # For now, just log the submission
    logger.info(f"Would send notification to {to_email} about submission from {submission['email']}")
    pass
