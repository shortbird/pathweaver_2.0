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
from utils.auth.decorators import require_auth
from middleware.rate_limiter import rate_limit
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('observer', __name__)

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
        frontend_url = request.environ.get('FRONTEND_URL', 'http://localhost:5173')
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
def get_my_observers():
    """
    Student views linked observers

    Returns:
        200: List of linked observers with relationship details
    """
    user_id = request.user_id

    try:
        supabase = get_user_client()

        # Note: Using raw query since Supabase Python client doesn't support joins well
        links = supabase.table('observer_student_links') \
            .select('*, observer:observer_id(id, email, first_name, last_name)') \
            .eq('student_id', user_id) \
            .execute()

        return jsonify({'observers': links.data}), 200

    except Exception as e:
        logger.error(f"Failed to fetch observers: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch observers'}), 500


@bp.route('/api/observers/<link_id>/remove', methods=['DELETE'])
@require_auth
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
@rate_limit(limit=5, per=300)  # 5 attempts per 5 minutes
def accept_observer_invitation(invitation_code):
    """
    Observer accepts invitation (creates account if needed)

    Body (optional if user already logged in):
        email: Observer email
        first_name: Observer first name
        last_name: Observer last name
        password: Password for new account
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

        # Check if observer already has account
        observer = supabase.table('users') \
            .select('id') \
            .eq('email', inv['observer_email']) \
            .execute()

        if observer.data:
            observer_id = observer.data[0]['id']
            logger.info(f"Existing observer account found: {observer_id}")
        else:
            # Create new observer account
            name_parts = inv['observer_name'].split()
            first_name = data.get('first_name', name_parts[0] if name_parts else '')
            last_name = data.get('last_name', ' '.join(name_parts[1:]) if len(name_parts) > 1 else '')

            new_observer = supabase.table('users').insert({
                'email': inv['observer_email'],
                'first_name': first_name,
                'last_name': last_name,
                'role': 'observer',
                'display_name': inv['observer_name']
            }).execute()

            observer_id = new_observer.data[0]['id']
            logger.info(f"Created new observer account: {observer_id}")

        # Check if link already exists
        existing_link = supabase.table('observer_student_links') \
            .select('id') \
            .eq('observer_id', observer_id) \
            .eq('student_id', inv['student_id']) \
            .execute()

        if not existing_link.data:
            # Create observer-student link
            supabase.table('observer_student_links').insert({
                'observer_id': observer_id,
                'student_id': inv['student_id'],
                'relationship': data.get('relationship', 'other'),
                'can_comment': True,
                'can_view_evidence': True,
                'notifications_enabled': True
            }).execute()

        # Mark invitation as accepted
        supabase.table('observer_invitations') \
            .update({
                'status': 'accepted',
                'accepted_at': datetime.utcnow().isoformat()
            }) \
            .eq('id', inv['id']) \
            .execute()

        logger.info(f"Observer invitation accepted: observer={observer_id}, student={inv['student_id']}")

        return jsonify({
            'status': 'success',
            'observer_id': observer_id,
            'student_id': inv['student_id']
        }), 200

    except Exception as e:
        logger.error(f"Failed to accept observer invitation: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to accept invitation'}), 500


@bp.route('/api/observers/my-students', methods=['GET'])
@require_auth
def get_my_students():
    """
    Observer views linked students

    Returns:
        200: List of students observer has access to
    """
    user_id = request.user_id

    try:
        supabase = get_user_client()

        links = supabase.table('observer_student_links') \
            .select('*, student:student_id(id, first_name, last_name, portfolio_slug, avatar_url)') \
            .eq('observer_id', user_id) \
            .execute()

        return jsonify({'students': links.data}), 200

    except Exception as e:
        logger.error(f"Failed to fetch students: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch students'}), 500


@bp.route('/api/observers/student/<student_id>/portfolio', methods=['GET'])
@require_auth
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

        return jsonify(portfolio_data), 200

    except Exception as e:
        logger.error(f"Failed to fetch student portfolio: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch portfolio'}), 500


@bp.route('/api/observers/comments', methods=['POST'])
@require_auth
@rate_limit(limit=20, per=3600)  # 20 comments per hour
def post_observer_comment():
    """
    Observer leaves encouraging comment on completed work

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
    observer_id = request.user_id
    data = request.json

    # Validate required fields
    if not data.get('student_id') or not data.get('comment_text'):
        return jsonify({'error': 'student_id and comment_text are required'}), 400

    if len(data['comment_text']) > 2000:
        return jsonify({'error': 'Comment text exceeds maximum length of 2000 characters'}), 400

    try:
        supabase = get_supabase_admin_client()

        # Verify observer has access and comment permission
        link = supabase.table('observer_student_links') \
            .select('can_comment') \
            .eq('observer_id', observer_id) \
            .eq('student_id', data['student_id']) \
            .execute()

        if not link.data or not link.data[0]['can_comment']:
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

        return jsonify({
            'status': 'success',
            'comment': comment.data[0]
        }), 200

    except Exception as e:
        logger.error(f"Failed to post observer comment: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to post comment'}), 500


@bp.route('/api/observers/student/<student_id>/comments', methods=['GET'])
@require_auth
def get_student_comments(student_id):
    """
    Get all observer comments for a student

    Accessible by:
    - The student themselves
    - Observers linked to the student

    Args:
        student_id: UUID of student

    Returns:
        200: List of comments
        403: Access denied
    """
    user_id = request.user_id

    try:
        supabase = get_user_client()

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
            .select('*, observer:observer_id(first_name, last_name)') \
            .eq('student_id', student_id) \
            .order('created_at', desc=True) \
            .execute()

        return jsonify({'comments': comments.data}), 200

    except Exception as e:
        logger.error(f"Failed to fetch comments: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch comments'}), 500


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
        supabase = get_user_client()

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
            .select('*, student:student_id(first_name, last_name)') \
            .eq('observer_email', email) \
            .eq('status', 'pending') \
            .execute()

        return jsonify({'invitations': invitations.data}), 200

    except Exception as e:
        logger.error(f"Failed to fetch pending invitations: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch invitations'}), 500
