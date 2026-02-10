"""
Observer Module - Parent Management

Parent-initiated observer invitation and management.
"""

from flask import request, jsonify
from datetime import datetime, timedelta
import logging
import secrets

from .helpers import get_frontend_url

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit

logger = logging.getLogger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/api/observers/parent-invite', methods=['POST'])
    @require_auth
    @rate_limit(limit=10, per=3600)  # 10 invitations per hour
    def parent_send_observer_invitation(user_id):
        """
        Parent creates shareable invitation link for observer to follow their child

        Body:
            student_id: UUID of the child/student
            relationship: Type of relationship (grandparent, aunt_uncle, family_friend, mentor, coach, other)

        Returns:
            200: Invitation created with shareable_link
            400: Invalid request
            403: Not authorized to invite for this student
            429: Rate limit exceeded
        """
        parent_id = user_id
        data = request.json

        # Validate required fields
        if not data.get('student_id'):
            return jsonify({'error': 'student_id is required'}), 400

        student_id = data['student_id']
        relationship = data.get('relationship', 'other')

        try:
            supabase = get_supabase_admin_client()

            # Verify parent role
            parent = supabase.table('users').select('role').eq('id', parent_id).single().execute()
            if not parent.data or parent.data['role'] not in ('parent', 'superadmin'):
                return jsonify({'error': 'Only parents can use this endpoint'}), 403

            # Verify parent-child relationship
            # Check if student is a dependent of this parent
            dependent = supabase.table('users') \
                .select('id, display_name, first_name, last_name') \
                .eq('id', student_id) \
                .eq('managed_by_parent_id', parent_id) \
                .execute()

            # Also check parent_student_links for linked 13+ students
            linked = None
            if not dependent.data:
                linked = supabase.table('parent_student_links') \
                    .select('id') \
                    .eq('parent_user_id', parent_id) \
                    .eq('student_user_id', student_id) \
                    .eq('status', 'approved') \
                    .execute()

            if not dependent.data and not (linked and linked.data):
                return jsonify({'error': 'You are not authorized to invite observers for this student'}), 403

            # Get student info
            student = dependent.data[0] if dependent.data else None
            if not student:
                student_result = supabase.table('users') \
                    .select('id, display_name, first_name, last_name') \
                    .eq('id', student_id) \
                    .single() \
                    .execute()
                student = student_result.data

            student_name = student.get('display_name') or f"{student.get('first_name', '')} {student.get('last_name', '')}".strip() or 'Your child'

            # Cancel any existing pending invitations from this parent for this student
            supabase.table('observer_invitations') \
                .delete() \
                .eq('student_id', student_id) \
                .eq('invited_by_user_id', parent_id) \
                .eq('status', 'pending') \
                .execute()

            # Generate unique invitation code
            invitation_code = secrets.token_urlsafe(32)

            # Set expiration (7 days)
            expires_at = datetime.utcnow() + timedelta(days=7)

            # Create invitation (no email required - link-based)
            # Use placeholder for observer_email since column has NOT NULL constraint
            placeholder_email = f"pending-{invitation_code[:8]}@invite.optio.local"
            invitation = supabase.table('observer_invitations').insert({
                'student_id': student_id,
                'observer_email': placeholder_email,  # Placeholder for link-based invites
                'observer_name': f'{relationship.replace("_", " ").title()} Observer',
                'invitation_code': invitation_code,
                'expires_at': expires_at.isoformat(),
                'invited_by_user_id': parent_id,
                'invited_by_role': 'parent'
            }).execute()

            logger.info(f"Parent observer invitation created: parent={parent_id}, student={student_id}")

            # Build shareable link
            frontend_url = get_frontend_url()
            shareable_link = f"{frontend_url}/observer/accept/{invitation_code}"

            return jsonify({
                'status': 'success',
                'invitation_id': invitation.data[0]['id'],
                'invitation_code': invitation_code,
                'shareable_link': shareable_link,
                'expires_at': expires_at.isoformat(),
                'student_name': student_name,
                'relationship': relationship
            }), 200

        except Exception as e:
            logger.error(f"Failed to create parent observer invitation: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to create invitation'}), 500


    @bp.route('/api/observers/parent-invitations/<student_id>', methods=['GET'])
    @require_auth
    @validate_uuid_param('student_id')
    def get_parent_observer_invitations(user_id, student_id):
        """
        Parent views invitations they've sent for a specific child

        Args:
            user_id: UUID of the authenticated user (from decorator)
            student_id: UUID of the child

        Returns:
            200: List of invitations with status
            403: Not authorized
        """
        parent_id = user_id

        try:
            supabase = get_supabase_admin_client()

            # Verify parent-child relationship
            dependent = supabase.table('users') \
                .select('id') \
                .eq('id', student_id) \
                .eq('managed_by_parent_id', parent_id) \
                .execute()

            linked = None
            if not dependent.data:
                linked = supabase.table('parent_student_links') \
                    .select('id') \
                    .eq('parent_user_id', parent_id) \
                    .eq('student_user_id', student_id) \
                    .eq('status', 'approved') \
                    .execute()

            if not dependent.data and not (linked and linked.data):
                return jsonify({'error': 'Not authorized'}), 403

            # Get invitations created by this parent for this student
            invitations = supabase.table('observer_invitations') \
                .select('*') \
                .eq('student_id', student_id) \
                .eq('invited_by_user_id', parent_id) \
                .order('created_at', desc=True) \
                .execute()

            return jsonify({'invitations': invitations.data}), 200

        except Exception as e:
            logger.error(f"Failed to fetch parent observer invitations: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch invitations'}), 500


    @bp.route('/api/observers/student/<student_id>/observers', methods=['GET'])
    @require_auth
    @validate_uuid_param('student_id')
    def get_observers_for_student(user_id, student_id):
        """
        Get linked observers for a specific student (accessible by parents)

        Args:
            user_id: UUID of the authenticated user (from decorator)
            student_id: UUID of the student

        Returns:
            200: List of linked observers
            403: Not authorized
        """

        try:
            supabase = get_supabase_admin_client()

            # Check if user is the student, their parent, or superadmin
            user = supabase.table('users').select('role').eq('id', user_id).single().execute()
            is_superadmin = user.data and user.data['role'] == 'superadmin'

            if not is_superadmin and user_id != student_id:
                # Check if user is parent
                dependent = supabase.table('users') \
                    .select('id') \
                    .eq('id', student_id) \
                    .eq('managed_by_parent_id', user_id) \
                    .execute()

                linked = None
                if not dependent.data:
                    linked = supabase.table('parent_student_links') \
                        .select('id') \
                        .eq('parent_user_id', user_id) \
                        .eq('student_user_id', student_id) \
                        .eq('status', 'approved') \
                        .execute()

                if not dependent.data and not (linked and linked.data):
                    return jsonify({'error': 'Not authorized'}), 403

            # Get observer links for this student
            links = supabase.table('observer_student_links') \
                .select('*') \
                .eq('student_id', student_id) \
                .execute()

            # Fetch observer details
            observer_ids = [link['observer_id'] for link in links.data]

            observers_data = []
            if observer_ids:
                observers = supabase.table('users') \
                    .select('id, email, first_name, last_name, display_name') \
                    .in_('id', observer_ids) \
                    .execute()

                observer_map = {obs['id']: obs for obs in observers.data}

                for link in links.data:
                    observer_info = observer_map.get(link['observer_id'], {})
                    observers_data.append({
                        **link,
                        'link_id': link['id'],  # Frontend expects link_id for delete operations
                        'observer': observer_info
                    })

            return jsonify({'observers': observers_data}), 200

        except Exception as e:
            logger.error(f"Failed to fetch observers for student: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch observers'}), 500


    @bp.route('/api/observers/student/<student_id>/observers/<link_id>', methods=['DELETE'])
    @require_auth
    @validate_uuid_param('student_id')
    @validate_uuid_param('link_id')
    def remove_observer_for_student(user_id, student_id, link_id):
        """
        Parent removes an observer from their child

        Args:
            user_id: UUID of the authenticated user (from decorator)
            student_id: UUID of the student
            link_id: UUID of the observer_student_links record

        Returns:
            200: Observer removed
            403: Not authorized
            404: Link not found
        """

        try:
            supabase = get_supabase_admin_client()

            # Check if user is the student, their parent, or superadmin
            user = supabase.table('users').select('role').eq('id', user_id).single().execute()
            is_superadmin = user.data and user.data['role'] == 'superadmin'

            if not is_superadmin and user_id != student_id:
                # Check if user is parent
                dependent = supabase.table('users') \
                    .select('id') \
                    .eq('id', student_id) \
                    .eq('managed_by_parent_id', user_id) \
                    .execute()

                linked = None
                if not dependent.data:
                    linked = supabase.table('parent_student_links') \
                        .select('id') \
                        .eq('parent_user_id', user_id) \
                        .eq('student_user_id', student_id) \
                        .eq('status', 'approved') \
                        .execute()

                if not dependent.data and not (linked and linked.data):
                    return jsonify({'error': 'Not authorized'}), 403

            # Verify the link exists and belongs to this student
            link = supabase.table('observer_student_links') \
                .select('id, observer_id') \
                .eq('id', link_id) \
                .eq('student_id', student_id) \
                .execute()

            if not link.data:
                return jsonify({'error': 'Observer link not found'}), 404

            # Delete the link
            supabase.table('observer_student_links') \
                .delete() \
                .eq('id', link_id) \
                .execute()

            logger.info(f"Observer removed by parent: link_id={link_id}, student_id={student_id}, removed_by={user_id}")

            return jsonify({'status': 'success'}), 200

        except Exception as e:
            logger.error(f"Failed to remove observer: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to remove observer'}), 500
