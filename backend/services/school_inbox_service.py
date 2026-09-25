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
                   show_sender_name: bool = False) -> Dict[str, Any]:
    """Send one direct message from the school to a member.

    The recipient sees the school's name; `sent_by` records the staff member
    who wrote it, so the School Inbox shows "Sent by Kate" and the reply comes
    back to a thread the office reads. With `fallback_sender`, a school whose
    inbox account cannot be resolved sends as that staff member instead -- a
    message that goes out under the wrong name beats one that does not go out
    at all (the People page's Message buttons); without one, the caller gets
    the error.

    `push` False skips the phone and browser push (Compose's toggle).
    `show_sender_name` tells the recipient who wrote it, "Kate for iCreate":
    set for a staff member answering a thread the office handed them with a
    task (thread_task_service). A recipient who is staff at the school is
    always told, whoever writes: a colleague needs to know which colleague is
    asking (iCreate, 2026-09-25, "I would like it if you signed your name").
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
    if author and (show_sender_name or is_org_staff((row or {}).get('id'), recipient_id)):
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
        return (member_org(user_id) or {}).get('inbox_user_id')
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: office lookup failed for {str(user_id)[:8]}: {e}")
        return None


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


def admin_recipients(org_id: str) -> List[Dict[str, Any]]:
    """Staff who share the inbox — the ADMIN tier (org_admin + campus
    coordinator) — as full staff records (id, name, email, is_placeholder).
    These are who get notified when a member writes in."""
    from services import sis_service
    try:
        staff = sis_service.list_org_staff(org_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: staff lookup failed for org {org_id}: {e}")
        return []
    return [s for s in staff
            if {'org_admin', 'campus_coordinator'} & set(s.get('roles') or [])]


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
        # A staff member the office handed this thread to with a task hears
        # about the family's answer too: the thread is their work now
        # (d93b24d2), and the office's bell alone would leave them waiting.
        recipients = list(admin_recipient_ids(org['id']))
        if conversation_id:
            recipients += [u for u in grant_holder_ids(org['id'], conversation_id)
                           if u not in recipients]
        for admin_id in recipients:
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
    coordinators) reads it, plus a superadmin, plus a staff member holding a
    live grant for this group (a task made from it, d93b24d2; `via` says
    which). Anyone else -- a teacher in the room, a parent, another school's
    admin -- gets None and reads the group, if at all, as the member they are
    through /api/groups (ac84b6cd).

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
    # A staff member the office handed this group to with a task (d93b24d2).
    if not via and active_grants(user_id, group_id=group_id, organization_id=org['id']):
        via = 'grant'
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


# ── A thread handed to a staff member ─────────────────────────────────────────
#
# The office turns a family's message into a task for somebody on staff ("Make a
# task", thread_task_service; iCreate 2026-09-23, bf8b754d / d93b24d2). Most of
# those people are teachers, and a teacher has no school inbox: every route in
# routes/school_inbox.py was ADMIN_ROLES. The task comes with a grant
# (school_thread_grants) for that one thread, and the thread routes accept the
# front office OR an active grant. What a granted teacher can do is read the
# whole thread and answer it as the school, with their name shown to the family
# ("Kate for iCreate") -- nothing else in the inbox.
#
# Active means: not revoked, and the task behind it still exists and is not
# finished. The task is checked on every read rather than trusting somebody to
# revoke on completion, because completion and deletion live in the tasks code;
# a grant found dead is revoked here, lazily, so the table says so too.

#: A task in one of these has ended, and so has its grant.
_CLOSED_TASK_STATUSES = frozenset({'complete', 'expired'})


def _thread_repo():
    from repositories.school_thread_repository import SchoolThreadRepository
    return SchoolThreadRepository(client=_admin())


def active_grants(user_id: str, *, conversation_id: Optional[str] = None,
                  group_id: Optional[str] = None,
                  organization_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """This person's live grants, for one thread or every thread. Never raises:
    a failed lookup is no access."""
    if not user_id:
        return []
    try:
        repo = _thread_repo()
        rows = repo.unrevoked_grants(user_id, conversation_id=conversation_id,
                                     group_id=group_id)
        if organization_id:
            rows = [r for r in rows if r.get('organization_id') == organization_id]
        if not rows:
            return []
        statuses = repo.task_statuses(r['task_id'] for r in rows if r.get('task_id'))
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: grant lookup failed for {str(user_id)[:8]}: {e}")
        return []
    live: List[Dict[str, Any]] = []
    dead: List[Dict[str, Any]] = []
    for r in rows:
        status = statuses.get(r['task_id']) if r.get('task_id') else None
        (dead if status is None or status in _CLOSED_TASK_STATUSES else live).append(r)
    if dead:
        try:
            repo.revoke(r['id'] for r in dead)
        except Exception:  # noqa: BLE001
            logger.debug("intentional swallow: lazy grant revoke", exc_info=True)
    return live


def revoke_grants_for_task(task_id: str) -> int:
    """End the thread access a task gave. The tasks code may call this when a
    task is completed or deleted; active_grants reaches the same answer on its
    own, so a caller that forgets costs nothing but a stale row."""
    try:
        return _thread_repo().revoke_for_task(task_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: revoke for task {str(task_id)[:8]} failed: {e}")
        return 0


def thread_access(user_id: str, org: Dict[str, Any], *,
                  conversation_id: Optional[str] = None,
                  group_id: Optional[str] = None) -> Optional[str]:
    """How `user_id` may open this school thread: 'office', 'grant', or None.

    The office is the org's admin tier (and a superadmin); anybody else needs a
    live grant for exactly this thread in exactly this org.
    """
    from services import sis_service
    if sis_service.caller_is_admin(user_id):
        return 'office'
    if active_grants(user_id, conversation_id=conversation_id, group_id=group_id,
                     organization_id=org.get('id')):
        return 'grant'
    return None


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


def granted_thread_ids(user_id: str, org_id: str) -> Dict[str, set]:
    """{'conversations': ids, 'groups': ids} this person holds a live grant for."""
    out: Dict[str, set] = {'conversations': set(), 'groups': set()}
    for g in active_grants(user_id, organization_id=org_id):
        if g.get('conversation_id'):
            out['conversations'].add(g['conversation_id'])
        if g.get('group_id'):
            out['groups'].add(g['group_id'])
    return out


def grant_holder_ids(org_id: str, conversation_id: str) -> List[str]:
    """Staff holding a live grant on this conversation: they hear about a new
    message in it the way the office does."""
    try:
        rows = _thread_repo().grant_holders(org_id, conversation_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"school inbox: grant holder lookup failed: {e}")
        return []
    return [u for u in {r['user_id'] for r in rows}
            if active_grants(u, conversation_id=conversation_id, organization_id=org_id)]


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
