"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- Multiple direct database calls to 'promo_signups' and 'consultation_requests' tables (6+ calls)
- Uses EmailService and CampaignAutomationService (service layer)
- Could create PromoRepository with methods:
  - create_signup(signup_data)
  - create_consultation_request(request_data)
  - get_all_signups() (admin only)
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import logging
import secrets
import string
from database import get_supabase_client, get_supabase_admin_client
from middleware.rate_limiter import rate_limit
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
from services.email_service import email_service
from utils.auth.decorators import require_admin

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)
promo_bp = Blueprint('promo', __name__)

@promo_bp.route('/signup', methods=['POST'])
def promo_signup():
    """Handle promo landing page signup form submissions"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['parentName', 'email', 'teenAge']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        # Validate email format (basic)
        email = data['email']
        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Invalid email format'}), 400
        
        # Validate teen age
        try:
            teen_age = int(data['teenAge'])
            if teen_age < 13 or teen_age > 18:
                return jsonify({'error': 'Teen age must be between 13 and 18'}), 400
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid teen age'}), 400

        # Admin client: Public form submission (ADR-002, Rule 2)
        supabase = get_supabase_admin_client()
        
        # Insert promo signup data
        signup_data = {
            'parent_name': data['parentName'],
            'email': email,
            'teen_age': teen_age,
            'activity': data.get('activity', ''),  # Optional field
            'created_at': datetime.utcnow().isoformat(),
            'source': 'promo_landing_page'
        }
        
        result = supabase.table('promo_signups').insert(signup_data).execute()
        
        if result.data:
            logger.info(f"Promo signup recorded: {email}")
            
            # Send welcome email to parent
            try:
                email_sent = email_service.send_promo_welcome_email(
                    parent_email=email,
                    parent_name=data['parentName'],
                    teen_age=str(teen_age),
                    activity=data.get('activity', '')
                )
                if email_sent:
                    logger.info(f"Welcome email sent to {email}")
                else:
                    logger.warning(f"Failed to send welcome email to {email}")
            except Exception as e:
                logger.error(f"Error sending welcome email to {email}: {str(e)}")
            
            return jsonify({
                'success': True,
                'message': 'Signup recorded successfully',
                'id': result.data[0]['id']
            }), 201
        else:
            logger.error(f"Failed to record promo signup: {email}")
            return jsonify({'error': 'Failed to record signup'}), 500
    
    except Exception as e:
        logger.error(f"Error in promo signup: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@promo_bp.route('/consultation', methods=['POST'])
def consultation_request():
    """Handle consultation booking form submissions"""
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['parentName', 'email']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        # Validate email format (basic)
        email = data['email']
        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Invalid email format'}), 400

        # Admin client: Public form submission (ADR-002, Rule 2)
        supabase = get_supabase_admin_client()

        # Insert consultation request data
        consultation_data = {
            'parent_name': data['parentName'],
            'email': email,
            'phone': data.get('phone', ''),
            'notes': data.get('notes', ''),
            'created_at': datetime.utcnow().isoformat(),
            'status': 'pending',
            'source': 'consultation_page'
        }

        result = supabase.table('consultation_requests').insert(consultation_data).execute()

        if result.data:
            logger.info(f"Consultation request recorded: {email}")

            # Send confirmation email to parent
            try:
                email_sent = email_service.send_consultation_confirmation_email(
                    parent_email=email,
                    parent_name=data['parentName']
                )
                if email_sent:
                    logger.info(f"Consultation confirmation email sent to {email}")
                else:
                    logger.warning(f"Failed to send consultation confirmation email to {email}")
            except Exception as e:
                logger.error(f"Error sending consultation confirmation email to {email}: {str(e)}")

            return jsonify({
                'success': True,
                'message': 'Consultation request recorded successfully',
                'id': result.data[0]['id']
            }), 201
        else:
            logger.error(f"Failed to record consultation request: {email}")
            return jsonify({'error': 'Failed to record consultation request'}), 500

    except Exception as e:
        logger.error(f"Error in consultation request: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@promo_bp.route('/credit-tracker', methods=['POST'])
def credit_tracker_signup():
    """Handle credit tracker landing page signup form submissions"""
    try:
        data = request.get_json()

        # Validate required fields
        if not data.get('email'):
            return jsonify({'error': 'Email is required'}), 400

        # Validate email format
        email = data['email']
        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Invalid email format'}), 400

        # Admin client: Public form submission (ADR-002, Rule 2)
        supabase = get_supabase_admin_client()

        # Store curriculum info in activity field
        current_curriculum = data.get('currentCurriculum', '')
        user_name = data.get('name', '').strip()  # Get name from form

        # Insert signup data (matches promo_signups table schema)
        signup_data = {
            'parent_name': user_name if user_name else None,  # Store user's name
            'email': email,
            'teen_age': None,  # Not collected by this form
            'activity': current_curriculum,  # Store curriculum selection here
            'created_at': datetime.utcnow().isoformat(),
            'source': 'credit-tracker'
        }

        result = supabase.table('promo_signups').insert(signup_data).execute()

        if result.data:
            logger.info(f"Credit tracker signup recorded: {email}")

            # Start CRM sequence for credit tracker
            try:
                from services.campaign_automation_service import CampaignAutomationService
                automation_service = CampaignAutomationService()

                # Get user's name from form data (field is 'name' in the form)
                user_name = data.get('name', 'there').strip() or 'there'

                automation_service.start_sequence_by_email(
                    sequence_name='promo_credit_tracker',
                    email=email,
                    context={
                        'parent_email': email,
                        'parent_name': user_name,
                        'user_name': user_name,  # Also provide as user_name for templates
                        'first_name': user_name.split()[0] if user_name != 'there' else 'there',  # Extract first name
                        'teen_age_text': '',
                        'activity_text': f" We're excited to hear you're using {current_curriculum}." if current_curriculum else '',
                        'current_curriculum': current_curriculum or ''
                    }
                )
                logger.info(f"Started promo_credit_tracker sequence for {email}")
            except Exception as e:
                logger.error(f"Error starting sequence for {email}: {str(e)}")

            return jsonify({
                'success': True,
                'message': 'Signup recorded successfully',
                'id': result.data[0]['id']
            }), 201
        else:
            return jsonify({'error': 'Failed to record signup'}), 500

    except Exception as e:
        logger.error(f"Error in credit-tracker signup: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@promo_bp.route('/homeschool-portfolio', methods=['POST'])
def homeschool_portfolio_signup():
    """Handle homeschool portfolio landing page signup form submissions"""
    try:
        data = request.get_json()

        # Validate required fields (matches current form fields)
        required_fields = ['parentName', 'email']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        # Validate email format
        email = data['email']
        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Invalid email format'}), 400

        # Admin client: Public form submission (ADR-002, Rule 2)
        supabase = get_supabase_admin_client()

        # Insert signup data
        signup_data = {
            'parent_name': data['parentName'],
            'email': email,
            'teen_age': None,  # Not collected by this form
            'activity': '',
            'created_at': datetime.utcnow().isoformat(),
            'source': 'homeschool-portfolio'
        }

        result = supabase.table('promo_signups').insert(signup_data).execute()

        if result.data:
            logger.info(f"Homeschool portfolio signup recorded: {email}")

            # Start CRM sequence for homeschool portfolio
            try:
                from services.campaign_automation_service import CampaignAutomationService
                automation_service = CampaignAutomationService()

                automation_service.start_sequence_by_email(
                    sequence_name='promo_homeschool_portfolio',
                    email=email,
                    context={
                        'parent_email': email,
                        'parent_name': data['parentName'],
                        'teen_age_text': '',
                        'activity_text': ''
                    }
                )
                logger.info(f"Started promo_homeschool_portfolio sequence for {email}")
            except Exception as e:
                logger.error(f"Error starting sequence for {email}: {str(e)}")

            return jsonify({
                'success': True,
                'message': 'Signup recorded successfully',
                'id': result.data[0]['id']
            }), 201
        else:
            return jsonify({'error': 'Failed to record signup'}), 500

    except Exception as e:
        logger.error(f"Error in homeschool-portfolio signup: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@promo_bp.route('/teacher-consultation', methods=['POST'])
def teacher_consultation_signup():
    """Handle teacher consultation landing page form submissions"""
    try:
        data = request.get_json()

        # Validate required fields (matches current form fields)
        required_fields = ['parentName', 'email']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        # Validate email format
        email = data['email']
        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Invalid email format'}), 400

        # Admin client: Public form submission (ADR-002, Rule 2)
        supabase = get_supabase_admin_client()

        # Store goals and phone in activity field for admin review
        activity_parts = []
        if data.get('phone'):
            activity_parts.append(f"Phone: {data['phone']}")
        if data.get('goals'):
            activity_parts.append(f"Goals: {data['goals']}")
        activity = ' | '.join(activity_parts) if activity_parts else ''

        # Insert into promo_signups table
        signup_data = {
            'parent_name': data['parentName'],
            'email': email,
            'teen_age': None,  # Not collected by this form
            'activity': activity,
            'created_at': datetime.utcnow().isoformat(),
            'source': 'teacher-consultation'
        }

        result = supabase.table('promo_signups').insert(signup_data).execute()

        if result.data:
            logger.info(f"Teacher consultation request recorded: {email}")

            # Start CRM sequence for teacher consultation
            try:
                from services.campaign_automation_service import CampaignAutomationService
                automation_service = CampaignAutomationService()

                automation_service.start_sequence_by_email(
                    sequence_name='promo_teacher_consultation',
                    email=email,
                    context={
                        'parent_email': email,
                        'parent_name': data['parentName'],
                        'phone': data.get('phone', ''),
                        'goals': data.get('goals', '')
                    }
                )
                logger.info(f"Started promo_teacher_consultation sequence for {email}")
            except Exception as e:
                logger.error(f"Error starting sequence for {email}: {str(e)}")

            return jsonify({
                'success': True,
                'message': 'Consultation request recorded successfully',
                'id': result.data[0]['id']
            }), 201
        else:
            return jsonify({'error': 'Failed to record consultation request'}), 500

    except Exception as e:
        logger.error(f"Error in teacher-consultation request: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

def generate_promo_code():
    """Generate a unique promo code in format OPTIO-XXXX-XXXX"""
    # Use only uppercase letters and digits that are easy to read (no 0, O, I, L)
    chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    part1 = ''.join(secrets.choice(chars) for _ in range(4))
    part2 = ''.join(secrets.choice(chars) for _ in range(4))
    return f"OPTIO-{part1}-{part2}"


@promo_bp.route('/first-month-free', methods=['POST'])
@rate_limit(max_requests=3, window_seconds=3600)  # 3 requests per hour per IP
def generate_first_month_free_code():
    """Generate a first month free promo code and send it via email"""
    try:
        data = request.get_json()

        # Validate email
        email = data.get('email', '').strip().lower()
        if not email or '@' not in email or '.' not in email:
            return jsonify({'error': 'Valid email is required'}), 400

        name = data.get('name', '').strip()

        # Admin client: Public form submission
        supabase = get_supabase_admin_client()

        # Generate unique code with retry logic
        max_attempts = 10
        code = None
        for _ in range(max_attempts):
            candidate = generate_promo_code()
            # Check if code already exists
            existing = supabase.table('promo_codes').select('id').eq('code', candidate).execute()
            if not existing.data:
                code = candidate
                break

        if not code:
            logger.error("Failed to generate unique promo code after max attempts")
            return jsonify({'error': 'Failed to generate promo code. Please try again.'}), 500

        # Calculate expiration (30 days from now)
        expires_at = (datetime.utcnow() + timedelta(days=30)).isoformat()

        # Insert promo code
        promo_data = {
            'code': code,
            'email': email,
            'name': name if name else None,
            'promotion_type': 'first_month_free',
            'target_role': 'parent',
            'status': 'pending',
            'expires_at': expires_at,
            'created_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('promo_codes').insert(promo_data).execute()

        if result.data:
            logger.info(f"Generated promo code {code} for {email}")

            # Send email with promo code
            try:
                email_sent = email_service.send_promo_code_email(
                    to_email=email,
                    name=name if name else 'there',
                    promo_code=code
                )
                if email_sent:
                    logger.info(f"Promo code email sent to {email}")
                else:
                    logger.warning(f"Failed to send promo code email to {email}")
            except Exception as e:
                logger.error(f"Error sending promo code email to {email}: {str(e)}")

            return jsonify({
                'success': True,
                'message': 'Check your email for your promo code!'
            }), 201
        else:
            logger.error(f"Failed to insert promo code for {email}")
            return jsonify({'error': 'Failed to generate promo code'}), 500

    except Exception as e:
        logger.error(f"Error generating first month free code: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@promo_bp.route('/validate-code', methods=['POST'])
def validate_promo_code():
    """Validate a promo code without redeeming it"""
    try:
        data = request.get_json()

        code = data.get('code', '').strip().upper()
        if not code:
            return jsonify({'valid': False, 'reason': 'not_found'}), 200

        # Admin client to bypass RLS
        supabase = get_supabase_admin_client()

        # Look up the code
        result = supabase.table('promo_codes').select('*').eq('code', code).execute()

        if not result.data:
            return jsonify({'valid': False, 'reason': 'not_found'}), 200

        promo = result.data[0]

        # Check status
        if promo['status'] == 'redeemed':
            return jsonify({'valid': False, 'reason': 'already_used'}), 200

        if promo['status'] == 'expired':
            return jsonify({'valid': False, 'reason': 'expired'}), 200

        # Check expiration date
        expires_at = datetime.fromisoformat(promo['expires_at'].replace('Z', '+00:00'))
        if datetime.now(expires_at.tzinfo) > expires_at:
            # Mark as expired in the database
            supabase.table('promo_codes').update({'status': 'expired'}).eq('id', promo['id']).execute()
            return jsonify({'valid': False, 'reason': 'expired'}), 200

        # Code is valid
        return jsonify({
            'valid': True,
            'promotion_type': promo['promotion_type'],
            'target_role': promo['target_role']
        }), 200

    except Exception as e:
        logger.error(f"Error validating promo code: {str(e)}")
        return jsonify({'valid': False, 'reason': 'error'}), 200


@promo_bp.route('/signups', methods=['GET'])
@require_admin
def get_promo_signups(user_id):
    """Get all promo signups (admin only - basic version for now)"""
    try:
        supabase = get_supabase_client()

        result = supabase.table('promo_signups').select('*').order('created_at', desc=True).execute()

        if result.data:
            return jsonify({
                'success': True,
                'signups': result.data,
                'total': len(result.data)
            }), 200
        else:
            return jsonify({
                'success': True,
                'signups': [],
                'total': 0
            }), 200

    except Exception as e:
        logger.error(f"Error fetching promo signups: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500