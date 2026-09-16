"""What "Action taken" in the moderation queue does to the reported thing.

Until Friends phase 3 (2026-09-17) a report's status was the whole story:
marking it 'actioned' recorded that a human had acted and changed nothing
about the content. The hidden_* columns on peer_comments were read by every
list and written by nobody. Now that kids write to kids, a report needs a
consequence the reporter can see:

    peer_comment -> hidden (hidden_reason='report'), stays for the parent view
    message      -> soft-deleted, the way the sender's own delete works
    anything else -> unchanged; the status is still the record

Hide, never delete. The parent's activity view shows what was said and that
it was taken down; that is the record a parent wants when they decide
whether to remove the friend.
"""

from typing import Any, Dict, List

from repositories.content_report_repository import ContentReportRepository
from repositories.peer_text_screen_repository import (
    PeerTextScreenRepository, HIDDEN_BY_REPORT)
from utils.logger import get_logger

logger = get_logger(__name__)

#: Report targets a takedown knows how to act on.
TAKEDOWN_TARGETS = ('peer_comment', 'message', 'group_message')
#: What the nightly conversation review reports: a whole thread. Nothing to
#: take down by itself; a person reads the thread and acts on the people.
THREAD_TARGETS = ('conversation', 'group_conversation')


def take_down(report: Dict[str, Any], admin_id: str) -> Dict[str, Any]:
    """Apply the consequence for one actioned report. Idempotent."""
    target_type = report.get('target_type')
    target_id = report.get('target_id')
    if target_type not in TAKEDOWN_TARGETS or not target_id:
        return {'taken_down': False, 'reason': 'no takedown for this target type'}

    repo = PeerTextScreenRepository()
    if target_type == 'peer_comment':
        comment = repo.comment(target_id)
        if not comment:
            return {'taken_down': False, 'reason': 'not found'}
        if not comment.get('hidden_at'):
            repo.hide_comment(target_id, hidden_by=admin_id, reason=HIDDEN_BY_REPORT)
        logger.info('[takedown] %s hid peer comment %s on report %s',
                    str(admin_id)[:8], str(target_id)[:8], str(report.get('id'))[:8])
        return {'taken_down': True}

    if target_type == 'group_message':
        message = repo.group_message(target_id)
        if not message:
            return {'taken_down': False, 'reason': 'not found'}
        if not message.get('is_deleted'):
            repo.hide_group_message(target_id)
            _tell_open_room(message)
        logger.info('[takedown] %s hid group message %s on report %s',
                    str(admin_id)[:8], str(target_id)[:8], str(report.get('id'))[:8])
        return {'taken_down': True}

    message = repo.message(target_id)
    if not message:
        return {'taken_down': False, 'reason': 'not found'}
    if not message.get('is_deleted'):
        repo.hide_message(target_id)
        _tell_open_threads(message)
    logger.info('[takedown] %s hid message %s on report %s',
                str(admin_id)[:8], str(target_id)[:8], str(report.get('id'))[:8])
    return {'taken_down': True}


def _tell_open_room(message: Dict[str, Any]) -> None:
    """The class chat's twin of _tell_open_threads. Best-effort."""
    try:
        from services import messaging_extras_service as extras
        extras._recompute_conversation_preview('group', message)
        extras.broadcast_group(message['group_id'], 'deleted', {'message_id': message['id']})
    except Exception as e:  # noqa: BLE001
        logger.warning('[takedown] could not refresh room for %s: %s',
                       str(message.get('id'))[:8], e)


def _tell_open_threads(message: Dict[str, Any]) -> None:
    """The same follow-through as the sender's own delete: refresh the
    conversation preview and tell any open chat window. Best-effort."""
    try:
        from services import messaging_extras_service as extras
        extras._recompute_conversation_preview('dm', message)
        extras.broadcast_dm(message['conversation_id'], 'deleted',
                            {'message_id': message['id']})
    except Exception as e:  # noqa: BLE001
        logger.warning('[takedown] could not refresh thread for %s: %s',
                       str(message.get('id'))[:8], e)


def with_previews(reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attach `preview` {text, author_id, hidden} to the reports whose target
    is a text a moderator has to read to judge. Other targets get none; the
    queue links to them instead."""
    repo = ContentReportRepository()
    comment_ids = [r['target_id'] for r in reports if r.get('target_type') == 'peer_comment']
    message_ids = [r['target_id'] for r in reports if r.get('target_type') == 'message']
    group_ids = [r['target_id'] for r in reports if r.get('target_type') == 'group_message']
    texts = {}
    try:
        texts.update(repo.peer_comment_texts(comment_ids))
        texts.update(repo.message_texts(message_ids))
        texts.update(repo.group_message_texts(group_ids))
    except Exception as e:  # noqa: BLE001
        logger.warning('[takedown] previews failed: %s', e)
    out = []
    threads = _thread_previews([r for r in reports if r.get('target_type') in THREAD_TARGETS])
    for r in reports:
        found = texts.get(str(r.get('target_id'))) if r.get('target_type') in TAKEDOWN_TARGETS else None
        item = dict(r)
        if r.get('target_type') in THREAD_TARGETS:
            item['thread'] = threads.get(str(r.get('target_id')))
        if found is not None:
            item['preview'] = {'text': found.get('text'), 'author_id': found.get('author_id'),
                               'hidden': bool(found.get('hidden_at'))}
        elif r.get('target_type') in TAKEDOWN_TARGETS:
            item['preview'] = {'text': None, 'author_id': None, 'hidden': True, 'gone': True}
        out.append(item)
    return out


def _thread_previews(reports: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """{thread_id: {kind, name, last_messages: [{who, text, at}]}} for the
    review's reports: the moderator reads the tail of the thread in the
    queue before opening anything."""
    if not reports:
        return {}
    try:
        from repositories.conversation_review_repository import ConversationReviewRepository
        repo = ConversationReviewRepository()
        out = {}
        for r in reports:
            kind = 'group' if r.get('target_type') == 'group_conversation' else 'dm'
            msgs = repo.messages(kind, r['target_id'], 8)
            names = repo.names_for([m['sender_id'] for m in msgs])
            roles = repo.roles_for([m['sender_id'] for m in msgs])
            out[str(r['target_id'])] = {
                'kind': kind,
                'last_messages': [{
                    'who': f"{names.get(m['sender_id'], 'someone')} ({roles.get(m['sender_id'], 'user')})",
                    'text': (m.get('message_content') or '')[:300],
                    'photos': len([a for a in (m.get('attachments') or []) if isinstance(a, dict)]),
                    'at': m.get('created_at'),
                } for m in msgs],
            }
        return out
    except Exception as e:  # noqa: BLE001
        logger.warning('[takedown] thread previews failed: %s', e)
        return {}


# --- what the moderator sees ----------------------------------------------------

def recent_holds(limit: int = 100) -> List[Dict[str, Any]]:
    """The Holds tab: what the screen held, with the two students named the
    way the parent view names them (display name and avatar, no surname)."""
    from repositories.peer_policy_repository import PeerPolicyRepository
    from services.messaging_extras_service import sign_attachments
    repo = PeerTextScreenRepository()
    rows = repo.recent_holds(limit)
    # The pictures live in the private uploads bucket; a moderator reads them
    # through a signed URL like any thread, never through the stored pointer.
    sign_attachments(rows)
    ids = {r['author_id'] for r in rows} | {r['recipient_id'] for r in rows if r.get('recipient_id')}
    people = PeerPolicyRepository().users_by_ids(list(ids), 'id, display_name, first_name, organization_id')
    # A class chat hold names the room, not a child.
    groups = repo.group_names([r['group_id'] for r in rows if r.get('group_id')])

    def _who(uid):
        if not uid:
            return None
        u = people.get(uid) or {}
        return {'id': uid, 'display_name': u.get('display_name') or u.get('first_name') or 'A student',
                'organization_id': u.get('organization_id')}

    def _group(gid):
        if not gid:
            return None
        return {'id': gid, 'name': groups.get(gid) or 'a class chat'}

    return [{**r, 'author': _who(r['author_id']), 'recipient': _who(r.get('recipient_id')),
             'group': _group(r.get('group_id'))} for r in rows]


def daily_digest(now=None) -> Dict[str, Any]:
    """Once a day, tell the superadmins what is waiting: reports nobody has
    looked at, and what the screen held in the last day. Sends nothing when
    both are zero -- an empty digest teaches people to ignore the digest.
    """
    from datetime import timedelta
    from app_config import Config
    from repositories.user_repository import UserRepository
    from services.email_service import email_service
    from utils.timestamps import utcnow

    now = now or utcnow()
    since = (now - timedelta(days=1)).isoformat()
    pending = ContentReportRepository().count_pending()
    holds = PeerTextScreenRepository().holds_since(since)
    if not pending and not holds:
        return {'sent': 0, 'pending_reports': 0, 'holds_24h': 0}

    # admin client justified: the digest goes to every superadmin, read by role
    admins = UserRepository(client=ContentReportRepository().client).find_by_role('superadmin')
    sent = 0
    for admin in admins:
        if not admin.get('email'):
            continue
        try:
            ok = email_service.send_templated_email(
                to_email=admin['email'],
                subject=f"Moderation: {pending} report(s) waiting, {holds} text(s) held today",
                template_name='moderation_daily_digest',
                context={
                    'admin_name': admin.get('first_name') or admin.get('display_name') or 'there',
                    'pending_reports': pending,
                    'holds_24h': holds,
                    'queue_url': f"{Config.FRONTEND_URL}/admin/moderation",
                },
            )
            sent += 1 if ok else 0
        except Exception as e:  # noqa: BLE001
            logger.warning('[moderation-digest] email to %s failed: %s', admin['email'], e)
    logger.info('[moderation-digest] %d pending report(s), %d hold(s); %d email(s) sent',
                pending, holds, sent)
    return {'sent': sent, 'pending_reports': pending, 'holds_24h': holds}

