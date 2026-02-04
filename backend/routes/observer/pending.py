"""
Observer Module - Pending Invitations

Pending invitation retrieval for observers.
"""

from flask import request, jsonify
from datetime import datetime, timedelta
import logging

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit

logger = logging.getLogger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/api/observers/pending-invitations', methods=['GET'])
    @require_auth
    def get_pending_invitations_for_observer():
        """
        Get pending invitations for the current user's email

        Useful for observers to see invitations before accepting

        Returns:
            200: List of pending invitations
        """
        user_id = request.user_id

        try:
            supabase = get_supabase_admin_client()

            # Get user's email
            user = supabase.table('users') \
                .select('email') \
                .eq('id', user_id) \
                .execute()

            if not user.data:
                return jsonify({'error': 'User not found'}), 404

            email = user.data[0]['email']

            # Find pending invitations
            invitations = supabase.table('observer_invitations') \
                .select('*') \
                .eq('observer_email', email) \
                .eq('status', 'pending') \
                .execute()

            # Fetch student details separately
            student_ids = list(set([inv['student_id'] for inv in invitations.data]))

            invitations_data = invitations.data
            if student_ids:
                students = supabase.table('users') \
                    .select('id, first_name, last_name, display_name') \
                    .in_('id', student_ids) \
                    .execute()

                # Create lookup map
                student_map = {student['id']: student for student in students.data}

                # Add student details to each invitation
                for invitation in invitations_data:
                    invitation['student'] = student_map.get(invitation['student_id'], {})

            return jsonify({'invitations': invitations_data}), 200

        except Exception as e:
            logger.error(f"Failed to fetch pending invitations: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch invitations'}), 500
