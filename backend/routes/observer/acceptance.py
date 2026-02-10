"""
Observer Module - Acceptance Endpoints

Observer accepting invitations and viewing linked students.
"""

from flask import request, jsonify
from datetime import datetime, timedelta
import logging

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit
from services.email_service import email_service

logger = logging.getLogger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/api/observers/accept/<invitation_code>', methods=['POST'])
    @require_auth
    @rate_limit(limit=5, per=300)  # 5 attempts per 5 minutes
    def accept_observer_invitation(user_id, invitation_code):
        """
        Observer accepts invitation (must be logged in)

        The logged-in user becomes the observer for the student(s).
        Supports both single-student invitations and multi-child (family) invitations.

        Args:
            user_id: UUID of authenticated user (from decorator)
            invitation_code: Invitation code from URL

        Body (optional):
            relationship: Relationship to student

        Returns:
            200: Invitation accepted, observer linked
            400: Invitation expired or invalid
            404: Invitation not found
        """
        try:
            supabase = get_supabase_admin_client()

            # Find invitation (codes are reusable, so don't filter by status)
            invitation = supabase.table('observer_invitations') \
                .select('*') \
                .eq('invitation_code', invitation_code) \
                .execute()

            if not invitation.data:
                return jsonify({'error': 'Invitation not found'}), 404

            inv = invitation.data[0]

            # Check if invitation was explicitly expired/revoked
            if inv.get('status') == 'expired':
                return jsonify({'error': 'Invitation has been revoked'}), 400

            # Check expiration
            expires_at = datetime.fromisoformat(inv['expires_at'].replace('Z', '+00:00'))
            if datetime.utcnow() > expires_at.replace(tzinfo=None):
                # Mark as expired
                supabase.table('observer_invitations') \
                    .update({'status': 'expired'}) \
                    .eq('id', inv['id']) \
                    .execute()

                return jsonify({'error': 'Invitation expired'}), 400

            data = request.json or {}

            # Use the logged-in user as the observer
            observer_id = user_id
            logger.info(f"Using logged-in user as observer: {observer_id}")

            # Get user's current role and created_at to determine if they're a new user
            user_result = supabase.table('users').select('role, created_at').eq('id', observer_id).single().execute()
            current_role = user_result.data.get('role') if user_result.data else None
            created_at = user_result.data.get('created_at') if user_result.data else None

            # Determine if this is a new user (created within the last hour)
            # This handles Google OAuth users who get 'student' role by default
            is_new_user = False
            if created_at:
                try:
                    created_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    is_new_user = (datetime.utcnow() - created_time.replace(tzinfo=None)) < timedelta(hours=1)
                except (ValueError, TypeError):
                    pass

            # Set role to 'observer' if:
            # 1. User has no role yet, OR
            # 2. User is a new user with 'student' role (likely from Google OAuth default)
            # Existing users with established roles (parent, advisor, etc.) keep their primary role
            # and gain observer access via the observer_student_links table
            if not current_role:
                supabase.table('users').update({'role': 'observer'}).eq('id', observer_id).execute()
                logger.info(f"Set user role to observer (was empty): {observer_id}")
            elif current_role == 'student' and is_new_user:
                # New user registered via Google OAuth gets 'student' by default
                # Since they're accepting an observer invitation, update to 'observer'
                supabase.table('users').update({'role': 'observer'}).eq('id', observer_id).execute()
                logger.info(f"Updated new user role from student to observer: {observer_id}")
                current_role = 'observer'
            else:
                logger.info(f"User already has role '{current_role}', keeping it. Observer access via observer_student_links.")

            # Determine which students to link
            # Check for multi-child (family) invitation first
            invitation_students = supabase.table('observer_invitation_students') \
                .select('student_id') \
                .eq('invitation_id', inv['id']) \
                .execute()

            student_ids = []
            if invitation_students.data:
                # This is a family invitation - link to all students
                student_ids = [s['student_id'] for s in invitation_students.data]
                logger.info(f"Family invitation detected: {len(student_ids)} students")
            elif inv.get('student_id'):
                # This is a single-student invitation
                student_ids = [inv['student_id']]
                logger.info(f"Single-student invitation detected")
            else:
                logger.error(f"Invitation {inv['id']} has no associated students")
                return jsonify({'error': 'Invalid invitation - no students linked'}), 400

            # Get the parent ID who created this invitation (for tracking)
            invited_by_parent_id = inv.get('invited_by_user_id') if inv.get('invited_by_role') == 'parent' else None

            # Create observer-student links for each student
            linked_student_ids = []
            for student_id in student_ids:
                # Check if link already exists
                existing_link = supabase.table('observer_student_links') \
                    .select('id') \
                    .eq('observer_id', observer_id) \
                    .eq('student_id', student_id) \
                    .execute()

                if not existing_link.data:
                    # Create observer-student link
                    link_data = {
                        'observer_id': observer_id,
                        'student_id': student_id,
                        'relationship': data.get('relationship', 'other'),
                        'can_comment': True,
                        'can_view_evidence': True,
                        'notifications_enabled': True
                    }

                    # Track which parent invited this observer (for family management)
                    if invited_by_parent_id:
                        link_data['invited_by_parent_id'] = invited_by_parent_id

                    supabase.table('observer_student_links').insert(link_data).execute()
                    linked_student_ids.append(student_id)

            # Note: We don't mark the invitation as 'accepted' because codes are reusable
            # Multiple observers can use the same invitation link

            logger.info(f"Observer invitation accepted: observer={observer_id}, students={student_ids}, newly_linked={linked_student_ids}")

            # Send notification email to parents of newly linked students
            if linked_student_ids:
                try:
                    # Get observer's info
                    observer_info = supabase.table('users') \
                        .select('first_name, last_name, display_name, email') \
                        .eq('id', observer_id) \
                        .single() \
                        .execute()

                    observer_data = observer_info.data if observer_info.data else {}
                    observer_name = observer_data.get('display_name') or \
                        f"{observer_data.get('first_name', '')} {observer_data.get('last_name', '')}".strip() or \
                        'An observer'
                    observer_email_addr = observer_data.get('email', 'Unknown')

                    logger.info(f"Preparing to send observer linked notifications: observer={observer_name}, students={linked_student_ids}")

                    # Get student info and their parents
                    for student_id in linked_student_ids:
                        try:
                            # Get student info
                            student_info = supabase.table('users') \
                                .select('first_name, last_name, display_name, managed_by_parent_id') \
                                .eq('id', student_id) \
                                .single() \
                                .execute()

                            student_data = student_info.data if student_info.data else {}
                            student_name = student_data.get('display_name') or \
                                f"{student_data.get('first_name', '')} {student_data.get('last_name', '')}".strip() or \
                                'Your child'

                            # Collect parent IDs to notify
                            parent_ids_to_notify = set()

                            # Check if student is a dependent (has managing parent)
                            managed_by = student_data.get('managed_by_parent_id')
                            if managed_by:
                                parent_ids_to_notify.add(managed_by)
                                logger.info(f"Student {student_id} has managing parent: {managed_by}")

                            # Get parents from parent_student_links (13+ students)
                            parent_links = supabase.table('parent_student_links') \
                                .select('parent_user_id') \
                                .eq('student_user_id', student_id) \
                                .eq('status', 'approved') \
                                .execute()

                            for link in parent_links.data:
                                parent_ids_to_notify.add(link['parent_user_id'])

                            logger.info(f"Found {len(parent_ids_to_notify)} parent(s) to notify for student {student_id}: {parent_ids_to_notify}")

                            if not parent_ids_to_notify:
                                logger.warning(f"No parents found for student {student_id} - skipping notification")
                                continue

                            # Send notification to each parent
                            # Note: We notify ALL parents including the one who created the invitation
                            # This serves as confirmation that the observer has successfully accepted
                            for parent_id in parent_ids_to_notify:
                                # Get parent info
                                parent_info = supabase.table('users') \
                                    .select('first_name, last_name, display_name, email') \
                                    .eq('id', parent_id) \
                                    .single() \
                                    .execute()

                                if parent_info.data and parent_info.data.get('email'):
                                    parent_data = parent_info.data
                                    parent_name = parent_data.get('display_name') or \
                                        parent_data.get('first_name') or 'there'
                                    parent_email = parent_data.get('email')

                                    logger.info(f"Sending observer linked notification to {parent_email} for student {student_name}")

                                    # Send the notification
                                    result = email_service.send_observer_linked_notification(
                                        parent_email=parent_email,
                                        parent_name=parent_name,
                                        student_name=student_name,
                                        observer_name=observer_name,
                                        observer_email=observer_email_addr
                                    )

                                    if result:
                                        logger.info(f"Successfully sent observer linked notification to parent {parent_id} for student {student_id}")
                                    else:
                                        logger.error(f"Failed to send observer linked notification to parent {parent_id}")
                                else:
                                    logger.warning(f"Parent {parent_id} has no email address - skipping notification")

                        except Exception as e:
                            # Don't fail the invitation if email fails
                            logger.error(f"Failed to send observer notification for student {student_id}: {str(e)}", exc_info=True)

                except Exception as e:
                    # Don't fail the invitation if email fails
                    logger.error(f"Failed to send observer linked notifications: {str(e)}", exc_info=True)

            # Return the first student_id for backward compatibility
            primary_student_id = student_ids[0] if student_ids else None

            return jsonify({
                'status': 'success',
                'observer_id': observer_id,
                'student_id': primary_student_id,  # Backward compatibility
                'student_ids': student_ids,  # New: all linked students
                'student_count': len(student_ids),
                'user_role': current_role,  # Frontend uses this to decide navigation
                'has_existing_role': bool(current_role and current_role != 'observer')
            }), 200

        except Exception as e:
            logger.error(f"Failed to accept observer invitation: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to accept invitation'}), 500


    @bp.route('/api/observers/my-students', methods=['GET'])
    @require_auth
    def get_my_students(user_id):
        """
        Observer views linked students

        Also includes:
        - Students from advisor_student_assignments for superadmin/advisor users
        - Parent's children (dependents and linked 13+ students) for parent users

        Returns:
            200: List of students observer has access to
        """

        try:
            supabase = get_supabase_admin_client()

            # Get user role to check if they're superadmin/advisor/parent
            # Need both role and org_role to handle org-managed users
            # Note: Don't use .single() as it throws if user doesn't exist yet (race condition)
            user_result = supabase.table('users').select('role, org_role').eq('id', user_id).execute()
            if not user_result.data:
                logger.warning(f"User {user_id} not found in users table - may be a timing issue")
                return jsonify({'students': []}), 200
            user_data = user_result.data[0]
            user_role = user_data.get('role')
            user_org_role = user_data.get('org_role')

            # Determine effective role (org_role for org_managed users, role otherwise)
            effective_role = user_org_role if user_role == 'org_managed' else user_role

            # Get student links for this observer
            links = supabase.table('observer_student_links') \
                .select('*') \
                .eq('observer_id', user_id) \
                .execute()

            # Fetch student details separately to avoid PostgREST relationship issues
            student_ids = [link['student_id'] for link in links.data]

            # For superadmin or advisor, also get students from advisor_student_assignments
            advisor_student_ids = []
            if effective_role in ('superadmin', 'advisor'):
                advisor_assignments = supabase.table('advisor_student_assignments') \
                    .select('student_id') \
                    .eq('advisor_id', user_id) \
                    .eq('is_active', True) \
                    .execute()
                advisor_student_ids = [a['student_id'] for a in advisor_assignments.data]

            # Include user's children (dependents + linked students) regardless of role
            # This ensures superadmins, advisors, etc. who also have children see them
            parent_child_ids = []

            # Get dependents (under 13, managed by this user)
            dependents = supabase.table('users') \
                .select('id') \
                .eq('managed_by_parent_id', user_id) \
                .execute()
            parent_child_ids.extend([d['id'] for d in dependents.data])

            # Get linked students (13+, via parent_student_links)
            linked_students = supabase.table('parent_student_links') \
                .select('student_user_id') \
                .eq('parent_user_id', user_id) \
                .eq('status', 'approved') \
                .execute()
            parent_child_ids.extend([l['student_user_id'] for l in linked_students.data])

            # Combine and deduplicate student IDs
            all_student_ids = list(set(student_ids + advisor_student_ids + parent_child_ids))

            students_data = []
            if all_student_ids:
                students = supabase.table('users') \
                    .select('id, first_name, last_name, display_name, portfolio_slug, avatar_url') \
                    .in_('id', all_student_ids) \
                    .execute()

                # Create lookup map
                student_map = {student['id']: student for student in students.data}

                # Merge link data with student details for observer links
                for link in links.data:
                    student_info = student_map.get(link['student_id'], {})
                    students_data.append({
                        **link,
                        'student': student_info
                    })

                # Add advisor-linked students that aren't already in observer links
                existing_student_ids = set(student_ids)
                for advisor_student_id in advisor_student_ids:
                    if advisor_student_id not in existing_student_ids:
                        student_info = student_map.get(advisor_student_id, {})
                        students_data.append({
                            'student_id': advisor_student_id,
                            'observer_id': user_id,
                            'relationship': 'advisor',
                            'can_comment': True,
                            'can_view_evidence': True,
                            'notifications_enabled': False,
                            'student': student_info
                        })
                        existing_student_ids.add(advisor_student_id)

                # Add parent's children that aren't already in observer links
                for child_id in parent_child_ids:
                    if child_id not in existing_student_ids:
                        student_info = student_map.get(child_id, {})
                        students_data.append({
                            'student_id': child_id,
                            'observer_id': user_id,
                            'relationship': 'parent',
                            'can_comment': True,
                            'can_view_evidence': True,
                            'notifications_enabled': True,
                            'student': student_info
                        })
                        existing_student_ids.add(child_id)

            return jsonify({'students': students_data}), 200

        except Exception as e:
            logger.error(f"Failed to fetch students: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch students'}), 500
