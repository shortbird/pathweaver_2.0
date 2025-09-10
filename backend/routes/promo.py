from flask import Blueprint, request, jsonify
from datetime import datetime
import logging
from database import get_supabase_client

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
        
        supabase = get_supabase_client()
        
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

@promo_bp.route('/signups', methods=['GET'])
def get_promo_signups():
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