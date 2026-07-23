"""
Announcement email fan-out.

When an org sends an announcement, recipients who never open the app (mostly
parents) still need to receive it. This service best-effort emails every
recipient with a real address after the in-app/push notification fan-out.

Rules:
- Dependent/placeholder accounts (`*@optio-internal-placeholder.local`,
  `*@pending.optio.local`) never receive email; their managing parent is
  emailed instead.
- Emails are deduped by address, so a parent with three kids in the org gets
  exactly one copy.
- Every send is wrapped in try/except; a failure is logged and never bubbles
  up to the announcement request.

Called from routes/announcements.py inside a daemon thread (the established
fire-and-forget pattern, e.g. routes/quest/classes.py).
"""

import html as html_lib

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

PLACEHOLDER_EMAIL_SUFFIXES = (
    '@optio-internal-placeholder.local',
    '@pending.optio.local',
)

_CHUNK = 100  # keep .in_() URL lengths sane


def _is_placeholder(email):
    e = (email or '').strip().lower()
    return (not e) or any(e.endswith(sfx) for sfx in PLACEHOLDER_EMAIL_SUFFIXES)


def _fresh_admin_client():
    """Fresh service-role client — safe outside Flask request/g context
    (same pattern as NotificationService)."""
    from supabase import create_client
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)


def render_announcement_html(message: str) -> str:
    """Announcement body as simple escaped HTML paragraphs + footer link."""
    paragraphs = [
        f"<p style=\"margin: 0 0 1em 0; line-height: 1.5;\">{html_lib.escape(line.strip())}</p>"
        for line in (message or '').split('\n')
        if line.strip()
    ]
    footer = (
        f'<p style="margin: 1.5em 0 0 0; font-size: 14px; color: #6b7280;">'
        f'Read in Optio: <a href="{Config.FRONTEND_URL}/announcements" '
        f'style="color: #6D469B;">{Config.FRONTEND_URL}/announcements</a></p>'
    )
    return ''.join(paragraphs) + footer


def send_announcement_emails(org_id, title, message, recipient_ids):
    """
    Email an announcement to every recipient with a real email address.

    Args:
        org_id: Organization the announcement belongs to
        title: Announcement title
        message: Full announcement body (plain text)
        recipient_ids: Iterable of user ids that received the in-app notification

    Returns:
        (sent_count, skipped_count) — informational only; all failures are logged.
    """
    recipient_ids = [rid for rid in set(recipient_ids or []) if rid]
    if not recipient_ids:
        return 0, 0

    try:
        admin = _fresh_admin_client()

        org_name = 'Your school'
        try:
            org = admin.table('organizations').select('name')\
                .eq('id', org_id).single().execute().data
            if org and org.get('name'):
                org_name = org['name']
        except Exception as oe:  # noqa: BLE001
            logger.warning(f"Announcement email: org name lookup failed for {org_id}: {oe}")

        # Fetch recipient rows in chunks
        rows = []
        for i in range(0, len(recipient_ids), _CHUNK):
            chunk = recipient_ids[i:i + _CHUNK]
            try:
                res = admin.table('users')\
                    .select('id, email, managed_by_parent_id')\
                    .in_('id', chunk).execute()
                rows.extend(res.data or [])
            except Exception as ce:  # noqa: BLE001
                logger.warning(f"Announcement email: user fetch chunk failed: {ce}")

        # Resolve target addresses. Dependents with placeholder emails route to
        # their managing parent; dedupe by lowercased address.
        emails = set()
        parent_ids_needed = set()
        for row in rows:
            email = (row.get('email') or '').strip()
            if not _is_placeholder(email):
                emails.add(email.lower())
            elif row.get('managed_by_parent_id'):
                parent_ids_needed.add(row['managed_by_parent_id'])

        if parent_ids_needed:
            parent_ids = list(parent_ids_needed)
            for i in range(0, len(parent_ids), _CHUNK):
                chunk = parent_ids[i:i + _CHUNK]
                try:
                    res = admin.table('users').select('id, email')\
                        .in_('id', chunk).execute()
                    for p in (res.data or []):
                        pe = (p.get('email') or '').strip()
                        if not _is_placeholder(pe):
                            emails.add(pe.lower())
                except Exception as ce:  # noqa: BLE001
                    logger.warning(f"Announcement email: parent fetch chunk failed: {ce}")

        if not emails:
            logger.info(f"Announcement email: no emailable recipients for org {org_id}")
            return 0, len(rows)

        subject = f"{org_name}: {title}"
        html_body = render_announcement_html(message)
        text_body = f"{message}\n\nRead in Optio: {Config.FRONTEND_URL}/announcements"

        from services.email_service import email_service

        sent = 0
        failed = 0
        for addr in sorted(emails):
            try:
                if email_service.send_email(
                    to_email=addr,
                    subject=subject,
                    html_body=html_body,
                    text_body=text_body,
                ):
                    sent += 1
                else:
                    failed += 1
            except Exception as se:  # noqa: BLE001
                failed += 1
                logger.warning(f"Announcement email failed for {addr}: {se}")

        logger.info(
            f"Announcement email fan-out for org {org_id}: {sent} sent, "
            f"{failed} failed, {len(rows) - len(emails)} routed/skipped"
        )
        return sent, failed

    except Exception as e:  # noqa: BLE001
        # Never let email fan-out break anything upstream.
        logger.error(f"Announcement email fan-out crashed for org {org_id}: {e}", exc_info=True)
        return 0, 0
