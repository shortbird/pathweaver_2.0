"""
School inbox — the "{School Name}" messaging contact.

Every member of an organization (students and staff via organization_id,
platform parents by proxy of their enrolled children) sees the school itself as
a DM contact, named after the org. Messages to it land in a shared inbox that
the front office (ADMIN_ROLES: org_admin, campus_coordinator, superadmin) reads
and answers as the school.

The school side of the thread is a dedicated account: a platform user with no
login (stub auth account with a placeholder email, the same COPPA pattern
dependents use). Modeling it as a real user means the entire DM stack —
conversations, attachments, reactions, realtime, unread counts, the parent
read-only viewers — works on these threads unchanged. The account deliberately
has organization_id NULL so it never shows up in org rosters, people pages, or
member counts; organizations.inbox_user_id is the only link.
"""

import secrets
from datetime import datetime
from typing import Any, Dict, List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)


# admin client justified: messaging spans both sides of a conversation, and
#   a sender cannot read the recipient's rows under RLS; membership is checked
#   before every use
from utils.admin_client import admin_client as _admin


def get_org(org_id: str) -> Optional[Dict[str, Any]]:
    r = (_admin().table('organizations')
         .select('id, name, slug, is_active, inbox_user_id')
         .eq('id', org_id).limit(1).execute())
    return r.data[0] if r.data else None


def org_for_inbox_user(user_id: str) -> Optional[Dict[str, Any]]:
    """The org whose school inbox `user_id` backs, or None for normal users."""
    if not user_id:
        return None
    r = (_admin().table('organizations')
         .select('id, name, slug, is_active, inbox_user_id')
         .eq('inbox_user_id', user_id).limit(1).execute())
    return r.data[0] if r.data else None


def member_org(user_id: str) -> Optional[Dict[str, Any]]:
    """The ACTIVE org this user is a member of, resolving the way the rest of
    the family-facing SIS does (sis_service.member_org_id — platform parents
    belong through their children). None for platform users outside any org."""
    from services import sis_service
    org_id = sis_service.member_org_id(user_id)
    if not org_id:
        return None
    org = get_org(org_id)
    if not org or not org.get('is_active'):
        return None
    return org


def get_or_create_inbox_user(org: Dict[str, Any]) -> Optional[str]:
    """Return the users.id of this org's school-inbox account, creating it on
    first use. Never raises — a failure here must not take down the contacts
    endpoint, so it returns None and the contact simply doesn't appear yet."""
    try:
        if org.get('inbox_user_id'):
            return org['inbox_user_id']
        return _create_inbox_user(org)
    except Exception as e:  # noqa: BLE001
        logger.error(f"school inbox: get_or_create failed for org {org.get('id')}: {e}")
        return None


def _create_inbox_user(org: Dict[str, Any]) -> Optional[str]:
    admin = _admin()
    org_name = org.get('name') or 'School'

    # Stub auth account (cannot log in): unconfirmed placeholder email, no
    # password — the same shape DependentRepository.create_dependent uses.
    placeholder_email = f"school_{secrets.token_hex(16)}@optio-internal-placeholder.local"
    auth_response = admin.auth.admin.create_user({
        'email': placeholder_email,
        'email_confirm': False,
        'user_metadata': {'is_school_inbox': True, 'organization_id': org['id']},
        'app_metadata': {'provider': 'school_inbox', 'providers': ['school_inbox']},
    })
    if not auth_response.user:
        logger.error(f"school inbox: auth create failed for org {org['id']}")
        return None
    inbox_id = auth_response.user.id

    def _cleanup():
        try:
            admin.auth.admin.delete_user(inbox_id)
        except Exception:  # noqa: BLE001
            logger.warning(f"school inbox: failed to clean up auth user {inbox_id}")

    try:
        # Platform user, org NULL on purpose: the account must never appear in
        # org rosters or counts. 'observer' is the least-entangled valid role —
        # observers only surface through observer_student_links, which this
        # account never has. Email NULL so it can't collide with anything.
        admin.table('users').insert({
            'id': inbox_id,
            'display_name': org_name,
            'first_name': org_name,
            'last_name': '',
            'email': None,
            'role': 'observer',
            'organization_id': None,
        }).execute()
    except Exception as e:  # noqa: BLE001
        logger.error(f"school inbox: users insert failed for org {org['id']}: {e}")
        _cleanup()
        return None

    # Conditional claim so two concurrent first-loads don't each mint an
    # account: only the writer that finds the column still NULL wins.
    claimed = (admin.table('organizations')
               .update({'inbox_user_id': inbox_id})
               .eq('id', org['id']).is_('inbox_user_id', 'null')
               .execute())
    if claimed.data:
        logger.info(f"school inbox: created inbox account {inbox_id} for org {org['id']} ({org_name})")
        return inbox_id

    # Lost the race — use the winner's account, discard ours.
    try:
        admin.table('users').delete().eq('id', inbox_id).execute()
    except Exception:  # noqa: BLE001
        logger.debug("intentional swallow", exc_info=True)
    _cleanup()
    current = get_org(org['id'])
    return current.get('inbox_user_id') if current else None


def school_account(org) -> tuple:
    """(org row, inbox user id) for the account a school speaks as, or
    (None, None). `org` may be an id or the row itself.

    The one resolver. Four callers used to look the org up and mint the inbox
    account each in their own way (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md,
    D3); a fifth would have been a sixth way to get it wrong.
    """
    row = get_org(org) if isinstance(org, str) else org
    if not row:
        return None, None
    return row, get_or_create_inbox_user(row)


def send_as_school(org, recipient_id: str, content: str, *, sent_by: Optional[str],
                   reply_to_message_id: Optional[str] = None,
                   attachments: Optional[List[Dict[str, Any]]] = None,
                   fallback_sender: Optional[str] = None,
                   push: bool = True,
                   in_thread: bool = False) -> Dict[str, Any]:
    """Send one direct message from the school to a member.

    The recipient sees the school's name; `sent_by` records the staff member
    who wrote it, so the School Inbox shows "Sent by Kate" and the reply comes
    back to a thread the office reads. With `fallback_sender`, a school whose
    inbox account cannot be resolved sends as that staff member instead -- a
    message that goes out under the wrong name beats one that does not go out
    at all (the People page's Message buttons); without one, the caller gets
    the error.

    `push` False skips the phone and browser push (Compose's toggle).

    The school's voice is for families and students. Somebody on staff at the
    school hears from the colleague who wrote, by name, in a personal thread:
    a teacher who is also a parent here is a colleague first. The rule used to
    turn on seven facts about the recipient that the sender could not see, and
    one send to two teachers reached one as the admin and the other as the
    school (docs/messaging/MESSAGING_AUDIT_2026-10-01.md).

    `in_thread` is the one exception, and it is about the thread, not the
    person: a reply typed into the school's existing thread with a teacher
    (who wrote to the office) stays in that thread, signed "Kate for iCreate"
    ("I would like it if you signed your name", iCreate, 2026-09-25). The
    front office has no such thread -- it reads that inbox as the school
    (office_inbox_id) -- so a message to one of them is always personal.
    """
    from services.direct_message_service import DirectMessageService
    row: Optional[Dict[str, Any]] = None
    try:
        row, inbox_user_id = school_account(org)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school sender: inbox lookup failed for org {str(org)[:8]}: {e}")
        inbox_user_id = None
    if not inbox_user_id:
        if not fallback_sender:
            raise RuntimeError('School inbox is unavailable')
        sender, author = fallback_sender, None
    else:
        sender, author = inbox_user_id, sent_by
    extra: Dict[str, Any] = {}
    if not push:
        extra['push'] = False
    if author and is_org_staff((row or {}).get('id'), recipient_id):
        if not in_thread or office_inbox_id(recipient_id) == inbox_user_id:
            # Somebody in the office writing to themselves as the school
            # (their own household from the People page) rang "New message
            # from iCreate" on their own phone, for a thread My messages
            # leaves out (audit 2026-10-01). There is nobody to send it to.
            if author == recipient_id:
                raise ValueError('You read this inbox as the school, so this message '
                                 'would only come back to you.')
            # A reply_to_message_id points into the school thread, so it
            # stays behind.
            return DirectMessageService().send_message(
                author, recipient_id, content, attachments=attachments or [], **extra)
        extra['show_sender_name'] = True
    return DirectMessageService().send_message(
        sender, recipient_id, content,
        reply_to_message_id=reply_to_message_id,
        attachments=attachments or [],
        sent_by_user_id=author,
        **extra,
    )


def is_org_staff(org_id: Optional[str], user_id: str) -> bool:
    """Whether `user_id` works at this school (utils.sis_roles.STAFF_ROLES,
    their org being this one). Never raises: an unknown answer is 'no', which
    leaves a message under the school's name as it always was."""
    from repositories.quest_repository import VISIBILITY_USER_COLUMNS, is_school_staff
    if not org_id or not user_id:
        return False
    try:
        rows = (_admin().table('users').select(VISIBILITY_USER_COLUMNS)
                .eq('id', user_id).limit(1).execute()).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: staff lookup failed for {str(user_id)[:8]}: {e}")
        return False
    return bool(rows) and rows[0].get('organization_id') == org_id and is_school_staff(rows[0])


def office_inbox_id(user_id: str) -> Optional[str]:
    """The school inbox account of the office `user_id` works in, or None.

    Front-office staff (ADMIN tier) read and answer the school inbox as the
    school, so the school is not somebody they message: in their own Messages
    a thread "with iCreate" is a thread with their own team, read from both
    ends (iCreate, 2026-09-25). Callers hide it; the School tab has it all.
    """
    from services import sis_service
    try:
        if not sis_service.caller_is_admin(user_id):
            return None
        org = member_org(user_id) or {}
        # A coordinator the org's inbox list leaves out does not read the
        # School tab, so the school is somebody they can write to (19047fd0).
        members = inbox_member_ids(org['id']) if org.get('id') else []
        if members and user_id not in members and not can_manage_inbox_members(user_id):
            return None
        return org.get('inbox_user_id')
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: office lookup failed for {str(user_id)[:8]}: {e}")
        return None


def _family_circle(user_id: str) -> set:
    """This person's own children, and the other guardians of those children.
    Raises on a failed lookup; callers decide what unknown means."""
    from utils.class_membership import children_of_parent, guardians_by_student
    children = set(children_of_parent(user_id))
    if not children:
        return set()
    circle = set(children)
    for guardians in guardians_by_student(list(children)).values():
        circle |= set(guardians)
    circle.discard(user_id)
    return circle


def _own_family(user_id: str, other_id: str) -> bool:
    """Whether these two are one family: one is the other's child, or they
    are guardians of the same child. Never raises; unknown is 'no'."""
    try:
        return other_id in _family_circle(user_id) or user_id in _family_circle(other_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: family lookup failed for {str(user_id)[:8]}: {e}")
        return False


def _family_or_student_of(org: Dict[str, Any], user_id: str) -> bool:
    """A member of this school who is not on its staff: a guardian or a
    student. Platform parents belong through their children (member_org_id)."""
    from services import sis_service
    try:
        if sis_service.member_org_id(user_id) != org.get('id'):
            return False
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: member lookup failed for {str(user_id)[:8]}: {e}")
        return False
    return not is_org_staff(org.get('id'), user_id)


def office_family_route(sender_id: str, target_id: str) -> Optional[Dict[str, Any]]:
    """When a direct message between these two is the school's mail, how it
    travels; None when it is an ordinary personal message.

    Between the front office and a family or student of the same school there
    is one thread, the school's (owner decision, 2026-10-01). A parent used to
    hold two threads with one person -- "iCreate" and "Marika Connole" -- and
    an answer in the second was read by nobody else in the office.

      {'direction': 'to_family', 'org', 'inbox_user_id'}  the office member's
          message goes out as the school, with their name recorded.
      {'direction': 'to_office', ...}  the family's message goes to the
          school inbox, where the whole office reads it.

    Only for a school that works its inbox in the console
    (org_uses_school_inbox); elsewhere an admin's own messages are where a
    family reaches a person. Never between members of one family: an office
    member writing to their own child, or to the child's other parent, is a
    parent. Teachers are not the office and keep their own threads with the
    families of their classes.
    """
    for office_id, other_id, direction in ((sender_id, target_id, 'to_family'),
                                          (target_id, sender_id, 'to_office')):
        org = _office_of(office_id)
        if not org:
            continue
        if not _family_or_student_of(org, other_id) or _own_family(office_id, other_id):
            return None
        return {'direction': direction, 'org': org, 'inbox_user_id': org['inbox_user_id']}
    return None


def _office_of(user_id: str) -> Optional[Dict[str, Any]]:
    """The school whose inbox this person works today, or None.

    Narrower than office_inbox_id on purpose: the school has to run its inbox
    in the console, and the person has to be CURRENT office staff
    (admin_recipients leaves out archived staff). A coordinator who left the
    staff and is still a parent keeps her role columns; her messages to
    another parent are two parents talking, not the school's mail.
    """
    if not office_inbox_id(user_id):
        return None
    org = member_org(user_id)
    if not org or not org.get('inbox_user_id') or not org_uses_school_inbox(org):
        return None
    return org if user_id in admin_recipient_ids(org['id']) else None


def school_mail_contact_ids(user_id: str, candidate_ids) -> set:
    """The contacts this person does not write to personally, because that
    mail is the school's (office_family_route): for the front office, the
    families and students of the school; for a family or student, the people
    in the front office. Their own family is never in the answer.

    The contact list's half of the rule -- the send route holds the other --
    so nobody is offered a thread that would not be the one their message
    lands in. Batched: an admin's contact list is the whole school. Never
    raises; an unknown answer hides nobody.
    """
    candidates = [c for c in dict.fromkeys(candidate_ids or []) if c and c != user_id]
    if not candidates:
        return set()
    try:
        org = _office_of(user_id)
        if org:
            from services import message_compose_service
            kinds = message_compose_service.people_kinds(org['id'])
            circle = _family_circle(user_id)
            return {c for c in candidates
                    if kinds.get(c) in ('family', 'student') and c not in circle}
        if office_inbox_id(user_id):
            return set()
        org = member_org(user_id)
        if not org or not org_uses_school_inbox(org) or is_org_staff(org['id'], user_id):
            return set()
        office = set(admin_recipient_ids(org['id'])) & set(candidates)
        return {o for o in office if not _own_family(user_id, o)}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: contact rule failed for {str(user_id)[:8]}: {e}")
        return set()


def school_contact(org: Dict[str, Any], inbox_user_id: str) -> Dict[str, Any]:
    """The contact-list entry members see — the school by its own name."""
    return {
        'id': inbox_user_id,
        'display_name': org.get('name') or 'School',
        'first_name': org.get('name') or 'School',
        'last_name': '',
        'avatar_url': None,
        'role': 'school',
        'relationship': 'school',
        'is_school': True,
    }


def mark_school_conversations(conversations: List[Dict[str, Any]]) -> None:
    """Flag conversation-list rows whose other participant is a school inbox
    account (`other_user.is_school`), so clients render the school identity.
    Mutates in place; one query for the whole list."""
    other_ids = [c['other_user']['id'] for c in conversations
                 if isinstance(c.get('other_user'), dict) and c['other_user'].get('id')]
    if not other_ids:
        return
    try:
        rows = (_admin().table('organizations')
                .select('inbox_user_id, name')
                .in_('inbox_user_id', other_ids).execute()).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: conversation flagging failed: {e}")
        return
    by_inbox = {r['inbox_user_id']: r for r in rows}
    for c in conversations:
        other = c.get('other_user')
        if isinstance(other, dict) and other.get('id') in by_inbox:
            other['is_school'] = True
            other['display_name'] = by_inbox[other['id']].get('name') or other.get('display_name')


def can_message_school(user_id: str, target_id: str) -> bool:
    """The school-inbox permission rule for can_message_user: a member may DM
    their own org's inbox account, and the inbox account (driven by staff via
    the shared inbox) may DM that org's members."""
    try:
        rows = (_admin().table('organizations')
                .select('id, is_active, inbox_user_id')
                .in_('inbox_user_id', [user_id, target_id]).execute()).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: permission lookup failed: {e}")
        return False
    if not rows:
        return False
    org = rows[0]
    if not org.get('is_active'):
        return False
    other = target_id if org['inbox_user_id'] == user_id else user_id
    from services import sis_service
    return sis_service.member_org_id(other) == org['id']


# ── Who is on the inbox ──────────────────────────────────────────────────────
#
# Ticket 19047fd0, Molly (iCreate, org_admin): org admins choose who can open
# the school inbox. The list lives in organizations.feature_flags, under
# sis_settings.school_inbox_member_ids: a list of user ids.
#
#   - empty or absent: every office staff member (org admins and campus
#     coordinators), which is how every school worked before the list;
#   - not empty: the org admins (always) plus the people on it.
#
# A superadmin always has access. Everything that says who the office is
# follows the one answer: the route gate (inbox_access), the bell
# (admin_recipients), the task assignees (thread_task_service) and the
# school groups (school_group_access).

INBOX_MEMBERS_KEY = 'school_inbox_member_ids'


def members_from_flags(feature_flags: Any) -> List[str]:
    """The configured member ids from a feature_flags blob ([] = everyone)."""
    sis = (feature_flags or {}).get('sis_settings') if isinstance(feature_flags, dict) else None
    ids = (sis or {}).get(INBOX_MEMBERS_KEY) if isinstance(sis, dict) else None
    if not isinstance(ids, list):
        return []
    return [str(i) for i in ids if i]


def inbox_member_ids(org_id: Optional[str]) -> List[str]:
    """The org's configured inbox list, or [] for "all office staff".

    A failed read answers [] -- the behaviour every school had before the list
    existed -- so a lookup problem never locks the whole office out of the
    families' mail."""
    if not org_id:
        return []
    try:
        from repositories.organization_repository import OrganizationRepository
        org = OrganizationRepository(client=_admin()).find_by_id(org_id) or {}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: member list lookup failed for org {org_id}: {e}")
        return []
    return members_from_flags(org.get('feature_flags') if isinstance(org, dict) else None)


def _on_the_list(staff_row: Dict[str, Any], member_ids: set) -> bool:
    roles = set(staff_row.get('roles') or [])
    if 'org_admin' in roles:
        return True
    return 'campus_coordinator' in roles and (not member_ids or staff_row['id'] in member_ids)


def inbox_access(user_id: str, org_id: str) -> bool:
    """Whether `user_id` may open org `org_id`'s school inbox at all.

    The office tier first (sis_service.caller_is_admin: superadmin, org admin,
    campus coordinator). Then the list: empty lets every one of them in; a
    list lets in the people on it, and the org admins and a superadmin
    whether or not they are on it. Which org the caller may act on is
    sis_service.resolve_org_id's job, before this is asked."""
    if not user_id:
        return False
    from services import sis_service
    if not sis_service.caller_is_admin(user_id):
        return False
    members = inbox_member_ids(org_id)
    if not members or user_id in members:
        return True
    return can_manage_inbox_members(user_id)


def can_manage_inbox_members(user_id: str) -> bool:
    """Org admins (and a superadmin) pick the list; a coordinator may not."""
    from services import sis_service
    ctx = sis_service.get_user_org_context(user_id) or {}
    if ctx.get('role') == 'superadmin':
        return True
    return 'org_admin' in set(sis_service._user_org_roles(ctx))


def office_staff_ids(org_id: str) -> List[str]:
    """Every org admin and campus coordinator, whatever the inbox list says.

    For the messaging "Front office" quick pick and the office label in the
    compose list: those name the job, not who reads the school inbox, so a
    coordinator the inbox list leaves out is still front office there."""
    from services import sis_service
    try:
        staff = sis_service.list_org_staff(org_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: staff lookup failed for org {org_id}: {e}")
        return []
    return [s['id'] for s in staff
            if {'org_admin', 'campus_coordinator'} & set(s.get('roles') or [])]


def admin_recipients(org_id: str) -> List[Dict[str, Any]]:
    """Staff who share the inbox -- org admins, plus the campus coordinators
    the org's inbox list lets in (all of them when the list is empty) -- as
    full staff records (id, name, email, is_placeholder). These are who get
    notified when a member writes in, and who a thread task may go to."""
    from services import sis_service
    try:
        staff = sis_service.list_org_staff(org_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: staff lookup failed for org {org_id}: {e}")
        return []
    members = set(inbox_member_ids(org_id))
    return [s for s in staff if _on_the_list(s, members)]


def admin_recipient_ids(org_id: str) -> List[str]:
    """Just the ids of :func:`admin_recipients` — for in-app notifications."""
    return [s['id'] for s in admin_recipients(org_id)]


def school_inbox_link(*, conversation_id: Optional[str] = None,
                      group_id: Optional[str] = None) -> str:
    """The console path that opens one school-inbox thread in place.

    A bare '/inbox' was the link on every member-message notification, so
    "View details" opened the page the reader was already on and did nothing
    else (iCreate, 11f6ad24). SchoolInboxPage consumes ?conversation= and
    ?group= once the thread is in its list.
    """
    if conversation_id:
        return f'/inbox?tab=school&conversation={conversation_id}'
    if group_id:
        return f'/inbox?tab=school&group={group_id}'
    return '/inbox?tab=school'


def notify_admins_of_member_message(org: Dict[str, Any], sender_id: str,
                                    sender_name: str, preview: str,
                                    conversation_id: Optional[str] = None) -> None:
    """Fan a member's message to the shared inbox out to the front office's
    notification bells. Best-effort; never raises.

    `conversation_id` is the thread the message landed in. It goes into the
    link and the metadata so the bell opens THAT thread (11f6ad24).
    """
    from services.notification_service import NotificationService
    try:
        notification_service = NotificationService()
        metadata = {'sender_id': sender_id, 'sender_name': sender_name,
                    'school_inbox': True, 'organization_id': org['id']}
        if conversation_id:
            metadata['conversation_id'] = conversation_id
        for admin_id in admin_recipient_ids(org['id']):
            if admin_id == sender_id:
                continue
            notification_service.create_notification(
                user_id=admin_id,
                notification_type='message_received',
                title=f"{org.get('name') or 'School'} inbox: message from {sender_name}",
                message=preview,
                link=school_inbox_link(conversation_id=conversation_id),
                metadata=metadata,
                organization_id=org['id'],
            )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: admin notification failed for org {org.get('id')}: {e}")


def org_admin_recipients(org_id: str) -> List[Dict[str, Any]]:
    """The org admins a forwarded support message goes to.

    Narrower than :func:`admin_recipients` on purpose. The forward is delivered
    as a normal DM from the member, and `can_message_user` only opens that door
    for org_admin ("anyone in the same org can reply to their org admin") — a
    student DMing a campus coordinator is refused, which would fail the whole
    forward. Coordinators still share the school inbox; they just aren't a
    forward target.
    """
    return [s for s in admin_recipients(org_id)
            if 'org_admin' in set(s.get('roles') or [])]


# Where a forwarded message is answered. Two addresses because two kinds of
# school — see org_uses_school_inbox.
LEARNING_APP_URL = 'https://www.optioeducation.com'
SIS_INBOX_URL = 'https://sis.optioeducation.com/inbox'


def forward_reply_url(member_id: str) -> str:
    """The member's thread in the web app's Messages. ?user= opens it directly."""
    return f"{LEARNING_APP_URL}/messages?user={member_id}"


def org_uses_school_inbox(org: Dict[str, Any]) -> bool:
    """Does this school answer members in the shared inbox, or in each admin's
    own Messages?

    The inbox is a SIS-console surface, so sis_enabled is the honest test.
    iCreate runs its front office there and wants every message in one place,
    answered as the school. Hearthwood never opens the console — a forward left
    in that inbox would sit unread — so its admins get the message as a normal
    DM instead. Fails closed to the DM route, which always reaches a person.
    """
    from utils.org_features import org_has_feature
    return org_has_feature(org.get('id'), 'sis_enabled')


def email_admins_of_forwarded_message(org: Dict[str, Any],
                                      recipients: List[Dict[str, Any]],
                                      member_name: str, message_text: str,
                                      reply_url: str,
                                      school_inbox: bool = False) -> int:
    """Email the org admins a forwarded support message was just delivered to.
    Returns how many emails went out.

    `recipients` is the same list the DM went to, so the mail and the thread
    can never disagree about who was told.

    Best-effort — a mail failure must never undo a forward that already landed
    in someone's messages.
    """
    from services.email_service import EmailService
    sent = 0
    try:
        email_service = EmailService()
        for staff in recipients:
            email = (staff.get('email') or '').strip()
            # Placeholder addresses belong to accounts created by roster import
            # that nobody has claimed; mail to them bounces.
            if not email or staff.get('is_placeholder'):
                continue
            try:
                ok = email_service.send_forwarded_support_message_email(
                    to_email=email,
                    staff_name=staff.get('first_name') or staff.get('name') or 'there',
                    org_name=org.get('name') or 'your school',
                    member_name=member_name,
                    message_text=message_text,
                    reply_url=reply_url,
                    school_inbox=school_inbox,
                )
            except Exception as send_err:  # noqa: BLE001
                logger.warning(f"forward email to {email} failed: {send_err}")
                continue
            if ok:
                sent += 1
    except Exception as e:  # noqa: BLE001
        logger.warning(f"forward email fan-out failed for org {org.get('id')}: {e}")
    return sent


def conversation_for_inbox(conversation_id: str, inbox_user_id: str) -> Optional[Dict[str, Any]]:
    """The conversation row, only if the inbox account is a participant."""
    try:
        r = (_admin().table('message_conversations').select('*')
             .eq('id', conversation_id).limit(1).execute())
    except Exception:  # noqa: BLE001
        return None
    if not r.data:
        return None
    convo = r.data[0]
    if inbox_user_id not in (convo['participant_1_id'], convo['participant_2_id']):
        return None
    return convo


def mark_conversation_read(conversation_id: str, inbox_user_id: str) -> int:
    """Mark every unread message TO the school in this thread as read (the
    inbox is shared — one staff member reading it reads it for all). Returns
    how many messages were marked."""
    admin = _admin()
    updated = (admin.table('direct_messages')
               .update({'read_at': datetime.utcnow().isoformat()})
               .eq('conversation_id', conversation_id)
               .eq('recipient_id', inbox_user_id)
               .is_('read_at', 'null')
               .execute()).data or []
    if updated:
        # Keep the cached counter roughly honest (reads recompute anyway), and
        # clear the whole front office's bell notifications for this member —
        # the inbox is shared, so one colleague reading it reads it for all.
        try:
            convo = conversation_for_inbox(conversation_id, inbox_user_id)
            if convo:
                field = ('unread_count_p1'
                         if convo['participant_1_id'] == inbox_user_id
                         else 'unread_count_p2')
                admin.table('message_conversations').update({field: 0}) \
                    .eq('id', conversation_id).execute()
                member_id = (convo['participant_2_id']
                             if convo['participant_1_id'] == inbox_user_id
                             else convo['participant_1_id'])
                org = org_for_inbox_user(inbox_user_id)
                if org:
                    from services.notification_service import NotificationService
                    notification_service = NotificationService()
                    for admin_id in admin_recipient_ids(org['id']):
                        notification_service.mark_message_notifications_read(
                            user_id=admin_id, sender_id=member_id)
        except Exception:  # noqa: BLE001
            logger.debug("intentional swallow", exc_info=True)
    return len(updated)


def school_group_access(user_id: str, group_id: str) -> Optional[Dict[str, Any]]:
    """Whether `user_id` may read and write group `group_id` AS the school.

    Returns {'group', 'org', 'inbox_user_id'} or None. The rule is the one the
    school's DMs already follow: the thread belongs to the org's inbox account,
    and the org's front office (admin_recipients: org admins and campus
    coordinators) reads it, plus a superadmin. Anyone else -- a teacher in the
    room, a parent, another school's admin -- gets None and reads the group,
    if at all, as the member they are through /api/groups (ac84b6cd).

    The group is the school's only if the inbox account created it
    (GroupMessageService.create_school_group) AND the group sits in that same
    org; a personal group someone later added the inbox to is not.
    """
    if not user_id or not group_id:
        return None
    try:
        from repositories.group_repository import GroupRepository
        group = GroupRepository(client=_admin()).group_owner_row(group_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: group lookup failed for {str(group_id)[:8]}: {e}")
        return None
    if not group or not group.get('is_active'):
        return None
    created_by = group.get('created_by')
    org = org_for_inbox_user(created_by) if created_by else None
    if not org or not org.get('is_active') or org.get('id') != group.get('organization_id'):
        return None
    via = 'office' if user_id in admin_recipient_ids(org['id']) else None
    if not via:
        from services.group_message_service import GroupMessageService
        via = 'office' if GroupMessageService()._is_superadmin(user_id) else None
    if not via:
        return None
    return {'group': group, 'org': org, 'inbox_user_id': org['inbox_user_id'], 'via': via}


def attach_sent_by_names(messages: List[Dict[str, Any]]) -> None:
    """For the STAFF inbox view only: resolve sent_by_user_id into a display
    name so the team can see which colleague answered. Mutates in place."""
    ids = list({m.get('sent_by_user_id') for m in messages if m.get('sent_by_user_id')})
    if not ids:
        return
    try:
        rows = (_admin().table('users')
                .select('id, display_name, first_name, last_name')
                .in_('id', ids).execute()).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: sent-by lookup failed: {e}")
        return
    names = {}
    for r in rows:
        names[r['id']] = (r.get('display_name')
                          or f"{r.get('first_name') or ''} {r.get('last_name') or ''}".strip()
                          or 'Staff')
    for m in messages:
        if m.get('sent_by_user_id') in names:
            m['sent_by_name'] = names[m['sent_by_user_id']]


# ── Who may open a school thread ─────────────────────────────────────────────
#
# The front office, and nobody else. From 2026-09-23 to 2026-10-01 a teacher
# could also be handed one thread with a task (school_thread_grants, d93b24d2)
# and answer it as the school. Nobody ever was: zero grants in production, and
# the access rule it needed ran on every thread read. "Make a task" stays, for
# the office (thread_task_service).


def _thread_repo():
    from repositories.school_thread_repository import SchoolThreadRepository
    return SchoolThreadRepository(client=_admin())


def thread_access(user_id: str, org: Dict[str, Any], *,
                  conversation_id: Optional[str] = None,
                  group_id: Optional[str] = None) -> Optional[str]:
    """How `user_id` may open this school thread: 'office' or None. The office
    is whoever inbox_access lets in: the org's admins, the coordinators on the
    org's inbox list (all of them when it is empty), and a superadmin."""
    return 'office' if inbox_access(user_id, str((org or {}).get('id') or '')) else None


def conversation_with_member(inbox_user_id: str, member_id: str) -> Optional[Dict[str, Any]]:
    """The school's thread with one member, or None."""
    try:
        return _thread_repo().conversation_between(inbox_user_id, member_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: conversation lookup failed: {e}")
        return None


def record_thread_read(org_id: str, user_id: str, *, conversation_id: Optional[str] = None,
                       group_id: Optional[str] = None) -> None:
    """Remember that this staff member opened this school thread (9b46c748:
    the shared read state says somebody did; the office asked who).
    Best-effort."""
    try:
        _thread_repo().record_read(organization_id=org_id, user_id=user_id,
                                   conversation_id=conversation_id, group_id=group_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: read record failed: {e}")


def thread_readers(*, conversation_id: Optional[str] = None,
                   group_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """[{user_id, name, first_read_at, last_read_at}] for everyone on staff who
    has opened this school thread, most recent first."""
    try:
        repo = _thread_repo()
        rows = repo.readers(conversation_id=conversation_id, group_id=group_id)
        names = repo.user_names(r['user_id'] for r in rows)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: readers lookup failed: {e}")
        return []
    from utils.person_name import full_name
    return [{**r, 'name': full_name(names.get(r['user_id']), 'Staff')} for r in rows]


def user_display_names(user_ids: List[str]) -> Dict[str, str]:
    """{user_id: full name} for wording a task. Best-effort."""
    try:
        rows = _thread_repo().user_names(user_ids)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: name lookup failed: {e}")
        return {}
    from utils.person_name import full_name
    return {uid: full_name(row, 'Someone') for uid, row in rows.items()}


def message_in_thread(message_id: str, *, conversation_id: Optional[str] = None,
                      group_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """The message, only if it is in the named thread."""
    try:
        return _thread_repo().message_in_thread(
            message_id, conversation_id=conversation_id, group_id=group_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: message lookup failed: {e}")
        return None
