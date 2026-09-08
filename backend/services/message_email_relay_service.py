"""
"Send to Gmail" for Optio messages, and the reply path back in.

Why this exists (Tanner, 2026-09-08): the Optio Support inbox is not where he
triages work — Gmail is. A message that needs a real answer later gets read on
a phone, mentally filed, and lost, because nothing in his actual inbox nags him
about it. So a superadmin can push one message out to their own mailbox, where
it sits until it is dealt with.

The Reply-To on that copy is a relay address. Replying to it in Gmail posts the
reply back into the Optio thread as the superadmin, so a member never learns an
email address, never leaves Optio, and never sees a support alias change shape.

Superadmin only, deliberately. This mails one person's words to a mailbox they
did not choose, and grants that mailbox a standing write capability into the
thread. It is a support tool for the one account that already reads every
support thread, not a general "email me this" button.

Three layers guard the inbound direction, because any one of them alone is thin:
  1. The webhook URL carries a shared secret (?key=). SendGrid Inbound Parse
     posts unauthenticated otherwise.
  2. The relay token is 32 random url-safe bytes and is the entire local part.
  3. The envelope sender must match the mailbox the relay was minted for. So a
     leaked token still cannot write into the thread from another address.

Reply-by-email is OFF unless Config.INBOUND_EMAIL_DOMAIN is set (see
ENV_KEYS_REFERENCE.md). The emailed copy degrades honestly: no Reply-To, and
the mail says replies are not wired up rather than silently swallowing one.
"""

import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from markupsafe import escape

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

# Where the emailed copy points back to. Same host the forwarded-support mail
# uses, so there is one answer to "where do I read this in Optio".
MESSAGES_URL = 'https://www.optioeducation.com/messages'

RELAY_TTL_DAYS = 180

# reply+<token>@<domain>. The '+' keeps the token visibly a machine address, so
# a human who sees it in a header does not mistake it for a person's mailbox.
_ADDRESS_RE = re.compile(r'reply\+([A-Za-z0-9_-]{20,})@', re.IGNORECASE)

# A bare address, or "Display Name <addr@host>".
_FROM_RE = re.compile(r'<([^<>@\s]+@[^<>@\s]+)>|([^<>@\s]+@[^<>@\s]+)')


def _admin():
    from database import get_supabase_admin_client
    # admin client justified: relay rows are service-role only (a token is a
    # write capability into a superadmin's messages), and the inbound handler
    # runs with no user session at all.
    return get_supabase_admin_client()


# ─────────────────────────── configuration ───────────────────────────

def replies_enabled() -> bool:
    """Whether a reply-by-email address can be offered at all.

    Both halves or neither: a domain with no webhook secret means the endpoint
    rejects every delivery, so the Reply-To would be a promise that bounces.
    """
    return bool(Config.INBOUND_EMAIL_DOMAIN and Config.INBOUND_EMAIL_WEBHOOK_SECRET)


def reply_address(token: str) -> str:
    return f"reply+{token}@{Config.INBOUND_EMAIL_DOMAIN}"


# ─────────────────────────────── relays ───────────────────────────────

def get_or_create_relay(owner_id: str, owner_email: str, recipient_id: str,
                        conversation_id: Optional[str] = None,
                        source_message_id: Optional[str] = None) -> Dict[str, Any]:
    """The relay for this (superadmin, recipient) pair, minting one if needed.

    One relay per pair rather than per message, so the reply address for a
    person is stable — replying to last week's copy still lands in today's
    thread. Every send refreshes the expiry and un-revokes, since sending is an
    explicit act by the owner.
    """
    client = _admin()
    now = datetime.now(timezone.utc)
    existing = (client.table('message_email_relays')
                .select('*')
                .eq('owner_id', owner_id)
                .eq('recipient_id', recipient_id)
                .limit(1).execute()).data

    fields = {
        'owner_email': (owner_email or '').strip().lower(),
        'conversation_id': conversation_id,
        'source_message_id': source_message_id,
        'last_sent_at': now.isoformat(),
        'expires_at': (now + timedelta(days=RELAY_TTL_DAYS)).isoformat(),
        'revoked': False,
    }

    if existing:
        row = existing[0]
        updated = (client.table('message_email_relays')
                   .update(fields).eq('id', row['id']).execute()).data
        return updated[0] if updated else {**row, **fields}

    fields.update({
        'token': secrets.token_urlsafe(32),
        'owner_id': owner_id,
        'recipient_id': recipient_id,
    })
    return (client.table('message_email_relays').insert(fields).execute()).data[0]


def find_relay(token: str) -> Optional[Dict[str, Any]]:
    """A live relay for this token, or None. Expiry and revocation are checked
    here so no caller can forget to."""
    rows = (_admin().table('message_email_relays')
            .select('*').eq('token', token).limit(1).execute()).data
    if not rows:
        return None
    relay = rows[0]
    if relay.get('revoked'):
        return None
    expires = _parse_ts(relay.get('expires_at'))
    if expires and expires < datetime.now(timezone.utc):
        return None
    return relay


def _parse_ts(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


# ────────────────────────────── outbound ──────────────────────────────

def _display_name(user: Dict[str, Any]) -> str:
    return (user.get('display_name')
            or f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip()
            or 'Someone')


def _format_sent_at(value: Optional[str]) -> str:
    ts = _parse_ts(value)
    return ts.strftime('%b %-d, %Y at %-I:%M %p UTC') if ts else ''


def email_message_to_owner(owner: Dict[str, Any], message: Dict[str, Any],
                           author: Dict[str, Any], other_party: Dict[str, Any],
                           org_name: Optional[str] = None) -> Dict[str, Any]:
    """Mail one Optio message to the superadmin's own inbox.

    `author` is whose words these are — which is not always the other party,
    since the caller can email a message they wrote themselves. `other_party`
    is the far side of the thread, and is what a reply must reach; conflating
    the two would mint a relay pointing at the caller's own inbox.

    Returns {'sent': bool, 'reply_address': str|None, 'to': str}.
    Raises ValueError when the owner has no email on file.
    """
    from services.email_service import EmailService

    to_email = (owner.get('email') or '').strip()
    if not to_email:
        raise ValueError('Your Optio account has no email address on file')

    author_name = _display_name(author)
    other_name = _display_name(other_party)
    body = (message.get('message_content') or '').strip()
    attachments = message.get('attachments') or []
    sent_at = _format_sent_at(message.get('created_at'))
    thread_url = f"{MESSAGES_URL}?user={other_party.get('id')}"

    relay = None
    reply_to = None
    if replies_enabled():
        relay = get_or_create_relay(
            owner_id=owner['id'],
            owner_email=to_email,
            recipient_id=other_party['id'],
            conversation_id=message.get('conversation_id'),
            source_message_id=message.get('id'),
        )
        reply_to = reply_address(relay['token'])

    subject = f"[Optio] {other_name}"
    if org_name:
        subject += f" ({org_name})"

    html = _render_email(
        author_name=author_name,
        reply_to_name=other_name,
        org_name=org_name,
        sent_at=sent_at,
        body=body,
        attachments=attachments,
        thread_url=thread_url,
        reply_to=reply_to,
    )
    text = _render_text(author_name, other_name, org_name, sent_at, body,
                        attachments, thread_url, reply_to)

    sent = EmailService().send_email(
        to_email=to_email,
        subject=subject,
        html_body=html,
        text_body=text,
        reply_to=reply_to,
        # This is one member's words being mailed to a personal inbox on
        # purpose. It must not ALSO fan out to the support-copy address, and it
        # is education-record-adjacent by nature: a student describing their
        # work is exactly what this carries.
        support_copy=False,
        contains_student_records=True,
        categories=['message_relay'],
    )
    return {'sent': bool(sent), 'reply_address': reply_to, 'to': to_email}


def _render_email(author_name: str, reply_to_name: str, org_name: Optional[str],
                  sent_at: str, body: str, attachments: list, thread_url: str,
                  reply_to: Optional[str]) -> str:
    """Deliberately plain. This lands in a personal inbox next to real mail; it
    should read like a forwarded message, not like marketing."""
    meta = escape(author_name)
    if org_name:
        meta = f"{meta} &middot; {escape(org_name)}"
    if sent_at:
        meta = f"{meta} &middot; {escape(sent_at)}"

    body_html = (
        '<br>'.join(escape(line) for line in body.splitlines())
        if body else '<em style="color:#6b7280;">(no text)</em>'
    )

    attach_html = ''
    if attachments:
        names = ''.join(
            f'<li style="margin:2px 0;">{escape(a.get("name") or "attachment")}</li>'
            for a in attachments if isinstance(a, dict)
        )
        attach_html = (
            '<p style="margin:16px 0 4px;color:#6b7280;font-size:13px;">'
            f'{len(attachments)} attachment(s) — open the thread in Optio to view:</p>'
            f'<ul style="margin:0;padding-left:20px;color:#374151;font-size:13px;">{names}</ul>'
        )

    if reply_to:
        footer = (
            f'<strong>Reply to this email</strong> and your reply is posted to '
            f'{escape(reply_to_name)} in Optio, from Optio Support. They never see '
            'your email address.'
        )
    else:
        footer = (
            'Replying to this email does nothing — reply-by-email is not '
            'configured. Open the thread in Optio to answer.'
        )

    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:24px 16px;background:#f9fafb;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;
border-radius:12px;padding:24px;">
  <p style="margin:0 0 4px;font-size:16px;font-weight:600;">{escape(author_name)}</p>
  <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">{meta}</p>
  <div style="border-left:3px solid #6D469B;padding:8px 0 8px 14px;font-size:15px;
line-height:1.55;white-space:normal;">{body_html}</div>
  {attach_html}
  <p style="margin:24px 0 0;">
    <a href="{escape(thread_url)}" style="display:inline-block;background:#6D469B;
color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;
font-weight:600;">Open the thread in Optio</a>
  </p>
  <p style="margin:20px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">{footer}</p>
</div>
</body></html>"""


def _render_text(author_name: str, reply_to_name: str, org_name: Optional[str],
                 sent_at: str, body: str, attachments: list, thread_url: str,
                 reply_to: Optional[str]) -> str:
    header = author_name
    if org_name:
        header += f" ({org_name})"
    if sent_at:
        header += f" — {sent_at}"
    parts = [header, '', body or '(no text)']
    if attachments:
        parts += ['', f'{len(attachments)} attachment(s) — open the thread in Optio to view.']
    parts += ['', f'Open the thread: {thread_url}', '']
    parts.append(
        f'Reply to this email and your reply is posted to {reply_to_name} in Optio.'
        if reply_to else
        'Replying to this email does nothing — reply-by-email is not configured.'
    )
    return '\n'.join(parts)


# ────────────────────────────── inbound ──────────────────────────────

def extract_relay_token(*header_values: Optional[str]) -> Optional[str]:
    """The relay token from any of the recipient headers the provider sends.

    Checked across several fields because Inbound Parse reports the envelope
    recipient in `envelope`, and the header recipient in `to` — and a reply
    that was also CC'd puts the relay address in only one of them.
    """
    for value in header_values:
        if not value:
            continue
        found = _ADDRESS_RE.search(value)
        if found:
            return found.group(1)
    return None


def extract_sender_email(from_header: Optional[str]) -> Optional[str]:
    if not from_header:
        return None
    found = _FROM_RE.search(from_header)
    if not found:
        return None
    return (found.group(1) or found.group(2) or '').strip().lower() or None


# Everything from the first of these onward is the quoted original, not the
# reply. Gmail on both web and Android produces the "On ... wrote:" form; the
# rest cover Outlook, Apple Mail and forwarded chains, which reach this inbox
# whenever a reply is written from something other than the phone.
_QUOTE_MARKERS = (
    re.compile(r'^\s*On .{0,200}\bwrote:\s*$', re.IGNORECASE),
    re.compile(r'^\s*-{2,}\s*Original Message\s*-{2,}\s*$', re.IGNORECASE),
    re.compile(r'^\s*_{5,}\s*$'),
    re.compile(r'^\s*From:\s.+$', re.IGNORECASE),
    re.compile(r'^\s*Sent from my \w+', re.IGNORECASE),
    re.compile(r'^\s*>{1,}'),
)


def strip_quoted_reply(text: str) -> str:
    """Just what the person typed.

    Gmail sends the whole quoted thread back. Posting that verbatim into the
    Optio thread would show the member a copy of their own message wrapped in
    mail headers, which looks broken and leaks how the sausage is made.
    """
    if not text:
        return ''
    lines = text.replace('\r\n', '\n').split('\n')
    kept = []
    for line in lines:
        if any(marker.match(line) for marker in _QUOTE_MARKERS):
            break
        kept.append(line)
    # A trailing "-- \nsignature" block, per RFC 3676.
    body = '\n'.join(kept)
    body = re.split(r'\n-- \n', body)[0]
    return body.strip()


def handle_inbound(*, to_header: Optional[str], envelope_to: Optional[str],
                   from_header: Optional[str], text: Optional[str],
                   dkim: Optional[str] = None,
                   attachment_count: int = 0) -> Tuple[str, str]:
    """Post an emailed reply back into its Optio thread.

    Returns (status, detail) where status is one of 'delivered', 'ignored',
    'empty'. Never raises for a bad delivery — the caller answers 200 either
    way, because a 4xx to Inbound Parse turns a spoofed or stale message into a
    retry storm and a bounce back at whoever sent it.
    """
    from services.direct_message_service import DirectMessageService

    token = extract_relay_token(envelope_to, to_header)
    if not token:
        return 'ignored', 'no relay token in recipient'

    relay = find_relay(token)
    if not relay:
        return 'ignored', 'unknown, expired or revoked relay'

    sender_email = extract_sender_email(from_header)
    if not sender_email or sender_email != (relay.get('owner_email') or '').lower():
        # The token is unguessable, so this is either a forwarded relay address
        # or an attempt. Either way it must not write into the thread.
        logger.warning(
            "Inbound relay rejected: sender %r is not the relay owner", sender_email
        )
        return 'ignored', 'sender is not the relay owner'

    # DKIM is advisory here rather than the gate — the token plus the owner
    # check already carry the weight — but a From that fails DKIM is a spoof
    # attempt on a known-good address and there is no reason to accept it.
    if dkim and 'pass' not in dkim.lower():
        logger.warning("Inbound relay rejected: DKIM did not pass (%r)", dkim)
        return 'ignored', 'DKIM did not pass'

    body = strip_quoted_reply(text or '')
    if attachment_count:
        # Attachments are not carried through: an inbound file has no owner,
        # no virus scan and no storage policy on this path. Say so in the
        # thread rather than dropping them silently.
        note = (f"({attachment_count} attachment(s) were sent by email and could "
                "not be delivered here.)")
        body = f"{body}\n\n{note}".strip()
    if not body:
        return 'empty', 'reply had no text'

    message = DirectMessageService().send_message(
        relay['owner_id'], relay['recipient_id'], body
    )

    now = datetime.now(timezone.utc).isoformat()
    try:
        _admin().table('message_email_relays').update({
            'reply_count': (relay.get('reply_count') or 0) + 1,
            'last_reply_at': now,
        }).eq('id', relay['id']).execute()
    except Exception as e:  # noqa: BLE001
        # The reply is already in the thread; bookkeeping must not undo it.
        logger.warning("Relay bookkeeping failed for %s: %s", relay['id'], e)

    logger.info("Inbound email reply delivered to conversation %s",
                message.get('conversation_id'))
    return 'delivered', message.get('id') or ''
