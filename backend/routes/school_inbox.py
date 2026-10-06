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

Every route is ADMIN_ROLES, and inside that tier the org's inbox list decides
(ticket 19047fd0): org admins choose which campus coordinators open the inbox;
an empty list is every coordinator. _resolve_inbox is the one gate, and the
group routes ask school_group_access, which reads the same list.

Every route is ADMIN_ROLES. For a week a teacher could be handed one thread
with a task and answer it as the school (d93b24d2); nobody ever was, and the
grant was removed on 2026-10-01 (school_inbox_service.thread_access).
"""

from flask import Blueprint, request

from services import school_inbox_service, sis_service
from services.direct_message_service import DirectMessageService
from services.group_message_service import GroupMessageService
from utils.auth.decorators import require_role
from utils.auth.read_state import masquerade_read_only
from utils.auth.relationships import require_relationship_to
from utils.api_response import success_response, error_response
from utils.logger import get_logger
from utils.sis_roles import ADMIN_ROLES, INBOX_MANAGER_ROLES
from utils.validation.validators import validate_string_length
from middleware.error_handler import ValidationError

logger = get_logger(__name__)

bp = Blueprint('school_inbox', __name__, url_prefix='/api/school-inbox')

message_service = DirectMessageService()


def _resolve_inbox(user_id):
    """(org, inbox_user_id) for the caller, or (None, error_response).

    The one gate on the shared inbox: a coordinator the org's inbox list
    leaves out is refused here, before anything is read or written
    (ticket 19047fd0)."""
    org_id = sis_service.resolve_org_id(user_id, request.args.get('organization_id'))
    if not org_id:
        return None, error_response('No organization context', status_code=400,
                                    error_code='validation_error')
    if not school_inbox_service.inbox_access(user_id, org_id):
        return None, error_response("You are not on this school's inbox", status_code=403,
                                    error_code='forbidden')
    org, inbox_user_id = school_inbox_service.school_account(org_id)
    if not org or not org.get('is_active'):
        return None, error_response('Organization not found', status_code=404,
                                    error_code='not_found')
    if not inbox_user_id:
        return None, error_response('School inbox is unavailable', status_code=500,
                                    error_code='internal_error')
    return {'org': org, 'inbox_user_id': inbox_user_id}, None


@bp.route('/access', methods=['GET'])
@require_role(*ADMIN_ROLES)
def get_inbox_access(user_id: str):
    """Whether the caller may open the school inbox, and who is on it.

    `inbox_access` is what the console reads to show or hide the School tab.
    `office_ids` is everyone the inbox reaches today (org admins plus the
    coordinators let in); `member_ids` is the configured list, [] when every
    coordinator is in (`everyone`). `can_manage` is true for the org admins
    who may change the list (ticket 19047fd0)."""
    try:
        org_id = sis_service.resolve_org_id(user_id, request.args.get('organization_id'))
        if not org_id:
            return error_response('No organization context', status_code=400,
                                  error_code='validation_error')
        members = school_inbox_service.inbox_member_ids(org_id)
        return success_response({
            'organization_id': org_id,
            'inbox_access': school_inbox_service.inbox_access(user_id, org_id),
            'can_manage': school_inbox_service.can_manage_inbox_members(user_id),
            'member_ids': members,
            'everyone': not members,
            'office_ids': school_inbox_service.admin_recipient_ids(org_id),
        })
    except Exception as e:
        logger.error(f"Error loading school inbox access: {str(e)}")
        return error_response('Failed to load inbox access', status_code=500,
                              error_code='internal_error')


@bp.route('/access', methods=['PUT'])
@require_role(*INBOX_MANAGER_ROLES)
def set_inbox_access(user_id: str):
    """Org admins choose which campus coordinators open the school inbox.

    Body: {member_ids: [user_id, ...]}. An empty list means every coordinator
    (the default). Each id must be an org admin or campus coordinator of this
    school; org admins are in whether or not they are listed."""
    try:
        org_id = sis_service.resolve_org_id(user_id, request.args.get('organization_id'))
        if not org_id:
            return error_response('No organization context', status_code=400,
                                  error_code='validation_error')
        data = request.get_json(silent=True) or {}
        raw = data.get('member_ids')
        if not isinstance(raw, list):
            return error_response('member_ids must be a list', status_code=400,
                                  error_code='validation_error')
        wanted = list(dict.fromkeys(str(i) for i in raw if i))
        office = {s['id'] for s in sis_service.list_org_staff(org_id)
                  if {'org_admin', 'campus_coordinator'} & set(s.get('roles') or [])}
        outside = [i for i in wanted if i not in office]
        if outside:
            return error_response('Only org admins and campus coordinators of this school '
                                  'can be on the inbox', status_code=400,
                                  error_code='validation_error')
        from services.org_settings_service import FlagsRejected, patch_feature_flags
        ctx = sis_service.get_user_org_context(user_id)
        try:
            patch_feature_flags(
                org_id,
                {'sis_settings': {school_inbox_service.INBOX_MEMBERS_KEY: wanted or None}},
                caller_id=user_id,
                sees_finance=sis_service.caller_sees_pay(user_id),
                is_superadmin=ctx.get('role') == 'superadmin',
            )
        except FlagsRejected as rejected:
            return error_response(rejected.body.get('error', 'Not saved'),
                                  status_code=rejected.status, error_code='forbidden')
        return success_response({
            'organization_id': org_id,
            'member_ids': wanted,
            'everyone': not wanted,
            'office_ids': school_inbox_service.admin_recipient_ids(org_id),
        })
    except Exception as e:
        logger.error(f"Error saving school inbox access: {str(e)}")
        return error_response('Failed to save inbox access', status_code=500,
                              error_code='internal_error')


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
    read (the inbox is shared: one staff member reading reads for all) and
    records WHICH staff member opened it (9b46c748), returned as `opened_by`."""
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
        # A colleague may delete what they wrote as the school (ticket
        # ecc73d0e). sent_by_user_id is already on each row; can_delete is
        # the same rule DELETE /messages/<id> applies, so the console does not
        # re-derive it.
        for m in messages:
            m['can_delete'] = bool(
                m.get('sender_id') == ctx['inbox_user_id']
                and m.get('sent_by_user_id') == user_id
                and not m.get('is_deleted'))
        # A masquerade reads without marking: the read state (and the
        # "opened by" mark) belongs to the staff member being viewed as
        # (ticket 50082917).
        if request.args.get('mark_read', '1') != '0' and not masquerade_read_only():
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
@require_role(*ADMIN_ROLES)
@require_relationship_to('target_user_id', allow=('org_staff',))
def send_as_school(user_id: str, target_user_id: str):
    """Reply to a member as the school. The member sees the school's name;
    sent_by_user_id records the actual author for the rest of the team.

    A reply typed into the school's existing thread stays in that thread. With
    no thread yet this starts one, and send_as_school decides the voice: the
    school's for a family or student, the author's own for a colleague."""
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        if not school_inbox_service.thread_access(user_id, ctx['org']):
            return error_response('Conversation not found', status_code=404,
                                  error_code='not_found')
        data = request.get_json() or {}
        content = (data.get('content') or '').strip()
        attachments = data.get('attachments') or []
        if not content and not attachments:
            raise ValidationError('Message content cannot be empty')
        if content:
            validate_string_length(content, 'content', max_length=2000)

        convo = school_inbox_service.conversation_with_member(
            ctx['inbox_user_id'], target_user_id)
        message = school_inbox_service.send_as_school(
            ctx['org'], target_user_id, content, sent_by=user_id,
            reply_to_message_id=data.get('reply_to_message_id'),
            attachments=attachments,
            in_thread=bool(convo and convo.get('last_message_at')),
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
    """Close a member thread AS the school, or reopen it ({"resolved": false}).
    Shared like read state: one colleague closing it closes it for the whole
    office (5c858931). The console calls the two states Open and Closed
    (d57973f6); the column is still resolved_at."""
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


@bp.route('/messages/<message_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_school_message(user_id: str, message_id: str):
    """Delete a message the caller sent as the school (soft delete).

    Ticket ecc73d0e: a coordinator sent a message by mistake and had no way to
    take it back. The school's reply carries the school as sender_id, so the
    normal DM delete refuses it; the author is sent_by_user_id. Only that
    colleague may delete it, and only a message of this org's school inbox --
    anything else is refused with nothing written.

    School GROUP messages have no sent_by column, so they stay undeletable."""
    from services import messaging_extras_service as extras
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        result = extras.delete_school_message(user_id, ctx['inbox_user_id'], message_id)
        if result.get('error'):
            own = 'own' in result['error']
            return error_response(result['error'], status_code=403 if own else 404,
                                  error_code='forbidden' if own else 'not_found')
        return success_response(result)
    except Exception as e:
        logger.error(f"Error deleting school inbox message: {str(e)}")
        return error_response('Failed to delete the message', status_code=500,
                              error_code='internal_error')


@bp.route('/unread-count', methods=['GET'])
@require_role(*ADMIN_ROLES)
def unread_count(user_id: str):
    """Threads in the shared inbox waiting for the office's reply (SIS
    sidebar badge).

    Threads, not messages: the badge sits on the page that lists threads, and
    the two disagreed (iCreate, 2026-09-15, 4b364a4c). `unread_count` keeps
    its name because the badge reads it; `needs_reply_threads` says what it is.

    The same one rule as /api/messages/unread-count?threads=1: 1:1 threads in
    the Open view + the school's group threads with unread messages, so every
    number points at a row on the School tab (ticket 16d13eb4).
    """
    try:
        ctx, err = _resolve_inbox(user_id)
        if err:
            return err
        inbox_id = ctx['inbox_user_id']
        direct_threads = message_service.count_threads_needing_reply(inbox_id)
        group_threads = _groups().count_groups_with_unread(inbox_id, owned_by=inbox_id)
        count = direct_threads + group_threads
        return success_response({'unread_count': count, 'needs_reply_threads': count,
                                 'direct_threads': direct_threads,
                                 'group_threads': group_threads})
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
# org's front office (or a superadmin). ADMIN_ROLES alone would let one
# school's admin read another school's group by id.

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
@require_role(*ADMIN_ROLES)
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
@require_role(*ADMIN_ROLES)
def get_school_group_messages(user_id: str, group_id: str):
    """One page of a school group, read as the school. Reading it marks it read
    for the whole office, the same shared read state as the school's DMs."""
    try:
        access, err = _school_group_or_404(user_id, group_id)
        if err:
            return err
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))
        # A masquerade reads without marking anything (ticket 50082917).
        read_only = masquerade_read_only()
        messages = _groups().get_messages(access['inbox_user_id'], group_id,
                                          limit=limit, offset=offset,
                                          mark_read=not read_only)
        if not read_only:
            school_inbox_service.record_thread_read(access['org']['id'], user_id,
                                                    group_id=group_id)
            # The office's bell holds one row per chat now, and a new message
            # only rings when that row has been read. Reading the group here
            # has to read the row, or it absorbs every later message in silence.
            try:
                from services.notification_service import NotificationService
                NotificationService().mark_group_message_notifications_read(user_id, group_id)
            except Exception as read_err:  # noqa: BLE001
                logger.warning(f"School group bell sync failed: {read_err}")
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
@require_role(*ADMIN_ROLES)
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


# ── Making a task from a thread ───────────────────────────────────────────────


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
    """Turn a school thread (or one message in it) into a task for somebody
    in the front office (bf8b754d).

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
