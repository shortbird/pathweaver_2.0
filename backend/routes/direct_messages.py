"""
Direct Messages API routes for user-to-user communication
Handles advisor-student and friend-to-friend messaging

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Primarily uses DirectMessageService (service layer pattern)
- One direct database call for user role check (simple query, acceptable)
- Service layer is the preferred pattern over direct repository usage
"""

from flask import Blueprint, request, jsonify
from typing import Dict, List, Optional, Any
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

from utils.auth.decorators import require_auth
from services.direct_message_service import DirectMessageService
from middleware.error_handler import ValidationError
from utils.validation.validators import validate_required_fields, validate_string_length
from utils.api_response import success_response, error_response

bp = Blueprint('direct_messages', __name__, url_prefix='/api/messages')

# Set up logging
logger = logging.getLogger(__name__)

# Initialize service
message_service = DirectMessageService()

# The "Optio Support" contact is a display alias. Messages addressed to it are
# routed to the superadmin account below (product owner decision). We resolve the
# id at request time (by email + role) rather than hardcoding it, since there can
# be more than one superadmin on the platform.
SUPPORT_EMAIL = 'tannerbowman@gmail.com'


def _get_support_user(supabase):
    """Return the superadmin user record that backs the 'Optio Support' alias, or None."""
    try:
        res = supabase.table('users').select(
            'id, display_name, first_name, last_name, avatar_url, role'
        ).eq('email', SUPPORT_EMAIL).eq('role', 'superadmin').single().execute()
        return res.data if res.data else None
    except Exception as e:
        logger.warning(f"Could not resolve Optio Support user: {str(e)}")
        return None


def _build_support_contact(support_user):
    """Build the display-aliased 'Optio Support' contact for the underlying superadmin."""
    return {
        'id': support_user['id'],
        'display_name': 'Optio Support',
        'first_name': 'Optio',
        'last_name': 'Support',
        # Present as a branded support contact rather than the raw superadmin avatar.
        'avatar_url': None,
        'role': 'support',
        'relationship': 'support',
        'is_support': True,
    }


def _get_parent_child_ids(supabase, parent_id):
    """
    Return the set of child user-ids a parent is linked to, via either mechanism:
    - dependents created by the parent (users.managed_by_parent_id)
    - approved parent_student_links (parent_user_id -> student_user_id)
    """
    child_ids = set()
    deps = supabase.table('users').select('id').eq('managed_by_parent_id', parent_id).execute()
    if deps.data:
        child_ids.update(d['id'] for d in deps.data)
    links = supabase.table('parent_student_links').select('student_user_id').eq(
        'parent_user_id', parent_id
    ).eq('status', 'approved').execute()
    if links.data:
        child_ids.update(l['student_user_id'] for l in links.data)
    return list(child_ids)


def _append_support_contact(supabase, contacts, user_id):
    """
    Deduplicate contacts by id (first relationship wins) and always append the
    'Optio Support' contact, unless the requester IS the support account itself.
    """
    seen = set()
    deduped = []
    for ct in contacts:
        if ct['id'] in seen:
            continue
        seen.add(ct['id'])
        deduped.append(ct)

    support_user = _get_support_user(supabase)
    if support_user and support_user['id'] != user_id:
        # Don't surface the support account twice under its real name.
        deduped = [ct for ct in deduped if ct['id'] != support_user['id']]
        deduped.append(_build_support_contact(support_user))

    return deduped


@bp.route('/conversations', methods=['GET'])
@require_auth
def get_conversations(user_id: str):
    """
    Get all conversations for the current user
    Includes advisor, friends, and conversation metadata
    """
    try:
        conversations = message_service.get_user_conversations(user_id)

        return success_response({
            'conversations': conversations,
            'total': len(conversations)
        })

    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        return error_response(
            f"Failed to get conversations: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/conversations/<conversation_id>', methods=['GET'])
@require_auth
def get_conversation_messages(user_id: str, conversation_id: str):
    """
    Get messages for a specific conversation
    Supports pagination with limit and offset query params
    """
    try:
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))

        messages = message_service.get_conversation_messages(
            conversation_id,
            user_id,
            limit=limit,
            offset=offset
        )

        return success_response({
            'messages': messages,
            'conversation_id': conversation_id,
            'count': len(messages),
            'limit': limit,
            'offset': offset
        })

    except ValueError as e:
        logger.error(f"Validation error getting conversation messages: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error getting conversation messages: {str(e)}")
        return error_response(
            f"Failed to get messages: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/conversations/<target_user_id>/send', methods=['POST'])
@require_auth
def send_message(user_id: str, target_user_id: str):
    """
    Send a message to a user (advisor, friend)
    Creates conversation if it doesn't exist
    """
    try:
        data = request.get_json()

        content = (data.get('content') or '').strip()
        attachments = data.get('attachments') or []

        # Attachment-only messages are allowed; otherwise content is required.
        if not content and not attachments:
            raise ValidationError("Message content cannot be empty")
        if content:
            validate_string_length(content, 'content', max_length=2000)

        # Send message
        message = message_service.send_message(
            user_id, target_user_id, content,
            reply_to_message_id=data.get('reply_to_message_id'),
            attachments=attachments,
        )

        return success_response({
            'message': message,
            'conversation_id': message['conversation_id']
        })

    except ValidationError as e:
        logger.error(f"Validation error sending message: {str(e)}")
        return error_response(str(e), status_code=400, error_code="validation_error")

    except ValueError as e:
        logger.error(f"Permission error sending message: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error sending message: {str(e)}")
        return error_response(
            f"Failed to send message: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/<message_id>/read', methods=['PUT'])
@require_auth
def mark_message_as_read(user_id: str, message_id: str):
    """
    Mark a message as read
    Only the recipient can mark their messages as read
    """
    try:
        success = message_service.mark_as_read(message_id, user_id)

        return success_response({
            'success': success,
            'message_id': message_id
        })

    except ValueError as e:
        logger.error(f"Permission error marking message as read: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error marking message as read: {str(e)}")
        return error_response(
            f"Failed to mark message as read: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/unread-count', methods=['GET'])
@require_auth
def get_unread_count(user_id: str):
    """
    Get total unread message count for badge display
    """
    try:
        unread_count = message_service.get_unread_count(user_id)

        return success_response({
            'unread_count': unread_count
        })

    except Exception as e:
        logger.error(f"Error getting unread count: {str(e)}")
        return error_response(
            f"Failed to get unread count: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/can-message/<target_user_id>', methods=['GET'])
@require_auth
def check_can_message(user_id: str, target_user_id: str):
    """
    Check if user can message another user
    Useful for frontend permission checks
    """
    try:
        can_message = message_service.can_message_user(user_id, target_user_id)

        return success_response({
            'can_message': can_message,
            'target_user_id': target_user_id
        })

    except Exception as e:
        logger.error(f"Error checking message permission: {str(e)}")
        return error_response(
            f"Failed to check permission: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/contacts', methods=['GET'])
@require_auth
def get_contacts(user_id: str):
    """
    Get all messaging contacts for the user (advisors, students, etc.)
    Organization isolation is enforced.
    This includes:
    - For superadmin: ALL users on the platform
    - For students: their advisor(s) in the same organization
    - For advisors/admins: their assigned students in the same organization
    """
    try:
        from database import get_supabase_admin_client
        # admin client justified: cross-user contact lookup gated by relationship (advisor-student / parent-student / org-isolation) checks below; replacing with user_client would require complex RLS policies for advisor_student_assignments and cross-org filtering
        supabase = get_supabase_admin_client()

        # Get user role and organization
        from utils.roles import get_effective_role
        user = supabase.table('users').select('role, org_role, organization_id').eq('id', user_id).single().execute()
        if not user.data:
            return error_response('User not found', status_code=404, error_code='not_found')

        contacts = []
        user_role = get_effective_role(user.data)
        user_org_id = user.data.get('organization_id')

        # SUPERADMIN: Return ALL users on the platform (no organization isolation)
        if user_role == 'superadmin':
            all_users = supabase.table('users').select(
                'id, display_name, first_name, last_name, avatar_url, role, org_role, organization_id, email'
            ).neq('id', user_id).order('display_name').execute()

            if all_users.data:
                for u in all_users.data:
                    # Determine effective role for display
                    effective_role = u.get('org_role') if u.get('role') == 'org_managed' else u.get('role')
                    org_id = u.pop('organization_id', None)
                    u.pop('org_role', None)
                    contacts.append({
                        **u,
                        'relationship': effective_role or 'user',
                        'organization_id': org_id  # Include for superadmin context
                    })

            return success_response({
                'contacts': contacts,
                'total': len(contacts)
            })

        # For students: add their advisor(s) as contacts
        if user_role == 'student':
            # Get advisor assignments for this student
            assignments = supabase.table('advisor_student_assignments').select(
                'advisor_id'
            ).eq('student_id', user_id).eq('is_active', True).execute()

            if assignments.data:
                advisor_ids = [a['advisor_id'] for a in assignments.data]
                # Fetch advisor details with organization filter
                advisors = supabase.table('users').select(
                    'id, display_name, first_name, last_name, avatar_url, role, organization_id'
                ).in_('id', advisor_ids).execute()

                if advisors.data:
                    for advisor in advisors.data:
                        # ORGANIZATION ISOLATION: Only include advisors from same org
                        if user_org_id is not None and advisor.get('organization_id') != user_org_id:
                            continue
                        # Remove org_id from response
                        advisor.pop('organization_id', None)
                        contacts.append({
                            **advisor,
                            'relationship': 'advisor'
                        })

        # For org_admins: show ALL users in their organization
        if user_role == 'org_admin' and user_org_id:
            org_users = supabase.table('users').select(
                'id, display_name, first_name, last_name, avatar_url, role, org_role, organization_id'
            ).eq('organization_id', user_org_id).neq('id', user_id).order('display_name').execute()

            if org_users.data:
                for u in org_users.data:
                    effective_role = u.get('org_role') if u.get('role') == 'org_managed' else u.get('role')
                    u.pop('organization_id', None)
                    u.pop('org_role', None)
                    contacts.append({
                        **u,
                        'relationship': effective_role or 'user'
                    })

        # For advisors: add their assigned students
        elif user_role == 'advisor':
            # Get student assignments for this advisor
            assignments = supabase.table('advisor_student_assignments').select(
                'student_id'
            ).eq('advisor_id', user_id).eq('is_active', True).execute()

            if assignments.data:
                student_ids = [a['student_id'] for a in assignments.data]
                # Fetch student details with organization filter
                students = supabase.table('users').select(
                    'id, display_name, first_name, last_name, avatar_url, role, organization_id'
                ).in_('id', student_ids).execute()

                if students.data:
                    for student in students.data:
                        # ORGANIZATION ISOLATION: Only include students from same org
                        if user_org_id is not None and student.get('organization_id') != user_org_id:
                            logger.warning(
                                f"Organization isolation: Filtered out student {student.get('id')} "
                                f"from contacts for user {user_id}"
                            )
                            continue
                        # Remove org_id from response
                        student.pop('organization_id', None)
                        contacts.append({
                            **student,
                            'relationship': 'student'
                        })

        # For parents: their children, the advisors of those children, AND all
        # observers linked to those children.
        elif user_role == 'parent':
            child_ids = _get_parent_child_ids(supabase, user_id)

            if child_ids:
                # The children themselves
                children = supabase.table('users').select(
                    'id, display_name, first_name, last_name, avatar_url, role, organization_id'
                ).in_('id', child_ids).execute()
                if children.data:
                    for child in children.data:
                        if user_org_id is not None and child.get('organization_id') != user_org_id:
                            continue
                        child.pop('organization_id', None)
                        contacts.append({**child, 'relationship': 'child'})

                # Advisors assigned to those children
                adv_assignments = supabase.table('advisor_student_assignments').select(
                    'advisor_id'
                ).in_('student_id', child_ids).eq('is_active', True).execute()
                advisor_ids = list({a['advisor_id'] for a in (adv_assignments.data or [])})
                if advisor_ids:
                    advisors = supabase.table('users').select(
                        'id, display_name, first_name, last_name, avatar_url, role, organization_id'
                    ).in_('id', advisor_ids).execute()
                    if advisors.data:
                        for advisor in advisors.data:
                            if user_org_id is not None and advisor.get('organization_id') != user_org_id:
                                continue
                            advisor.pop('organization_id', None)
                            contacts.append({**advisor, 'relationship': 'advisor'})

                # All observers linked to those children
                obs_links = supabase.table('observer_student_links').select(
                    'observer_id'
                ).in_('student_id', child_ids).execute()
                observer_ids = list({o['observer_id'] for o in (obs_links.data or [])})
                if observer_ids:
                    observers = supabase.table('users').select(
                        'id, display_name, first_name, last_name, avatar_url, role, organization_id'
                    ).in_('id', observer_ids).execute()
                    if observers.data:
                        for observer in observers.data:
                            if user_org_id is not None and observer.get('organization_id') != user_org_id:
                                continue
                            observer.pop('organization_id', None)
                            contacts.append({**observer, 'relationship': 'observer'})

        # For observers: the students they are linked to
        elif user_role == 'observer':
            obs_links = supabase.table('observer_student_links').select(
                'student_id'
            ).eq('observer_id', user_id).execute()
            student_ids = list({o['student_id'] for o in (obs_links.data or [])})
            if student_ids:
                students = supabase.table('users').select(
                    'id, display_name, first_name, last_name, avatar_url, role, organization_id'
                ).in_('id', student_ids).execute()
                if students.data:
                    for student in students.data:
                        if user_org_id is not None and student.get('organization_id') != user_org_id:
                            continue
                        student.pop('organization_id', None)
                        contacts.append({**student, 'relationship': 'student'})

        # Always include the "Optio Support" contact (dedupes by id too).
        contacts = _append_support_contact(supabase, contacts, user_id)

        return success_response({
            'contacts': contacts,
            'total': len(contacts)
        })

    except Exception as e:
        logger.error(f"Error getting contacts: {str(e)}")
        return error_response(
            f"Failed to get contacts: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


def _can_view_child_history(supabase, requester_id, child_id):
    """
    A requester may view a child's message history if they are a parent/guardian
    of that child (managed_by_parent_id or approved parent_student_links) or a
    superadmin. Returns True/False.
    """
    from utils.roles import get_effective_role
    requester = supabase.table('users').select(
        'role, org_role, organization_id'
    ).eq('id', requester_id).single().execute()
    if requester.data and get_effective_role(requester.data) == 'superadmin':
        return True
    return message_service.is_parent_of_child(requester_id, child_id)


@bp.route('/children', methods=['GET'])
@require_auth
def get_messageable_children(user_id: str):
    """
    List the children whose message history the requester may view. Parents see
    their linked children; superadmins who are themselves linked as a parent (e.g.
    to their own kids) see those too. Used to populate the parent "view my child's
    messages" picker.
    """
    try:
        from database import get_supabase_admin_client
        # admin client justified: cross-user child lookup gated by parent linkage (managed_by_parent_id / approved parent_student_links) keyed on the authenticated user_id
        supabase = get_supabase_admin_client()

        from utils.roles import get_effective_role
        requester = supabase.table('users').select(
            'role, org_role, organization_id'
        ).eq('id', user_id).single().execute()
        if not requester.data:
            return error_response('User not found', status_code=404, error_code='not_found')

        role = get_effective_role(requester.data)
        children = []
        # Resolve linked children for parents and superadmins. _get_parent_child_ids
        # keys off this user's own parent linkage, so a non-parent superadmin simply
        # gets an empty list.
        if role in ('parent', 'superadmin'):
            child_ids = _get_parent_child_ids(supabase, user_id)
            if child_ids:
                res = supabase.table('users').select(
                    'id, display_name, first_name, last_name, avatar_url, role'
                ).in_('id', child_ids).execute()
                children = res.data or []

        return success_response({
            'children': children,
            'total': len(children)
        })

    except Exception as e:
        logger.error(f"Error getting messageable children: {str(e)}")
        return error_response(
            f"Failed to get children: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/children/<child_id>/conversations', methods=['GET'])
@require_auth
def get_child_conversations(user_id: str, child_id: str):
    """
    Read-only: list a child's conversations for an authorized parent/guardian
    (or superadmin). Does NOT mark anything read or allow sending.
    """
    try:
        from database import get_supabase_admin_client
        # admin client justified: reads another user's (the child's) conversations, gated by _can_view_child_history (parent linkage / superadmin)
        supabase = get_supabase_admin_client()

        if not _can_view_child_history(supabase, user_id, child_id):
            return error_response(
                "You do not have permission to view this child's messages",
                status_code=403,
                error_code="forbidden"
            )

        conversations = message_service.get_user_conversations(child_id)
        return success_response({
            'conversations': conversations,
            'total': len(conversations),
            'child_id': child_id
        })

    except Exception as e:
        logger.error(f"Error getting child conversations: {str(e)}")
        return error_response(
            f"Failed to get child conversations: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/children/<child_id>/conversations/<conversation_id>', methods=['GET'])
@require_auth
def get_child_conversation_messages(user_id: str, child_id: str, conversation_id: str):
    """
    Read-only: return the messages in one of a child's conversations for an
    authorized parent/guardian (or superadmin). The child must be a participant.
    """
    try:
        from database import get_supabase_admin_client
        # admin client justified: reads another user's (the child's) conversation messages, gated by _can_view_child_history (parent linkage / superadmin)
        supabase = get_supabase_admin_client()

        if not _can_view_child_history(supabase, user_id, child_id):
            return error_response(
                "You do not have permission to view this child's messages",
                status_code=403,
                error_code="forbidden"
            )

        messages = message_service.get_child_conversation_messages(conversation_id, child_id)
        return success_response({
            'messages': messages,
            'conversation_id': conversation_id,
            'child_id': child_id,
            'count': len(messages)
        })

    except ValueError as e:
        logger.error(f"Validation error getting child conversation messages: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error getting child conversation messages: {str(e)}")
        return error_response(
            f"Failed to get child conversation messages: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


# Error handlers
@bp.errorhandler(ValidationError)
def handle_validation_error(error):
    return error_response(str(error), "validation_error", status_code=400)


@bp.errorhandler(ValueError)
def handle_value_error(error):
    return error_response(str(error), "forbidden", status_code=403)


# ── Messaging overhaul: reactions, edit/delete, attachment upload ─────────────
@bp.route('/<message_id>/reactions', methods=['POST'])
@require_auth
def toggle_reaction(user_id: str, message_id: str):
    """Toggle an emoji reaction on a direct message."""
    from services import messaging_extras_service as extras
    data = request.get_json() or {}
    result = extras.toggle_reaction(user_id, 'dm', message_id, (data.get('emoji') or '').strip())
    if result.get('error'):
        return error_response(result['error'], status_code=400, error_code="validation_error")
    return success_response(result)


@bp.route('/<message_id>', methods=['PATCH'])
@require_auth
def edit_message(user_id: str, message_id: str):
    """Edit your own direct message."""
    from services import messaging_extras_service as extras
    data = request.get_json() or {}
    result = extras.edit_message(user_id, 'dm', message_id, data.get('content') or '')
    if result.get('error'):
        return error_response(result['error'], status_code=403 if 'own' in result['error'] else 400,
                              error_code="forbidden")
    return success_response(result)


@bp.route('/<message_id>', methods=['DELETE'])
@require_auth
def delete_message(user_id: str, message_id: str):
    """Delete your own direct message (soft delete)."""
    from services import messaging_extras_service as extras
    result = extras.delete_message(user_id, 'dm', message_id)
    if result.get('error'):
        return error_response(result['error'], status_code=403 if 'own' in result['error'] else 404,
                              error_code="forbidden")
    return success_response(result)


@bp.route('/attachments', methods=['POST'])
@require_auth
def upload_attachment(user_id: str):
    """Upload a message attachment (image/video/pdf/audio/doc) to storage and
    return its metadata for inclusion in a send call. Shared by DMs and groups."""
    import uuid as _uuid
    from database import get_supabase_admin_client
    from services.messaging_extras_service import MAX_ATTACHMENT_MB

    if 'file' not in request.files:
        return error_response('No file provided', status_code=400, error_code="validation_error")
    file = request.files['file']
    if not file.filename:
        return error_response('No file selected', status_code=400, error_code="validation_error")

    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    allowed = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'mp4', 'mov', 'webm',
               'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'm4a', 'mp3', 'wav'}
    if ext not in allowed:
        return error_response('This file type is not supported', status_code=400, error_code="validation_error")
    file.seek(0, 2)
    size = file.tell()
    if size > MAX_ATTACHMENT_MB * 1024 * 1024:
        return error_response(f'File must be under {MAX_ATTACHMENT_MB}MB', status_code=400,
                              error_code="validation_error")
    file.seek(0)

    supabase = get_supabase_admin_client()
    bucket = 'user-uploads'
    path = f"messages/{user_id}/{_uuid.uuid4().hex}.{ext}"
    try:
        supabase.storage.from_(bucket).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or 'application/octet-stream'},
        )
        url = supabase.storage.from_(bucket).get_public_url(path)
    except Exception as e:
        logger.error(f"Message attachment upload failed: {e}")
        return error_response('Failed to upload the file', status_code=500, error_code="internal_error")

    kind = 'image' if ext in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif') \
        else 'video' if ext in ('mp4', 'mov', 'webm') \
        else 'audio' if ext in ('m4a', 'mp3', 'wav') else 'file'
    return success_response({'attachment': {
        'url': url, 'type': kind, 'name': file.filename[:255], 'size': size,
    }})
