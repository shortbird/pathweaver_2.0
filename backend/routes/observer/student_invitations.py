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

    @bp.route('/api/observers/generate-link', methods=['POST'])
    @require_auth
    @rate_limit(limit=10, per=3600)  # 10 links per hour
    def generate_observer_invite_link(user_id):
        """
        Student generates a shareable invitation link for observers.

        No email or name required - the link can be shared with anyone.
        Cancels any existing pending link-based invitation from this student
        before creating a new one.

        Returns:
            200: shareable_link, expires_at
            429: Rate limit exceeded
        """
        try:
            # admin client justified: student-side observer-invite mgmt; verifies caller is the student and writes observer_invitations / observer_invitation_students scoped to self
            supabase = get_supabase_admin_client()

            # Get student name for the invitation record
            student = supabase.table('users').select('first_name, last_name, display_name').eq('id', user_id).single().execute()
            student_name = student.data.get('display_name') or f"{student.data.get('first_name', '')} {student.data.get('last_name', '')}".strip() or 'Student'

            # Cancel any existing pending link-based invitations from this student
            supabase.table('observer_invitations') \
                .delete() \
                .eq('student_id', user_id) \
                .eq('invited_by_role', 'student') \
                .eq('status', 'pending') \
                .execute()

            # Generate unique invitation code
            invitation_code = secrets.token_urlsafe(32)

            # Set expiration (7 days)
            expires_at = datetime.utcnow() + timedelta(days=7)

            # Create invitation (link-based, no email required)
            placeholder_email = f"pending-{invitation_code[:8]}@invite.optio.local"
            invitation = supabase.table('observer_invitations').insert({
                'student_id': user_id,
                'observer_email': placeholder_email,
                'observer_name': 'Observer',
                'invitation_code': invitation_code,
                'expires_at': expires_at.isoformat(),
                'invited_by_user_id': user_id,
                'invited_by_role': 'student'
            }).execute()

            logger.info(f"Student observer invite link generated: student={user_id}")

            frontend_url = get_frontend_url()
            shareable_link = f"{frontend_url}/observer/accept/{invitation_code}"

            return jsonify({
                'status': 'success',
                'invitation_id': invitation.data[0]['id'],
                'shareable_link': shareable_link,
                'expires_at': expires_at.isoformat()
            }), 200

        except Exception as e:
            logger.error(f"Failed to generate observer invite link: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to generate invitation link'}), 500


    @bp.route('/api/observers/my-invitations', methods=['GET'])
    @require_auth
    def get_my_observer_invitations(user_id):
        """
        Student views sent invitations

        Returns:
            200: List of invitations with status
        """

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
    def cancel_observer_invitation(user_id, invitation_id):
        """
        Student or parent cancels pending invitation

        Args:
            invitation_id: UUID of invitation to cancel

        Returns:
            200: Invitation cancelled
            404: Invitation not found or not authorized
        """

        try:
            # admin client justified: student-side observer-invite mgmt; verifies caller is the student and writes observer_invitations / observer_invitation_students scoped to self
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
        Student views everyone who can see their activity feed.

        Returns observers, parents, advisors, and the Optio team entry.

        Returns:
            200: { observers: [...], viewers: [...] }
                 observers = observer_student_links (removable by student)
                 viewers = all people who can see the feed (for display)
        """
        try:
            # admin client justified: student-side observer-invite mgmt; verifies caller is the student and writes observer_invitations / observer_invitation_students scoped to self
            supabase = get_supabase_admin_client()

            # --- 1) Observer links (removable) ---
            links = supabase.table('observer_student_links') \
                .select('*') \
                .eq('student_id', user_id) \
                .execute()

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
                        'observer': observer_info
                    })

            # --- 2) Build full viewers list ---
            # Platform admin emails that should be hidden (shown as "Optio" instead)
            OPTIO_EMAILS = {'tannerbowman@gmail.com', 'tyler@zionforge.com'}

            viewers = []

            # Always show Optio as first entry
            viewers.append({
                'type': 'platform',
                'name': 'Optio',
                'detail': 'Platform team',
                'removable': False
            })

            # Parents (managed_by_parent_id)
            student = supabase.table('users') \
                .select('managed_by_parent_id, organization_id') \
                .eq('id', user_id) \
                .single() \
                .execute()

            parent_ids = set()
            if student.data and student.data.get('managed_by_parent_id'):
                parent_ids.add(student.data['managed_by_parent_id'])

            # Parents from parent_student_links
            parent_links = supabase.table('parent_student_links') \
                .select('parent_user_id') \
                .eq('student_user_id', user_id) \
                .eq('status', 'approved') \
                .execute()
            for pl in (parent_links.data or []):
                parent_ids.add(pl['parent_user_id'])

            if parent_ids:
                parents = supabase.table('users') \
                    .select('id, email, first_name, last_name, display_name') \
                    .in_('id', list(parent_ids)) \
                    .execute()
                for p in (parents.data or []):
                    if p.get('email', '').lower() in OPTIO_EMAILS:
                        continue
                    name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or p.get('display_name') or 'Parent'
                    viewers.append({
                        'type': 'parent',
                        'name': name,
                        'detail': 'Parent',
                        'removable': False
                    })

            # Advisors assigned to this student
            try:
                advisor_links = supabase.table('advisor_student_assignments') \
                    .select('advisor_id') \
                    .eq('student_id', user_id) \
                    .execute()
                advisor_ids = [al['advisor_id'] for al in (advisor_links.data or [])]
                if advisor_ids:
                    advisors = supabase.table('users') \
                        .select('id, email, first_name, last_name, display_name') \
                        .in_('id', advisor_ids) \
                        .execute()
                    for a in (advisors.data or []):
                        if a.get('email', '').lower() in OPTIO_EMAILS:
                            continue
                        name = f"{a.get('first_name', '')} {a.get('last_name', '')}".strip() or a.get('display_name') or 'Advisor'
                        viewers.append({
                            'type': 'advisor',
                            'name': name,
                            'detail': 'Advisor',
                            'removable': False
                        })
            except Exception:
                # advisor_student_assignments table may not exist
                logger.debug("intentional swallow", exc_info=True)

            # Observers (from links above, excluding Optio emails)
            for obs_entry in observers_data:
                obs = obs_entry.get('observer', {})
                if obs.get('email', '').lower() in OPTIO_EMAILS:
                    continue
                name = f"{obs.get('first_name', '')} {obs.get('last_name', '')}".strip() or obs.get('display_name') or obs.get('email') or 'Observer'
                viewers.append({
                    'type': 'observer',
                    'name': name,
                    'detail': 'Observer',
                    'link_id': obs_entry.get('id'),
                    'removable': True
                })

            return jsonify({
                'observers': observers_data,
                'viewers': viewers
            }), 200

        except Exception as e:
            logger.error(f"Failed to fetch observers: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch observers'}), 500


    @bp.route('/api/observers/<link_id>/remove', methods=['DELETE'])
    @require_auth
    @validate_uuid_param('link_id')
    def remove_observer(user_id, link_id):
        """
        Student removes observer access

        Args:
            link_id: UUID of observer-student link to remove

        Returns:
            200: Observer access removed
            404: Link not found or not owned by student
        """

        try:
            # admin client justified: student-side observer-invite mgmt; verifies caller is the student and writes observer_invitations / observer_invitation_students scoped to self
            supabase = get_supabase_admin_client()

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
