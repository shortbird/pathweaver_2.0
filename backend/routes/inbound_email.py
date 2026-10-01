"""
Inbound email: Google Meet notes forwarded onto CRM files.

  POST /api/email/inbound?key=<INBOUND_EMAIL_WEBHOOK_SECRET>

SendGrid Inbound Parse POSTs a multipart/form-data body here for every message
delivered to INBOUND_EMAIL_DOMAIN. One address under that domain is read: the
Meet notes import address, whose mail goes onto the CRM file of the people in
the meeting. See services/meet_notes_import_service.py for the checks that gate
it (URL secret here, then the import token, DKIM and the sender).

This webhook was built for reply-by-email on "Send to Gmail" (2026-09-08): a
superadmin mailed a message to their own inbox, and a reply to the reply+<token>
address was posted back into the Optio thread. That was removed on 2026-10-01
after 5 sends and no reply. The message_email_relays table still holds those
rows, and a reply to one of the old copies now lands here and is ignored.

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
     backend. Setting them first hands out an import address that bounces
     everything forwarded to it.

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
    the path post mail at it. The import address is derived from this same
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
    # the SMTP recipient, which survives a forward that rewrites the To header;
    # the `to` field carries the header recipient. Either can hold the import
    # address, so both are searched.
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

    # Mail for any other address under the domain, which includes a reply to
    # an old "Send to Gmail" copy. Nothing reads it. Still a 200, for the
    # reason in the module docstring.
    logger.info('Inbound email ignored: no handler for this recipient')
    return jsonify({'status': 'ignored'}), 200
