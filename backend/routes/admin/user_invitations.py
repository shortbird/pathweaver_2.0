"""
Organization User Invitations Routes

Handles email invitations for org admins to invite users to join their organization.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_org_admin
from utils.validation import sanitize_input
from utils.logger import get_logger
from middleware.rate_limiter import rate_limit
import secrets
import re
import time
from datetime import datetime, timedelta

logger = get_logger(__name__)

bp = Blueprint('user_invitations', __name__, url_prefix='/api/admin/organizations')

# Valid roles that can be assigned via invitation
VALID_INVITATION_ROLES = ['student', 'parent', 'advisor', 'org_admin', 'observer']


def get_role_with_article(role):
    """Return role with correct article (a/an)."""
    vowel_roles = ['advisor', 'observer', 'org_admin']
    article = 'an' if role in vowel_roles else 'a'
    return f"{article} {role}"


def generate_invitation_code():
    """Generate a secure unique invitation code"""
    return secrets.token_urlsafe(32)


def validate_email(email):
    """Basic email validation"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


@bp.route('/<org_id>/invitations', methods=['GET'])
@require_org_admin
def get_org_invitations(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Get all invitations for an organization

    Query params:
        status: Filter by status (pending, accepted, expired, cancelled)
    """
    try:
        supabase = get_supabase_admin_client()

        # Build query
        query = supabase.table('org_invitations') \
            .select('*') \
            .eq('organization_id', org_id) \
            .order('created_at', desc=True)

        # Optional status filter
        status = request.args.get('status')
        if status:
            query = query.eq('status', status)

        result = query.execute()

        # Auto-expire old pending invitations
        now = datetime.utcnow()
        invitations = []
        for inv in result.data:
            # Check if expired
            expires_at = datetime.fromisoformat(inv['expires_at'].replace('Z', '+00:00'))
            if inv['status'] == 'pending' and expires_at < now.replace(tzinfo=expires_at.tzinfo):
                # Mark as expired in database
                try:
                    supabase.table('org_invitations') \
                        .update({'status': 'expired'}) \
                        .eq('id', inv['id']) \
                        .execute()
                    inv['status'] = 'expired'
                except Exception as e:
                    logger.warning(f"Failed to update expired invitation: {e}")
            invitations.append(inv)

        return jsonify({
            'invitations': invitations,
            'total': len(invitations)
        }), 200

    except Exception as e:
        logger.error(f"Failed to get invitations for org {org_id}: {e}")
        return jsonify({'error': 'Failed to fetch invitations'}), 500


@bp.route('/<org_id>/invitations/parent', methods=['POST'])
@require_org_admin
@rate_limit(max_requests=20, window_seconds=300)  # 20 invitations per 5 minutes
def create_parent_invitation(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Create and send a parent invitation with student links

    Body:
        email: Email address to invite
        name: Name of the person being invited (optional)
        student_ids: List of student UUIDs to auto-link upon acceptance
        send_email: Whether to send email (default: true)
    """
    try:
        data = request.json
        user_id = current_user_id

        # Validate required fields
        email = data.get('email', '').strip().lower()
        if not email:
            return jsonify({'error': 'Email is required'}), 400

        if not validate_email(email):
            return jsonify({'error': 'Invalid email format'}), 400

        student_ids = data.get('student_ids', [])
        if not student_ids or not isinstance(student_ids, list):
            return jsonify({'error': 'At least one student must be selected'}), 400

        invited_name = sanitize_input(data.get('name', ''))
        send_email = data.get('send_email', True)

        supabase = get_supabase_admin_client()

        # Validate student_ids belong to org and have student role
        students_result = supabase.table('users') \
            .select('id, first_name, last_name, org_role') \
            .eq('organization_id', org_id) \
            .in_('id', student_ids) \
            .execute()

        valid_students = [s for s in students_result.data if s.get('org_role') == 'student']
        if len(valid_students) != len(student_ids):
            return jsonify({'error': 'One or more students are invalid or not in this organization'}), 400

        # Check if user already exists in this organization
        existing_in_org = supabase.table('users') \
            .select('id, email') \
            .eq('email', email) \
            .eq('organization_id', org_id) \
            .execute()

        if existing_in_org.data:
            return jsonify({'error': 'User is already a member of this organization'}), 409

        # Check if user has an Optio account (but not in this org)
        # If so, add them directly without sending invitation email
        existing_user = supabase.table('users') \
            .select('id, email, first_name, last_name') \
            .eq('email', email) \
            .execute()

        if existing_user.data:
            # User already has an account - add them to org and link to students directly
            user = existing_user.data[0]
            user_id = user['id']

            # Update user's organization and role
            supabase.table('users') \
                .update({
                    'organization_id': org_id,
                    'role': 'org_managed',
                    'org_role': 'parent'
                }) \
                .eq('id', user_id) \
                .execute()

            # Create parent-student links
            linked_students = _create_parent_student_links(
                supabase, user_id, student_ids, org_id
            )

            logger.info(f"Added existing user {email} to org {org_id} as parent and linked to {len(linked_students)} students")

            return jsonify({
                'success': True,
                'existing_user': True,
                'user_added': True,
                'linked_students': linked_students,
                'message': f'{user["first_name"]} {user["last_name"]} has been added to your organization and connected to their student(s).'
            }), 200

        # Check for existing pending invitation
        existing_invitation = supabase.table('org_invitations') \
            .select('id, status, expires_at') \
            .eq('organization_id', org_id) \
            .eq('email', email) \
            .eq('status', 'pending') \
            .execute()

        if existing_invitation.data:
            # Check if still valid
            inv = existing_invitation.data[0]
            expires_at = datetime.fromisoformat(inv['expires_at'].replace('Z', '+00:00'))
            if expires_at > datetime.utcnow().replace(tzinfo=expires_at.tzinfo):
                return jsonify({'error': 'A pending invitation already exists for this email'}), 409
            else:
                # Mark old one as expired
                supabase.table('org_invitations') \
                    .update({'status': 'expired'}) \
                    .eq('id', inv['id']) \
                    .execute()

        # Get organization details
        org_result = supabase.table('organizations') \
            .select('name, slug') \
            .eq('id', org_id) \
            .single() \
            .execute()

        if not org_result.data:
            return jsonify({'error': 'Organization not found'}), 404

        org_name = org_result.data['name']

        # Get inviter name
        inviter_result = supabase.table('users') \
            .select('display_name, first_name, last_name') \
            .eq('id', user_id) \
            .single() \
            .execute()

        inviter_name = 'The team'
        if inviter_result.data:
            user_data = inviter_result.data
            inviter_name = user_data.get('display_name') or \
                          f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}".strip() or \
                          'The team'

        # Generate invitation code and expiration
        invitation_code = generate_invitation_code()
        expires_at = datetime.utcnow() + timedelta(days=7)

        # Build student names for email
        student_names = [f"{s['first_name']} {s['last_name']}" for s in valid_students]
        student_names_str = ', '.join(student_names[:-1]) + (' and ' if len(student_names) > 1 else '') + student_names[-1] if len(student_names) > 1 else student_names[0]

        # Create invitation record with metadata
        invitation_data = {
            'organization_id': org_id,
            'email': email,
            'invited_name': invited_name,
            'role': 'parent',
            'invitation_code': invitation_code,
            'invited_by': user_id,
            'status': 'pending',
            'expires_at': expires_at.isoformat(),
            'metadata': {
                'invitation_type': 'parent',
                'student_ids': student_ids
            }
        }

        result = supabase.table('org_invitations').insert(invitation_data).execute()

        if not result.data:
            return jsonify({'error': 'Failed to create invitation'}), 500

        invitation = result.data[0]

        # Send email if requested
        email_sent = False
        if send_email:
            try:
                from app_config import Config
                frontend_url = Config.FRONTEND_URL
                invitation_link = f"{frontend_url}/invitation/{invitation_code}"

                from services.email_service import EmailService
                email_service = EmailService()

                # Use the org_parent_invitation template
                email_sent = email_service.send_templated_email(
                    to_email=email,
                    subject=f"{org_name} invites you to connect with {student_names_str} on Optio",
                    template_name='org_parent_invitation',
                    context={
                        'invited_name': invited_name or 'there',
                        'inviter_name': inviter_name,
                        'org_name': org_name,
                        'student_names': student_names_str,
                        'student_count': len(valid_students),
                        'invitation_link': invitation_link,
                        'expires_days': 7
                    }
                )

                if not email_sent:
                    logger.warning(f"Failed to send parent invitation email to {email}")

            except Exception as e:
                logger.error(f"Error sending parent invitation email: {e}")

        return jsonify({
            'success': True,
            'invitation': invitation,
            'email_sent': email_sent,
            'students': valid_students,
            'message': 'Parent invitation created successfully'
        }), 201

    except Exception as e:
        logger.error(f"Failed to create parent invitation for org {org_id}: {e}")
        return jsonify({'error': 'Failed to create parent invitation'}), 500


@bp.route('/<org_id>/invitations', methods=['POST'])
@require_org_admin
@rate_limit(max_requests=20, window_seconds=300)  # 20 invitations per 5 minutes
def create_invitation(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Create and send an invitation to join the organization

    Body:
        email: Email address to invite
        name: Name of the person being invited (optional)
        role: Role to assign (student, parent, advisor, org_admin, observer)
        send_email: Whether to send email (default: true)
    """
    try:
        data = request.json
        user_id = current_user_id

        # Validate required fields
        email = data.get('email', '').strip().lower()
        if not email:
            return jsonify({'error': 'Email is required'}), 400

        if not validate_email(email):
            return jsonify({'error': 'Invalid email format'}), 400

        role = data.get('role', 'student').lower()
        if role not in VALID_INVITATION_ROLES:
            return jsonify({'error': f'Invalid role. Must be one of: {", ".join(VALID_INVITATION_ROLES)}'}), 400

        invited_name = sanitize_input(data.get('name', ''))
        send_email = data.get('send_email', True)

        supabase = get_supabase_admin_client()

        # Check if user already exists in this organization
        existing_user = supabase.table('users') \
            .select('id, email') \
            .eq('email', email) \
            .eq('organization_id', org_id) \
            .execute()

        if existing_user.data:
            return jsonify({'error': 'User is already a member of this organization'}), 409

        # Check for existing pending invitation
        existing_invitation = supabase.table('org_invitations') \
            .select('id, status, expires_at') \
            .eq('organization_id', org_id) \
            .eq('email', email) \
            .eq('status', 'pending') \
            .execute()

        if existing_invitation.data:
            # Check if still valid
            inv = existing_invitation.data[0]
            expires_at = datetime.fromisoformat(inv['expires_at'].replace('Z', '+00:00'))
            if expires_at > datetime.utcnow().replace(tzinfo=expires_at.tzinfo):
                return jsonify({'error': 'A pending invitation already exists for this email'}), 409
            else:
                # Mark old one as expired
                supabase.table('org_invitations') \
                    .update({'status': 'expired'}) \
                    .eq('id', inv['id']) \
                    .execute()

        # Get organization details
        org_result = supabase.table('organizations') \
            .select('name, slug') \
            .eq('id', org_id) \
            .single() \
            .execute()

        if not org_result.data:
            return jsonify({'error': 'Organization not found'}), 404

        org_name = org_result.data['name']

        # Get inviter name
        inviter_result = supabase.table('users') \
            .select('display_name, first_name, last_name') \
            .eq('id', user_id) \
            .single() \
            .execute()

        inviter_name = 'The team'
        if inviter_result.data:
            user_data = inviter_result.data
            inviter_name = user_data.get('display_name') or \
                          f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}".strip() or \
                          'The team'

        # Generate invitation code and expiration
        invitation_code = generate_invitation_code()
        expires_at = datetime.utcnow() + timedelta(days=7)

        # Create invitation record
        invitation_data = {
            'organization_id': org_id,
            'email': email,
            'invited_name': invited_name,
            'role': role,
            'invitation_code': invitation_code,
            'invited_by': user_id,
            'status': 'pending',
            'expires_at': expires_at.isoformat()
        }

        result = supabase.table('org_invitations').insert(invitation_data).execute()

        if not result.data:
            return jsonify({'error': 'Failed to create invitation'}), 500

        invitation = result.data[0]

        # Send email if requested
        email_sent = False
        if send_email:
            try:
                from app_config import Config
                frontend_url = Config.FRONTEND_URL
                invitation_link = f"{frontend_url}/invitation/{invitation_code}"

                from services.email_service import EmailService
                email_service = EmailService()

                # Use the org_invitation template
                email_sent = email_service.send_templated_email(
                    to_email=email,
                    subject=f"You're invited to join {org_name} on Optio",
                    template_name='org_invitation',
                    context={
                        'invited_name': invited_name or 'there',
                        'inviter_name': inviter_name,
                        'org_name': org_name,
                        'role_with_article': get_role_with_article(role),
                        'invitation_link': invitation_link
                    }
                )

                if not email_sent:
                    logger.warning(f"Failed to send invitation email to {email}")

            except Exception as e:
                logger.error(f"Error sending invitation email: {e}")

        return jsonify({
            'success': True,
            'invitation': invitation,
            'email_sent': email_sent,
            'message': 'Invitation created successfully'
        }), 201

    except Exception as e:
        logger.error(f"Failed to create invitation for org {org_id}: {e}")
        return jsonify({'error': 'Failed to create invitation'}), 500


@bp.route('/<org_id>/invitations/<invitation_id>/resend', methods=['POST'])
@require_org_admin
@rate_limit(max_requests=10, window_seconds=300)  # 10 resends per 5 minutes
def resend_invitation(current_user_id, current_org_id, is_superadmin, org_id, invitation_id):
    """
    Resend an invitation email and optionally extend expiration
    """
    try:
        supabase = get_supabase_admin_client()

        # Get the invitation
        invitation = supabase.table('org_invitations') \
            .select('*') \
            .eq('id', invitation_id) \
            .eq('organization_id', org_id) \
            .single() \
            .execute()

        if not invitation.data:
            return jsonify({'error': 'Invitation not found'}), 404

        inv = invitation.data

        if inv['status'] != 'pending':
            return jsonify({'error': f'Cannot resend {inv["status"]} invitation'}), 400

        # Get organization details
        org_result = supabase.table('organizations') \
            .select('name') \
            .eq('id', org_id) \
            .single() \
            .execute()

        org_name = org_result.data['name'] if org_result.data else 'the organization'

        # Get inviter name
        inviter_result = supabase.table('users') \
            .select('display_name, first_name, last_name') \
            .eq('id', inv['invited_by']) \
            .single() \
            .execute()

        inviter_name = 'The team'
        if inviter_result.data:
            user_data = inviter_result.data
            inviter_name = user_data.get('display_name') or \
                          f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}".strip() or \
                          'The team'

        # Optionally extend expiration
        extend = request.json.get('extend_expiration', True) if request.json else True
        if extend:
            new_expires = datetime.utcnow() + timedelta(days=7)
            supabase.table('org_invitations') \
                .update({'expires_at': new_expires.isoformat()}) \
                .eq('id', invitation_id) \
                .execute()

        # Send email
        try:
            from app_config import Config
            frontend_url = Config.FRONTEND_URL
            invitation_link = f"{frontend_url}/invitation/{inv['invitation_code']}"

            from services.email_service import EmailService
            email_service = EmailService()

            email_sent = email_service.send_templated_email(
                to_email=inv['email'],
                subject=f"Reminder: You're invited to join {org_name} on Optio",
                template_name='org_invitation',
                context={
                    'invited_name': inv['invited_name'] or 'there',
                    'inviter_name': inviter_name,
                    'org_name': org_name,
                    'role_with_article': get_role_with_article(inv['role']),
                    'invitation_link': invitation_link
                }
            )

            if email_sent:
                return jsonify({
                    'success': True,
                    'message': 'Invitation resent successfully'
                }), 200
            else:
                return jsonify({
                    'success': False,
                    'error': 'Failed to send email'
                }), 500

        except Exception as e:
            logger.error(f"Error resending invitation email: {e}")
            return jsonify({'error': 'Failed to send email'}), 500

    except Exception as e:
        logger.error(f"Failed to resend invitation: {e}")
        return jsonify({'error': 'Failed to resend invitation'}), 500


@bp.route('/<org_id>/invitations/link', methods=['POST'])
@require_org_admin
@rate_limit(max_requests=20, window_seconds=300)  # 20 links per 5 minutes
def generate_invitation_link(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Generate a shareable invitation link for the organization.

    Unlike email-based invitations, this creates a link that can be shared
    manually (via Slack, WhatsApp, in-person, etc.) and allows anyone with
    the link to join the organization.

    Body:
        role: Role to assign (student, parent, advisor, org_admin, observer)

    Returns:
        201: Invitation link created with shareable_link
    """
    try:
        data = request.json or {}
        user_id = current_user_id

        role = data.get('role', 'student').lower()
        if role not in VALID_INVITATION_ROLES:
            return jsonify({'error': f'Invalid role. Must be one of: {", ".join(VALID_INVITATION_ROLES)}'}), 400

        supabase = get_supabase_admin_client()

        # Get organization details
        org_result = supabase.table('organizations') \
            .select('name, slug') \
            .eq('id', org_id) \
            .single() \
            .execute()

        if not org_result.data:
            return jsonify({'error': 'Organization not found'}), 404

        org_name = org_result.data['name']

        # Generate invitation code and expiration
        invitation_code = generate_invitation_code()
        expires_at = datetime.utcnow() + timedelta(days=7)

        # Create invitation with placeholder email (link-based)
        # The actual email will be provided when the user accepts
        placeholder_email = f"link-invite-{invitation_code[:12]}@pending.optio.local"

        invitation_data = {
            'organization_id': org_id,
            'email': placeholder_email,
            'invited_name': '',  # Will be provided by user
            'role': role,
            'invitation_code': invitation_code,
            'invited_by': user_id,
            'status': 'pending',
            'expires_at': expires_at.isoformat()
        }

        result = supabase.table('org_invitations').insert(invitation_data).execute()

        if not result.data:
            return jsonify({'error': 'Failed to create invitation link'}), 500

        invitation = result.data[0]

        # Build shareable link
        from app_config import Config
        frontend_url = Config.FRONTEND_URL
        shareable_link = f"{frontend_url}/invitation/{invitation_code}"

        logger.info(f"Generated invitation link for org {org_id} with role {role}")

        return jsonify({
            'success': True,
            'invitation': invitation,
            'shareable_link': shareable_link,
            'invitation_code': invitation_code,
            'expires_at': expires_at.isoformat(),
            'role': role,
            'organization_name': org_name,
            'message': 'Invitation link generated successfully'
        }), 201

    except Exception as e:
        logger.error(f"Failed to generate invitation link for org {org_id}: {e}")
        return jsonify({'error': 'Failed to generate invitation link'}), 500


@bp.route('/<org_id>/invitations/<invitation_id>', methods=['DELETE'])
@require_org_admin
def cancel_invitation(current_user_id, current_org_id, is_superadmin, org_id, invitation_id):
    """
    Cancel a pending invitation
    """
    try:
        supabase = get_supabase_admin_client()

        # Get the invitation
        invitation = supabase.table('org_invitations') \
            .select('status') \
            .eq('id', invitation_id) \
            .eq('organization_id', org_id) \
            .single() \
            .execute()

        if not invitation.data:
            return jsonify({'error': 'Invitation not found'}), 404

        if invitation.data['status'] != 'pending':
            return jsonify({'error': f'Cannot cancel {invitation.data["status"]} invitation'}), 400

        # Update status to cancelled
        supabase.table('org_invitations') \
            .update({'status': 'cancelled'}) \
            .eq('id', invitation_id) \
            .execute()

        return jsonify({
            'success': True,
            'message': 'Invitation cancelled'
        }), 200

    except Exception as e:
        logger.error(f"Failed to cancel invitation: {e}")
        return jsonify({'error': 'Failed to cancel invitation'}), 500


# Helper function for parent-student linking

def _create_parent_student_links(supabase, parent_user_id, student_ids, organization_id):
    """
    Create parent-student links for a parent invitation.
    Handles edge cases like student removed from org or already linked.

    Returns list of successfully linked student names.
    """
    linked_students = []

    for student_id in student_ids:
        try:
            # Verify student is still in the organization
            student_result = supabase.table('users') \
                .select('id, first_name, last_name, org_role') \
                .eq('id', student_id) \
                .eq('organization_id', organization_id) \
                .single() \
                .execute()

            if not student_result.data:
                logger.warning(f"Student {student_id} no longer in org {organization_id}, skipping link")
                continue

            student = student_result.data
            if student.get('org_role') != 'student':
                logger.warning(f"User {student_id} is not a student role, skipping link")
                continue

            # Check if link already exists
            existing_link = supabase.table('parent_student_links') \
                .select('id') \
                .eq('parent_user_id', parent_user_id) \
                .eq('student_user_id', student_id) \
                .execute()

            if existing_link.data:
                logger.info(f"Parent-student link already exists for parent {parent_user_id} and student {student_id}")
                linked_students.append(f"{student['first_name']} {student['last_name']}")
                continue

            # Create the link
            supabase.table('parent_student_links').insert({
                'parent_user_id': parent_user_id,
                'student_user_id': student_id,
                'status': 'approved',
                'admin_verified': True,
                'admin_notes': 'Auto-linked via parent invitation'
            }).execute()

            linked_students.append(f"{student['first_name']} {student['last_name']}")
            logger.info(f"Created parent-student link: parent={parent_user_id}, student={student_id}")

        except Exception as e:
            logger.error(f"Failed to create parent-student link for student {student_id}: {e}")
            continue

    return linked_students


# Public endpoints for accepting invitations (no auth required)

@bp.route('/invitations/validate/<invitation_code>', methods=['GET'])
def validate_invitation_code(invitation_code):
    """
    Validate an invitation code and return invitation details
    (Public endpoint - used on accept invitation page)
    """
    try:
        supabase = get_supabase_admin_client()

        # Find the invitation
        result = supabase.table('org_invitations') \
            .select('id, organization_id, email, invited_name, role, status, expires_at, metadata, organizations(name, slug, branding_config)') \
            .eq('invitation_code', invitation_code) \
            .single() \
            .execute()

        if not result.data:
            return jsonify({'valid': False, 'error': 'Invalid invitation code'}), 404

        inv = result.data

        # Check status
        if inv['status'] != 'pending':
            return jsonify({
                'valid': False,
                'error': f'This invitation has been {inv["status"]}'
            }), 400

        # Check expiration
        expires_at = datetime.fromisoformat(inv['expires_at'].replace('Z', '+00:00'))
        if expires_at < datetime.utcnow().replace(tzinfo=expires_at.tzinfo):
            # Mark as expired
            supabase.table('org_invitations') \
                .update({'status': 'expired'}) \
                .eq('id', inv['id']) \
                .execute()
            return jsonify({
                'valid': False,
                'error': 'This invitation has expired'
            }), 400

        # Check if this is a link-based invitation (no specific email required)
        is_link_based = inv['email'].startswith('link-invite-') and inv['email'].endswith('@pending.optio.local')

        response_data = {
            'valid': True,
            'invitation': {
                'email': '' if is_link_based else inv['email'],  # Don't show placeholder
                'invited_name': inv['invited_name'],
                'role': inv['role'],
                'organization': inv['organizations'],
                'is_link_based': is_link_based  # Frontend uses this to show email input
            }
        }

        # For parent invitations with student_ids, fetch student info
        metadata = inv.get('metadata') or {}
        if metadata.get('invitation_type') == 'parent' and metadata.get('student_ids'):
            student_ids = metadata['student_ids']
            students_result = supabase.table('users') \
                .select('id, first_name, last_name') \
                .in_('id', student_ids) \
                .eq('organization_id', inv['organization_id']) \
                .execute()

            response_data['invitation']['students'] = students_result.data or []
            response_data['invitation']['is_parent_invitation'] = True

        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"Failed to validate invitation code: {e}")
        return jsonify({'valid': False, 'error': 'Failed to validate invitation'}), 500


@bp.route('/invitations/check-email', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=60)  # 10 checks per minute
def check_email_exists():
    """
    Check if an email already has an Optio account.
    Used by AcceptInvitationPage to determine if user needs full registration or just password.

    Body:
        email: Email to check
        invitation_code: The invitation code (for context/logging)

    Returns:
        exists: boolean - whether account exists
        has_name: boolean - whether we have first/last name on file
    """
    try:
        data = request.json
        email = data.get('email', '').strip().lower()

        if not email or not validate_email(email):
            return jsonify({'error': 'Valid email is required'}), 400

        supabase = get_supabase_admin_client()

        # Check if user exists
        result = supabase.table('users') \
            .select('id, first_name, last_name') \
            .eq('email', email) \
            .execute()

        if result.data:
            user = result.data[0]
            has_name = bool(user.get('first_name') and user.get('last_name'))
            return jsonify({
                'exists': True,
                'has_name': has_name
            }), 200

        return jsonify({
            'exists': False,
            'has_name': False
        }), 200

    except Exception as e:
        logger.error(f"Failed to check email: {e}")
        return jsonify({'error': 'Failed to check email'}), 500


@bp.route('/invitations/accept/<invitation_code>', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=300)  # 5 attempts per 5 minutes
def accept_invitation(invitation_code):
    """
    Accept an invitation and create user account or add to organization

    Body:
        email: Email (must match invitation)
        password: Password for new account (not required if already authenticated)
        first_name: First name
        last_name: Last name
        date_of_birth: Date of birth (optional, YYYY-MM-DD)
        skip_password_check: Boolean (only valid if user is already authenticated)
    """
    try:
        from utils.session_manager import session_manager

        data = request.json
        supabase = get_supabase_admin_client()

        # Check if user is already authenticated (logged in)
        authenticated_user_id = session_manager.get_effective_user_id()
        skip_password_check = data.get('skip_password_check', False) and authenticated_user_id is not None

        # Find the invitation
        result = supabase.table('org_invitations') \
            .select('*, organizations(name, slug)') \
            .eq('invitation_code', invitation_code) \
            .single() \
            .execute()

        if not result.data:
            return jsonify({'error': 'Invalid invitation code'}), 404

        inv = result.data

        # Check status
        if inv['status'] != 'pending':
            return jsonify({'error': f'This invitation has been {inv["status"]}'}), 400

        # Check expiration
        expires_at = datetime.fromisoformat(inv['expires_at'].replace('Z', '+00:00'))
        if expires_at < datetime.utcnow().replace(tzinfo=expires_at.tzinfo):
            supabase.table('org_invitations') \
                .update({'status': 'expired'}) \
                .eq('id', inv['id']) \
                .execute()
            return jsonify({'error': 'This invitation has expired'}), 400

        # Get data from request
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        first_name = sanitize_input(data.get('first_name', ''))
        last_name = sanitize_input(data.get('last_name', ''))
        date_of_birth = data.get('date_of_birth')

        # Check if this is a link-based invitation
        is_link_based = inv['email'].startswith('link-invite-') and inv['email'].endswith('@pending.optio.local')

        # Validate email
        if not email or not validate_email(email):
            return jsonify({'error': 'Valid email is required'}), 400

        # For email-based invitations, email must match
        # For link-based invitations, any valid email is accepted
        if not is_link_based and email != inv['email'].lower():
            return jsonify({'error': 'Email does not match invitation'}), 400

        # For link-based invites, check if this email is already in the org
        if is_link_based:
            existing_in_org = supabase.table('users') \
                .select('id') \
                .eq('email', email) \
                .eq('organization_id', inv['organization_id']) \
                .execute()
            if existing_in_org.data:
                return jsonify({'error': 'This email is already a member of this organization'}), 409

        # Check if user already exists (before validating all fields)
        # Existing users only need password verification
        existing_user = supabase.table('users') \
            .select('id, organization_id, first_name, last_name') \
            .eq('email', email) \
            .execute()

        is_existing_user = bool(existing_user.data)

        # Validate password (not required if user is already authenticated)
        if not skip_password_check and (not password or len(password) < 8):
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        # Only require name for new users
        if not is_existing_user and (not first_name or not last_name):
            return jsonify({'error': 'First name and last name are required'}), 400

        # Handle existing user
        if is_existing_user:
            user = existing_user.data[0]

            # If user is already authenticated, verify their identity matches
            if skip_password_check:
                if authenticated_user_id != user['id']:
                    return jsonify({'error': 'Authenticated user does not match invitation email'}), 403
                logger.info(f"Authenticated user {authenticated_user_id} joining org via invitation (password check skipped)")
            else:
                # User is not authenticated - verify password through Supabase Auth
                try:
                    auth_response = supabase.auth.sign_in_with_password({
                        'email': email,
                        'password': password
                    })
                    if not auth_response.user:
                        return jsonify({'error': 'Invalid password'}), 401
                except Exception as auth_error:
                    error_str = str(auth_error).lower()
                    # Check if this is an OAuth user (no password set)
                    if 'invalid login credentials' in error_str or 'invalid password' in error_str:
                        # Could be OAuth user - suggest logging in first
                        return jsonify({
                            'error': 'Unable to verify password. If you signed up with Google or another provider, please log in first and then use the invitation link.',
                            'oauth_hint': True
                        }), 401
                    logger.warning(f"Password verification failed for {email}: {auth_error}")
                    return jsonify({'error': 'Invalid password. Please try again.'}), 401

            # Identity verified - update user's organization and role
            # Organization users have role='org_managed' with actual role in org_role
            supabase.table('users') \
                .update({
                    'organization_id': inv['organization_id'],
                    'role': 'org_managed',
                    'org_role': inv['role']
                }) \
                .eq('id', user['id']) \
                .execute()

            # For email-based invitations, mark as accepted
            # For link-based invitations, keep them pending so they can be reused
            if not is_link_based:
                supabase.table('org_invitations') \
                    .update({
                        'status': 'accepted',
                        'accepted_at': datetime.utcnow().isoformat(),
                        'accepted_by': user['id']
                    }) \
                    .eq('id', inv['id']) \
                    .execute()

            # Handle parent invitation - auto-create parent-student links
            linked_students = []
            metadata = inv.get('metadata') or {}
            if metadata.get('invitation_type') == 'parent' and metadata.get('student_ids'):
                linked_students = _create_parent_student_links(
                    supabase, user['id'], metadata['student_ids'], inv['organization_id']
                )

            return jsonify({
                'success': True,
                'message': 'You have been added to the organization',
                'existing_user': True,
                'linked_students': linked_students
            }), 200

        # Create new user
        try:
            from app_config import Config

            # Create auth user - requires email verification
            auth_response = supabase.auth.admin.create_user({
                'email': email,
                'password': password,
                'email_confirm': False,  # Require email verification
                'user_metadata': {
                    'first_name': first_name,
                    'last_name': last_name
                }
            })

            # Trigger verification email via Supabase Auth
            try:
                supabase.auth.resend({"type": "signup", "email": email})
                logger.info(f"Verification email sent to {email}")
            except Exception as email_err:
                logger.warning(f"Failed to send verification email: {email_err}")

            if not auth_response.user:
                return jsonify({'error': 'Failed to create user account'}), 500

            user_id = auth_response.user.id

            # Create user profile
            # Organization users have role='org_managed' with actual role in org_role
            profile_data = {
                'id': user_id,
                'email': email,
                'first_name': first_name,
                'last_name': last_name,
                'display_name': f"{first_name} {last_name}",
                'role': 'org_managed',
                'org_role': inv['role'],
                'organization_id': inv['organization_id']
            }

            if date_of_birth:
                profile_data['date_of_birth'] = date_of_birth

            # Retry logic for FK constraint errors (auth user may not be immediately visible)
            max_retries = 3
            retry_delay = 0.5  # seconds
            profile_created = False

            for attempt in range(max_retries):
                try:
                    supabase.table('users').upsert(profile_data, on_conflict='id').execute()
                    profile_created = True
                    break
                except Exception as profile_error:
                    error_str = str(profile_error).lower()
                    if ('foreign key' in error_str or '23503' in error_str) and attempt < max_retries - 1:
                        # FK constraint error - auth user may not be visible yet, retry
                        logger.warning(f"Profile creation FK error, retrying in {retry_delay}s (attempt {attempt + 1}/{max_retries})")
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                    elif 'foreign key' in error_str or '23503' in error_str:
                        # Final attempt failed - auth user doesn't exist
                        logger.error(f"Profile creation failed after {max_retries} attempts: {profile_error}")
                        raise Exception("Registration failed. Please try again in a few moments.")
                    else:
                        # Re-raise other errors
                        raise

            if not profile_created:
                raise Exception("Failed to create user profile. Please try again.")

            # Initialize diploma and skills
            from routes.auth.registration import ensure_user_diploma_and_skills
            ensure_user_diploma_and_skills(supabase, user_id, first_name, last_name)

            # For email-based invitations, mark as accepted
            # For link-based invitations, keep them pending so they can be reused
            if not is_link_based:
                supabase.table('org_invitations') \
                    .update({
                        'status': 'accepted',
                        'accepted_at': datetime.utcnow().isoformat(),
                        'accepted_by': user_id
                    }) \
                    .eq('id', inv['id']) \
                    .execute()

            # Handle parent invitation - auto-create parent-student links
            linked_students = []
            metadata = inv.get('metadata') or {}
            if metadata.get('invitation_type') == 'parent' and metadata.get('student_ids'):
                linked_students = _create_parent_student_links(
                    supabase, user_id, metadata['student_ids'], inv['organization_id']
                )

            return jsonify({
                'success': True,
                'message': 'Account created! Please check your email to verify your account before logging in.',
                'new_user': True,
                'requires_verification': True,
                'linked_students': linked_students
            }), 201

        except Exception as e:
            logger.error(f"Failed to create user from invitation: {e}")
            error_str = str(e).lower()
            if 'already registered' in error_str or 'already exists' in error_str:
                return jsonify({'error': 'An account with this email already exists. Please log in instead.'}), 409
            return jsonify({'error': 'Failed to create account'}), 500

    except Exception as e:
        logger.error(f"Failed to accept invitation: {e}")
        return jsonify({'error': 'Failed to accept invitation'}), 500
