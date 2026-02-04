"""
Observer Module - Family Management

Family observer invitations and child access management.
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
    @bp.route('/api/observers/family-invite', methods=['POST'])
    @require_auth
    @rate_limit(limit=10, per=3600)  # 10 invitations per hour
    def family_invite(user_id):
        """
        Parent creates shareable invitation link for observer to follow multiple children at once.

        Body:
            student_ids: List of UUIDs of children to include
            relationship: Type of relationship (grandparent, aunt_uncle, family_friend, mentor, coach, other)

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
        relationship = data.get('relationship', 'other')

        try:
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
                'observer_name': f'{relationship.replace("_", " ").title()} Observer',
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
                'relationship': relationship
            }), 200

        except Exception as e:
            logger.error(f"Failed to create family observer invitation: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to create invitation'}), 500


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

                    # Get relationship from first link
                    relationship = observer_links[0]['relationship'] if observer_links else 'other'

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
                        'observer_id': observer_id,
                        'observer_name': observer_info.get('display_name') or \
                            f"{observer_info.get('first_name', '')} {observer_info.get('last_name', '')}".strip(),
                        'observer_email': observer_info.get('email'),
                        'avatar_url': observer_info.get('avatar_url'),
                        'relationship': relationship,
                        'children': children_access
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
                .select('id, relationship') \
                .eq('observer_id', observer_id) \
                .eq('student_id', student_id) \
                .execute()

            if enabled:
                if not existing_link.data:
                    # Get relationship from any existing link this observer has (invited by this parent)
                    other_link = supabase.table('observer_student_links') \
                        .select('relationship') \
                        .eq('observer_id', observer_id) \
                        .eq('invited_by_parent_id', parent_id) \
                        .limit(1) \
                        .execute()

                    relationship = other_link.data[0]['relationship'] if other_link.data else 'other'

                    # Create new link
                    supabase.table('observer_student_links').insert({
                        'observer_id': observer_id,
                        'student_id': student_id,
                        'relationship': relationship,
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
