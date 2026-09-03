"""
Direct Messages API routes for user-to-user communication
Handles advisor-student and friend-to-friend messaging

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Primarily uses DirectMessageService (service layer pattern)
- One direct database call for user role check (simple query, acceptable)
- Service layer is the preferred pattern over direct repository usage
"""

from flask import Blueprint, request
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

from utils.auth.decorators import require_auth
from utils import class_membership
from services.direct_message_service import DirectMessageService
from middleware.error_handler import ValidationError
from utils.validation.validators import validate_string_length
from utils.api_response import success_response, error_response
from utils.storage_urls import (
    public_object_url, sign_stored_url, sign_thumbs_in_place,
)

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


def _add_class_contacts(supabase, contacts, user_ids, relationship, user_id, user_org_id):
    """Append SIS class contacts (a teacher's students, or a student's teachers)
    to `contacts`, in place. Ids already in the list are skipped, and the same
    organization isolation the other branches apply is applied here."""
    already = {ct['id'] for ct in contacts} | {user_id}
    wanted = [uid for uid in user_ids if uid and uid not in already]
    if not wanted:
        return

    for i in range(0, len(wanted), 100):
        rows = supabase.table('users').select(
            'id, display_name, first_name, last_name, avatar_url, role, organization_id'
        ).in_('id', wanted[i:i + 100]).execute()
        for row in (rows.data or []):
            if user_org_id is not None and row.get('organization_id') != user_org_id:
                continue
            row.pop('organization_id', None)
            contacts.append({**row, 'relationship': relationship})


def _append_org_adult_contacts(supabase, contacts, user_id, user_role):
    """Append the other adults of the caller's school — every guardian and staff
    member — to `contacts`, in place.

    A school is a community, and until 2026-08-27 a parent could only reach the
    families already advertising a ride on the carpool board. Now they find each
    other by name in Messages. Students are never included; observers are not
    part of the parent body and keep their linked-student contacts only. Ids
    already in the list keep the relationship the earlier, more specific branch
    gave them (a child's teacher stays 'advisor', not 'advisor' by proxy of the
    org). Never raises: a school roster failing is not worth an empty inbox.
    """
    from services import sis_service
    if user_role not in sis_service.ADULT_ORG_ROLES:
        return
    try:
        org_id = sis_service.member_org_id(user_id)
        if not org_id:
            return
        already = {ct['id'] for ct in contacts} | {user_id}
        for u in sis_service.org_adults(org_id):
            if u['id'] in already:
                continue
            contacts.append({
                'id': u['id'],
                'display_name': u.get('display_name'),
                'first_name': u.get('first_name'),
                'last_name': u.get('last_name'),
                'avatar_url': u.get('avatar_url'),
                'role': u.get('org_role'),
                'relationship': u['org_role'],
            })
    except Exception as e:
        logger.warning(f"Could not append org adult contacts for {user_id}: {str(e)}")


def _append_school_contact(contacts, user_id):
    """
    Append the caller's "{School Name}" contact — the org's shared inbox. Every
    member of an org gets it (students/staff via organization_id, platform
    parents by proxy of their children). Appends in place; never raises.
    """
    from services import school_inbox_service
    try:
        org = school_inbox_service.member_org(user_id)
        if not org:
            return
        inbox_user_id = school_inbox_service.get_or_create_inbox_user(org)
        if not inbox_user_id or inbox_user_id == user_id:
            return
        contacts[:] = [ct for ct in contacts if ct['id'] != inbox_user_id]
        contacts.append(school_inbox_service.school_contact(org, inbox_user_id))
    except Exception as e:
        logger.warning(f"Could not append school contact for {user_id}: {str(e)}")


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


def _label_member_orgs(viewer_id: str, people: list) -> None:
    """Superadmin view only: tag each person with the school they belong to
    (`organization_name`), so Optio Support can tell whose member is writing
    in without opening a second tab. Mutates in place.

    Superadmin-only on purpose — for everyone else this is a fact about
    another user they have no reason to be handed. Best-effort: a failed
    lookup just leaves the rows unlabeled.
    """
    try:
        people = [p for p in people
                  if isinstance(p, dict) and p.get('id') and not p.get('is_school')]
        if not people:
            return
        from database import get_supabase_admin_client
        from utils.roles import get_effective_role
        from services import sis_service
        # admin client justified: resolves OTHER users' org membership for the
        # superadmin support inbox; the superadmin check below is the gate.
        supabase = get_supabase_admin_client()
        viewer = supabase.table('users').select('role, org_role') \
            .eq('id', viewer_id).limit(1).execute().data
        if not viewer or get_effective_role(viewer[0]) != 'superadmin':
            return
        orgs = sis_service.member_orgs_by_user([p['id'] for p in people])
        for person in people:
            org = orgs.get(person['id'])
            if org:
                person['organization_id'] = org['id']
                person['organization_name'] = org['name']
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Org labeling failed for viewer {viewer_id}: {e}")


@bp.route('/conversations', methods=['GET'])
@require_auth
def get_conversations(user_id: str):
    """
    Get all conversations for the current user
    Includes advisor, friends, and conversation metadata
    """
    try:
        conversations = message_service.get_user_conversations(user_id)
        _label_member_orgs(user_id, [c.get('other_user') for c in conversations])

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
        logger.warning(f"Validation error getting conversation messages: {str(e)}")
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
        # Expected client error (400) — a bad request, not a server fault. Log at
        # warning so it stays a Sentry breadcrumb instead of becoming an issue.
        logger.warning(f"Validation error sending message: {str(e)}")
        return error_response(str(e), status_code=400, error_code="validation_error")

    except ValueError as e:
        # Expected permission denial (403) — user tried to message someone they
        # aren't linked to. Not a server fault; log at warning to keep it out of
        # Sentry issues.
        logger.warning(f"Permission error sending message: {str(e)}")
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
        # Expected permission denial (403), not a server fault — log at warning.
        logger.warning(f"Permission error marking message as read: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error marking message as read: {str(e)}")
        return error_response(
            f"Failed to mark message as read: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/conversations/<conversation_id>/read', methods=['POST'])
@require_auth
def mark_conversation_read(user_id: str, conversation_id: str):
    """Mark the whole thread read in one request.

    Replaces a PUT-per-message loop from the client; see
    DirectMessageService.mark_conversation_read.
    """
    try:
        count = message_service.mark_conversation_read(conversation_id, user_id)
        return success_response({
            'success': True,
            'conversation_id': conversation_id,
            'marked_read': count,
        })

    except ValueError as e:
        logger.warning(f"Permission error marking conversation as read: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error marking conversation as read: {str(e)}")
        return error_response(
            f"Failed to mark conversation as read: {str(e)}",
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


def _deliver_forward(org, member_id, body, attachments, forwarded_by):
    """Put a forwarded support message where this school actually answers mail.

    Two shapes, because there are two kinds of school (school_inbox_service.
    org_uses_school_inbox):

    - SIS orgs (iCreate) run the front office in the shared school inbox. One
      message to the inbox account; the whole front office reads it there and
      answers as the school.
    - Everyone else (Hearthwood) never opens the SIS console, so a message left
      in that inbox would go unread. It goes as a normal DM to each org admin's
      own Messages instead — and only org admins, because can_message_user lets
      a member write to their org admin but not to a campus coordinator, which
      would refuse the whole forward.

    Returns ({messages, recipients, reply_url, via}, None), or (None, error).
    """
    from services import school_inbox_service

    if school_inbox_service.org_uses_school_inbox(org):
        inbox_user_id = school_inbox_service.get_or_create_inbox_user(org)
        if not inbox_user_id:
            return None, error_response('School inbox is unavailable',
                                        status_code=500, error_code='internal_error')
        forwarded = message_service.send_message(
            member_id, inbox_user_id, body,
            attachments=attachments, sent_by_user_id=forwarded_by,
        )
        return {
            'messages': [forwarded],
            'recipients': school_inbox_service.admin_recipients(org['id']),
            'reply_url': school_inbox_service.SIS_INBOX_URL,
            'via': 'school_inbox',
        }, None

    admins = school_inbox_service.org_admin_recipients(org['id'])
    if not admins:
        return None, error_response(f"{org['name']} has no org admin to forward this to",
                                    status_code=400, error_code='validation_error')
    delivered = []
    reached = []   # the admins whose thread actually got it — who to email
    failures = []
    for admin_staff in admins:
        try:
            delivered.append(message_service.send_message(
                member_id, admin_staff['id'], body,
                attachments=attachments, sent_by_user_id=forwarded_by,
            ))
            reached.append(admin_staff)
        except Exception as send_err:  # noqa: BLE001
            # One admin's thread failing must not lose the others.
            failures.append(str(send_err))
            logger.warning(f"Forward to admin {admin_staff['id']} failed: {send_err}")
    if not delivered:
        raise ValueError(failures[0] if failures else 'Could not deliver the forward')
    return {
        'messages': delivered,
        'recipients': reached,
        'reply_url': school_inbox_service.forward_reply_url(member_id),
        'via': 'org_admins',
    }, None


@bp.route('/<message_id>/forward-to-school', methods=['POST'])
@require_auth
def forward_to_school(user_id: str, message_id: str):
    """
    Superadmin-only: forward a message a member sent to Optio Support to their
    school, so the school handles it instead.

    Where it lands depends on the school — the shared SIS inbox, or each org
    admin's own Messages; see _deliver_forward. Either way the people who can
    answer it also get an email with a button that opens it, and Optio Support
    sends the member a courtesy note that the school will follow up.
    """
    try:
        from database import get_supabase_admin_client
        from utils.roles import get_effective_role
        from services import school_inbox_service

        # admin client justified: superadmin-only cross-thread action, role verified below
        supabase = get_supabase_admin_client()
        caller = supabase.table('users').select('role, org_role, organization_id') \
            .eq('id', user_id).single().execute()
        if not caller.data or get_effective_role(caller.data) != 'superadmin':
            return error_response('Superadmin access required', status_code=403,
                                  error_code='forbidden')

        msg = supabase.table('direct_messages').select('*').eq('id', message_id) \
            .limit(1).execute()
        if not msg.data:
            return error_response('Message not found', status_code=404, error_code='not_found')
        msg = msg.data[0]
        if msg.get('is_deleted'):
            return error_response('This message was deleted', status_code=400,
                                  error_code='validation_error')

        # Only the support flow: the message must have been sent TO a superadmin
        # (the account behind the Optio Support alias), by a non-staff member.
        recipient = supabase.table('users').select('role').eq('id', msg['recipient_id']) \
            .single().execute()
        if not recipient.data or recipient.data.get('role') != 'superadmin':
            return error_response('Only messages sent to Optio Support can be forwarded',
                                  status_code=400, error_code='validation_error')

        member_id = msg['sender_id']
        org = school_inbox_service.member_org(member_id)
        if not org:
            return error_response("This person isn't a member of any school",
                                  status_code=400, error_code='validation_error')
        # The member's words, wherever this school answers mail. Sent as the
        # member so the reply goes straight back to them; the prefix keeps the
        # provenance honest on every surface, and sent_by_user_id records who
        # forwarded it.
        original = (msg.get('message_content') or '').strip()
        body = (f"Forwarded from Optio Support:\n\n{original}" if original
                else "Forwarded from Optio Support (attachment)")
        delivery, err = _deliver_forward(
            org, member_id, body, msg.get('attachments') or [], user_id)
        if err:
            return err

        # Everyone who got the message also gets an email: the in-app bell from
        # send_message never reaches someone who isn't logged in today.
        member = supabase.table('users').select('display_name, first_name, last_name') \
            .eq('id', member_id).limit(1).execute().data
        member = member[0] if member else {}
        member_name = (member.get('display_name')
                       or f"{member.get('first_name') or ''} {member.get('last_name') or ''}".strip()
                       or 'A member')
        emailed = school_inbox_service.email_admins_of_forwarded_message(
            org, delivery['recipients'], member_name, original,
            delivery['reply_url'], school_inbox=delivery['via'] == 'school_inbox')

        # Courtesy note back in the support thread, from the support account.
        ack_text = (f"Your message has been sent to {org['name']} — "
                    "they'll get back to you here on Optio.")
        try:
            message_service.send_message(msg['recipient_id'], member_id, ack_text)
        except Exception as ack_err:
            # The forward itself succeeded; a failed ack shouldn't undo it.
            logger.warning(f"Forward ack failed for message {message_id}: {ack_err}")

        return success_response({
            'forwarded_message_id': delivery['messages'][0]['id'],
            'conversation_id': delivery['messages'][0]['conversation_id'],
            'organization': {'id': org['id'], 'name': org['name']},
            'via': delivery['via'],
            'emailed_admins': emailed,
        })

    except ValueError as e:
        # send_message permission refusal (e.g. inactive org).
        logger.warning(f"Forward to org admin refused: {str(e)}")
        return error_response(str(e), status_code=403, error_code='forbidden')
    except Exception as e:
        logger.error(f"Error forwarding message to school: {str(e)}")
        return error_response('Failed to forward message', status_code=500,
                              error_code='internal_error')


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

            # Name the org, not just its uuid: the support inbox needs to know
            # whose member it is talking to. One query for the whole list.
            org_ids = list({c['organization_id'] for c in contacts if c.get('organization_id')})
            if org_ids:
                try:
                    from utils.db_fetch import fetch_all_rows
                    org_rows = fetch_all_rows(lambda: (
                        supabase.table('organizations').select('id, name').in_('id', org_ids)
                    ))
                    names = {o['id']: o.get('name') for o in org_rows}
                    for contact in contacts:
                        name = names.get(contact.get('organization_id'))
                        if name:
                            contact['organization_name'] = name
                except Exception as org_err:  # noqa: BLE001
                    logger.warning(f"Contact org names failed: {org_err}")

            # Avatars live in private buckets and the list draws them at 40px,
            # so serve thumbnails -- a full-size user photo averages 1.3 MB.
            sign_thumbs_in_place(contacts, ['avatar_url'])
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

            # SIS classes: the teachers of every class this student is enrolled
            # in. They are assigned on the class, not through
            # advisor_student_assignments, so they need their own lookup.
            _add_class_contacts(
                supabase, contacts, class_membership.teachers_of_student(user_id),
                'advisor', user_id, user_org_id
            )

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

            # SIS classes: everyone on the roster of a class this teacher teaches,
            # and — since the class chat holds the adults (2026-08-22) — the
            # guardians of those students.
            taught = class_membership.students_taught_by(user_id)
            _add_class_contacts(
                supabase, contacts, taught,
                'student', user_id, user_org_id
            )
            # user_org_id deliberately None: guardians are usually platform
            # parents (organization_id NULL), and the roster link — their child
            # in this teacher's class — is already the authorization.
            _add_class_contacts(
                supabase, contacts, class_membership.parents_of_students(taught),
                'parent', user_id, None
            )

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

                # SIS classes: the teachers of every class those children are
                # enrolled in. Class chats hold guardians and teachers, so the
                # 1:1 surface has to offer the same adults (2026-08-22).
                # Batched across the whole sibling set — per-child lookups cost
                # three queries each.
                class_teacher_ids = class_membership.teachers_of_students(child_ids)
                _add_class_contacts(
                    supabase, contacts, class_teacher_ids,
                    'advisor', user_id, user_org_id
                )

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

        # Everyone else in the school. The role branches above cover the
        # relationships a person has (their children, their teachers, their
        # observers); this covers the school they are all in.
        _append_org_adult_contacts(supabase, contacts, user_id, user_role)

        # Every org member gets their school's shared-inbox contact.
        _append_school_contact(contacts, user_id)

        # Always include the "Optio Support" contact (dedupes by id too).
        contacts = _append_support_contact(supabase, contacts, user_id)

        sign_thumbs_in_place(contacts, ['avatar_url'])
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
                sign_thumbs_in_place(children, ['avatar_url'])

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
        logger.warning(f"Validation error getting child conversation messages: {str(e)}")
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

    # admin client justified: server-side storage upload to user-uploads bucket; path is server-generated under the caller's own user_id from @require_auth
    supabase = get_supabase_admin_client()
    bucket = 'user-uploads'
    path = f"messages/{user_id}/{_uuid.uuid4().hex}.{ext}"
    try:
        supabase.storage.from_(bucket).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or 'application/octet-stream'},
        )
        # `user-uploads` is private. `url` is the durable pointer the send call
        # posts back to be stored on the message; `display_url` is the signed,
        # expiring twin the composer renders as a preview. Never store the twin
        # — every reader is handed a fresh one when they open the thread.
        url = public_object_url(bucket, path)
    except Exception as e:
        logger.error(f"Message attachment upload failed: {e}")
        return error_response('Failed to upload the file', status_code=500, error_code="internal_error")

    kind = 'image' if ext in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif') \
        else 'video' if ext in ('mp4', 'mov', 'webm') \
        else 'audio' if ext in ('m4a', 'mp3', 'wav') else 'file'
    return success_response({'attachment': {
        'url': url, 'display_url': sign_stored_url(url, bucket),
        'type': kind, 'name': file.filename[:255], 'size': size,
    }})
