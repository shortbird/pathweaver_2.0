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

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
    return get_supabase_admin_client()


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


def notify_admins_of_member_message(org: Dict[str, Any], sender_id: str,
                                    sender_name: str, preview: str) -> None:
    """Fan a member's message to the shared inbox out to the front office's
    notification bells. Best-effort; never raises."""
    from services.notification_service import NotificationService
    try:
        notification_service = NotificationService()
        for admin_id in admin_recipient_ids(org['id']):
            if admin_id == sender_id:
                continue
            notification_service.create_notification(
                user_id=admin_id,
                notification_type='message_received',
                title=f"{org.get('name') or 'School'} inbox: message from {sender_name}",
                message=preview,
                link='/inbox',
                metadata={'sender_id': sender_id, 'sender_name': sender_name,
                          'school_inbox': True, 'organization_id': org['id']},
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
