"""
CRM public + internal routes (docs/CRM_REPLACEMENT_PLAN.md).

Public:
  GET  /api/crm/unsubscribe?token=   minimal HTML confirm page
  POST /api/crm/unsubscribe          performs it (also the RFC 8058 one-click
                                     target, via the List-Unsubscribe-Post
                                     header on every CRM send)

Internal (X-Cron-Secret, or a signed-in superadmin for manual triggering):
  POST /api/crm/internal/funnel-sweep     the scheduled-send sweep
  POST /api/crm/internal/calendar-poll    Google Calendar booking poll

Provider callback:
  POST /api/crm/internal/sendgrid-events  SendGrid event webhook. ECDSA P-256
        signature verification is MANDATORY — unsigned or badly signed
        requests are rejected, and the endpoint refuses everything when
        SENDGRID_WEBHOOK_PUBLIC_KEY is unset. Events land in crm_email_events
        (deduped on sg_event_id); bounce/spam/unsubscribe also suppress the
        address and exit any active funnel membership.
"""
import base64
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from markupsafe import escape
from postgrest.exceptions import APIError

from app_config import Config
from middleware.rate_limiter import rate_limit
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('crm', __name__, url_prefix='/api/crm')

# SendGrid event types that permanently close a mailbox for marketing.
# 'bounce' is conditional: SendGrid reports BOTH permanent failures
# (payload type 'bounce' — 550 no such user) and transient ones (type
# 'blocked' — MX lookup failure, SMTP timeout, greylisting) under the same
# event name. Suppressing on 'blocked' is how real gmail addresses ended up
# permanently unmailable during the first weeks on a cold IP; the event is
# still recorded, it just no longer closes the mailbox.
SUPPRESSING_EVENTS = {
    'bounce': 'hard_bounce',
    'dropped': 'hard_bounce',
    'spamreport': 'spam_report',
    'unsubscribe': 'unsubscribe',
    'group_unsubscribe': 'unsubscribe',
}


def _suppression_reason(repo, event: dict, email: str):
    """The suppression reason this event earns, or None to leave the mailbox
    open. Bounce classification (permanent vs transient, and how many
    transient failures make a dead mailbox) lives in CrmRepository."""
    reason = SUPPRESSING_EVENTS.get(event.get('event'))
    if reason == 'hard_bounce' and not repo.bounce_is_permanent(event, email):
        return None
    return reason


_UNSUB_PAGE = """<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Optio</title></head>
<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f9fafb;
margin:0;padding:48px 16px;text-align:center;color:#111827;">
<div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;
border-radius:12px;padding:32px;">{body}</div></body></html>"""


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _admin_db():
    from database import get_supabase_admin_client
    # admin client justified: CRM tables are service-role only; these routes
    # serve anonymous recipients (unsubscribe) and cron (sweeps/webhooks).
    return get_supabase_admin_client()


def _cron_or_superadmin():
    """Shared auth gate for the internal endpoints: the cron secret, or a
    signed-in superadmin for manual triggering (same dual gate as the SIS
    sweeps). Returns None when authorized, else a (response, status) pair."""
    from utils.cron_auth import is_valid_cron_secret
    if is_valid_cron_secret(request.headers.get('X-Cron-Secret')):
        return None
    from utils.session_manager import session_manager
    uid = session_manager.get_effective_user_id()
    if uid:
        row = (_admin_db().table('users').select('role')
               .eq('id', uid).limit(1).execute()).data
        if row and row[0].get('role') == 'superadmin':
            return None
    return jsonify({'success': False, 'error': 'Unauthorized'}), 401


@bp.route('/unsubscribe', methods=['GET'])
@rate_limit(max_requests=30, window_seconds=3600)
def unsubscribe_confirm():
    """Confirm page. GET never mutates (mail scanners prefetch links); the
    button posts back with the token."""
    token = (request.args.get('token') or '').strip()
    # The token goes straight back out in the form, so it is validated as a
    # UUID (which is all we ever mint) rather than reflected as-is, and
    # escaped on the way into the HTML. Reflecting it raw was a stored-XSS
    # hole on the API origin.
    if not _is_uuid(token):
        return _UNSUB_PAGE.format(body='<p>Invalid unsubscribe link.</p>'), 404
    return _UNSUB_PAGE.format(body=(
        '<h2 style="margin:0 0 12px;">Unsubscribe</h2>'
        '<p style="color:#6b7280;">Stop receiving marketing emails from Optio?</p>'
        f'<form method="POST" action="/api/crm/unsubscribe">'
        f'<input type="hidden" name="token" value="{escape(token)}">'
        '<button type="submit" style="margin-top:16px;padding:12px 28px;border:0;'
        'border-radius:8px;background:linear-gradient(90deg,#6D469B,#EF597B);'
        'color:#fff;font-size:15px;cursor:pointer;">Unsubscribe</button></form>'
    ))


@bp.route('/unsubscribe', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=3600)
def unsubscribe_perform():
    """Performs the unsubscribe. Serves both the confirm-page form and RFC
    8058 one-click POSTs from mail clients (token in the query string)."""
    token = (request.args.get('token') or request.form.get('token')
             or (request.get_json(silent=True) or {}).get('token') or '').strip()
    from services.crm_funnel_engine import unsubscribe_by_token
    if not token or not unsubscribe_by_token(token):
        return _UNSUB_PAGE.format(body='<p>Invalid unsubscribe link.</p>'), 404
    return _UNSUB_PAGE.format(body=(
        '<h2 style="margin:0 0 12px;">You are unsubscribed</h2>'
        '<p style="color:#6b7280;">You will not receive marketing emails from '
        'Optio again. Transactional emails about an account you hold are '
        'unaffected.</p>'
    ))


@bp.route('/internal/funnel-sweep', methods=['POST'])
def funnel_sweep():
    err = _cron_or_superadmin()
    if err:
        return err
    from services.crm_funnel_engine import run_sweep
    return jsonify({'success': True, **run_sweep()})


@bp.route('/internal/calendar-poll', methods=['POST'])
def calendar_poll():
    err = _cron_or_superadmin()
    if err:
        return err
    from services.crm_calendar_service import run_poll
    return jsonify({'success': True, **run_poll()})


def _verify_sendgrid_signature(public_key_b64: str, payload: bytes,
                               signature_b64: str, timestamp: str) -> bool:
    """SendGrid's Signed Event Webhook: ECDSA P-256 over SHA-256 of
    timestamp+payload. The dashboard's "Verification Key" is a base64 DER
    SubjectPublicKeyInfo; the signature header is a base64 DER signature."""
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.serialization import load_der_public_key
        key = load_der_public_key(base64.b64decode(public_key_b64))
        key.verify(base64.b64decode(signature_b64),
                   timestamp.encode('utf-8') + payload,
                   ec.ECDSA(hashes.SHA256()))
        return True
    except Exception:  # noqa: BLE001  # bad key material or bad signature: reject
        return False


@bp.route('/internal/sendgrid-events', methods=['POST'])
def sendgrid_events():
    public_key = Config.SENDGRID_WEBHOOK_PUBLIC_KEY
    if not public_key:
        logger.warning('SendGrid webhook rejected: SENDGRID_WEBHOOK_PUBLIC_KEY not set')
        return jsonify({'error': 'webhook not configured'}), 403
    signature = request.headers.get('X-Twilio-Email-Event-Webhook-Signature', '')
    timestamp = request.headers.get('X-Twilio-Email-Event-Webhook-Timestamp', '')
    if not signature or not timestamp or not _verify_sendgrid_signature(
            public_key, request.get_data(), signature, timestamp):
        logger.warning('SendGrid webhook rejected: bad or missing signature')
        return jsonify({'error': 'invalid signature'}), 401

    events = request.get_json(silent=True)
    if not isinstance(events, list):
        return jsonify({'error': 'expected a JSON array'}), 400

    db = _admin_db()
    from repositories.crm_repository import CrmRepository
    repo = CrmRepository(client=db)
    stored = suppressed = 0
    for event in events:
        if not isinstance(event, dict):
            continue
        event_type = event.get('event')
        email = (event.get('email') or '').lower().strip()
        custom = {k: event.get(k) for k in ('send_id', 'lead_id') if event.get(k)}
        occurred = event.get('timestamp')
        occurred_iso = (datetime.fromtimestamp(occurred, tz=timezone.utc).isoformat()
                        if isinstance(occurred, (int, float)) else None)
        try:
            db.table('crm_email_events').insert({
                'sg_event_id': event.get('sg_event_id'),
                'send_id': custom.get('send_id'),
                'lead_id': custom.get('lead_id'),
                'email': email or None,
                'event_type': event_type or 'unknown',
                'payload': event,
                'occurred_at': occurred_iso,
            }).execute()
            stored += 1
        except APIError as _exc:
            logger.debug("CRM email-event insert failed: %s", _exc, exc_info=True)
            continue

        reason = _suppression_reason(repo, event, email) if email else None
        if reason:
            repo.suppress(email, reason, source='sendgrid_webhook')
            suppressed += 1

    return jsonify({'success': True, 'stored': stored, 'suppressed': suppressed})
