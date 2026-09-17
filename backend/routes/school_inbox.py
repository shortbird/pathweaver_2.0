"""
School inbox — the staff side of the "{School Name}" messaging contact.

Members DM the school through the normal /api/messages surface (the school is
just a contact to them). These routes are how the front office reads and
answers those threads AS the school: every send goes out under the school's
name, with sent_by_user_id recording which staff member actually wrote it
(shown only in this inbox, never to the member).

Access: ADMIN_ROLES (org_admin, campus_coordinator, superadmin) — the same tier
that runs the rest of the front office. A superadmin picks the org with
?organization_id=; everyone else is locked to their own org.
"""

from flask import Blueprint, request

from services import school_inbox_service, sis_service
from services.direct_message_service import DirectMessageService
from utils.auth.decorators import require_role
from utils.auth.relationships import require_relationship_to
from utils.api_response import success_response, error_response
from utils.logger import get_logger
from utils.sis_roles import ADMIN_ROLES
from utils.validation.validators import validate_string_length
from middleware.error_handler import ValidationError

logger = get_logger(__name__)

bp = Blueprint('school_inbox', __name__, url_prefix='/api/school-inbox')

message_service = DirectMessageService()


def _resolve_inbox(user_id):
    """(org, inbox_user_id) for the caller, or (None, error_response)."""
    org_id = sis_service.resolve_org_id(user_id, request.args.get('organization_id'))
    if not org_id:
        return None, error_response('No organization context', status_code=400,
                                    error_code='validation_error')
    org, inbox_user_id = school_inbox_service.school_account(org_id)
    if not org or not org.get('is_active'):
        return None, error_response('Organization not found', status_code=404,
                                    error_code='not_found')
    if not inbox_user_id:
        return None, error_response('School inbox is unavailable', status_code=500,
                                    error_code='internal_error')
    return {'org': org, 'inbox_user_id': inbox_user_id}, None


@bp.route('/conversations', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_threads(user_id: str):
    """Every member thread in the org's shared inbox, most recent first."""
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        # Each row carries last_message_sender_id and the school's resolved_at,
        # so the office can separate "waiting on us" from "answered" without
        # opening every thread (2ca63bde, 7fb34ed4, 7ee545c4).
        conversations = message_service.get_user_conversations(ctx['inbox_user_id'])
        return success_response({
            'organization': {'id': ctx['org']['id'], 'name': ctx['org']['name']},
            'inbox_user_id': ctx['inbox_user_id'],
            'conversations': conversations,
            'total': len(conversations),
        })
    except Exception as e:
        logger.error(f"Error listing school inbox threads: {str(e)}")
        return error_response('Failed to load the inbox', status_code=500,
                              error_code='internal_error')


@bp.route('/conversations/<conversation_id>', methods=['GET'])
@require_role(*ADMIN_ROLES)
def get_thread(user_id: str, conversation_id: str):
    """One thread's messages, read as the school. Marks the member's messages
    read (the inbox is shared: one staff member reading reads for all)."""
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        convo = school_inbox_service.conversation_for_inbox(
            conversation_id, ctx['inbox_user_id'])
        if not convo:
            return error_response('Conversation not found', status_code=404,
                                  error_code='not_found')
        messages = message_service.get_conversation_messages(
            conversation_id, ctx['inbox_user_id'],
            limit=min(int(request.args.get('limit', 100)), 200),
            offset=int(request.args.get('offset', 0)),
        )
        school_inbox_service.attach_sent_by_names(messages)
        if request.args.get('mark_read', '1') != '0':
            school_inbox_service.mark_conversation_read(
                conversation_id, ctx['inbox_user_id'])
        return success_response({
            'messages': messages,
            'conversation_id': conversation_id,
            'inbox_user_id': ctx['inbox_user_id'],
        })
    except Exception as e:
        logger.error(f"Error loading school inbox thread: {str(e)}")
        return error_response('Failed to load the conversation', status_code=500,
                              error_code='internal_error')


@bp.route('/conversations/<target_user_id>/send', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('target_user_id', allow=('org_staff',))
def send_as_school(user_id: str, target_user_id: str):
    """Reply to a member as the school. The member sees the school's name;
    sent_by_user_id records the actual author for the rest of the team."""
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        data = request.get_json() or {}
        content = (data.get('content') or '').strip()
        attachments = data.get('attachments') or []
        if not content and not attachments:
            raise ValidationError('Message content cannot be empty')
        if content:
            validate_string_length(content, 'content', max_length=2000)

        message = school_inbox_service.send_as_school(
            ctx['org'], target_user_id, content, sent_by=user_id,
            reply_to_message_id=data.get('reply_to_message_id'),
            attachments=attachments,
        )
        return success_response({
            'message': message,
            'conversation_id': message['conversation_id'],
        })
    except ValidationError as e:
        return error_response(str(e), status_code=400, error_code='validation_error')
    except ValueError as e:
        # can_message_user refused — the target isn't a member of this org.
        logger.warning(f"School inbox send refused: {str(e)}")
        return error_response(str(e), status_code=403, error_code='forbidden')
    except Exception as e:
        logger.error(f"Error sending as school: {str(e)}")
        return error_response('Failed to send message', status_code=500,
                              error_code='internal_error')


@bp.route('/conversations/<conversation_id>/resolve', methods=['POST'])
@require_role(*ADMIN_ROLES)
def resolve_thread(user_id: str, conversation_id: str):
    """Mark a member thread handled AS the school, or take it back
    ({"resolved": false}). Shared like read state: one colleague resolving it
    moves it out of "Needs a reply" for the whole office (5c858931)."""
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        data = request.get_json(silent=True) or {}
        resolved = data.get('resolved', True)
        if not isinstance(resolved, bool):
            return error_response('resolved must be true or false', status_code=400,
                                  error_code='validation_error')
        value = message_service.set_conversation_resolved(
            conversation_id, ctx['inbox_user_id'], resolved)
        return success_response({'conversation_id': conversation_id, 'resolved_at': value})
    except ValueError as e:
        return error_response(str(e), status_code=404, error_code='not_found')
    except Exception as e:
        logger.error(f"Error resolving school inbox thread: {str(e)}")
        return error_response('Failed to update the thread', status_code=500,
                              error_code='internal_error')


@bp.route('/unread-count', methods=['GET'])
@require_role(*ADMIN_ROLES)
def unread_count(user_id: str):
    """Threads in the shared inbox waiting for the office's reply (SIS
    sidebar badge).

    Threads, not messages: the badge sits on the page that lists threads, and
    the two disagreed (iCreate, 2026-09-15, 4b364a4c). `unread_count` keeps
    its name because the badge reads it; `needs_reply_threads` says what it is.
    """
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        count = message_service.count_threads_needing_reply(ctx['inbox_user_id'])
        return success_response({'unread_count': count, 'needs_reply_threads': count})
    except Exception as e:
        logger.error(f"Error getting school inbox unread count: {str(e)}")
        return error_response('Failed to get unread count', status_code=500,
                              error_code='internal_error')
