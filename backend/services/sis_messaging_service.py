"""Messaging a group of staff from the SIS console.

The office writes to teachers constantly -- "everyone teaching Tuesday, the
gate code changed", "the three of you covering Ada's block, here is the plan" --
and until now the console offered exactly one way to do it: pick one person, and
do it again for the next one. The only multi-select in the whole console was the
announcement composer, which is a broadcast: no thread, no replies, everyone
notified whether it concerns them or not.

Two shapes, because both are real:

  group     one thread, everyone in it, replies visible to all. The default:
            "did the room get sorted?" is a question the whole group wants the
            answer to, and N private copies of it means N people asking it.
  separate  one private DM each. For the same words to different people when
            the replies should not be shared -- a reminder about paperwork.

Who owns the thread depends on where it was sent from (owner decision,
2026-09-22, after iCreate's ac84b6cd: "when I sent a group message from
icreate's inbox, the thread popped into my PERSONAL inbox"):

  My messages (as_school False)
            the staff member, personally -- their own group or DMs, in their own
            Messages, exactly as before.
  School tab (as_school True)
            the SCHOOL. A group is created by the school-inbox account
            (GroupMessageService.create_school_group) and listed on the School
            tab for the whole front office; separate messages go through
            school_inbox_service.send_as_school, so replies land in the school
            inbox. Every message still names its author: the staff member is
            the group message's sender and the DM's sent_by, because a thread
            with no author is unanswerable -- who would a teacher be replying to?
            School groups sit in their own list on the School tab, apart from
            the family queue, so they do not bury the parent messages the
            office works through.
"""

from typing import Any, Dict, List, Optional, Sequence, Set

from utils.logger import get_logger

logger = get_logger(__name__)

#: Message bodies, like the school inbox's, are capped well below the column.
MAX_BODY = 2000
#: group_conversations.name is varchar(100).
MAX_NAME = 100

#: Weekday presets. class_meetings.day_of_week is 0-6; 1 is Monday, matching
#: the announcement composer's day chips.
_WEEKDAYS = ((1, 'Monday'), (2, 'Tuesday'), (3, 'Wednesday'),
             (4, 'Thursday'), (5, 'Friday'))


def staff_recipients(org_id: str) -> List[Dict[str, Any]]:
    """Everyone in this org who can actually receive a message.

    Placeholder staff are dropped: those rows exist so a class can name a
    teacher who has no account yet, and a DM to one is read by nobody. Better
    absent from the picker than silently undelivered.
    """
    from services import sis_service
    try:
        staff = sis_service.list_org_staff(org_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"sis messaging: staff lookup failed for org {org_id}: {e}")
        return []
    return [{
        'id': s['id'],
        'name': s.get('name') or '',
        'first_name': s.get('first_name'),
        'last_name': s.get('last_name'),
        'roles': s.get('roles') or [],
        'role_labels': s.get('role_labels') or [],
        'avatar_url': s.get('avatar_url'),
    } for s in staff if not s.get('is_placeholder')]


def preset_groups(org_id: str) -> List[Dict[str, Any]]:
    """The named sets of staff worth one click, each with its member ids.

    Ids are returned with the list rather than resolved on submit so the picker
    can show a count and let one member be removed before sending -- "all
    teachers except Sam" is the common case, and a preset that resolves only at
    send time cannot express it.
    """
    people = staff_recipients(org_id)
    by_id = {p['id']: p for p in people}
    presets: List[Dict[str, Any]] = []

    def _add(key, label, ids, description=None):
        members = [i for i in ids if i in by_id]
        if members:
            presets.append({'key': key, 'label': label, 'member_ids': members,
                            'description': description})

    _add('all_teachers', 'All teachers',
         [p['id'] for p in people if 'advisor' in p['roles']])
    _add('all_staff', 'All staff', [p['id'] for p in people])

    from services import school_inbox_service
    _add('front_office', 'Front office',
         school_inbox_service.admin_recipient_ids(org_id),
         'Admins and campus coordinators')

    classes = _active_classes(org_id)
    teachers_by_class = _teachers_by_class(classes)
    for cls in classes:
        _add(f"class:{cls['id']}", cls.get('name') or 'Class',
             teachers_by_class.get(cls['id'], set()), 'Teachers of this class')

    for dow, label in _WEEKDAYS:
        ids: Set[str] = set()
        for class_id in _classes_meeting_on(org_id, classes, dow):
            ids |= teachers_by_class.get(class_id, set())
        _add(f'weekday:{dow}', f'Teaching {label}', ids,
             f'Anyone with a class that meets on {label}')

    return presets


def _active_classes(org_id: str) -> List[Dict[str, Any]]:
    # admin client justified: builds the "teachers of this class" presets for a
    # caller already gated to ADMIN_ROLES of this org; reads org_classes rows
    # the caller may already list on the Classes page, and returns only ids and
    # names for a picker.
    from utils.admin_client import admin_client
    from utils.db_fetch import fetch_all_rows
    try:
        # By name. fetch_all_rows orders by id when nothing says otherwise,
        # which is to say by UUID, which is to say at random -- 158 quick-pick
        # chips in no order anyone could follow, and an org admin who gave up
        # and picked people by teacher instead (2026-09-22). The families side
        # has always sorted by name; this is the same list in the same modal.
        return fetch_all_rows(lambda: (
            admin_client().table('org_classes')
            .select('id, name, primary_instructor_id, assistant_instructor_ids')
            .eq('organization_id', org_id).neq('status', 'archived')
        ), order_by='name')
    except Exception as e:  # noqa: BLE001
        logger.warning(f"sis messaging: class lookup failed for org {org_id}: {e}")
        return []


def _teachers_by_class(classes: Sequence[Dict[str, Any]]) -> Dict[str, Set[str]]:
    """All three teacher sources per class, via the shared answer."""
    from utils import class_membership
    return {c['id']: class_membership.class_teacher_ids(c['id'], class_row=c)
            for c in classes}


def _classes_meeting_on(org_id: str, classes: Sequence[Dict[str, Any]],
                        day_of_week: int) -> Set[str]:
    # admin client justified: same ADMIN_ROLES caller and the same org's
    # classes; reads class_meetings only to answer "which classes meet on this
    # day", and returns class ids.
    from utils.admin_client import admin_client
    from utils.db_fetch import fetch_all_rows
    class_ids = [c['id'] for c in classes]
    if not class_ids:
        return set()
    try:
        rows = fetch_all_rows(lambda: (
            admin_client().table('class_meetings').select('class_id, day_of_week')
            .eq('organization_id', org_id).in_('class_id', class_ids)
            .eq('day_of_week', day_of_week)
        ))
    except Exception as e:  # noqa: BLE001
        logger.warning(f"sis messaging: meeting lookup failed for org {org_id}: {e}")
        return set()
    return {r['class_id'] for r in rows if r.get('class_id')}


def resolve_recipients(org_id: str, actor_id: str,
                       recipient_ids: Optional[Sequence[str]] = None,
                       group_keys: Optional[Sequence[str]] = None) -> List[str]:
    """The people a compose actually goes to: the union, minus the sender.

    Refuses anyone who is not staff of this org rather than silently dropping
    them -- a picker that quietly discards a recipient tells the sender their
    message went somewhere it did not.
    """
    people = {p['id'] for p in staff_recipients(org_id)}
    wanted: Set[str] = set()

    for rid in (recipient_ids or []):
        if rid not in people:
            raise ValueError('Everyone you message has to be staff at this school')
        wanted.add(rid)

    if group_keys:
        presets = {p['key']: p for p in preset_groups(org_id)}
        for key in group_keys:
            preset = presets.get(key)
            if preset is None:
                raise ValueError(f'There is no group called "{key}"')
            wanted.update(preset['member_ids'])

    wanted.discard(actor_id)
    return sorted(wanted)


def compose(org_id: str, actor_id: str, *, body: str,
            recipient_ids: Optional[Sequence[str]] = None,
            group_keys: Optional[Sequence[str]] = None,
            mode: str = 'group', subject: Optional[str] = None,
            name: Optional[str] = None,
            attachments: Optional[List[Dict[str, Any]]] = None,
            as_school: bool = False) -> Dict[str, Any]:
    """Send one message to several staff. See the module docstring for the two
    modes, and for `as_school` (sent from the School tab: the school owns it).

    Raises ValueError on anything the sender can fix (no recipients, a stranger
    in the list, an empty body); the route turns those into a 400.
    """
    if mode not in ('group', 'separate'):
        raise ValueError('mode has to be "group" or "separate"')

    body = (body or '').strip()
    if not body and not attachments:
        raise ValueError('Write something to send')
    if len(body) > MAX_BODY:
        raise ValueError(f'Messages are limited to {MAX_BODY} characters')

    recipients = resolve_recipients(org_id, actor_id, recipient_ids, group_keys)
    if not recipients:
        raise ValueError('Choose at least one person to message')

    content = f'{subject}\n\n{body}' if (subject or '').strip() else body

    # A "group" of one is a DM. Making a two-person group chat for it would
    # leave the recipient with a named room instead of a conversation, and a
    # thread the sender cannot find under their own messages.
    if mode == 'group' and len(recipients) > 1:
        if as_school:
            return _send_as_school_group(org_id, actor_id, recipients, content, name, attachments)
        return _send_as_group(org_id, actor_id, recipients, content, name, attachments)
    return _send_separately(actor_id, recipients, content, attachments,
                            school_org_id=org_id if as_school else None)


def _send_as_group(org_id: str, actor_id: str, recipients: List[str],
                   content: str, name: Optional[str],
                   attachments: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    from services.group_message_service import GroupMessageService
    svc = GroupMessageService()
    group = svc.create_group(
        actor_id,
        (name or '').strip()[:MAX_NAME] or _default_name(org_id, recipients),
        member_ids=recipients,
        organization_id=org_id,
        audience='staff',
    )
    message = svc.send_message(actor_id, group['id'], content,
                               attachments=attachments)
    return {'mode': 'group', 'group': group, 'message': message,
            'sent': len(recipients), 'skipped': []}


def _send_as_school_group(org_id: str, actor_id: str, recipients: List[str],
                          content: str, name: Optional[str],
                          attachments: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    """The School tab's group: owned by the school inbox, written by the actor
    (ac84b6cd). No fallback to a personal group when the inbox cannot be
    resolved -- that is the bug this replaces, and a 500 the sender can retry
    is better than a thread filed where the office cannot see it."""
    from services import school_inbox_service
    from services.group_message_service import GroupMessageService
    _org, inbox_user_id = school_inbox_service.school_account(org_id)
    if not inbox_user_id:
        raise RuntimeError('School inbox is unavailable')
    svc = GroupMessageService()
    group = svc.create_school_group(
        org_id, inbox_user_id, actor_id,
        (name or '').strip()[:MAX_NAME] or _default_name(org_id, recipients),
        member_ids=recipients,
        audience='staff',
    )
    message = svc.send_message(actor_id, group['id'], content,
                               attachments=attachments, on_behalf_of=inbox_user_id)
    return {'mode': 'group', 'group': group, 'message': message, 'as_school': True,
            'sent': len(recipients), 'skipped': []}


def _send_separately(actor_id: str, recipients: List[str], content: str,
                     attachments: Optional[List[Dict[str, Any]]],
                     school_org_id: Optional[str] = None) -> Dict[str, Any]:
    """One DM each: from the actor, or -- with `school_org_id`, sent from the
    School tab -- from the school with the actor as sent_by."""
    from services import school_inbox_service
    from services.direct_message_service import DirectMessageService
    svc = DirectMessageService()
    conversations, skipped = [], []
    for rid in recipients:
        try:
            if school_org_id:
                message = school_inbox_service.send_as_school(
                    school_org_id, rid, content, sent_by=actor_id,
                    attachments=attachments)
            else:
                message = svc.send_message(actor_id, rid, content, attachments=attachments)
            conversations.append({'recipient_id': rid,
                                  'conversation_id': message.get('conversation_id')})
        except Exception as e:  # noqa: BLE001
            # Best-effort per recipient, the shape message_household_guardians
            # uses: one unreachable person must not swallow the other nine.
            logger.info(f'staff message to {str(rid)[:8]} skipped: {e}')
            skipped.append(rid)
    return {'mode': 'separate', 'group': None, 'conversations': conversations,
            'sent': len(conversations), 'skipped': skipped}


def _default_name(org_id: str, recipients: List[str]) -> str:
    """A name the office will recognise in a list a week later.

    Names beat a date: "Ada, Sam and 4 others" says who is in the room, which is
    the thing you scan a group list for.
    """
    people = {p['id']: p for p in staff_recipients(org_id)}
    first_names = [(people.get(r) or {}).get('first_name')
                   or (people.get(r) or {}).get('name') or '' for r in recipients]
    first_names = [n for n in first_names if n]
    if not first_names:
        return 'Staff message'[:MAX_NAME]
    shown = first_names[:2]
    rest = len(first_names) - len(shown)
    label = ', '.join(shown)
    if rest == 1:
        label = f'{label} and 1 other'
    elif rest > 1:
        label = f'{label} and {rest} others'
    return label[:MAX_NAME]
