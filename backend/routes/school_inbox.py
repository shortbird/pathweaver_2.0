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

One exception, per thread (iCreate, 2026-09-23, d93b24d2): a staff member the
office handed a thread to with a task ("Make a task", thread_task_service)
holds a grant for it. The routes that open ONE thread -- read it, answer it --
take STAFF_ROLES and then ask school_inbox_service.thread_access, which lets in
the office or a live grant for exactly that thread. Everything that lists or
manages the inbox (the thread list, resolve, the badge, the group list, making
a task) stays ADMIN_ROLES. A granted teacher's reply goes out as the school
with their name shown to the family ("Kate for iCreate").
"""

from flask import Blueprint, request

from services import school_inbox_service, sis_service
from services.direct_message_service import DirectMessageService
from services.group_message_service import GroupMessageService
from utils.auth.decorators import require_role
from utils.auth.relationships import require_relationship_to
from utils.api_response import success_response, error_response
from utils.logger import get_logger
from utils.sis_roles import ADMIN_ROLES, STAFF_ROLES
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
@require_role(*STAFF_ROLES)
def get_thread(user_id: str, conversation_id: str):
    """One thread's messages, read as the school. Marks the member's messages
    read (the inbox is shared: one staff member reading reads for all) and
    records WHICH staff member opened it (9b46c748), returned as `opened_by`.

    The office, or a staff member with a live grant for this thread."""
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        convo = school_inbox_service.conversation_for_inbox(
            conversation_id, ctx['inbox_user_id'])
        # Not found and not allowed answer the same: a teacher probing thread
        # ids learns nothing about which exist.
        via = convo and school_inbox_service.thread_access(
            user_id, ctx['org'], conversation_id=conversation_id)
        if not convo or not via:
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
            school_inbox_service.record_thread_read(
                ctx['org']['id'], user_id, conversation_id=conversation_id)
        return success_response({
            'messages': messages,
            'conversation_id': conversation_id,
            'inbox_user_id': ctx['inbox_user_id'],
            'organization': {'id': ctx['org']['id'], 'name': ctx['org']['name']},
            'access': via,
            'opened_by': school_inbox_service.thread_readers(conversation_id=conversation_id),
        })
    except Exception as e:
        logger.error(f"Error loading school inbox thread: {str(e)}")
        return error_response('Failed to load the conversation', status_code=500,
                              error_code='internal_error')


@bp.route('/conversations/<target_user_id>/send', methods=['POST'])
@require_role(*STAFF_ROLES)
@require_relationship_to('target_user_id', allow=('org_staff',))
def send_as_school(user_id: str, target_user_id: str):
    """Reply to a member as the school. The member sees the school's name;
    sent_by_user_id records the actual author for the rest of the team.

    A staff member outside the office may send only into a thread they hold a
    live grant for -- the school's existing thread with this member -- and
    their reply names them to the member ("Kate for iCreate", d93b24d2). They
    cannot start a new thread as the school."""
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        via = 'office' if sis_service.caller_is_admin(user_id) else None
        if not via:
            convo = school_inbox_service.conversation_with_member(
                ctx['inbox_user_id'], target_user_id)
            if convo and school_inbox_service.thread_access(
                    user_id, ctx['org'], conversation_id=convo['id']):
                via = 'grant'
        if not via:
            return error_response('Conversation not found', status_code=404,
                                  error_code='not_found')
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
            **({'show_sender_name': True} if via == 'grant' else {}),
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


# ── Groups the school owns ────────────────────────────────────────────────────
#
# A staff group started from the School tab belongs to the school-inbox
# account (GroupMessageService.create_school_group), not to the colleague who
# started it -- it used to land in the sender's personal Messages and nowhere
# the rest of the office could see (iCreate, ac84b6cd). These routes are how the
# front office reads and writes those threads in the console, without being
# members: the school is the member. What a staff member writes is sent under
# their own name, so the teachers in the room know who asked.
#
# Access is school_inbox_service.school_group_access on every id route: the
# group must be owned by an org's inbox account, and the caller must be that
# org's front office (or a superadmin), or hold a live grant for that group
# (d93b24d2). ADMIN_ROLES alone would let one school's admin read another
# school's group by id; the id routes take STAFF_ROLES so a granted teacher
# reaches the check at all.

group_service = GroupMessageService()


def _groups():
    return group_service


@bp.route('/groups', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_school_groups(user_id: str):
    """The school's group threads for the School tab, most recent first."""
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        groups = _groups().get_school_groups(ctx['inbox_user_id'])
        return success_response({
            'groups': groups,
            'inbox_user_id': ctx['inbox_user_id'],
            'total': len(groups),
        })
    except Exception as e:
        logger.error(f"Error listing school groups: {str(e)}")
        return error_response('Failed to load group threads', status_code=500,
                              error_code='internal_error')


def _school_group_or_404(user_id, group_id):
    access = school_inbox_service.school_group_access(user_id, group_id)
    if not access:
        return None, error_response('Group not found', status_code=404,
                                    error_code='not_found')
    return access, None


@bp.route('/groups/<group_id>', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_school_group(user_id: str, group_id: str):
    """Group details (members, pin, settings), read as the school."""
    try:
        access, err = _school_group_or_404(user_id, group_id)
        if err:
            return err
        group = _groups().get_group(access['inbox_user_id'], group_id)
        return success_response({**group, 'inbox_user_id': access['inbox_user_id']})
    except ValueError as e:
        return error_response(str(e), status_code=404, error_code='not_found')
    except Exception as e:
        logger.error(f"Error loading school group: {str(e)}")
        return error_response('Failed to load the group', status_code=500,
                              error_code='internal_error')


@bp.route('/groups/<group_id>/messages', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_school_group_messages(user_id: str, group_id: str):
    """One page of a school group, read as the school. Reading it marks it read
    for the whole office, the same shared read state as the school's DMs."""
    try:
        access, err = _school_group_or_404(user_id, group_id)
        if err:
            return err
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))
        messages = _groups().get_messages(access['inbox_user_id'], group_id,
                                          limit=limit, offset=offset)
        school_inbox_service.record_thread_read(access['org']['id'], user_id,
                                                group_id=group_id)
        return success_response({
            'messages': messages,
            'group_id': group_id,
            'inbox_user_id': access['inbox_user_id'],
            'access': access.get('via'),
            'opened_by': school_inbox_service.thread_readers(group_id=group_id),
            'count': len(messages),
            'limit': limit,
            'offset': offset,
        })
    except ValueError as e:
        return error_response(str(e), status_code=404, error_code='not_found')
    except Exception as e:
        logger.error(f"Error loading school group messages: {str(e)}")
        return error_response('Failed to load the conversation', status_code=500,
                              error_code='internal_error')


@bp.route('/groups/<group_id>/messages', methods=['POST'])
@require_role(*STAFF_ROLES)
def send_to_school_group(user_id: str, group_id: str):
    """Write in a school group. The school's membership lets the caller in; the
    message is sent under the caller's own name."""
    try:
        access, err = _school_group_or_404(user_id, group_id)
        if err:
            return err
        data = request.get_json() or {}
        content = (data.get('content') or '').strip()
        attachments = data.get('attachments') or []
        if not content and not attachments:
            raise ValidationError('Message content cannot be empty')
        if content:
            validate_string_length(content, 'content', max_length=2000)
        message = _groups().send_message(
            user_id, group_id, content,
            reply_to_message_id=data.get('reply_to_message_id'),
            attachments=attachments,
            on_behalf_of=access['inbox_user_id'],
        )
        return success_response({'message': message, 'group_id': group_id},
                                status_code=201)
    except ValidationError as e:
        return error_response(str(e), status_code=400, error_code='validation_error')
    except ValueError as e:
        logger.warning(f"School group send refused: {str(e)}")
        return error_response(str(e), status_code=403, error_code='forbidden')
    except Exception as e:
        logger.error(f"Error sending to school group: {str(e)}")
        return error_response('Failed to send message', status_code=500,
                              error_code='internal_error')


# ── Threads handed to a staff member, and making the task ────────────────────


@bp.route('/granted', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_granted_threads(user_id: str):
    """The school threads the caller holds a live grant for: what a teacher
    sees under the school's name in the console (d93b24d2). Shaped like the
    inbox's own lists so the page renders them with the same rows."""
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        ids = school_inbox_service.granted_thread_ids(user_id, ctx['org']['id'])
        conversations = []
        if ids['conversations']:
            conversations = [c for c in message_service.get_user_conversations(ctx['inbox_user_id'])
                             if c.get('id') in ids['conversations']]
        groups = []
        if ids['groups']:
            groups = [g for g in _groups().get_school_groups(ctx['inbox_user_id'])
                      if g.get('id') in ids['groups']]
        return success_response({
            'organization': {'id': ctx['org']['id'], 'name': ctx['org']['name']},
            'inbox_user_id': ctx['inbox_user_id'],
            'conversations': conversations,
            'groups': groups,
        })
    except Exception as e:
        logger.error(f"Error listing granted school threads: {str(e)}")
        return error_response('Failed to load your school threads', status_code=500,
                              error_code='internal_error')


def _task_payload():
    data = request.get_json() or {}
    return {
        'assignee_id': data.get('assignee_id'),
        'message_id': data.get('message_id') or None,
        'action': data.get('action') or 'reply',
        'due_date': data.get('due_date') or None,
        'priority': data.get('priority') or None,
        'note': data.get('note'),
        'title': data.get('title'),
    }


@bp.route('/conversations/<conversation_id>/task', methods=['POST'])
@require_role(*ADMIN_ROLES)
def make_task_from_conversation(user_id: str, conversation_id: str):
    """Turn a school thread (or one message in it) into a task for a staff
    member, and give them the thread (bf8b754d, d93b24d2).

    Body: {assignee_id, action: 'reply'|'do', due_date?, priority?, note?,
           message_id?, title?}
    """
    from services import thread_task_service
    ctx, err = _resolve_inbox(user_id)
    if err:
        return err
    convo = school_inbox_service.conversation_for_inbox(conversation_id, ctx['inbox_user_id'])
    if not convo:
        return error_response('Conversation not found', status_code=404, error_code='not_found')
    body = _task_payload()
    member_id = (convo['participant_2_id'] if convo['participant_1_id'] == ctx['inbox_user_id']
                 else convo['participant_1_id'])
    names = school_inbox_service.user_display_names([member_id])
    quote, quote_sender = _quoted(body['message_id'], names, ctx, conversation_id=conversation_id)
    if body['message_id'] and quote is None:
        return error_response('That message is not in this thread', status_code=400,
                              error_code='validation_error')
    try:
        result = thread_task_service.create_task_from_thread(
            ctx['org']['id'], user_id, body['assignee_id'],
            conversation_id=conversation_id, message_id=body['message_id'],
            action=body['action'], due_date=body['due_date'], priority=body['priority'],
            note=body['note'], title=body['title'], member_name=names.get(member_id),
            quote=quote, quote_sender=quote_sender)
    except ValueError as e:
        return error_response(str(e), status_code=400, error_code='validation_error')
    return success_response(result, status_code=201)


@bp.route('/groups/<group_id>/task', methods=['POST'])
@require_role(*ADMIN_ROLES)
def make_task_from_group(user_id: str, group_id: str):
    """The same for a group thread the school owns."""
    from services import thread_task_service
    access, err = _school_group_or_404(user_id, group_id)
    if err:
        return err
    if access.get('via') != 'office':
        return error_response('Group not found', status_code=404, error_code='not_found')
    body = _task_payload()
    quote, quote_sender = _quoted(body['message_id'], None, access, group_id=group_id)
    if body['message_id'] and quote is None:
        return error_response('That message is not in this thread', status_code=400,
                              error_code='validation_error')
    try:
        result = thread_task_service.create_task_from_thread(
            access['org']['id'], user_id, body['assignee_id'],
            group_id=group_id, message_id=body['message_id'],
            action=body['action'], due_date=body['due_date'], priority=body['priority'],
            note=body['note'], title=body['title'],
            thread_name=(access.get('group') or {}).get('name'),
            quote=quote, quote_sender=quote_sender)
    except ValueError as e:
        return error_response(str(e), status_code=400, error_code='validation_error')
    return success_response(result, status_code=201)


def _quoted(message_id, names, ctx, *, conversation_id=None, group_id=None):
    """(text, author name) of the picked message, or (None, None)."""
    if not message_id:
        return None, None
    msg = school_inbox_service.message_in_thread(
        message_id, conversation_id=conversation_id, group_id=group_id)
    if not msg:
        return None, None
    author = msg.get('sender_id')
    if author == ctx.get('inbox_user_id'):
        # The school's own message: name the colleague who wrote it.
        author = msg.get('sent_by_user_id') or author
    who = (names or {}).get(author) or school_inbox_service.user_display_names([author]).get(author)
    return msg.get('message_content') or '', who
