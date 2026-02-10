"""
Observer Module - Student Invitation Endpoints

Endpoints for students to send, view, and manage observer invitations.
"""

from flask import request, jsonify
from datetime import datetime, timedelta
import secrets
import logging

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit
from .helpers import get_frontend_url

logger = logging.getLogger(__name__)


def register_routes(bp):
    """Register student invitation routes on the blueprint."""

    @bp.route('/api/observers/invite', methods=['POST'])
    @require_auth
    @rate_limit(limit=10, per=3600)  # 10 invitations per hour
    def send_observer_invitation():
        """
        Student sends invitation to observer

        Body:
            observer_email: Observer's email address
            observer_name: Observer's full name
            relationship: Type of relationship (grandparent, mentor, coach, family_friend, other)

        Returns:
            200: Invitation created with invitation_link
            400: Invalid request
            429: Rate limit exceeded
        """
        user_id = request.user_id
        data = request.json

        # Validate required fields
        if not data.get('observer_email') or not data.get('observer_name'):
            return jsonify({'error': 'observer_email and observer_name are required'}), 400

        try:
            supabase = get_supabase_admin_client()

            # Generate unique invitation code
            invitation_code = secrets.token_urlsafe(32)

            # Set expiration (7 days)
            expires_at = datetime.utcnow() + timedelta(days=7)

            # Create invitation
            invitation = supabase.table('observer_invitations').insert({
                'student_id': user_id,
                'observer_email': data['observer_email'],
                'observer_name': data['observer_name'],
                'invitation_code': invitation_code,
                'expires_at': expires_at.isoformat()
            }).execute()

            logger.info(f"Observer invitation sent: student={user_id}, email={data['observer_email']}")

            # Get student name for email
            student = supabase.table('users').select('first_name, last_name, display_name').eq('id', user_id).single().execute()
            student_name = student.data.get('display_name') or f"{student.data.get('first_name', '')} {student.data.get('last_name', '')}".strip()

            # Send email notification to observer
            frontend_url = get_frontend_url()
            invitation_link = f"{frontend_url}/observer/accept/{invitation_code}"

            from services.email_service import EmailService
            email_service = EmailService()
            email_sent = email_service.send_templated_email(
                to_email=data['observer_email'],
                subject=f"{student_name} invited you to follow their learning on Optio",
                template_name='observer_invitation',
                context={
                    'observer_name': data['observer_name'],
                    'student_name': student_name,
                    'invitation_link': invitation_link
                }
            )

            if not email_sent:
                logger.warning(f"Failed to send observer invitation email to {data['observer_email']}")

            return jsonify({
                'status': 'success',
                'invitation_id': invitation.data[0]['id'],
                'invitation_link': invitation_link,
                'expires_at': expires_at.isoformat()
            }), 200

        except Exception as e:
            logger.error(f"Failed to create observer invitation: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to create invitation'}), 500


    @bp.route('/api/observers/my-invitations', methods=['GET'])
    @require_auth
    def get_my_observer_invitations():
        """
        Student views sent invitations

        Returns:
            200: List of invitations with status
        """
        user_id = request.user_id

        try:
            supabase = get_user_client()

            invitations = supabase.table('observer_invitations') \
                .select('*') \
                .eq('student_id', user_id) \
                .order('created_at', desc=True) \
                .execute()

            return jsonify({'invitations': invitations.data}), 200

        except Exception as e:
            logger.error(f"Failed to fetch observer invitations: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch invitations'}), 500


    @bp.route('/api/observers/invitations/<invitation_id>/cancel', methods=['DELETE'])
    @require_auth
    @validate_uuid_param('invitation_id')
    def cancel_observer_invitation(invitation_id):
        """
        Student or parent cancels pending invitation

        Args:
            invitation_id: UUID of invitation to cancel

        Returns:
            200: Invitation cancelled
            404: Invitation not found or not authorized
        """
        user_id = request.user_id

        try:
            supabase = get_supabase_admin_client()

            # Get the invitation first
            invitation = supabase.table('observer_invitations') \
                .select('id, status, student_id, invited_by_user_id, invited_by_role') \
                .eq('id', invitation_id) \
                .eq('status', 'pending') \
                .execute()

            if not invitation.data:
                return jsonify({'error': 'Invitation not found'}), 404

            inv = invitation.data[0]

            # Check authorization: user is the student OR the parent who created it
            is_student = inv['student_id'] == user_id
            is_parent_creator = inv.get('invited_by_user_id') == user_id and inv.get('invited_by_role') == 'parent'

            # Also check if user is parent of the student (can cancel any invitation for their child)
            is_parent_of_student = False
            if not is_student and not is_parent_creator:
                student = supabase.table('users') \
                    .select('managed_by_parent_id') \
                    .eq('id', inv['student_id']) \
                    .single() \
                    .execute()
                if student.data and student.data.get('managed_by_parent_id') == user_id:
                    is_parent_of_student = True

            if not is_student and not is_parent_creator and not is_parent_of_student:
                return jsonify({'error': 'Not authorized to cancel this invitation'}), 403

            # Delete invitation
            supabase.table('observer_invitations') \
                .delete() \
                .eq('id', invitation_id) \
                .execute()

            logger.info(f"Observer invitation cancelled: id={invitation_id}")

            return jsonify({'status': 'success'}), 200

        except Exception as e:
            logger.error(f"Failed to cancel invitation: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to cancel invitation'}), 500


    @bp.route('/api/observers/my-observers', methods=['GET'])
    @require_auth
    def get_my_observers(user_id: str):
        """
        Student views linked observers

        Returns:
            200: List of linked observers with relationship details
        """
        try:
            supabase = get_supabase_admin_client()

            # Get observer links for this student
            links = supabase.table('observer_student_links') \
                .select('*') \
                .eq('student_id', user_id) \
                .execute()

            # Fetch observer details separately to avoid PostgREST relationship issues
            observer_ids = [link['observer_id'] for link in links.data]

            observers_data = []
            if observer_ids:
                observers = supabase.table('users') \
                    .select('id, email, first_name, last_name, display_name') \
                    .in_('id', observer_ids) \
                    .execute()

                # Create lookup map
                observer_map = {obs['id']: obs for obs in observers.data}

                # Merge link data with observer details
                for link in links.data:
                    observer_info = observer_map.get(link['observer_id'], {})
                    observers_data.append({
                        **link,
                        'observer': observer_info
                    })

            return jsonify({'observers': observers_data}), 200

        except Exception as e:
            logger.error(f"Failed to fetch observers: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch observers'}), 500


    @bp.route('/api/observers/<link_id>/remove', methods=['DELETE'])
    @require_auth
    @validate_uuid_param('link_id')
    def remove_observer(link_id):
        """
        Student removes observer access

        Args:
            link_id: UUID of observer-student link to remove

        Returns:
            200: Observer access removed
            404: Link not found or not owned by student
        """
        user_id = request.user_id

        try:
            supabase = get_user_client()

            # Verify link belongs to student
            link = supabase.table('observer_student_links') \
                .select('id') \
                .eq('id', link_id) \
                .eq('student_id', user_id) \
                .execute()

            if not link.data:
                return jsonify({'error': 'Observer link not found'}), 404

            # Delete link
            supabase.table('observer_student_links') \
                .delete() \
                .eq('id', link_id) \
                .execute()

            logger.info(f"Observer access removed: link_id={link_id}")

            return jsonify({'status': 'success'}), 200

        except Exception as e:
            logger.error(f"Failed to remove observer: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to remove observer'}), 500
