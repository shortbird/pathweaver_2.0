from flask import Blueprint, request, jsonify
from datetime import datetime
import logging
from database import get_supabase_client, get_supabase_admin_client
from backend.repositories import (
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

        # Use admin client for public form submissions
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

        # Use admin client for public form submissions
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