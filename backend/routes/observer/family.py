"""
Observer Module - Family Management

Family observer invitations and child access management.
"""

import re
from flask import request, jsonify
from datetime import datetime, timedelta
import logging
import secrets

from .helpers import get_frontend_url

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit
from services.email_service import email_service

logger = logging.getLogger(__name__)

# Loose email validation — server-side guard, not a substitute for the
# more permissive client-side hint. Anything obviously malformed gets rejected.
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/api/observers/family-invite', methods=['POST'])
    @require_auth
    @rate_limit(limit=10, per=3600)  # 10 invitations per hour
    def family_invite(user_id):
        """
        Parent creates shareable invitation link for observer to follow multiple children at once.

        Body:
            student_ids: List of UUIDs of children to include

        Returns:
            200: Invitation created with shareable_link
            400: Invalid request
            403: Not authorized to invite for these students
            429: Rate limit exceeded
        """
        parent_id = user_id
        data = request.json

        # Validate required fields
        if not data.get('student_ids') or not isinstance(data['student_ids'], list) or len(data['student_ids']) == 0:
            return jsonify({'error': 'student_ids is required and must be a non-empty array'}), 400

        student_ids = data['student_ids']

        try:
            # admin client justified: parent-side observer mgmt; verifies parent role + parent->child ownership (managed_by_parent_id / parent_student_links) before writing observer_invitations / observer_invitation_students / observer_student_links
            supabase = get_supabase_admin_client()

            # Verify parent role
            parent = supabase.table('users').select('role').eq('id', parent_id).single().execute()
            if not parent.data or parent.data['role'] not in ('parent', 'superadmin'):
                return jsonify({'error': 'Only parents can use this endpoint'}), 403

            # Verify parent-child relationship for ALL students
            authorized_student_ids = []
            student_names = []

            for student_id in student_ids:
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

                if dependent.data or (linked and linked.data):
                    authorized_student_ids.append(student_id)
                    # Get student name
                    if dependent.data:
                        student = dependent.data[0]
                    else:
                        student_result = supabase.table('users') \
                            .select('id, display_name, first_name, last_name') \
                            .eq('id', student_id) \
                            .single() \
                            .execute()
                        student = student_result.data if student_result.data else {}

                    name = student.get('display_name') or \
                        f"{student.get('first_name', '')} {student.get('last_name', '')}".strip() or 'Child'
                    student_names.append(name)

            if len(authorized_student_ids) != len(student_ids):
                return jsonify({'error': 'You are not authorized to invite observers for one or more of these students'}), 403

            # Generate unique invitation code
            invitation_code = secrets.token_urlsafe(32)

            # Set expiration (7 days)
            expires_at = datetime.utcnow() + timedelta(days=7)

            # Create invitation (student_id is null for family invites)
            placeholder_email = f"pending-{invitation_code[:8]}@invite.optio.local"
            invitation = supabase.table('observer_invitations').insert({
                'student_id': None,  # Family invite - no single student
                'observer_email': placeholder_email,
                'observer_name': 'Pending Observer',
                'invitation_code': invitation_code,
                'expires_at': expires_at.isoformat(),
                'invited_by_user_id': parent_id,
                'invited_by_role': 'parent'
            }).execute()

            invitation_id = invitation.data[0]['id']

            # Create entries in observer_invitation_students for each child
            for student_id in authorized_student_ids:
                supabase.table('observer_invitation_students').insert({
                    'invitation_id': invitation_id,
                    'student_id': student_id
                }).execute()

            logger.info(f"Family observer invitation created: parent={parent_id}, students={authorized_student_ids}")

            # Build shareable link
            frontend_url = get_frontend_url()
            shareable_link = f"{frontend_url}/observer/accept/{invitation_code}"

            return jsonify({
                'status': 'success',
                'invitation_id': invitation_id,
                'invitation_code': invitation_code,
                'shareable_link': shareable_link,
                'expires_at': expires_at.isoformat(),
                'student_names': student_names,
                'student_count': len(authorized_student_ids),
            }), 200

        except Exception as e:
            logger.error(f"Failed to create family observer invitation: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to create invitation'}), 500


    @bp.route('/api/observers/family-invite/email', methods=['POST'])
    @require_auth
    @rate_limit(limit=20, per=3600)  # 20 invite emails per hour per parent
    def family_invite_email(user_id):
        """
        Email an Optio-branded invitation for an existing pending family invite.

        Body:
            email: Observer's email address
            invitation_code: Code of an existing pending invitation owned by this parent

        Returns:
            200: Email sent
            400: Bad request (missing/invalid fields)
            403: Caller doesn't own this invitation or isn't a parent
            404: Invitation not found
            500: Failed to send
        """
        parent_id = user_id
        data = request.json or {}

        recipient_email = (data.get('email') or '').strip().lower()
        invitation_code = (data.get('invitation_code') or '').strip()

        if not recipient_email or not EMAIL_RE.match(recipient_email):
            return jsonify({'error': 'A valid email address is required'}), 400
        if not invitation_code:
            return jsonify({'error': 'invitation_code is required'}), 400

        try:
            # admin client justified: needs to read parent profile + invitation + invitation_students rows the caller owns
            supabase = get_supabase_admin_client()

            # Verify caller is a parent (or superadmin previewing as parent)
            parent = supabase.table('users') \
                .select('id, role, display_name, first_name, last_name') \
                .eq('id', parent_id) \
                .single() \
                .execute()
            if not parent.data or parent.data['role'] not in ('parent', 'superadmin'):
                return jsonify({'error': 'Only parents can use this endpoint'}), 403

            # Look up the invitation; must belong to this parent, still be pending,
            # and not expired. Collapse all "you can't email this invite" failure
            # shapes into a single 404 so we don't leak whether an arbitrary
            # invitation code exists / belongs to someone else / has been used.
            invitation = supabase.table('observer_invitations') \
                .select('id, invitation_code, invited_by_user_id, expires_at, status') \
                .eq('invitation_code', invitation_code) \
                .execute()

            now_iso = datetime.utcnow().isoformat()
            inv_row = invitation.data[0] if invitation.data else None
            invalid = (
                not inv_row
                or inv_row.get('invited_by_user_id') != parent_id
                or inv_row.get('status') != 'pending'
                or (inv_row.get('expires_at') and inv_row['expires_at'] <= now_iso)
            )
            if invalid:
                return jsonify({'error': 'Invitation not found'}), 404

            # Build the student-name string for the template ("Sarah & Tommy")
            student_links = supabase.table('observer_invitation_students') \
                .select('student_id') \
                .eq('invitation_id', inv_row['id']) \
                .execute()
            student_ids = [link['student_id'] for link in (student_links.data or [])]

            student_label = 'your student'
            if student_ids:
                students = supabase.table('users') \
                    .select('id, display_name, first_name, last_name') \
                    .in_('id', student_ids) \
                    .execute()
                names = []
                for s in (students.data or []):
                    name = s.get('display_name') or \
                        f"{s.get('first_name', '')} {s.get('last_name', '')}".strip()
                    if name:
                        names.append(name.split(' ')[0])  # first name only for warmth
                if len(names) == 1:
                    student_label = names[0]
                elif len(names) == 2:
                    student_label = f"{names[0]} & {names[1]}"
                elif len(names) > 2:
                    student_label = ", ".join(names[:-1]) + f" & {names[-1]}"

            # Parent name for the template's optional reference
            parent_name = parent.data.get('display_name') or \
                f"{parent.data.get('first_name', '')} {parent.data.get('last_name', '')}".strip() or \
                'A parent'

            frontend_url = get_frontend_url()
            invitation_link = f"{frontend_url}/observer/accept/{invitation_code}"

            sent = email_service.send_templated_email(
                to_email=recipient_email,
                subject=f"{student_label} invited you to follow their learning on Optio",
                template_name='observer_invitation',
                context={
                    'student_name': student_label,
                    'observer_name': 'there',  # we don't know recipient's name yet
                    'invitation_link': invitation_link,
                    'parent_name': parent_name,
                }
            )

            if not sent:
                logger.error(f"Family invite email failed: parent={parent_id}, to={recipient_email}")
                return jsonify({'error': 'Failed to send invitation email'}), 500

            logger.info(f"Family invite email sent: parent={parent_id}, to={recipient_email}, invitation={inv_row['id']}")
            return jsonify({'status': 'success'}), 200

        except Exception as e:
            logger.error(f"Failed to email family invite: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to send invitation email'}), 500


    @bp.route('/api/observers/family-observers', methods=['GET'])
    @require_auth
    def get_family_observers(user_id):
        """
        Parent views all observers they've invited, grouped by observer with child access toggles.

        Returns:
            200: List of family observers with their child access details
            403: Not authorized
        """
        parent_id = user_id

        try:
            # admin client justified: parent-side observer mgmt; verifies parent role + parent->child ownership (managed_by_parent_id / parent_student_links) before writing observer_invitations / observer_invitation_students / observer_student_links
            supabase = get_supabase_admin_client()

            # Verify parent role
            parent = supabase.table('users').select('role').eq('id', parent_id).single().execute()
            if not parent.data or parent.data['role'] not in ('parent', 'superadmin'):
                return jsonify({'error': 'Only parents can use this endpoint'}), 403

            # Get all children this parent manages
            dependents = supabase.table('users') \
                .select('id, display_name, first_name, last_name, avatar_url') \
                .eq('managed_by_parent_id', parent_id) \
                .execute()

            linked = supabase.table('parent_student_links') \
                .select('student_user_id') \
                .eq('parent_user_id', parent_id) \
                .eq('status', 'approved') \
                .execute()

            linked_student_ids = [l['student_user_id'] for l in linked.data]

            # Get linked student details
            linked_students = []
            if linked_student_ids:
                linked_students_result = supabase.table('users') \
                    .select('id, display_name, first_name, last_name, avatar_url') \
                    .in_('id', linked_student_ids) \
                    .execute()
                linked_students = linked_students_result.data

            all_children = dependents.data + linked_students
            child_ids = [c['id'] for c in all_children]
            children_map = {c['id']: c for c in all_children}

            if not child_ids:
                return jsonify({'observers': [], 'children': []}), 200

            # Get all observer links for these children that were invited by this parent
            links = supabase.table('observer_student_links') \
                .select('*') \
                .in_('student_id', child_ids) \
                .eq('invited_by_parent_id', parent_id) \
                .execute()

            # Group by observer
            observer_ids = list(set([link['observer_id'] for link in links.data]))

            observers_data = []
            if observer_ids:
                # Get observer details
                observers = supabase.table('users') \
                    .select('id, email, first_name, last_name, display_name, avatar_url') \
                    .in_('id', observer_ids) \
                    .execute()

                observer_map = {obs['id']: obs for obs in observers.data}

                # Build observer data with children toggles
                for observer_id in observer_ids:
                    observer_info = observer_map.get(observer_id, {})

                    # Find which children this observer has access to
                    observer_links = [l for l in links.data if l['observer_id'] == observer_id]
                    linked_child_ids = [l['student_id'] for l in observer_links]

                    children_access = []
                    for child in all_children:
                        children_access.append({
                            'student_id': child['id'],
                            'student_name': child.get('display_name') or \
                                f"{child.get('first_name', '')} {child.get('last_name', '')}".strip(),
                            'avatar_url': child.get('avatar_url'),
                            'enabled': child['id'] in linked_child_ids,
                            'link_id': next((l['id'] for l in observer_links if l['student_id'] == child['id']), None)
                        })

                    observers_data.append({
                        'status': 'accepted',
                        'observer_id': observer_id,
                        'observer_name': observer_info.get('display_name') or \
                            f"{observer_info.get('first_name', '')} {observer_info.get('last_name', '')}".strip(),
                        'observer_email': observer_info.get('email'),
                        'avatar_url': observer_info.get('avatar_url'),
                        'children': children_access
                    })

            # Also surface PENDING invitations (created at invite time, before the
            # observer accepts) so a parent who just invited someone sees them
            # immediately rather than an empty list. These live in
            # observer_invitations (status='pending'), with covered children in
            # observer_invitation_students — there is no observer user row yet, so
            # there's no observer_id; the frontend keys/removes these by
            # invitation_id via the invitation-revoke endpoint.
            now_iso = datetime.utcnow().isoformat()
            pending_invites = supabase.table('observer_invitations') \
                .select('id, invitation_code, created_at, expires_at') \
                .eq('invited_by_user_id', parent_id) \
                .eq('status', 'pending') \
                .gt('expires_at', now_iso) \
                .order('created_at', desc=True) \
                .execute()

            if pending_invites.data:
                pending_ids = [inv['id'] for inv in pending_invites.data]
                pending_links = supabase.table('observer_invitation_students') \
                    .select('invitation_id, student_id') \
                    .in_('invitation_id', pending_ids) \
                    .execute()

                # Org-isolation: only count children this parent actually manages.
                child_id_set = set(child_ids)
                for inv in pending_invites.data:
                    covered = [
                        l['student_id'] for l in pending_links.data
                        if l['invitation_id'] == inv['id'] and l['student_id'] in child_id_set
                    ]
                    if not covered:
                        continue  # invitation covers none of this parent's current children

                    pending_children = [{
                        'student_id': child_id,
                        'student_name': children_map[child_id].get('display_name') or \
                            f"{children_map[child_id].get('first_name', '')} {children_map[child_id].get('last_name', '')}".strip(),
                        'avatar_url': children_map[child_id].get('avatar_url'),
                        'enabled': True,
                        'link_id': None,
                    } for child_id in covered]

                    observers_data.append({
                        'status': 'pending',
                        'invitation_id': inv['id'],
                        'observer_id': None,
                        'observer_name': None,
                        'observer_email': None,
                        'avatar_url': None,
                        'expires_at': inv['expires_at'],
                        'created_at': inv['created_at'],
                        'children': pending_children,
                    })

            # Format children list for the response
            children_list = [{
                'id': c['id'],
                'name': c.get('display_name') or f"{c.get('first_name', '')} {c.get('last_name', '')}".strip(),
                'avatar_url': c.get('avatar_url')
            } for c in all_children]

            return jsonify({
                'observers': observers_data,
                'children': children_list
            }), 200

        except Exception as e:
            logger.error(f"Failed to fetch family observers: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch observers'}), 500


    @bp.route('/api/observers/family-observers/<observer_id>/toggle-child', methods=['POST'])
    @require_auth
    @validate_uuid_param('observer_id')
    def toggle_child_access(user_id, observer_id):
        """
        Parent toggles observer access to a specific child.

        Body:
            student_id: UUID of the child
            enabled: boolean - true to enable access, false to disable

        Returns:
            200: Access toggled successfully
            400: Invalid request
            403: Not authorized
        """
        parent_id = user_id
        data = request.json

        if not data.get('student_id'):
            return jsonify({'error': 'student_id is required'}), 400

        student_id = data['student_id']
        enabled = data.get('enabled', True)

        try:
            # admin client justified: parent-side observer mgmt; verifies parent role + parent->child ownership (managed_by_parent_id / parent_student_links) before writing observer_invitations / observer_invitation_students / observer_student_links
            supabase = get_supabase_admin_client()

            # Verify parent role
            parent = supabase.table('users').select('role').eq('id', parent_id).single().execute()
            if not parent.data or parent.data['role'] not in ('parent', 'superadmin'):
                return jsonify({'error': 'Only parents can use this endpoint'}), 403

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
                return jsonify({'error': 'You are not authorized to manage observers for this student'}), 403

            # Check if observer exists
            observer = supabase.table('users').select('id').eq('id', observer_id).execute()
            if not observer.data:
                return jsonify({'error': 'Observer not found'}), 404

            # Check existing link
            existing_link = supabase.table('observer_student_links') \
                .select('id') \
                .eq('observer_id', observer_id) \
                .eq('student_id', student_id) \
                .execute()

            if enabled:
                if not existing_link.data:
                    # Create new link
                    supabase.table('observer_student_links').insert({
                        'observer_id': observer_id,
                        'student_id': student_id,
                        'invited_by_parent_id': parent_id,
                        'can_comment': True,
                        'can_view_evidence': True,
                        'notifications_enabled': True
                    }).execute()

                    logger.info(f"Child access enabled: observer={observer_id}, student={student_id}, by_parent={parent_id}")
            else:
                if existing_link.data:
                    # Only delete if this parent invited this observer
                    # Check if this link was created by this parent
                    link_check = supabase.table('observer_student_links') \
                        .select('id') \
                        .eq('id', existing_link.data[0]['id']) \
                        .eq('invited_by_parent_id', parent_id) \
                        .execute()

                    if link_check.data:
                        supabase.table('observer_student_links') \
                            .delete() \
                            .eq('id', existing_link.data[0]['id']) \
                            .execute()

                        logger.info(f"Child access disabled: observer={observer_id}, student={student_id}, by_parent={parent_id}")
                    else:
                        return jsonify({'error': 'Cannot modify observer link not created by you'}), 403

            return jsonify({
                'status': 'success',
                'observer_id': observer_id,
                'student_id': student_id,
                'enabled': enabled
            }), 200

        except Exception as e:
            logger.error(f"Failed to toggle child access: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to toggle access'}), 500


    @bp.route('/api/observers/family-observers/<observer_id>', methods=['DELETE'])
    @require_auth
    @validate_uuid_param('observer_id')
    def remove_family_observer(user_id, observer_id):
        """
        Parent removes an observer from ALL their children.

        Args:
            observer_id: UUID of the observer to remove

        Returns:
            200: Observer removed from all children
            403: Not authorized
        """
        parent_id = user_id

        try:
            # admin client justified: parent-side observer mgmt; verifies parent role + parent->child ownership (managed_by_parent_id / parent_student_links) before writing observer_invitations / observer_invitation_students / observer_student_links
            supabase = get_supabase_admin_client()

            # Verify parent role
            parent = supabase.table('users').select('role').eq('id', parent_id).single().execute()
            if not parent.data or parent.data['role'] not in ('parent', 'superadmin'):
                return jsonify({'error': 'Only parents can use this endpoint'}), 403

            # Get all children this parent manages
            dependents = supabase.table('users') \
                .select('id') \
                .eq('managed_by_parent_id', parent_id) \
                .execute()

            linked = supabase.table('parent_student_links') \
                .select('student_user_id') \
                .eq('parent_user_id', parent_id) \
                .eq('status', 'approved') \
                .execute()

            child_ids = [d['id'] for d in dependents.data] + [l['student_user_id'] for l in linked.data]

            if not child_ids:
                return jsonify({'error': 'No children found'}), 404

            # Delete all observer links for this observer that were invited by this parent
            deleted = supabase.table('observer_student_links') \
                .delete() \
                .eq('observer_id', observer_id) \
                .eq('invited_by_parent_id', parent_id) \
                .execute()

            logger.info(f"Family observer removed: observer={observer_id}, by_parent={parent_id}")

            return jsonify({
                'status': 'success',
                'observer_id': observer_id,
                'children_removed': len(deleted.data) if deleted.data else 0
            }), 200

        except Exception as e:
            logger.error(f"Failed to remove family observer: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to remove observer'}), 500


    @bp.route('/api/observers/family-pending-invites', methods=['GET'])
    @require_auth
    def get_pending_family_invites(user_id):
        """
        Parent views their pending (unaccepted, unexpired) observer invitations
        with the children they cover.
        """
        parent_id = user_id

        try:
            supabase = get_supabase_admin_client()
            parent = supabase.table('users').select('role').eq('id', parent_id).single().execute()
            if not parent.data or parent.data['role'] not in ('parent', 'superadmin'):
                return jsonify({'error': 'Only parents can use this endpoint'}), 403

            now_iso = datetime.utcnow().isoformat()
            invites = supabase.table('observer_invitations') \
                .select('id, invitation_code, created_at, expires_at, status') \
                .eq('invited_by_user_id', parent_id) \
                .eq('invited_by_role', 'parent') \
                .eq('status', 'pending') \
                .gt('expires_at', now_iso) \
                .order('created_at', desc=True) \
                .execute()

            if not invites.data:
                return jsonify({'invites': []}), 200

            invitation_ids = [inv['id'] for inv in invites.data]
            student_links = supabase.table('observer_invitation_students') \
                .select('invitation_id, student_id') \
                .in_('invitation_id', invitation_ids) \
                .execute()

            student_ids = list({l['student_id'] for l in student_links.data})
            students = supabase.table('users') \
                .select('id, display_name, first_name, last_name, avatar_url') \
                .in_('id', student_ids) \
                .execute() if student_ids else type('R', (), {'data': []})()
            student_map = {s['id']: s for s in (students.data or [])}

            frontend_url = get_frontend_url()
            result = []
            for inv in invites.data:
                child_links = [l for l in student_links.data if l['invitation_id'] == inv['id']]
                kids = []
                for link in child_links:
                    student = student_map.get(link['student_id'])
                    if student:
                        kids.append({
                            'id': student['id'],
                            'name': student.get('display_name') or f"{student.get('first_name','')} {student.get('last_name','')}".strip(),
                            'avatar_url': student.get('avatar_url'),
                        })
                result.append({
                    'id': inv['id'],
                    'shareable_link': f"{frontend_url}/observer/accept/{inv['invitation_code']}",
                    'created_at': inv['created_at'],
                    'expires_at': inv['expires_at'],
                    'children': kids,
                })

            return jsonify({'invites': result}), 200

        except Exception as e:
            logger.error(f"Failed to list pending family invites: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to load pending invites'}), 500


    @bp.route('/api/observers/family-pending-invites/<invitation_id>', methods=['DELETE'])
    @require_auth
    @validate_uuid_param('invitation_id')
    def revoke_pending_family_invite(user_id, invitation_id):
        """Parent revokes a pending invitation they sent."""
        parent_id = user_id

        try:
            supabase = get_supabase_admin_client()
            invite = supabase.table('observer_invitations') \
                .select('id, invited_by_user_id, status') \
                .eq('id', invitation_id) \
                .single() \
                .execute()

            if not invite.data:
                return jsonify({'error': 'Invitation not found'}), 404
            if invite.data['invited_by_user_id'] != parent_id:
                return jsonify({'error': 'Not authorized to revoke this invitation'}), 403
            if invite.data['status'] != 'pending':
                return jsonify({'error': 'Invitation is not pending'}), 400

            supabase.table('observer_invitations') \
                .update({'status': 'cancelled'}) \
                .eq('id', invitation_id) \
                .execute()

            logger.info(f"Family invite revoked: invitation={invitation_id}, by_parent={parent_id}")
            return jsonify({'status': 'success'}), 200

        except Exception as e:
            logger.error(f"Failed to revoke family invite: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to revoke invitation'}), 500
