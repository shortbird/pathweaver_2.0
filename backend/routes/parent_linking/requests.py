"""Connection request lifecycle: submit, approve, reject, promote.

Split from routes/parent_linking.py on 2026-04-14 (Q1).
"""

"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- 30+ direct database calls for parent-student linking operations
- Complex JOIN queries with nested select (users table)
- Could create ParentLinkingRepository with methods:
  - get_linked_children(parent_id)
  - get_parent_links(student_id)
  - create_admin_link(parent_id, student_id, admin_id)
  - delete_link(link_id, admin_id)
  - submit_connection_requests(parent_id, children_data)
  - get_pending_requests(student_id)
  - approve_connection(link_id, student_id)
  - reject_connection(link_id, student_id)
- Note: Already uses ParentRepository (imported but unused), needs integration

Parent-Student Linking API routes.
Admin-only workflow for connecting parents to students.
Once linked, connections are permanent.

NOTE: Admin client usage justified throughout this file for parent-student linking operations.
Managing parent-student relationships requires cross-user operations and elevated privileges.
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from database import get_supabase_admin_client
from repositories import ParentRepository
from utils.auth.decorators import require_auth, require_admin
from middleware.error_handler import ValidationError, NotFoundError, AuthorizationError
import logging

from utils.logger import get_logger

logger = get_logger(__name__)



from routes.parent_linking import bp


@bp.route('/submit-connection-requests', methods=['POST'])
@require_auth
def submit_connection_requests(user_id):
    """
    Parent submits connection requests for one or more students (13+).
    Searches for existing student accounts by email and creates pending connections.

    Request body:
    {
        "children": [
            {
                "first_name": "Alex",
                "last_name": "Smith",
                "email": "alex@example.com"
            }
        ]
    }

    Returns:
    {
        "submitted_count": 1,
        "auto_matched_count": 1,
        "pending_approval_count": 0,
        "details": [...]
    }
    """
    try:
        data = request.get_json()
        if not data or 'children' not in data:
            raise ValidationError("Request must include 'children' array")

        children = data.get('children', [])
        if not isinstance(children, list) or len(children) == 0:
            raise ValidationError("At least one child must be provided")

        # admin client justified: parent-student link lifecycle (request/approve/revoke); cross-user writes to parent_student_links + cross-user reads of users for invitee lookup gated by user_id from @require_auth + status checks
        supabase = get_supabase_admin_client()

        # Verify requesting user is a parent or admin (admins have full parent privileges)
        parent = supabase.table('users').select('id, role, first_name, last_name, email').eq('id', user_id).execute()
        if not parent.data or parent.data[0].get('role') not in ('parent', 'superadmin'):
            raise AuthorizationError("Only parent accounts can submit connection requests")

        parent_data = parent.data[0]
        results = []
        auto_matched = 0
        pending_approval = 0

        for child in children:
            first_name = child.get('first_name', '').strip()
            last_name = child.get('last_name', '').strip()
            email = child.get('email', '').strip().lower()

            if not first_name or not last_name or not email:
                results.append({
                    'email': email,
                    'status': 'error',
                    'message': 'Missing required fields'
                })
                continue

            # Search for existing student account by email
            student_search = supabase.table('users').select(
                'id, first_name, last_name, email, role, is_dependent, managed_by_parent_id'
            ).eq('email', email).execute()

            if not student_search.data or len(student_search.data) == 0:
                # No account found - parent should create dependent profile instead
                results.append({
                    'email': email,
                    'status': 'not_found',
                    'message': f'No student account found for {email}. If they are under 13, create a dependent profile instead.'
                })
                continue

            student = student_search.data[0]

            # Check if student is actually a dependent (shouldn't use this flow)
            if student.get('is_dependent'):
                results.append({
                    'email': email,
                    'status': 'error',
                    'message': 'This is a dependent profile. Dependent profiles cannot be connected via requests.'
                })
                continue

            # Check if student has student role
            if student.get('role') != 'student':
                results.append({
                    'email': email,
                    'status': 'error',
                    'message': f'{email} is not a student account (role: {student.get("role")})'
                })
                continue

            # Check if link already exists
            existing_link = supabase.table('parent_student_links').select('id, status').eq(
                'parent_user_id', user_id
            ).eq('student_user_id', student['id']).execute()

            if existing_link.data:
                link_status = existing_link.data[0].get('status')
                results.append({
                    'email': email,
                    'status': 'already_exists',
                    'message': f'Connection already exists (status: {link_status})'
                })
                continue

            # Admin will handle connection manually - just return success message
            pending_approval += 1

            results.append({
                'email': email,
                'student_name': f"{first_name} {last_name}",
                'status': 'pending_admin_review',
                'message': f'Request received. Please contact support@optioeducation.com with your name and the student\'s email to complete the connection.'
            })

        logger.info(f"Parent {user_id} submitted {len(children)} connection requests: {auto_matched} auto-matched, {pending_approval} pending approval")

        return jsonify({
            'success': True,
            'submitted_count': len(children),
            'auto_matched_count': auto_matched,
            'pending_approval_count': pending_approval,
            'details': results
        }), 200

    except (ValidationError, AuthorizationError) as e:
        logger.warning(f"Validation error submitting connection requests: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error submitting connection requests: {str(e)}")
        import traceback
        return jsonify({'success': False, 'error': 'Failed to submit connection requests'}), 500


# ============================================================================
# STUDENT ENDPOINTS - Approve/Reject Connection Requests
# ============================================================================

@bp.route('/pending-requests', methods=['GET'])
@require_auth
def get_pending_requests(user_id):
    """
    Student views pending parent connection requests.
    Returns list of parents requesting to link to this student's account.
    """
    try:
        # admin client justified: parent-student link lifecycle (request/approve/revoke); cross-user writes to parent_student_links + cross-user reads of users for invitee lookup gated by user_id from @require_auth + status checks
        supabase = get_supabase_admin_client()

        # Get pending requests where this user is the student
        pending_response = supabase.table('parent_student_links').select('''
            id,
            parent_user_id,
            created_at,
            users!parent_student_links_parent_user_id_fkey(
                id,
                first_name,
                last_name,
                email,
                avatar_url
            )
        ''').eq('student_user_id', user_id).eq('status', 'pending_approval').execute()

        pending_requests = []
        if pending_response.data:
            for link in pending_response.data:
                parent = link.get('users')
                if parent:
                    pending_requests.append({
                        'link_id': link['id'],
                        'parent_id': link['parent_user_id'],
                        'parent_first_name': parent.get('first_name'),
                        'parent_last_name': parent.get('last_name'),
                        'parent_email': parent.get('email'),
                        'parent_avatar_url': parent.get('avatar_url'),
                        'requested_at': link['created_at']
                    })

        return jsonify({
            'success': True,
            'pending_requests': pending_requests,
            'count': len(pending_requests)
        }), 200

    except Exception as e:
        logger.error(f"Error getting pending requests: {str(e)}")
        import traceback
        return jsonify({'success': False, 'error': 'Failed to fetch pending requests'}), 500


@bp.route('/approve-request/<link_id>', methods=['POST'])
@require_auth
def approve_connection_request(user_id, link_id):
    """
    Student approves a parent connection request.
    Updates link status from 'pending_approval' to 'approved'.
    """
    try:
        # admin client justified: parent-student link lifecycle (request/approve/revoke); cross-user writes to parent_student_links + cross-user reads of users for invitee lookup gated by user_id from @require_auth + status checks
        supabase = get_supabase_admin_client()

        # Get the link and verify it's pending and belongs to this student
        link_response = supabase.table('parent_student_links').select('''
            id, parent_user_id, student_user_id, status
        ''').eq('id', link_id).single().execute()

        if not link_response.data:
            raise NotFoundError("Connection request not found")

        link = link_response.data

        # Verify this student owns the request
        if link['student_user_id'] != user_id:
            raise AuthorizationError("You can only approve requests for your own account")

        # Verify status is pending
        if link['status'] != 'pending_approval':
            return jsonify({
                'success': False,
                'error': f'This request has already been {link["status"]}'
            }), 400

        # Update status to approved
        supabase.table('parent_student_links').update({
            'status': 'approved',
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', link_id).execute()

        logger.info(f"Student {user_id} approved parent connection request {link_id}")

        return jsonify({
            'success': True,
            'message': 'Parent connection approved successfully'
        }), 200

    except (NotFoundError, AuthorizationError) as e:
        logger.warning(f"Authorization error approving request: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error approving connection request: {str(e)}")
        import traceback
        return jsonify({'success': False, 'error': 'Failed to approve connection request'}), 500


@bp.route('/reject-request/<link_id>', methods=['POST'])
@require_auth
def reject_connection_request(user_id, link_id):
    """
    Student rejects a parent connection request.
    Updates link status from 'pending_approval' to 'rejected'.
    """
    try:
        # admin client justified: parent-student link lifecycle (request/approve/revoke); cross-user writes to parent_student_links + cross-user reads of users for invitee lookup gated by user_id from @require_auth + status checks
        supabase = get_supabase_admin_client()

        # Get the link and verify it's pending and belongs to this student
        link_response = supabase.table('parent_student_links').select('''
            id, parent_user_id, student_user_id, status
        ''').eq('id', link_id).single().execute()

        if not link_response.data:
            raise NotFoundError("Connection request not found")

        link = link_response.data

        # Verify this student owns the request
        if link['student_user_id'] != user_id:
            raise AuthorizationError("You can only reject requests for your own account")

        # Verify status is pending
        if link['status'] != 'pending_approval':
            return jsonify({
                'success': False,
                'error': f'This request has already been {link["status"]}'
            }), 400

        # Update status to rejected
        supabase.table('parent_student_links').update({
            'status': 'rejected',
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', link_id).execute()

        logger.info(f"Student {user_id} rejected parent connection request {link_id}")

        return jsonify({
            'success': True,
            'message': 'Parent connection rejected'
        }), 200

    except (NotFoundError, AuthorizationError) as e:
        logger.warning(f"Authorization error rejecting request: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error rejecting connection request: {str(e)}")
        import traceback
        return jsonify({'success': False, 'error': 'Failed to reject connection request'}), 500


# ============================================================================
# FAMILY SETTINGS - Co-Parent Management
# ============================================================================
@bp.route('/promote-observer', methods=['POST'])
@require_auth
def promote_observer_to_parent(user_id):
    """
    Promote an observer to a parent role for this family.
    The observer must have been invited by this parent.
    Changes their role from 'observer' to 'parent' and converts
    observer_student_links into proper parent-child relationships.

    Request body:
    {
        "observer_id": "<uuid>"
    }
    """
    try:
        data = request.get_json()
        observer_id = data.get('observer_id', '').strip()

        if not observer_id:
            raise ValidationError("observer_id is required")

        # admin client justified: parent-student link lifecycle (request/approve/revoke); cross-user writes to parent_student_links + cross-user reads of users for invitee lookup gated by user_id from @require_auth + status checks
        supabase = get_supabase_admin_client()

        # Verify requesting user is a parent
        parent = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not parent.data or parent.data['role'] not in ('parent', 'superadmin'):
            return jsonify({'error': 'Only parents can promote observers'}), 403

        # Verify user exists and is an observer (or already a parent)
        observer = supabase.table('users').select('id, role, display_name, first_name, last_name, email').eq('id', observer_id).single().execute()
        if not observer.data:
            raise NotFoundError("User not found")

        if observer.data['role'] not in ('observer', 'parent'):
            return jsonify({'error': 'This user cannot be made a parent'}), 400

        # Verify this user was invited by this parent (via observer links)
        links = supabase.table('observer_student_links') \
            .select('id, student_id') \
            .eq('observer_id', observer_id) \
            .eq('invited_by_parent_id', user_id) \
            .execute()

        if not links.data:
            return jsonify({'error': 'This user is not part of your family'}), 403

        student_ids = [link['student_id'] for link in links.data]

        # Change role to parent if not already
        if observer.data['role'] != 'parent':
            supabase.table('users').update({'role': 'parent'}).eq('id', observer_id).execute()

        # Create parent_student_links for all children (dependents and linked)
        for student_id in student_ids:
            existing_link = supabase.table('parent_student_links') \
                .select('id') \
                .eq('parent_user_id', observer_id) \
                .eq('student_user_id', student_id) \
                .execute()

            if not existing_link.data:
                supabase.table('parent_student_links').insert({
                    'parent_user_id': observer_id,
                    'student_user_id': student_id,
                    'status': 'approved'
                }).execute()

        observer_name = observer.data.get('display_name') or \
            f"{observer.data.get('first_name', '')} {observer.data.get('last_name', '')}".strip() or \
            observer.data.get('email', 'Observer')

        logger.info(f"Parent {user_id} promoted observer {observer_id} ({observer_name}) to parent role")

        return jsonify({
            'success': True,
            'message': f'{observer_name} is now a parent in your family'
        }), 200

    except (ValidationError, NotFoundError) as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error promoting observer to parent: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to promote observer'}), 500
