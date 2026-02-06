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

            # Find invitation
            invitation = supabase.table('observer_invitations') \
                .select('*') \
                .eq('invitation_code', invitation_code) \
                .eq('status', 'pending') \
                .execute()

            if not invitation.data:
                return jsonify({'error': 'Invitation not found or already accepted'}), 404

            inv = invitation.data[0]

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

            # Get user's current role
            user_result = supabase.table('users').select('role').eq('id', observer_id).single().execute()
            current_role = user_result.data.get('role') if user_result.data else None

            # Only set role to 'observer' if user has no role yet
            # Users with existing roles (parent, student, advisor, etc.) keep their primary role
            # and gain observer access via the observer_student_links table
            if not current_role:
                supabase.table('users').update({'role': 'observer'}).eq('id', observer_id).execute()
                logger.info(f"Set user role to observer (was empty): {observer_id}")
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

            # Mark invitation as accepted
            supabase.table('observer_invitations') \
                .update({
                    'status': 'accepted',
                    'accepted_at': datetime.utcnow().isoformat()
                }) \
                .eq('id', inv['id']) \
                .execute()

            logger.info(f"Observer invitation accepted: observer={observer_id}, students={student_ids}, newly_linked={linked_student_ids}")

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
            user_result = supabase.table('users').select('role, org_role').eq('id', user_id).single().execute()
            user_role = user_result.data.get('role') if user_result.data else None
            user_org_role = user_result.data.get('org_role') if user_result.data else None

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

            # For parents, include their children (dependents + linked students)
            parent_child_ids = []
            if effective_role == 'parent':
                # Get dependents (under 13, managed by this parent)
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
