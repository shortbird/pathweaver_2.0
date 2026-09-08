"""
Inbound email: the reply half of "Send to Gmail".

  POST /api/email/inbound?key=<INBOUND_EMAIL_WEBHOOK_SECRET>

SendGrid Inbound Parse POSTs a multipart/form-data body here for every message
delivered to INBOUND_EMAIL_DOMAIN. A reply to a relay address is posted back
into its Optio thread; see services/message_email_relay_service.py for the three
checks that gate it (URL secret, unguessable relay token, envelope sender must
match the relay owner).

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
     that bounces.

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
    the path inject messages once a relay token leaked into a forwarded email.
    """
    expected = Config.INBOUND_EMAIL_WEBHOOK_SECRET
    if not expected:
        return False
    return hmac.compare_digest(str(request.args.get('key') or ''), str(expected))


@bp.route('/inbound', methods=['POST'])
@rate_limit(max_requests=120, window_seconds=60)
def inbound_email():
    from services import message_email_relay_service as relay_service

    if not _authorized():
        logger.warning('Inbound email rejected: bad or missing webhook key')
        return jsonify({'error': 'unauthorized'}), 403

    form = request.form
    # `envelope` is JSON: {"to": ["reply+tok@..."], "from": "..."}. It carries
    # the SMTP recipient, which survives a Gmail reply that rewrites the To
    # header; the `to` field carries the header recipient. Either can hold the
    # relay address, so both are searched.
    envelope_to = form.get('envelope') or ''

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
        logger.error(f"Inbound email handling failed: {e}")
        # 200 on purpose: see the module docstring. The message is lost, which
        # the log records; a retry storm aimed at a member's mailbox is worse.
        return jsonify({'status': 'error'}), 200

    if status != 'delivered':
        logger.info(f"Inbound email not delivered ({status}): {detail}")
    return jsonify({'status': status}), 200
