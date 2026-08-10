"""
Announcement email fan-out.

When an org sends an announcement, recipients who never open the app (mostly
parents) still need to receive it. This service best-effort emails every
recipient with a real address after the in-app/push notification fan-out.

Rules:
- Dependent/placeholder accounts (`*@optio-internal-placeholder.local`,
  `*@pending.optio.local`) never receive email; their managing parent is
  emailed instead.
- Emails are deduped by canonical mailbox, not just exact address: lowercased,
  `+tag` stripped, and gmail's dot-insensitivity applied — so a parent with
  three kids gets one copy, and so does someone whose accounts are plus-aliases
  of the same inbox (how Tanner got four copies of an iCreate announcement on
  2026-08-07).
- Per-recipient sends never generate a [COPY] to SUPPORT_COPY_EMAIL — a
  school-wide announcement would flood it, and the recipient-org lookup inside
  send_email can't see platform parents of an excluded org's students anyway.
  Instead, ONE summary copy per announcement is sent here, honoring the org
  opt-out list.
- Every send is wrapped in try/except; a failure is logged and never bubbles
  up to the announcement request.

Called from routes/announcements.py inside a daemon thread (the established
fire-and-forget pattern, e.g. routes/quest/classes.py).
"""

import html as html_lib

from app_config import Config
from utils import rich_text
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


def _canonical_mailbox(email):
    """Dedup key for 'same inbox': lowercase, drop any `+tag`, and apply
    gmail's dot-insensitivity (googlemail == gmail). Used only as a key —
    the message is always sent to a real address that was on the list."""
    e = (email or '').strip().lower()
    local, _, domain = e.partition('@')
    base = local.split('+', 1)[0]
    if domain == 'googlemail.com':
        domain = 'gmail.com'
    if domain == 'gmail.com':
        base = base.replace('.', '')
    return f"{base}@{domain}" if base and domain else e


def _fresh_admin_client():
    """Fresh service-role client — safe outside Flask request/g context
    (same pattern as NotificationService)."""
    from supabase import create_client
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)


def render_announcement_html(message: str) -> str:
    """Announcement body as HTML paragraphs + footer link.

    A body written with the editor is already HTML — escaping it would put
    literal `<p>` tags in a parent's inbox — so it is sanitized and passed
    through. A plain-text body is escaped and split into paragraphs as before.
    """
    if rich_text.is_html(message):
        body = rich_text.sanitize(message)
    else:
        body = ''.join(
            f"<p style=\"margin: 0 0 1em 0; line-height: 1.5;\">{html_lib.escape(line.strip())}</p>"
            for line in (message or '').split('\n')
            if line.strip()
        )
    footer = (
        f'<p style="margin: 1.5em 0 0 0; font-size: 14px; color: #6b7280;">'
        f'Read in Optio: <a href="{Config.FRONTEND_URL}/school" '
        f'style="color: #6D469B;">{Config.FRONTEND_URL}/school</a></p>'
    )
    return body + footer


def send_announcement_emails(org_id, title, message, recipient_ids):
    """
    Email an announcement to every recipient with a real email address.

    Args:
        org_id: Organization the announcement belongs to
        title: Announcement title
        message: Full announcement body (plain text or sanitized editor HTML)
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
        org_slug = None
        reply_to = None
        try:
            org = admin.table('organizations').select('name, slug, feature_flags')\
                .eq('id', org_id).single().execute().data
            if org:
                org_name = org.get('name') or org_name
                org_slug = org.get('slug')
                # Same rule as send_email's per-recipient lookup, decided once
                # here so platform parents get the school's Reply-To too.
                value = (org.get('feature_flags') or {}).get('email_reply_to')
                reply_to = value.strip() if isinstance(value, str) and value.strip() else None
        except Exception as oe:  # noqa: BLE001
            logger.warning(f"Announcement email: org lookup failed for {org_id}: {oe}")

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
        # their managing parent; dedupe by canonical mailbox (one inbox, one
        # copy), delivering to the first real address seen for that inbox.
        mailboxes = {}

        def _add(addr):
            a = addr.lower()
            key = _canonical_mailbox(a)
            if key not in mailboxes or a < mailboxes[key]:
                mailboxes[key] = a

        parent_ids_needed = set()
        for row in rows:
            email = (row.get('email') or '').strip()
            if not _is_placeholder(email):
                _add(email)
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
                            _add(pe)
                except Exception as ce:  # noqa: BLE001
                    logger.warning(f"Announcement email: parent fetch chunk failed: {ce}")

        emails = list(mailboxes.values())
        if not emails:
            logger.info(f"Announcement email: no emailable recipients for org {org_id}")
            return 0, len(rows)

        subject = f"{org_name}: {title}"
        html_body = render_announcement_html(message)
        text_body = (f"{rich_text.to_text(message)}\n\n"
                     f"Read in Optio: {Config.FRONTEND_URL}/school")

        from services.email_service import email_service, SUPPORT_COPY_EXCLUDE_ORG_SLUGS

        sent = 0
        failed = 0
        for addr in sorted(emails):
            try:
                if email_service.send_email(
                    to_email=addr,
                    subject=subject,
                    html_body=html_body,
                    text_body=text_body,
                    reply_to=reply_to,
                    support_copy=False,
                ):
                    sent += 1
                else:
                    failed += 1
            except Exception as se:  # noqa: BLE001
                failed += 1
                logger.warning(f"Announcement email failed for {addr}: {se}")

        # One monitoring copy for the whole announcement (not per recipient),
        # unless the org has opted out of copies.
        if sent and org_slug not in SUPPORT_COPY_EXCLUDE_ORG_SLUGS:
            try:
                banner = (
                    f'<div style="background: #f3f4f6; padding: 12px; margin-bottom: 20px; '
                    f'border-left: 4px solid #6D469B;"><strong>Copy:</strong> '
                    f'{org_name} announcement emailed to {sent} recipients</div>'
                )
                email_service.send_email(
                    to_email=Config.SUPPORT_COPY_EMAIL,
                    subject=f"[COPY] {subject}",
                    html_body=banner + html_body,
                    text_body=(f"[{org_name} announcement emailed to {sent} recipients]\n\n"
                               f"{text_body}"),
                    support_copy=False,
                )
            except Exception as se:  # noqa: BLE001
                logger.warning(f"Announcement summary copy failed: {se}")

        logger.info(
            f"Announcement email fan-out for org {org_id}: {sent} sent, "
            f"{failed} failed, {len(rows) - len(emails)} routed/skipped"
        )
        return sent, failed

    except Exception as e:  # noqa: BLE001
        # Never let email fan-out break anything upstream.
        logger.error(f"Announcement email fan-out crashed for org {org_id}: {e}", exc_info=True)
        return 0, 0
