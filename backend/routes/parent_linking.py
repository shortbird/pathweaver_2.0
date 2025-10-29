"""
Parent-Student Linking API routes.
Handles invitation, registration, and approval workflow for connecting parents to students.

NOTE: Admin client usage justified throughout this file for parent-student linking operations.
Managing parent-student relationships requires cross-user operations and elevated privileges.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from database import get_supabase_admin_client, get_user_client
from backend.repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError, NotFoundError, AuthorizationError
from services.email_service import email_service
import secrets
import hashlib
import uuid
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

bp = Blueprint('parent_linking', __name__, url_prefix='/api/parents')

def generate_invitation_token():
    """Generate a secure random token for parent invitations"""
    return secrets.token_urlsafe(32)

def hash_token(token):
    """Hash the token for secure storage"""
    return hashlib.sha256(token.encode()).hexdigest()


# Using repository pattern for database access
@bp.route('/invite', methods=['POST'])
@require_auth
def send_parent_invitation(user_id):
    """
    Student sends invitation to parent.
    Creates invitation record and sends email with registration link.
    """
    try:
        data = request.get_json()
        parent_email = data.get('parent_email', '').strip().lower()

        if not parent_email:
            raise ValidationError("Parent email is required")

        # Validate email format
        if '@' not in parent_email or '.' not in parent_email.split('@')[1]:
            raise ValidationError("Invalid email format")

        supabase = get_supabase_admin_client()

        # Get student info
        student_response = supabase.table('users').select(
            'id, first_name, last_name, email, role'
        ).eq('id', user_id).execute()

        if not student_response.data:
            raise NotFoundError("Student not found")

        student = student_response.data[0]

        # Verify user is a student
        if student.get('role') not in ['student', None]:
            raise AuthorizationError("Only students can send parent invitations")

        # Check if parent already exists with this email
        existing_parent = supabase.table('users').select('id, role').eq('email', parent_email).execute()

        if existing_parent.data:
            parent_user = existing_parent.data[0]

            # Verify they're a parent
            if parent_user.get('role') != 'parent':
                return jsonify({
                    'error': 'An account with this email already exists but is not a parent account'
                }), 400

            # Check if already linked
            existing_link = supabase.table('parent_student_links').select('id, status').eq(
                'parent_user_id', parent_user['id']
            ).eq('student_user_id', user_id).execute()

            if existing_link.data:
                link_status = existing_link.data[0]['status']
                if link_status == 'active':
                    return jsonify({'error': 'This parent is already linked to your account'}), 400
                elif link_status == 'pending_approval':
                    return jsonify({'error': 'A link request is already pending approval'}), 400

            # Create pending approval link (parent already registered)
            link_data = {
                'id': str(uuid.uuid4()),
                'parent_user_id': parent_user['id'],
                'student_user_id': user_id,
                'status': 'pending_approval',
                'created_at': datetime.utcnow().isoformat()
            }

            supabase.table('parent_student_links').insert(link_data).execute()

            # Send notification email to student (manual approval needed)
            return jsonify({
                'message': 'Parent account exists. Link created pending your approval.',
                'status': 'pending_approval',
                'link_id': link_data['id']
            }), 201

        # Check for existing pending invitation
        existing_invite = supabase.table('parent_invitations').select('id, expires_at').eq(
            'email', parent_email
        ).eq('invited_by_student_id', user_id).execute()

        if existing_invite.data:
            # Delete old invitation if expired
            invite = existing_invite.data[0]
            expires_at = datetime.fromisoformat(invite['expires_at'].replace('Z', '+00:00'))
            if expires_at < datetime.utcnow():
                supabase.table('parent_invitations').delete().eq('id', invite['id']).execute()
            else:
                return jsonify({
                    'error': 'An invitation has already been sent to this email. It expires in 48 hours.'
                }), 400

        # Generate invitation token
        token = generate_invitation_token()
        expires_at = datetime.utcnow() + timedelta(hours=48)

        # Store invitation
        invitation_data = {
            'id': str(uuid.uuid4()),
            'email': parent_email,
            'invited_by_student_id': user_id,
            'token': token,
            'expires_at': expires_at.isoformat(),
            'created_at': datetime.utcnow().isoformat()
        }

        supabase.table('parent_invitations').insert(invitation_data).execute()

        # Send invitation email
        frontend_url = request.headers.get('Origin', 'https://optio-dev-frontend.onrender.com')
        invitation_link = f"{frontend_url}/parent/register?token={token}"

        student_name = f"{student.get('first_name', '')} {student.get('last_name', '')}".strip()
        if not student_name:
            student_name = "Your child"

        # Send email using email service
        email_sent = email_service.send_parent_invitation_email(
            parent_email=parent_email,
            student_name=student_name,
            invitation_link=invitation_link
        )

        if email_sent:
            logger.info(f"Parent invitation sent to {parent_email} by student {user_id}")
        else:
            logger.warning(f"Failed to send parent invitation email to {parent_email}")

        return jsonify({
            'message': 'Parent invitation sent successfully',
            'parent_email': parent_email,
            'expires_at': expires_at.isoformat(),
            'email_sent': email_sent
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error sending parent invitation: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to send parent invitation'}), 500


@bp.route('/invitations/<token>', methods=['GET'])
def get_invitation_details(token):
    """
    Public endpoint to validate invitation token and get details.
    Used on parent registration page.
    """
    try:
        supabase = get_supabase_admin_client()

        # Look up invitation
        invitation_response = supabase.table('parent_invitations').select('''
            id, email, invited_by_student_id, expires_at, created_at
        ''').eq('token', token).execute()

        if not invitation_response.data:
            return jsonify({'error': 'Invalid invitation token'}), 404

        invitation = invitation_response.data[0]

        # Check if expired
        expires_at = datetime.fromisoformat(invitation['expires_at'].replace('Z', '+00:00'))
        if expires_at < datetime.utcnow():
            return jsonify({'error': 'Invitation has expired'}), 400

        # Get student info (public info only)
        student_response = supabase.table('users').select(
            'id, first_name, last_name'
        ).eq('id', invitation['invited_by_student_id']).execute()

        if not student_response.data:
            return jsonify({'error': 'Student not found'}), 404

        student = student_response.data[0]
        student_name = f"{student.get('first_name', '')} {student.get('last_name', '')}".strip()

        return jsonify({
            'valid': True,
            'email': invitation['email'],
            'student_name': student_name,
            'student_id': invitation['invited_by_student_id'],
            'expires_at': invitation['expires_at']
        }), 200

    except Exception as e:
        logger.error(f"Error validating invitation: {str(e)}")
        return jsonify({'error': 'Failed to validate invitation'}), 500


@bp.route('/register', methods=['POST'])
def register_parent():
    """
    Parent creates account from invitation.
    Creates parent user account and pending approval link.
    """
    try:
        data = request.get_json()
        token = data.get('token')
        password = data.get('password')
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()

        if not all([token, password, first_name, last_name]):
            raise ValidationError("All fields are required: token, password, first_name, last_name")

        # Validate password strength
        if len(password) < 8:
            raise ValidationError("Password must be at least 8 characters")

        supabase = get_supabase_admin_client()

        # Look up invitation
        invitation_response = supabase.table('parent_invitations').select('''
            id, email, invited_by_student_id, expires_at
        ''').eq('token', token).execute()

        if not invitation_response.data:
            return jsonify({'error': 'Invalid invitation token'}), 404

        invitation = invitation_response.data[0]

        # Check if expired
        expires_at = datetime.fromisoformat(invitation['expires_at'].replace('Z', '+00:00'))
        if expires_at < datetime.utcnow():
            return jsonify({'error': 'Invitation has expired'}), 400

        # Check if email already has an account
        existing_user = supabase.table('users').select('id').eq('email', invitation['email']).execute()
        if existing_user.data:
            return jsonify({'error': 'An account with this email already exists'}), 400

        # Create parent account via Supabase Auth
        try:
            auth_response = supabase.auth.sign_up({
                'email': invitation['email'],
                'password': password,
                'options': {
                    'data': {
                        'first_name': first_name,
                        'last_name': last_name,
                        'role': 'parent'
                    }
                }
            })

            if not auth_response.user:
                raise Exception("Failed to create parent account")

            parent_user_id = auth_response.user.id

        except Exception as auth_error:
            logger.error(f"Auth error: {auth_error}")
            return jsonify({'error': 'Failed to create parent account'}), 500

        # Update user record with role
        supabase.table('users').update({
            'role': 'parent',
            'first_name': first_name,
            'last_name': last_name
        }).eq('id', parent_user_id).execute()

        # Create parent-student link (pending approval)
        link_data = {
            'id': str(uuid.uuid4()),
            'parent_user_id': parent_user_id,
            'student_user_id': invitation['invited_by_student_id'],
            'status': 'pending_approval',
            'created_at': datetime.utcnow().isoformat()
        }

        supabase.table('parent_student_links').insert(link_data).execute()

        # Delete used invitation
        supabase.table('parent_invitations').delete().eq('id', invitation['id']).execute()

        logger.info(f"Parent registered: {parent_user_id} for student {invitation['invited_by_student_id']}")

        return jsonify({
            'message': 'Parent account created successfully. Awaiting student approval.',
            'status': 'pending_approval',
            'link_id': link_data['id'],
            'user_id': parent_user_id
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error registering parent: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to register parent account'}), 500


@bp.route('/approve-link/<link_id>', methods=['POST'])
@require_auth
def approve_parent_link(user_id, link_id):
    """
    Student approves parent connection (final step).
    Once approved, parent gains permanent access (no revocation).
    """
    try:
        supabase = get_supabase_admin_client()

        # Get link
        link_response = supabase.table('parent_student_links').select('''
            id, parent_user_id, student_user_id, status
        ''').eq('id', link_id).execute()

        if not link_response.data:
            raise NotFoundError("Link not found")

        link = link_response.data[0]

        # Verify student owns this link
        if link['student_user_id'] != user_id:
            raise AuthorizationError("You can only approve your own parent links")

        # Check if already active
        if link['status'] == 'active':
            return jsonify({'message': 'This link is already active'}), 200

        # Check if pending approval
        if link['status'] != 'pending_approval':
            return jsonify({'error': 'This link is not pending approval'}), 400

        # Approve link (permanent - no revocation)
        supabase.table('parent_student_links').update({
            'status': 'active',
            'approved_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', link_id).execute()

        logger.info(f"Student {user_id} approved parent link {link_id}")

        return jsonify({
            'message': 'Parent connection approved successfully',
            'status': 'active',
            'link_id': link_id
        }), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error approving parent link: {str(e)}")
        return jsonify({'error': 'Failed to approve parent link'}), 500


@bp.route('/my-children', methods=['GET'])
@require_auth
def get_linked_children(user_id):
    """
    Get all children linked to this parent account.
    Returns list of active student connections.

    Special case: Admin users see themselves as a "child" for demo purposes.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user role - single optimized query
        user_response = supabase.table('users').select(
            'role, first_name, last_name, avatar_url, level, total_xp'
        ).eq('id', user_id).single().execute()

        if not user_response.data:
            raise AuthorizationError("User not found")

        user = user_response.data
        user_role = user.get('role')

        # Special case: Admin users see themselves as a demo "child"
        if user_role == 'admin':
            return jsonify({
                'children': [{
                    'link_id': 'admin-self-link',
                    'student_id': user_id,
                    'first_name': user.get('first_name'),
                    'last_name': user.get('last_name'),
                    'avatar_url': user.get('avatar_url'),
                    'level': user.get('level', 0),
                    'total_xp': user.get('total_xp', 0),
                    'approved_at': datetime.utcnow().isoformat(),
                    'linked_since': datetime.utcnow().isoformat(),
                    'is_demo': True
                }]
            }), 200

        # Verify parent role for non-admin users
        if user_role != 'parent':
            raise AuthorizationError("Only parent accounts can access this endpoint")

        # Single optimized query with JOIN to get links AND student details
        links_response = supabase.table('parent_student_links').select('''
            id,
            student_user_id,
            status,
            approved_at,
            created_at,
            users!parent_student_links_student_user_id_fkey(
                id,
                first_name,
                last_name,
                avatar_url,
                level,
                total_xp
            )
        ''').eq('parent_user_id', user_id).eq('status', 'active').execute()

        if not links_response.data:
            return jsonify({'children': []}), 200

        # Build response from joined data
        children = []
        for link in links_response.data:
            student = link.get('users')
            if student:
                children.append({
                    'link_id': link['id'],
                    'student_id': link['student_user_id'],
                    'first_name': student.get('first_name'),
                    'last_name': student.get('last_name'),
                    'avatar_url': student.get('avatar_url'),
                    'level': student.get('level', 0),
                    'total_xp': student.get('total_xp', 0),
                    'approved_at': link['approved_at'],
                    'linked_since': link['created_at']
                })

        return jsonify({'children': children}), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting linked children: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get linked children'}), 500


@bp.route('/pending-approvals', methods=['GET'])
@require_auth
def get_pending_approvals(user_id):
    """
    Student gets list of pending parent link approvals.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get pending links for this student
        links_response = supabase.table('parent_student_links').select('''
            id, parent_user_id, status, created_at
        ''').eq('student_user_id', user_id).eq('status', 'pending_approval').execute()

        if not links_response.data:
            return jsonify({'pending_approvals': []}), 200

        # Get parent details
        parent_ids = [link['parent_user_id'] for link in links_response.data]
        parents_response = supabase.table('users').select('''
            id, first_name, last_name, email
        ''').in_('id', parent_ids).execute()

        # Build response
        pending_approvals = []
        parents_map = {p['id']: p for p in parents_response.data}

        for link in links_response.data:
            parent = parents_map.get(link['parent_user_id'])
            if parent:
                pending_approvals.append({
                    'link_id': link['id'],
                    'parent_id': parent['id'],
                    'parent_first_name': parent.get('first_name'),
                    'parent_last_name': parent.get('last_name'),
                    'parent_email': parent.get('email'),
                    'requested_at': link['created_at']
                })

        return jsonify({'pending_approvals': pending_approvals}), 200

    except Exception as e:
        logger.error(f"Error getting pending approvals: {str(e)}")
        return jsonify({'error': 'Failed to get pending approvals'}), 500


@bp.route('/request-link', methods=['POST'])
@require_auth
def parent_request_link(user_id):
    """
    Parent sends link request to student by email.
    Creates pending approval link that appears in student's connections page.
    """
    try:
        data = request.get_json()
        student_email = data.get('student_email', '').strip().lower()

        if not student_email:
            raise ValidationError("Student email is required")

        # Validate email format
        if '@' not in student_email or '.' not in student_email.split('@')[1]:
            raise ValidationError("Invalid email format")

        supabase = get_supabase_admin_client()

        # Get parent info and verify role
        parent_response = supabase.table('users').select(
            'id, first_name, last_name, email, role'
        ).eq('id', user_id).execute()

        if not parent_response.data:
            raise NotFoundError("Parent not found")

        parent = parent_response.data[0]

        # Verify user is a parent
        if parent.get('role') != 'parent':
            raise AuthorizationError("Only parent accounts can send link requests")

        # Check if student exists with this email
        student_response = supabase.table('users').select('id, role, first_name, last_name').eq(
            'email', student_email
        ).execute()

        if not student_response.data:
            return jsonify({
                'error': 'No student account found with this email address'
            }), 404

        student_user = student_response.data[0]

        # Verify they're a student
        if student_user.get('role') not in ['student', None]:
            return jsonify({
                'error': 'The account with this email is not a student account'
            }), 400

        # Check if already linked
        existing_link = supabase.table('parent_student_links').select('id, status').eq(
            'parent_user_id', user_id
        ).eq('student_user_id', student_user['id']).execute()

        if existing_link.data:
            link_status = existing_link.data[0]['status']
            if link_status == 'active':
                return jsonify({'error': 'You are already linked to this student'}), 400
            elif link_status == 'pending_approval':
                return jsonify({'error': 'A link request is already pending with this student'}), 400

        # Create pending approval link
        link_data = {
            'id': str(uuid.uuid4()),
            'parent_user_id': user_id,
            'student_user_id': student_user['id'],
            'status': 'pending_approval',
            'created_at': datetime.utcnow().isoformat()
        }

        supabase.table('parent_student_links').insert(link_data).execute()

        logger.info(f"Parent {user_id} sent link request to student {student_user['id']}")

        student_name = f"{student_user.get('first_name', '')} {student_user.get('last_name', '')}".strip()

        return jsonify({
            'message': f'Link request sent to {student_name}. They will see it in their Connections page.',
            'status': 'pending_approval',
            'link_id': link_data['id'],
            'student_name': student_name
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error sending parent link request: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to send link request'}), 500


@bp.route('/decline-link/<link_id>', methods=['DELETE'])
@require_auth
def decline_parent_link(user_id, link_id):
    """
    Student declines parent connection request.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get link
        link_response = supabase.table('parent_student_links').select('''
            id, parent_user_id, student_user_id, status
        ''').eq('id', link_id).execute()

        if not link_response.data:
            raise NotFoundError("Link request not found")

        link = link_response.data[0]

        # Verify student owns this link
        if link['student_user_id'] != user_id:
            raise AuthorizationError("You can only decline your own parent link requests")

        # Check if pending approval
        if link['status'] != 'pending_approval':
            return jsonify({'error': 'This link is not pending approval'}), 400

        # Delete the link (decline)
        supabase.table('parent_student_links').delete().eq('id', link_id).execute()

        logger.info(f"Student {user_id} declined parent link {link_id}")

        return jsonify({
            'message': 'Parent connection request declined'
        }), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error declining parent link: {str(e)}")
        return jsonify({'error': 'Failed to decline parent link'}), 500


@bp.route('/pending-requests', methods=['GET'])
@require_auth
def get_pending_requests(user_id):
    """
    Parent gets list of pending link requests they've sent.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user role - single optimized query
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()

        user_role = user_response.data.get('role') if user_response.data else None
        if not user_response.data or user_role not in ['parent', 'admin']:
            raise AuthorizationError("Only parent accounts can access this endpoint")

        # Admin users have no pending requests (they're set up as their own parent for testing)
        if user_role == 'admin':
            return jsonify({'pending_requests': []}), 200

        # Single optimized query with JOIN to get links AND student details
        links_response = supabase.table('parent_student_links').select('''
            id,
            student_user_id,
            status,
            created_at,
            users!parent_student_links_student_user_id_fkey(
                id,
                first_name,
                last_name,
                email,
                avatar_url
            )
        ''').eq('parent_user_id', user_id).eq('status', 'pending_approval').execute()

        if not links_response.data:
            return jsonify({'pending_requests': []}), 200

        # Build response from joined data
        pending_requests = []
        for link in links_response.data:
            student = link.get('users')
            if student:
                pending_requests.append({
                    'link_id': link['id'],
                    'student_id': link['student_user_id'],
                    'student_first_name': student.get('first_name'),
                    'student_last_name': student.get('last_name'),
                    'student_email': student.get('email'),
                    'student_avatar_url': student.get('avatar_url'),
                    'requested_at': link['created_at']
                })

        return jsonify({'pending_requests': pending_requests}), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting pending requests: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get pending requests'}), 500


@bp.route('/my-links', methods=['GET'])
@require_auth
def get_my_links(user_id):
    """
    Student gets list of linked parents AND pending invitations.
    Combined endpoint for ParentLinking.jsx component.
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify user is a student
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user_response.data or user_response.data.get('role') not in ['student', None]:
            raise AuthorizationError("Only students can access this endpoint")

        # Get active parent links with parent details
        active_links_response = supabase.table('parent_student_links').select('''
            id,
            parent_user_id,
            status,
            approved_at,
            created_at,
            users!parent_student_links_parent_user_id_fkey(
                id,
                first_name,
                last_name,
                email,
                avatar_url
            )
        ''').eq('student_user_id', user_id).eq('status', 'active').execute()

        linked_parents = []
        if active_links_response.data:
            for link in active_links_response.data:
                parent = link.get('users')
                if parent:
                    linked_parents.append({
                        'link_id': link['id'],
                        'parent_id': link['parent_user_id'],
                        'parent_first_name': parent.get('first_name'),
                        'parent_last_name': parent.get('last_name'),
                        'parent_email': parent.get('email'),
                        'parent_avatar_url': parent.get('avatar_url'),
                        'linked_since': link['created_at'],
                        'approved_at': link['approved_at']
                    })

        # Get pending invitations (student invited parent, parent hasn't registered)
        invitations_response = supabase.table('parent_invitations').select(
            'id, email, expires_at, created_at'
        ).eq('invited_by_student_id', user_id).execute()

        pending_invitations = []
        if invitations_response.data:
            for invite in invitations_response.data:
                # Check if expired
                expires_at = datetime.fromisoformat(invite['expires_at'].replace('Z', '+00:00'))
                is_expired = expires_at < datetime.utcnow()

                pending_invitations.append({
                    'invitation_id': invite['id'],
                    'parent_email': invite['email'],
                    'expires_at': invite['expires_at'],
                    'created_at': invite['created_at'],
                    'is_expired': is_expired
                })

        # Get pending approval requests (parent registered, awaiting student approval)
        pending_approvals_response = supabase.table('parent_student_links').select('''
            id,
            parent_user_id,
            status,
            created_at,
            users!parent_student_links_parent_user_id_fkey(
                id,
                first_name,
                last_name,
                email
            )
        ''').eq('student_user_id', user_id).eq('status', 'pending_approval').execute()

        pending_approvals = []
        if pending_approvals_response.data:
            for link in pending_approvals_response.data:
                parent = link.get('users')
                if parent:
                    pending_approvals.append({
                        'link_id': link['id'],
                        'parent_id': link['parent_user_id'],
                        'parent_first_name': parent.get('first_name'),
                        'parent_last_name': parent.get('last_name'),
                        'parent_email': parent.get('email'),
                        'requested_at': link['created_at']
                    })

        return jsonify({
            'linked_parents': linked_parents,
            'pending_invitations': pending_invitations,
            'pending_approvals': pending_approvals
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting student links: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get parent links'}), 500


@bp.route('/invitations/<invitation_id>', methods=['DELETE'])
@require_auth
def cancel_invitation(user_id, invitation_id):
    """
    Student cancels a sent parent invitation.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get invitation
        invitation_response = supabase.table('parent_invitations').select(
            'id, invited_by_student_id, email'
        ).eq('id', invitation_id).execute()

        if not invitation_response.data:
            raise NotFoundError("Invitation not found")

        invitation = invitation_response.data[0]

        # Verify student owns this invitation
        if invitation['invited_by_student_id'] != user_id:
            raise AuthorizationError("You can only cancel your own invitations")

        # Delete invitation
        supabase.table('parent_invitations').delete().eq('id', invitation_id).execute()

        logger.info(f"Student {user_id} cancelled invitation {invitation_id}")

        return jsonify({
            'message': 'Invitation cancelled successfully'
        }), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error cancelling invitation: {str(e)}")
        return jsonify({'error': 'Failed to cancel invitation'}), 500


@bp.route('/pending-invitations', methods=['GET'])
@require_auth
def get_pending_invitations_for_parent(user_id):
    """
    Parent gets list of invitations sent by students awaiting registration.
    Shows invitations where the parent email matches the logged-in parent's email.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get parent info and verify role
        parent_response = supabase.table('users').select(
            'id, email, role'
        ).eq('id', user_id).single().execute()

        if not parent_response.data:
            raise NotFoundError("User not found")

        parent = parent_response.data
        if parent.get('role') != 'parent':
            raise AuthorizationError("Only parent accounts can access this endpoint")

        parent_email = parent.get('email', '').strip().lower()

        # Get invitations matching parent's email with student details
        invitations_response = supabase.table('parent_invitations').select('''
            id,
            email,
            invited_by_student_id,
            expires_at,
            created_at
        ''').eq('email', parent_email).execute()

        if not invitations_response.data:
            return jsonify({'pending_invitations': []}), 200

        # Get student details for all invitations
        student_ids = [inv['invited_by_student_id'] for inv in invitations_response.data]
        students_response = supabase.table('users').select(
            'id, first_name, last_name, avatar_url'
        ).in_('id', student_ids).execute()

        students_map = {s['id']: s for s in students_response.data}

        pending_invitations = []
        for invite in invitations_response.data:
            # Check if expired
            expires_at = datetime.fromisoformat(invite['expires_at'].replace('Z', '+00:00'))
            is_expired = expires_at < datetime.utcnow()

            student = students_map.get(invite['invited_by_student_id'])
            if student:
                pending_invitations.append({
                    'invitation_id': invite['id'],
                    'student_id': invite['invited_by_student_id'],
                    'student_first_name': student.get('first_name'),
                    'student_last_name': student.get('last_name'),
                    'student_avatar_url': student.get('avatar_url'),
                    'expires_at': invite['expires_at'],
                    'created_at': invite['created_at'],
                    'is_expired': is_expired
                })

        return jsonify({'pending_invitations': pending_invitations}), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting parent pending invitations: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get pending invitations'}), 500


@bp.route('/invitations/<invitation_id>/approve', methods=['POST'])
@require_auth
def approve_invitation(user_id, invitation_id):
    """
    Parent approves a student invitation by creating their account and linking.
    This is an alternative to the /register endpoint - used when parent already has account.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get parent info and verify role
        parent_response = supabase.table('users').select(
            'id, email, role'
        ).eq('id', user_id).single().execute()

        if not parent_response.data:
            raise NotFoundError("User not found")

        parent = parent_response.data
        if parent.get('role') != 'parent':
            raise AuthorizationError("Only parent accounts can approve invitations")

        parent_email = parent.get('email', '').strip().lower()

        # Get invitation
        invitation_response = supabase.table('parent_invitations').select(
            'id, email, invited_by_student_id, expires_at'
        ).eq('id', invitation_id).execute()

        if not invitation_response.data:
            raise NotFoundError("Invitation not found")

        invitation = invitation_response.data[0]

        # Verify invitation email matches parent email
        if invitation['email'].lower() != parent_email:
            raise AuthorizationError("This invitation was not sent to your email address")

        # Check if expired
        expires_at = datetime.fromisoformat(invitation['expires_at'].replace('Z', '+00:00'))
        if expires_at < datetime.utcnow():
            return jsonify({'error': 'This invitation has expired'}), 400

        # Check if already linked
        existing_link = supabase.table('parent_student_links').select('id, status').eq(
            'parent_user_id', user_id
        ).eq('student_user_id', invitation['invited_by_student_id']).execute()

        if existing_link.data:
            link_status = existing_link.data[0]['status']
            if link_status == 'active':
                return jsonify({'error': 'You are already linked to this student'}), 400
            elif link_status == 'pending_approval':
                return jsonify({'error': 'A link already exists pending approval'}), 400

        # Create active parent-student link (parent approving = immediate activation)
        link_data = {
            'id': str(uuid.uuid4()),
            'parent_user_id': user_id,
            'student_user_id': invitation['invited_by_student_id'],
            'status': 'active',
            'approved_at': datetime.utcnow().isoformat(),
            'created_at': datetime.utcnow().isoformat()
        }

        supabase.table('parent_student_links').insert(link_data).execute()

        # Delete used invitation
        supabase.table('parent_invitations').delete().eq('id', invitation_id).execute()

        logger.info(f"Parent {user_id} approved invitation {invitation_id} from student {invitation['invited_by_student_id']}")

        return jsonify({
            'message': 'Invitation approved. You are now connected to this student.',
            'status': 'active',
            'link_id': link_data['id']
        }), 201

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error approving invitation: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to approve invitation'}), 500


@bp.route('/invitations/<invitation_id>/decline', methods=['DELETE'])
@require_auth
def decline_invitation(user_id, invitation_id):
    """
    Parent declines a student invitation.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get parent info and verify role
        parent_response = supabase.table('users').select(
            'id, email, role'
        ).eq('id', user_id).single().execute()

        if not parent_response.data:
            raise NotFoundError("User not found")

        parent = parent_response.data
        if parent.get('role') != 'parent':
            raise AuthorizationError("Only parent accounts can decline invitations")

        parent_email = parent.get('email', '').strip().lower()

        # Get invitation
        invitation_response = supabase.table('parent_invitations').select(
            'id, email, invited_by_student_id'
        ).eq('id', invitation_id).execute()

        if not invitation_response.data:
            raise NotFoundError("Invitation not found")

        invitation = invitation_response.data[0]

        # Verify invitation email matches parent email
        if invitation['email'].lower() != parent_email:
            raise AuthorizationError("This invitation was not sent to your email address")

        # Delete invitation
        supabase.table('parent_invitations').delete().eq('id', invitation_id).execute()

        logger.info(f"Parent {user_id} declined invitation {invitation_id}")

        return jsonify({
            'message': 'Invitation declined successfully'
        }), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error declining invitation: {str(e)}")
        return jsonify({'error': 'Failed to decline invitation'}), 500
