"""
Promo interest form submissions from public landing pages.
"""

from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from services.email_service import email_service
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('promo', __name__)


@bp.route('/promo/interest', methods=['POST'])
def submit_interest():
    """
    Handle interest form submissions from public promo pages.

    Request body:
    - name: string (required)
    - email: string (required)
    - classes_interested: string (optional, may contain interest type + classes + state)
    - source: string (optional, defaults to 'for-students')

    Returns 200 on success, 400 on validation error, 500 on server error.
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body required'}), 400

        name = data.get('name', '').strip()
        email = data.get('email', '').strip()

        if not name:
            return jsonify({'error': 'Name is required'}), 400
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Invalid email address'}), 400

        classes_interested = data.get('classes_interested', '').strip() or None
        source = data.get('source', 'for-students').strip()

        # admin client justified: unauthenticated promo signup form; writes to promo_signups service-role-only table
        supabase = get_supabase_admin_client()

        result = supabase.table('promo_interest').insert({
            'name': name,
            'email': email,
            'classes_interested': classes_interested,
            'source': source,
        }).execute()

        if not result.data:
            logger.error('Failed to store promo interest submission')
            return jsonify({'error': 'Failed to submit form'}), 500

        logger.info(f"Promo interest submitted: source={source}, email={email}")

        # Parse interest details from classes_interested field
        interest_individual = False
        interest_fulltime = False
        classes = ''
        state = ''

        if classes_interested:
            parts = classes_interested.split(' | ')
            for part in parts:
                if 'Individual Classes' in part:
                    interest_individual = True
                if 'Full-Time' in part:
                    interest_fulltime = True
                if part.startswith('Classes: '):
                    classes = part.replace('Classes: ', '')
                if part.startswith('State: '):
                    state = part.replace('State: ', '')

        # Default to individual if neither was selected
        if not interest_individual and not interest_fulltime:
            interest_individual = True

        # Send automated email (no try/except so errors are visible)
        email_sent = email_service.send_student_promo_email(
            email=email,
            name=name,
            interest_individual=interest_individual,
            interest_fulltime=interest_fulltime,
            classes=classes,
            state=state,
        )

        return jsonify({
            'success': True,
            'message': 'Thanks! We will reach out soon.'
        }), 200

    except Exception as e:
        logger.error(f"Promo interest form error: {e}")
        return jsonify({'error': 'An unexpected error occurred'}), 500
