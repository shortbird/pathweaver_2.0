"""
Inbound email: replies to "Email this to me", and Google Meet notes.

  POST /api/email/inbound?key=<INBOUND_EMAIL_WEBHOOK_SECRET>

SendGrid Inbound Parse POSTs a multipart/form-data body here for every message
delivered to INBOUND_EMAIL_DOMAIN. Two kinds of address under that domain are
read:

  notes+<token>@  the Meet notes import address, whose mail goes onto the CRM
                  file of the people in the meeting. See
                  services/meet_notes_import_service.py for its checks (import
                  token, DKIM, sender).
  reply+<token>@  a relay address on a copy a superadmin mailed to their own
                  inbox ("Email this to me"). The reply is posted back into the
                  Optio thread; see services/message_email_relay_service.py for
                  the three checks that gate it (URL secret here, unguessable
                  relay token, envelope sender must match the relay owner).

The notes address is checked first, so a notes+ token never reaches the relay.
Reply-by-email was removed on 2026-10-01 and restored on 2026-10-05 (ticket
fc21a562); relays minted before the removal still work until they expire.

Setup, once, in this order — the middle step is the one that breaks things if
it runs early:

  1. DNS: MX on the subdomain, e.g.
       reply.optioeducation.com.  MX  10  mx.sendgrid.net.
     A dedicated subdomain, never the apex — the apex carries real mail.
  2. SendGrid → Settings → Inbound Parse → Add Host & URL:
       host  reply.optioeducation.com
       url   https://api.optioeducation.com/api/email/inbound?key=<secret>
     Leave "POST the raw, full MIME message" OFF; this handler reads the
     parsed fields.
  3. Only then set INBOUND_EMAIL_DOMAIN and INBOUND_EMAIL_WEBHOOK_SECRET on the
     backend. Setting them first makes every emailed copy advertise a Reply-To
     that bounces, and hands out an import address that bounces everything
     forwarded to it.

This endpoint answers 200 to everything it can parse, including rejections.
A 4xx to Inbound Parse makes SendGrid retry and eventually bounce back at
whoever sent the mail, which turns one spoofed message into a mail loop aimed
at a real person.
"""

import hmac

from flask import Blueprint, jsonify, request

from app_config import Config
from middleware.rate_limiter import rate_limit
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('inbound_email', __name__, url_prefix='/api/email')


def _authorized() -> bool:
    """Constant-time check of the shared secret in the callback URL.

    Unset secret means the endpoint is closed, not open: an inbound handler
    that accepts anything while half-configured would let anyone who guessed
    the path post mail at it, or inject messages once a relay token leaked
    into a forwarded email. The import address is derived from this same
    secret, so nothing can be addressed to it until the secret exists.
    """
    expected = Config.INBOUND_EMAIL_WEBHOOK_SECRET
    if not expected:
        return False
    return hmac.compare_digest(str(request.args.get('key') or ''), str(expected))


@bp.route('/inbound', methods=['POST'])
@rate_limit(max_requests=120, window_seconds=60)
def inbound_email():
    if not _authorized():
        logger.warning('Inbound email rejected: bad or missing webhook key')
        return jsonify({'error': 'unauthorized'}), 403

    form = request.form
    # `envelope` is JSON: {"to": ["notes+tok@..."], "from": "..."}. It carries
    # the SMTP recipient, which survives a forward or a Gmail reply that
    # rewrites the To header; the `to` field carries the header recipient.
    # Either can hold the import or relay address, so both are searched.
    envelope_to = form.get('envelope') or ''

    # Google Meet notes forwarded by the owner's Gmail filter go onto CRM
    # files. See services/meet_notes_import_service.py.
    from services import meet_notes_import_service as meet_notes
    if meet_notes.is_import_address(envelope_to, form.get('to')):
        try:
            result = meet_notes.handle_inbound(
                to_header=form.get('to'),
                envelope_to=envelope_to,
                from_header=form.get('from'),
                subject=form.get('subject'),
                text=form.get('text'),
                html=form.get('html'),
                dkim=form.get('dkim'),
            )
        except Exception as e:  # noqa: BLE001
            # 200 on purpose: see the module docstring. The notes are lost,
            # which the log records; a retry storm aimed at the sender's
            # mailbox is worse.
            logger.error(f"Meet notes import failed: {e}")
            return jsonify({'status': 'error'}), 200
        return jsonify({'status': result.get('status')}), 200

    # Everything else is a reply to an "Email this to me" copy, or mail for an
    # address nothing reads; the relay service tells the two apart.
    from services import message_email_relay_service as relay_service

    # SendGrid sends this as a decimal string, but a malformed post must not
    # become a 500 — the count is only used to add a note to the thread.
    try:
        attachment_count = int(form.get('attachments') or 0)
    except (TypeError, ValueError):
        attachment_count = 0

    try:
        status, detail = relay_service.handle_inbound(
            to_header=form.get('to'),
            envelope_to=envelope_to,
            from_header=form.get('from'),
            text=form.get('text') or form.get('html'),
            dkim=form.get('dkim'),
            attachment_count=attachment_count,
        )
    except ValueError as e:
        # send_message refused (blocked, no permission). Real, and the sender
        # needs to know, but retrying will not help.
        logger.warning(f"Inbound email reply refused: {e}")
        return jsonify({'status': 'refused'}), 200
    except Exception as e:  # noqa: BLE001
        # 200 on purpose: see the module docstring. The message is lost, which
        # the log records; a retry storm aimed at a member's mailbox is worse.
        logger.error(f"Inbound email handling failed: {e}")
        return jsonify({'status': 'error'}), 200

    if status != 'delivered':
        logger.info(f"Inbound email not delivered ({status}): {detail}")
    return jsonify({'status': status}), 200
