"""Publishing an announcement to a school's families.

One path, two callers. The learning app's announcements composer has always
posted here; the SIS Community Hub now can too, because posting there and
watching nothing reach families is exactly what happened to iCreate on
2026-08-01 ("I just posted an announcement from the admin side and it doesn't
show up in the announcements on the non-admin side of things").

The Community Hub is staff-only by design — a noticeboard for the office, with
lost & found and recognition beside it. This is the other thing: a message that
goes OUT, with a durable row families can read, an in-app notification, and an
email to people who never open the app.

Extracted from routes/announcements.py; the route is now a thin caller.
"""

import threading
from typing import Any, Dict, Iterable, List, Optional, Set

from flask import current_app

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.roles import get_effective_role

logger = get_logger(__name__)

# The audiences an announcement can be aimed at.
ROLE_AUDIENCES = {'students', 'parents', 'advisors'}


def _admin():
    return get_supabase_admin_client()


def normalize_audiences(audiences: Any, fallback: Any = None) -> List[str]:
    """Clean a requested audience list, tolerating the old single `audience`
    field ('everyone' meaning all roles)."""
    if not audiences:
        single = fallback or 'everyone'
        audiences = list(ROLE_AUDIENCES) if single == 'everyone' else [single]
    if isinstance(audiences, str):
        audiences = [audiences]
    return [a for a in audiences if a in ROLE_AUDIENCES]


def recipients_for(org_id: str, audiences: Iterable[str],
                   exclude_user_id: Optional[str] = None) -> Set[str]:
    """Every user id that should receive an announcement for these audiences.

    Parents are resolved per student, so a platform parent (no organization_id
    of their own) still gets their child's school announcements.
    """
    members = (
        _admin().table('users').select('id, role, org_role, org_roles')
        .eq('organization_id', org_id).execute()
    ).data or []
    students = [m for m in members if get_effective_role(m) == 'student']
    advisors = [m for m in members if get_effective_role(m) == 'advisor']

    recipient_ids: Set[str] = set()
    if 'students' in audiences:
        recipient_ids.update(m['id'] for m in students)
    if 'advisors' in audiences:
        recipient_ids.update(m['id'] for m in advisors)
    if 'parents' in audiences:
        from services.notification_service import NotificationService
        notifier = NotificationService()
        for s in students:
            try:
                for p in (notifier.get_parents_for_student(s['id']) or []):
                    if p.get('id'):
                        recipient_ids.add(p['id'])
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Could not resolve parents for student {s['id']}: {e}")
    recipient_ids.discard(exclude_user_id)
    return recipient_ids


def publish(org_id: str, author_id: str, title: str, content: str,
            audiences: List[str]) -> Dict[str, Any]:
    """Store the announcement and fan it out (notifications + email).

    The durable row is what the family-facing Announcements page reads, so it is
    written first and its failure is logged rather than raised — delivery still
    happens either way.
    """
    announcement_id = None
    try:
        ins = _admin().table('announcements').insert({
            'organization_id': org_id,
            'author_id': author_id,
            'title': title,
            'message': content,
            'target_audience': ('everyone' if set(audiences) == ROLE_AUDIENCES
                                else ','.join(sorted(audiences))),
        }).execute()
        announcement_id = ins.data[0]['id'] if ins.data else None
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Announcement row insert failed (continuing): {e}")

    recipient_ids = recipients_for(org_id, audiences, exclude_user_id=author_id)

    from services.notification_service import NotificationService
    notifier = NotificationService()
    preview = (content[:200] + '…') if len(content) > 200 else content
    sent = 0
    for rid in recipient_ids:
        try:
            notifier.create_notification(
                user_id=rid,
                notification_type='announcement',
                title=title,
                message=preview,
                link='/notifications',
                metadata={'announcement_id': announcement_id, 'audiences': audiences},
                organization_id=org_id,
            )
            sent += 1
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Announcement notify failed for {rid}: {e}")

    _email_fanout(org_id, title, content, list(recipient_ids))
    logger.info(f"Announcement '{title[:40]}' by {author_id[:8]} sent to {sent} "
                f"({','.join(audiences)})")
    return {'sent': sent, 'announcement_id': announcement_id,
            'recipients': len(recipient_ids)}


def _email_fanout(org_id: str, title: str, content: str, recipients: List[str]) -> None:
    """Email the announcement in a daemon thread — parents who never open the
    app still get it, and a slow SMTP hop never holds up the request."""
    if not recipients:
        return
    try:
        app = current_app._get_current_object()
    except RuntimeError:  # outside an app context (scripts, tests)
        logger.debug('announcement email fan-out skipped: no app context')
        return

    def _run():
        with app.app_context():
            try:
                from services.announcement_email_service import send_announcement_emails
                send_announcement_emails(org_id, title, content, recipients)
            except Exception as e:  # noqa: BLE001
                logger.error(f"Announcement email fan-out failed: {e}", exc_info=True)

    threading.Thread(target=_run, daemon=True).start()
