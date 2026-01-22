"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- 25+ direct database calls for observer workflow
- Invitation management, student linking, access control, comments
- Could create ObserverRepository with methods:
  - send_invitation(student_id, observer_email, observer_name)
  - get_student_invitations(student_id)
  - cancel_invitation(invitation_id, student_id)
  - accept_invitation(invitation_code, observer_data)
  - get_observer_students(observer_id)
  - get_student_observers(student_id)
  - create_observer_link(observer_id, student_id, relationship, permissions)
  - remove_observer_link(link_id, student_id)
  - post_comment(observer_id, student_id, comment_data)
  - get_student_comments(student_id)
- Complex invitation workflow suitable for repository abstraction

Observer Routes

Handles observer role functionality for extended family portfolio access.
Observers can:
- View student portfolios (read-only)
- Leave encouraging comments on completed work
- Receive notifications of student progress

Students control observer access through invitations.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import secrets

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit
from services.observer_audit_service import ObserverAuditService
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('observer', __name__)


def get_frontend_url():
    """
    Determine the correct frontend URL based on the request host.
    - localhost/127.0.0.1 -> http://localhost:3000
    - optio-dev-backend -> https://optio-dev-frontend.onrender.com
    - production -> https://www.optioeducation.com
    """
    host = request.host.lower() if request.host else ''

    if 'localhost' in host or '127.0.0.1' in host:
        return 'http://localhost:3000'
    elif 'optio-dev' in host:
        return 'https://optio-dev-frontend.onrender.com'
    else:
        return 'https://www.optioeducation.com'

# ============================================
# STUDENT ENDPOINTS - Send & Manage Invitations
# ============================================

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
    Student cancels pending invitation

    Args:
        invitation_id: UUID of invitation to cancel

    Returns:
        200: Invitation cancelled
        404: Invitation not found or not owned by student
    """
    user_id = request.user_id

    try:
        supabase = get_user_client()

        # Verify invitation belongs to student and is pending
        invitation = supabase.table('observer_invitations') \
            .select('id, status') \
            .eq('id', invitation_id) \
            .eq('student_id', user_id) \
            .eq('status', 'pending') \
            .execute()

        if not invitation.data:
            return jsonify({'error': 'Invitation not found'}), 404

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


# ============================================
# OBSERVER ENDPOINTS - Accept Invitations & View Portfolios
# ============================================

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
        user_result = supabase.table('users').select('role').eq('id', user_id).single().execute()
        user_role = user_result.data.get('role') if user_result.data else None

        # Get student links for this observer
        links = supabase.table('observer_student_links') \
            .select('*') \
            .eq('observer_id', user_id) \
            .execute()

        # Fetch student details separately to avoid PostgREST relationship issues
        student_ids = [link['student_id'] for link in links.data]

        # For superadmin or advisor, also get students from advisor_student_assignments
        advisor_student_ids = []
        if user_role in ('superadmin', 'advisor'):
            advisor_assignments = supabase.table('advisor_student_assignments') \
                .select('student_id') \
                .eq('advisor_id', user_id) \
                .eq('is_active', True) \
                .execute()
            advisor_student_ids = [a['student_id'] for a in advisor_assignments.data]

        # For parents, include their children (dependents + linked students)
        parent_child_ids = []
        if user_role == 'parent':
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


@bp.route('/api/observers/student/<student_id>/portfolio', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_portfolio_for_observer(student_id):
    """
    Observer views student portfolio (read-only)

    Args:
        student_id: UUID of student to view

    Returns:
        200: Portfolio data
        403: Observer doesn't have access to this student
        404: Student not found
    """
    observer_id = request.user_id

    try:
        supabase = get_supabase_admin_client()

        # Verify observer has access to this student
        link = supabase.table('observer_student_links') \
            .select('id, can_view_evidence') \
            .eq('observer_id', observer_id) \
            .eq('student_id', student_id) \
            .execute()

        if not link.data:
            return jsonify({'error': 'Access denied'}), 403

        # Fetch student portfolio data (same as public portfolio)
        from routes.portfolio import get_diploma_data
        portfolio_data = get_diploma_data(student_id)

        if not portfolio_data:
            return jsonify({'error': 'Student not found'}), 404

        # Log observer access for COPPA/FERPA compliance
        try:
            audit_service = ObserverAuditService(user_id=observer_id)
            audit_service.log_observer_access(
                observer_id=observer_id,
                student_id=student_id,
                action_type='view_portfolio',
                resource_type='portfolio',
                metadata={
                    'student_name': portfolio_data.get('student', {}).get('display_name'),
                    'diploma_slug': portfolio_data.get('student', {}).get('portfolio_slug')
                }
            )
        except Exception as audit_error:
            # Don't fail the request if audit logging fails
            logger.error(f"Failed to log observer access: {audit_error}")

        return jsonify(portfolio_data), 200

    except Exception as e:
        logger.error(f"Failed to fetch student portfolio: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch portfolio'}), 500


@bp.route('/api/observers/comments', methods=['POST'])
@require_auth
@rate_limit(limit=20, per=3600)  # 20 comments per hour
def post_observer_comment(user_id):
    """
    Observer leaves encouraging comment on completed work

    Args:
        user_id: UUID of authenticated user (from @require_auth)

    Body:
        student_id: UUID of student
        task_completion_id: UUID of task completion (optional)
        quest_id: UUID of quest (optional)
        comment_text: Comment text (max 2000 characters)

    Returns:
        200: Comment posted
        400: Invalid request
        403: Observer doesn't have comment permission
    """
    observer_id = user_id
    data = request.json

    # Validate required fields
    if not data.get('student_id') or not data.get('comment_text'):
        return jsonify({'error': 'student_id and comment_text are required'}), 400

    if len(data['comment_text']) > 2000:
        return jsonify({'error': 'Comment text exceeds maximum length of 2000 characters'}), 400

    try:
        supabase = get_supabase_admin_client()
        student_id = data['student_id']
        can_comment = False

        # Check if superadmin (superadmins have full access)
        user_result = supabase.table('users').select('role').eq('id', observer_id).single().execute()
        user_role = user_result.data.get('role') if user_result.data else None
        if user_role == 'superadmin':
            can_comment = True

        # Verify observer has access and comment permission
        if not can_comment:
            link = supabase.table('observer_student_links') \
                .select('can_comment') \
                .eq('observer_id', observer_id) \
                .eq('student_id', student_id) \
                .execute()
            can_comment = link.data and link.data[0]['can_comment']

        # Check advisor_student_assignments for advisors
        if not can_comment and user_role == 'advisor':
            advisor_link = supabase.table('advisor_student_assignments') \
                .select('id') \
                .eq('advisor_id', observer_id) \
                .eq('student_id', student_id) \
                .eq('is_active', True) \
                .execute()
            can_comment = bool(advisor_link.data)

        if not can_comment:
            return jsonify({'error': 'Access denied or comment permission disabled'}), 403

        # Create comment
        comment = supabase.table('observer_comments').insert({
            'observer_id': observer_id,
            'student_id': data['student_id'],
            'quest_id': data.get('quest_id'),
            'task_completion_id': data.get('task_completion_id'),
            'comment_text': data['comment_text']
        }).execute()

        logger.info(f"Observer comment posted: observer={observer_id}, student={data['student_id']}")

        # Log observer access for COPPA/FERPA compliance
        try:
            audit_service = ObserverAuditService(user_id=observer_id)
            audit_service.log_observer_access(
                observer_id=observer_id,
                student_id=data['student_id'],
                action_type='post_comment',
                resource_type='comment',
                resource_id=comment.data[0]['id'],
                metadata={
                    'quest_id': data.get('quest_id'),
                    'task_completion_id': data.get('task_completion_id'),
                    'comment_length': len(data['comment_text'])
                }
            )
        except Exception as audit_error:
            # Don't fail the request if audit logging fails
            logger.error(f"Failed to log observer access: {audit_error}")

        return jsonify({
            'status': 'success',
            'comment': comment.data[0]
        }), 200

    except Exception as e:
        logger.error(f"Failed to post observer comment: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to post comment'}), 500


@bp.route('/api/observers/comments/<comment_id>', methods=['DELETE'])
@require_auth
@validate_uuid_param('comment_id')
def delete_observer_comment(user_id, comment_id):
    """
    Delete an observer comment (only the comment author can delete)

    Args:
        user_id: UUID of authenticated user (from @require_auth)
        comment_id: UUID of the comment to delete

    Returns:
        200: Comment deleted
        403: Not authorized to delete this comment
        404: Comment not found
    """
    try:
        supabase = get_supabase_admin_client()

        # Get the comment and verify ownership
        comment = supabase.table('observer_comments') \
            .select('id, observer_id') \
            .eq('id', comment_id) \
            .single() \
            .execute()

        if not comment.data:
            return jsonify({'error': 'Comment not found'}), 404

        # Check if user is the comment author or superadmin
        user_result = supabase.table('users').select('role').eq('id', user_id).single().execute()
        user_role = user_result.data.get('role') if user_result.data else None

        if comment.data['observer_id'] != user_id and user_role != 'superadmin':
            return jsonify({'error': 'Not authorized to delete this comment'}), 403

        # Delete the comment
        supabase.table('observer_comments') \
            .delete() \
            .eq('id', comment_id) \
            .execute()

        logger.info(f"Observer comment deleted: comment_id={comment_id}, deleted_by={user_id}")

        return jsonify({'status': 'success'}), 200

    except Exception as e:
        logger.error(f"Failed to delete observer comment: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to delete comment'}), 500


@bp.route('/api/observers/student/<student_id>/comments', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_comments(user_id, student_id):
    """
    Get all observer comments for a student

    Accessible by:
    - The student themselves
    - Observers linked to the student

    Args:
        user_id: UUID of authenticated user (from @require_auth)
        student_id: UUID of student

    Returns:
        200: List of comments
        403: Access denied
    """

    try:
        supabase = get_supabase_admin_client()

        # Check if user is the student or an observer
        if user_id != student_id:
            # Check if user is observer for this student
            link = supabase.table('observer_student_links') \
                .select('id') \
                .eq('observer_id', user_id) \
                .eq('student_id', student_id) \
                .execute()

            if not link.data:
                return jsonify({'error': 'Access denied'}), 403

        # Fetch comments
        comments = supabase.table('observer_comments') \
            .select('*') \
            .eq('student_id', student_id) \
            .order('created_at', desc=True) \
            .execute()

        # Fetch observer details separately
        observer_ids = list(set([comment['observer_id'] for comment in comments.data]))

        comments_data = comments.data
        if observer_ids:
            observers = supabase.table('users') \
                .select('id, first_name, last_name, display_name') \
                .in_('id', observer_ids) \
                .execute()

            # Create lookup map
            observer_map = {obs['id']: obs for obs in observers.data}

            # Add observer details to each comment
            for comment in comments_data:
                comment['observer'] = observer_map.get(comment['observer_id'], {})

        # Log observer access for COPPA/FERPA compliance (only if viewer is an observer, not the student)
        if user_id != student_id:
            try:
                audit_service = ObserverAuditService(user_id=user_id)
                audit_service.log_observer_access(
                    observer_id=user_id,
                    student_id=student_id,
                    action_type='view_comments',
                    resource_type='comments',
                    metadata={
                        'comment_count': len(comments_data)
                    }
                )
            except Exception as audit_error:
                # Don't fail the request if audit logging fails
                logger.error(f"Failed to log observer access: {audit_error}")

        return jsonify({'comments': comments_data}), 200

    except Exception as e:
        logger.error(f"Failed to fetch comments: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch comments'}), 500


# ============================================
# STUDENT ACTIVITY FEED - Students view their own activity
# ============================================

@bp.route('/api/observers/student/<student_id>/activity', methods=['GET'])
@require_auth
@validate_uuid_param('student_id')
def get_student_activity_feed(user_id, student_id):
    """
    Student views their own activity feed (same format as observer feed)

    Shows completed tasks with evidence, likes, and comments.
    Only accessible by the student themselves.

    Args:
        user_id: UUID of authenticated user (from @require_auth)
        student_id: UUID of student

    Query params:
        limit: (optional) Number of items, default 20
        cursor: (optional) Pagination cursor

    Returns:
        200: Paginated feed of student's activities
        403: Access denied (not viewing own feed)
    """
    # Only allow students to view their own activity
    if user_id != student_id:
        return jsonify({'error': 'Access denied'}), 403

    limit = min(int(request.args.get('limit', 20)), 50)
    cursor = request.args.get('cursor')

    try:
        supabase = get_supabase_admin_client()

        # Get student's completed tasks
        query = supabase.table('quest_task_completions') \
            .select('id, user_id, quest_id, user_quest_task_id, completed_at, evidence_url, evidence_text, is_confidential') \
            .eq('user_id', student_id) \
            .order('completed_at', desc=True) \
            .limit(limit + 1)

        if cursor:
            query = query.lt('completed_at', cursor)

        completions = query.execute()

        if not completions.data:
            return jsonify({'items': [], 'has_more': False}), 200

        # Get task details
        task_ids = list(set([c['user_quest_task_id'] for c in completions.data if c['user_quest_task_id']]))
        tasks_map = {}
        if task_ids:
            tasks = supabase.table('user_quest_tasks') \
                .select('id, title, pillar, xp_value') \
                .in_('id', task_ids) \
                .execute()
            tasks_map = {t['id']: t for t in tasks.data}

        # Get quest details
        quest_ids = list(set([c['quest_id'] for c in completions.data if c['quest_id']]))
        quests_map = {}
        if quest_ids:
            quests = supabase.table('quests') \
                .select('id, title') \
                .in_('id', quest_ids) \
                .execute()
            quests_map = {q['id']: q for q in quests.data}

        # Get evidence document blocks for multi-format evidence
        evidence_docs = supabase.table('user_task_evidence_documents') \
            .select('id, task_id, user_id, status') \
            .in_('task_id', task_ids) \
            .eq('user_id', student_id) \
            .eq('status', 'completed') \
            .execute()

        doc_map = {}
        doc_ids = []
        for doc in evidence_docs.data:
            key = f"{doc['task_id']}_{doc['user_id']}"
            doc_map[key] = doc['id']
            doc_ids.append(doc['id'])

        evidence_blocks_map = {}
        if doc_ids:
            blocks = supabase.table('evidence_document_blocks') \
                .select('id, document_id, block_type, content, order_index, created_at, is_private') \
                .in_('document_id', doc_ids) \
                .eq('is_private', False) \
                .order('order_index') \
                .execute()

            for block in blocks.data:
                doc_id = block['document_id']
                if doc_id not in evidence_blocks_map:
                    evidence_blocks_map[doc_id] = []
                evidence_blocks_map[doc_id].append(block)

        # Build feed items - one per evidence block
        raw_feed_items = []
        for completion in completions.data:
            task_info = tasks_map.get(completion['user_quest_task_id'], {})
            quest_info = quests_map.get(completion['quest_id'], {})

            doc_key = f"{completion['user_quest_task_id']}_{completion['user_id']}"
            doc_id = doc_map.get(doc_key)

            if doc_id and doc_id in evidence_blocks_map:
                for block in evidence_blocks_map[doc_id]:
                    evidence_type = None
                    evidence_preview = None
                    content = block.get('content', {})

                    if block['block_type'] == 'image':
                        evidence_type = 'image'
                        evidence_preview = content.get('url')
                    elif block['block_type'] == 'video':
                        evidence_type = 'video'
                        evidence_preview = content.get('url')
                    elif block['block_type'] == 'link':
                        evidence_type = 'link'
                        evidence_preview = content.get('url')
                    elif block['block_type'] == 'text':
                        evidence_type = 'text'
                        text = content.get('text', '')
                        evidence_preview = text[:200] + '...' if len(text) > 200 else text
                    elif block['block_type'] == 'document':
                        evidence_type = 'link'
                        evidence_preview = content.get('url')

                    if evidence_type:
                        raw_feed_items.append({
                            'id': f"{completion['id']}_{block['id']}",
                            'completion_id': completion['id'],
                            'block_id': block['id'],
                            'timestamp': block.get('created_at') or completion['completed_at'],
                            'task_id': completion['user_quest_task_id'],
                            'task_title': task_info.get('title', 'Task'),
                            'task_pillar': task_info.get('pillar'),
                            'task_xp': task_info.get('xp_value', 0),
                            'quest_id': completion['quest_id'],
                            'quest_title': quest_info.get('title', 'Quest'),
                            'evidence_type': evidence_type,
                            'evidence_preview': evidence_preview
                        })
            else:
                # Fallback: legacy evidence
                evidence_text = completion.get('evidence_text', '')
                if evidence_text and 'Multi-format evidence document' in evidence_text:
                    continue

                evidence_type = None
                evidence_preview = None

                if completion.get('evidence_url'):
                    url = completion['evidence_url'].lower()
                    if any(url.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
                        evidence_type = 'image'
                        evidence_preview = completion['evidence_url']
                    elif 'youtube.com' in url or 'youtu.be' in url or 'vimeo.com' in url:
                        evidence_type = 'video'
                        evidence_preview = completion['evidence_url']
                    else:
                        evidence_type = 'link'
                        evidence_preview = completion['evidence_url']
                elif evidence_text:
                    evidence_type = 'text'
                    evidence_preview = evidence_text[:200] + '...' if len(evidence_text) > 200 else evidence_text

                if evidence_type:
                    raw_feed_items.append({
                        'id': completion['id'],
                        'completion_id': completion['id'],
                        'block_id': None,
                        'timestamp': completion['completed_at'],
                        'task_id': completion['user_quest_task_id'],
                        'task_title': task_info.get('title', 'Task'),
                        'task_pillar': task_info.get('pillar'),
                        'task_xp': task_info.get('xp_value', 0),
                        'quest_id': completion['quest_id'],
                        'quest_title': quest_info.get('title', 'Quest'),
                        'evidence_type': evidence_type,
                        'evidence_preview': evidence_preview
                    })

        # Sort and paginate
        raw_feed_items.sort(key=lambda x: x['timestamp'], reverse=True)
        has_more = len(raw_feed_items) > limit
        paginated_items = raw_feed_items[:limit]

        # Get like counts
        completion_ids = list(set([item['completion_id'] for item in paginated_items]))
        likes_count = {}
        try:
            if completion_ids:
                likes = supabase.table('observer_likes') \
                    .select('completion_id') \
                    .in_('completion_id', completion_ids) \
                    .execute()

                for like in likes.data:
                    likes_count[like['completion_id']] = likes_count.get(like['completion_id'], 0) + 1
        except Exception:
            pass

        # Get comment counts
        comments_count = {}
        try:
            if completion_ids:
                comments = supabase.table('observer_comments') \
                    .select('task_completion_id') \
                    .in_('task_completion_id', completion_ids) \
                    .execute()

                for comment in comments.data:
                    if comment['task_completion_id']:
                        comments_count[comment['task_completion_id']] = comments_count.get(comment['task_completion_id'], 0) + 1
        except Exception:
            pass

        # Build final feed items
        feed_items = []
        for item in paginated_items:
            feed_items.append({
                'type': 'task_completed',
                'id': item['id'],
                'completion_id': item['completion_id'],
                'timestamp': item['timestamp'],
                'task': {
                    'id': item['task_id'],
                    'title': item['task_title'],
                    'pillar': item['task_pillar'],
                    'xp_value': item['task_xp']
                },
                'quest': {
                    'id': item['quest_id'],
                    'title': item['quest_title']
                },
                'evidence': {
                    'type': item['evidence_type'],
                    'url': item['evidence_preview'] if item['evidence_type'] != 'text' else None,
                    'preview_text': item['evidence_preview'] if item['evidence_type'] == 'text' else None,
                    'title': item.get('evidence_title')
                },
                'xp_awarded': item['task_xp'],
                'likes_count': likes_count.get(item['completion_id'], 0),
                'comments_count': comments_count.get(item['completion_id'], 0)
            })

        next_cursor = paginated_items[-1]['timestamp'] if paginated_items and has_more else None

        return jsonify({
            'items': feed_items,
            'has_more': has_more,
            'next_cursor': next_cursor
        }), 200

    except Exception as e:
        logger.error(f"Failed to fetch student activity feed: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch activity feed'}), 500


# ============================================
# PARENT ENDPOINTS - Invite Observers for Children
# ============================================

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


# ============================================
# OBSERVER FEED ENDPOINTS
# ============================================

@bp.route('/api/observers/feed', methods=['GET'])
@require_auth
def get_observer_feed(user_id):
    """
    Observer views activity feed for linked students

    Also includes:
    - Students from advisor_student_assignments for superadmin/advisor users
    - Parent's children (dependents and linked 13+ students) for parent users

    Query params:
        student_id: (optional) Filter to specific student
        limit: (optional) Number of items, default 20
        cursor: (optional) Pagination cursor (completion timestamp)

    Returns:
        200: Paginated feed of student activities
    """
    observer_id = user_id
    student_id_filter = request.args.get('student_id')
    limit = min(int(request.args.get('limit', 20)), 50)
    cursor = request.args.get('cursor')

    try:
        supabase = get_supabase_admin_client()

        # Get user role to check if they're superadmin/advisor/parent
        user_result = supabase.table('users').select('role').eq('id', observer_id).single().execute()
        user_role = user_result.data.get('role') if user_result.data else None

        # Get all linked students for this observer
        links = supabase.table('observer_student_links') \
            .select('student_id, can_view_evidence') \
            .eq('observer_id', observer_id) \
            .execute()

        student_ids = [link['student_id'] for link in links.data]
        evidence_permissions = {link['student_id']: link['can_view_evidence'] for link in links.data}

        # For superadmin or advisor, also get students from advisor_student_assignments
        if user_role in ('superadmin', 'advisor'):
            advisor_assignments = supabase.table('advisor_student_assignments') \
                .select('student_id') \
                .eq('advisor_id', observer_id) \
                .eq('is_active', True) \
                .execute()
            for assignment in advisor_assignments.data:
                sid = assignment['student_id']
                if sid not in student_ids:
                    student_ids.append(sid)
                    evidence_permissions[sid] = True  # Advisors can view evidence

        # For parents, include their children (dependents + linked students)
        if user_role == 'parent':
            # Get dependents (under 13, managed by this parent)
            dependents = supabase.table('users') \
                .select('id') \
                .eq('managed_by_parent_id', observer_id) \
                .execute()
            for dep in dependents.data:
                sid = dep['id']
                if sid not in student_ids:
                    student_ids.append(sid)
                    evidence_permissions[sid] = True  # Parents can view their children's evidence

            # Get linked students (13+, via parent_student_links)
            linked_students = supabase.table('parent_student_links') \
                .select('student_user_id') \
                .eq('parent_user_id', observer_id) \
                .eq('status', 'approved') \
                .execute()
            for linked in linked_students.data:
                sid = linked['student_user_id']
                if sid not in student_ids:
                    student_ids.append(sid)
                    evidence_permissions[sid] = True  # Parents can view their children's evidence

        if not student_ids:
            return jsonify({'items': [], 'has_more': False}), 200

        # Filter to specific student if requested
        if student_id_filter:
            if student_id_filter not in student_ids:
                return jsonify({'error': 'Access denied to this student'}), 403
            student_ids = [student_id_filter]

        # Build query for task completions
        # Note: xp_awarded is not on quest_task_completions - get it from user_quest_tasks
        query = supabase.table('quest_task_completions') \
            .select('id, user_id, quest_id, user_quest_task_id, evidence_text, evidence_url, completed_at, is_confidential') \
            .in_('user_id', student_ids) \
            .eq('is_confidential', False) \
            .order('completed_at', desc=True) \
            .limit(limit + 1)

        if cursor:
            query = query.lt('completed_at', cursor)

        completions = query.execute()

        if not completions.data:
            return jsonify({'items': [], 'has_more': False}), 200

        # Get task details
        task_ids = list(set([c['user_quest_task_id'] for c in completions.data if c['user_quest_task_id']]))
        tasks_map = {}
        if task_ids:
            tasks = supabase.table('user_quest_tasks') \
                .select('id, title, pillar, xp_value') \
                .in_('id', task_ids) \
                .execute()
            tasks_map = {t['id']: t for t in tasks.data}

        # Get quest details
        quest_ids = list(set([c['quest_id'] for c in completions.data if c['quest_id']]))
        quests_map = {}
        if quest_ids:
            quests = supabase.table('quests') \
                .select('id, title') \
                .in_('id', quest_ids) \
                .execute()
            quests_map = {q['id']: q for q in quests.data}

        # Get student details
        students = supabase.table('users') \
            .select('id, display_name, first_name, last_name, avatar_url') \
            .in_('id', student_ids) \
            .execute()
        students_map = {s['id']: s for s in students.data}

        # Get evidence document blocks for multi-format evidence
        # First, get evidence documents for these task IDs
        evidence_docs = supabase.table('user_task_evidence_documents') \
            .select('id, task_id, user_id, status') \
            .in_('task_id', task_ids) \
            .in_('user_id', student_ids) \
            .eq('status', 'completed') \
            .execute()

        # Map task_id+user_id to document_id
        doc_map = {}
        doc_ids = []
        for doc in evidence_docs.data:
            key = f"{doc['task_id']}_{doc['user_id']}"
            doc_map[key] = doc['id']
            doc_ids.append(doc['id'])

        # Get all evidence blocks for these documents (excluding private ones)
        evidence_blocks_map = {}  # document_id -> list of blocks
        if doc_ids:
            blocks = supabase.table('evidence_document_blocks') \
                .select('id, document_id, block_type, content, order_index, created_at, is_private') \
                .in_('document_id', doc_ids) \
                .eq('is_private', False) \
                .order('order_index') \
                .execute()

            for block in blocks.data:
                doc_id = block['document_id']
                if doc_id not in evidence_blocks_map:
                    evidence_blocks_map[doc_id] = []
                evidence_blocks_map[doc_id].append(block)

        # Build feed items - one per evidence block
        raw_feed_items = []
        for completion in completions.data:
            student_info = students_map.get(completion['user_id'], {})
            task_info = tasks_map.get(completion['user_quest_task_id'], {})
            quest_info = quests_map.get(completion['quest_id'], {})
            can_view = evidence_permissions.get(completion['user_id'], False)

            if not can_view:
                continue

            # Check if this completion has multi-format evidence
            doc_key = f"{completion['user_quest_task_id']}_{completion['user_id']}"
            doc_id = doc_map.get(doc_key)

            if doc_id and doc_id in evidence_blocks_map:
                # Create one feed item per evidence block
                for block in evidence_blocks_map[doc_id]:
                    evidence_type = None
                    evidence_preview = None
                    evidence_title = None
                    content = block.get('content', {})

                    # Helper to extract URL from content - handles both new format (items array)
                    # and legacy format (direct url property)
                    def get_content_url(content_obj):
                        items = content_obj.get('items', [])
                        if items and len(items) > 0:
                            return items[0].get('url')
                        return content_obj.get('url')

                    if block['block_type'] == 'image':
                        evidence_type = 'image'
                        evidence_preview = get_content_url(content)
                    elif block['block_type'] == 'video':
                        evidence_type = 'video'
                        evidence_preview = get_content_url(content)
                        evidence_title = content.get('title')
                    elif block['block_type'] == 'link':
                        evidence_type = 'link'
                        evidence_preview = get_content_url(content)
                        evidence_title = content.get('title')
                    elif block['block_type'] == 'text':
                        evidence_type = 'text'
                        text = content.get('text', '')
                        evidence_preview = text[:200] + '...' if len(text) > 200 else text
                    elif block['block_type'] == 'document':
                        evidence_type = 'link'
                        evidence_preview = get_content_url(content)
                        evidence_title = content.get('title') or content.get('filename')

                    if evidence_type:
                        student_name = student_info.get('display_name') or \
                            f"{student_info.get('first_name', '')} {student_info.get('last_name', '')}".strip() or 'Student'

                        raw_feed_items.append({
                            'id': f"{completion['id']}_{block['id']}",
                            'completion_id': completion['id'],
                            'block_id': block['id'],
                            'timestamp': block.get('created_at') or completion['completed_at'],
                            'student_id': completion['user_id'],
                            'student_name': student_name,
                            'student_avatar': student_info.get('avatar_url'),
                            'task_id': completion['user_quest_task_id'],
                            'task_title': task_info.get('title', 'Task'),
                            'task_pillar': task_info.get('pillar'),
                            'task_xp': task_info.get('xp_value', 0),
                            'quest_id': completion['quest_id'],
                            'quest_title': quest_info.get('title', 'Quest'),
                            'evidence_type': evidence_type,
                            'evidence_preview': evidence_preview,
                            'evidence_title': evidence_title
                        })
            else:
                # Fallback: legacy evidence (text/url directly on completion)
                # Skip if evidence_text is a document reference
                evidence_text = completion.get('evidence_text', '')
                if evidence_text and 'Multi-format evidence document' in evidence_text:
                    continue  # Skip - no blocks found for this document

                evidence_type = None
                evidence_preview = None

                if completion.get('evidence_url'):
                    url = completion['evidence_url'].lower()
                    if any(url.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
                        evidence_type = 'image'
                        evidence_preview = completion['evidence_url']
                    elif 'youtube.com' in url or 'youtu.be' in url or 'vimeo.com' in url:
                        evidence_type = 'video'
                        evidence_preview = completion['evidence_url']
                    else:
                        evidence_type = 'link'
                        evidence_preview = completion['evidence_url']
                elif evidence_text:
                    evidence_type = 'text'
                    evidence_preview = evidence_text[:200] + '...' if len(evidence_text) > 200 else evidence_text

                if evidence_type:
                    student_name = student_info.get('display_name') or \
                        f"{student_info.get('first_name', '')} {student_info.get('last_name', '')}".strip() or 'Student'

                    raw_feed_items.append({
                        'id': completion['id'],
                        'completion_id': completion['id'],
                        'block_id': None,
                        'timestamp': completion['completed_at'],
                        'student_id': completion['user_id'],
                        'student_name': student_name,
                        'student_avatar': student_info.get('avatar_url'),
                        'task_id': completion['user_quest_task_id'],
                        'task_title': task_info.get('title', 'Task'),
                        'task_pillar': task_info.get('pillar'),
                        'task_xp': task_info.get('xp_value', 0),
                        'quest_id': completion['quest_id'],
                        'quest_title': quest_info.get('title', 'Quest'),
                        'evidence_type': evidence_type,
                        'evidence_preview': evidence_preview,
                        'evidence_title': None  # Legacy evidence doesn't have titles
                    })

        # Sort by timestamp descending and paginate
        raw_feed_items.sort(key=lambda x: x['timestamp'], reverse=True)

        # Apply pagination
        has_more = len(raw_feed_items) > limit
        paginated_items = raw_feed_items[:limit]

        # Get like counts and user's likes
        completion_ids = list(set([item['completion_id'] for item in paginated_items]))
        likes_count = {}
        user_likes = set()
        try:
            if completion_ids:
                likes = supabase.table('observer_likes') \
                    .select('completion_id, observer_id') \
                    .in_('completion_id', completion_ids) \
                    .execute()

                for like in likes.data:
                    likes_count[like['completion_id']] = likes_count.get(like['completion_id'], 0) + 1
                    if like['observer_id'] == observer_id:
                        user_likes.add(like['completion_id'])
        except Exception as likes_error:
            logger.warning(f"Could not fetch observer_likes: {likes_error}")

        # Get comment counts
        comments_count = {}
        try:
            if completion_ids:
                comments = supabase.table('observer_comments') \
                    .select('task_completion_id') \
                    .in_('task_completion_id', completion_ids) \
                    .execute()

                for comment in comments.data:
                    if comment['task_completion_id']:
                        comments_count[comment['task_completion_id']] = comments_count.get(comment['task_completion_id'], 0) + 1
        except Exception as comments_error:
            logger.warning(f"Could not fetch observer_comments: {comments_error}")

        # Build final feed items in the expected format
        feed_items = []
        for item in paginated_items:
            feed_items.append({
                'type': 'task_completed',
                'id': item['id'],
                'completion_id': item['completion_id'],
                'timestamp': item['timestamp'],
                'student': {
                    'id': item['student_id'],
                    'display_name': item['student_name'],
                    'avatar_url': item['student_avatar']
                },
                'task': {
                    'id': item['task_id'],
                    'title': item['task_title'],
                    'pillar': item['task_pillar'],
                    'xp_value': item['task_xp']
                },
                'quest': {
                    'id': item['quest_id'],
                    'title': item['quest_title']
                },
                'evidence': {
                    'type': item['evidence_type'],
                    'url': item['evidence_preview'] if item['evidence_type'] != 'text' else None,
                    'preview_text': item['evidence_preview'] if item['evidence_type'] == 'text' else None,
                    'title': item.get('evidence_title')
                },
                'xp_awarded': item['task_xp'],
                'likes_count': likes_count.get(item['completion_id'], 0),
                'comments_count': comments_count.get(item['completion_id'], 0),
                'user_has_liked': item['completion_id'] in user_likes
            })

        # Log feed access
        try:
            audit_service = ObserverAuditService(user_id=observer_id)
            audit_service.log_observer_access(
                observer_id=observer_id,
                student_id=student_id_filter or student_ids[0],
                action_type='view_feed',
                resource_type='feed',
                metadata={
                    'student_filter': student_id_filter,
                    'items_returned': len(feed_items)
                }
            )
        except Exception as audit_error:
            logger.error(f"Failed to log feed access: {audit_error}")

        # Build next cursor
        next_cursor = paginated_items[-1]['timestamp'] if paginated_items and has_more else None

        return jsonify({
            'items': feed_items,
            'has_more': has_more,
            'next_cursor': next_cursor
        }), 200

    except Exception as e:
        logger.error(f"Failed to fetch observer feed: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch feed'}), 500


# ============================================
# LIKES ENDPOINTS
# ============================================

@bp.route('/api/observers/completions/<completion_id>/like', methods=['POST'])
@require_auth
@validate_uuid_param('completion_id')
def toggle_like(user_id, completion_id):
    """
    Observer toggles like on a task completion

    Args:
        user_id: UUID of authenticated user (from @require_auth)
        completion_id: UUID of task completion

    Returns:
        200: Like status toggled
        403: No access to this completion
    """
    observer_id = user_id

    try:
        supabase = get_supabase_admin_client()

        # Get the completion and verify access
        completion = supabase.table('quest_task_completions') \
            .select('user_id, is_confidential') \
            .eq('id', completion_id) \
            .single() \
            .execute()

        if not completion.data:
            return jsonify({'error': 'Completion not found'}), 404

        if completion.data['is_confidential']:
            return jsonify({'error': 'Cannot like confidential content'}), 403

        # Verify observer has access to this student
        student_id = completion.data['user_id']
        has_access = False

        # Check if superadmin (superadmins have full access)
        user_result = supabase.table('users').select('role').eq('id', observer_id).single().execute()
        user_role = user_result.data.get('role') if user_result.data else None
        if user_role == 'superadmin':
            has_access = True

        # Check observer_student_links
        if not has_access:
            link = supabase.table('observer_student_links') \
                .select('id') \
                .eq('observer_id', observer_id) \
                .eq('student_id', student_id) \
                .execute()
            has_access = bool(link.data)

        # Check advisor_student_assignments for advisors
        if not has_access and user_role == 'advisor':
            advisor_link = supabase.table('advisor_student_assignments') \
                .select('id') \
                .eq('advisor_id', observer_id) \
                .eq('student_id', student_id) \
                .eq('is_active', True) \
                .execute()
            has_access = bool(advisor_link.data)

        if not has_access:
            return jsonify({'error': 'Access denied'}), 403

        # Check if already liked
        try:
            existing = supabase.table('observer_likes') \
                .select('id') \
                .eq('observer_id', observer_id) \
                .eq('completion_id', completion_id) \
                .execute()
        except Exception as table_error:
            logger.error(f"observer_likes table may not exist: {table_error}")
            return jsonify({'error': 'Likes feature is not available. Please run the database migration.'}), 503

        if existing.data:
            # Unlike
            supabase.table('observer_likes') \
                .delete() \
                .eq('id', existing.data[0]['id']) \
                .execute()

            logger.info(f"Observer unliked completion: observer={observer_id}, completion={completion_id}")
            return jsonify({'liked': False, 'status': 'unliked'}), 200
        else:
            # Like
            supabase.table('observer_likes').insert({
                'observer_id': observer_id,
                'completion_id': completion_id
            }).execute()

            logger.info(f"Observer liked completion: observer={observer_id}, completion={completion_id}")
            return jsonify({'liked': True, 'status': 'liked'}), 200

    except Exception as e:
        logger.error(f"Failed to toggle like: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to toggle like'}), 500


@bp.route('/api/observers/completions/<completion_id>/comments', methods=['GET'])
@require_auth
@validate_uuid_param('completion_id')
def get_completion_comments(user_id, completion_id):
    """
    Get comments on a specific task completion

    Args:
        user_id: UUID of authenticated user (from @require_auth)
        completion_id: UUID of task completion

    Returns:
        200: List of comments
        403: Access denied
    """

    try:
        supabase = get_supabase_admin_client()

        # Get completion info
        completion = supabase.table('quest_task_completions') \
            .select('user_id') \
            .eq('id', completion_id) \
            .single() \
            .execute()

        if not completion.data:
            return jsonify({'error': 'Completion not found'}), 404

        student_id = completion.data['user_id']

        # Verify access (student themselves, observer, superadmin, or advisor)
        if user_id != student_id:
            has_access = False

            # Check if superadmin (superadmins have full access)
            user_result = supabase.table('users').select('role').eq('id', user_id).single().execute()
            user_role = user_result.data.get('role') if user_result.data else None
            logger.info(f"get_completion_comments: user_id={user_id}, student_id={student_id}, user_role={user_role}")
            if user_role == 'superadmin':
                has_access = True
                logger.info(f"get_completion_comments: superadmin access granted")

            # Check observer_student_links
            if not has_access:
                link = supabase.table('observer_student_links') \
                    .select('id') \
                    .eq('observer_id', user_id) \
                    .eq('student_id', student_id) \
                    .execute()

                if link.data:
                    has_access = True

            # Check advisor_student_assignments for advisors
            if not has_access and user_role == 'advisor':
                advisor_link = supabase.table('advisor_student_assignments') \
                    .select('id') \
                    .eq('advisor_id', user_id) \
                    .eq('student_id', student_id) \
                    .eq('is_active', True) \
                    .execute()
                if advisor_link.data:
                    has_access = True

            if not has_access:
                return jsonify({'error': 'Access denied'}), 403

        # Get comments
        comments = supabase.table('observer_comments') \
            .select('*') \
            .eq('task_completion_id', completion_id) \
            .order('created_at', desc=False) \
            .execute()

        # Get observer details
        observer_ids = list(set([c['observer_id'] for c in comments.data]))
        comments_data = comments.data

        if observer_ids:
            observers = supabase.table('users') \
                .select('id, first_name, last_name, display_name, avatar_url') \
                .in_('id', observer_ids) \
                .execute()

            observer_map = {obs['id']: obs for obs in observers.data}

            for comment in comments_data:
                comment['observer'] = observer_map.get(comment['observer_id'], {})

        return jsonify({'comments': comments_data}), 200

    except Exception as e:
        logger.error(f"Failed to fetch completion comments: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch comments'}), 500


# ============================================
# FAMILY OBSERVER ENDPOINTS
# ============================================

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


# ============================================
# UTILITY ENDPOINTS
# ============================================

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
