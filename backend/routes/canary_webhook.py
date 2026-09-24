"""Canarytoken alerts file tickets: POST /api/webhooks/canary?key=<secret>.

Canarytokens (canarytokens.org, by Thinkst) are fake credentials planted where
a thief looks first: AWS keys in backend/.env, in the Render env, in a
database row nobody reads. A token cannot be used without alerting, and its
alert POSTs here, so a possible breach lands in /admin/tickets next to the
Sentry tickets, at urgent priority, with the admin mail a new ticket sends.

How the request gets here: each token is created on canarytokens.org with
the webhook URL

    https://api.optioeducation.com/api/webhooks/canary?key=<CANARY_WEBHOOK_SECRET>

and a memo naming where the token was planted. The memo is the ticket title,
so it is the first thing anyone reads.

canarytokens.org does not sign its webhooks, so the secret in the URL is the
whole authorization, compared in constant time. Unset secret means refused:
an open URL that files urgent tickets is a spam surface. A forged call can
only file a false ticket; it reads nothing and changes nothing else.

The body is the "generic" shape from thinkst/canarytokens
(webhook_formatting.py). Two kinds arrive:

  - an alert (TokenAlertDetails): somebody used the token. Fields channel,
    token_type, token, memo, time, src_ip, manage_url, additional_data.
  - an exposure (TokenExposedDetails): the key was found published somewhere
    public, e.g. a GitHub commit. Fields key_id, public_location,
    exposed_time instead of time/src_ip.

When a token is saved, canarytokens.org sends a test alert whose token is
"a+test+token". That is acknowledged and files nothing.

One ticket per token while it is open, keyed by extra.canary_token; a repeat
alert appends a line to triage_notes. After the ticket is closed the next
alert opens a fresh one: a closed canary that fires again is a new incident.

Failures are logged at WARNING, below the level that opens a Sentry issue,
for the same reason as routes/sentry_webhook.py.
"""

import hmac
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from app_config import Config
from middleware.rate_limiter import rate_limit
from repositories.bug_report_repository import OPEN_STATUSES, BugReportRepository
from routes.bug_reports import TITLE_MAX
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('canary_webhook', __name__, url_prefix='/api/webhooks')

# The token canarytokens.org puts in the test alert it sends on save.
TEST_TOKEN = 'a+test+token'

# Every field is attacker-reachable text (the memo is ours, but a forged call
# can say anything), so each one is capped before it is stored.
_FIELD_MAX = 500


def _authorized() -> bool:
    expected = Config.CANARY_WEBHOOK_SECRET
    if not expected:
        return False
    return hmac.compare_digest(str(request.args.get('key') or ''), str(expected))


def _s(value) -> str:
    return str(value if value is not None else '')[:_FIELD_MAX]


def _ticket_from_payload(data: dict) -> dict:
    """Build the bug_reports row for an alert or an exposure, or raise ValueError."""
    token = _s(data.get('token')).strip()
    if not token:
        raise ValueError('no token in payload')

    memo = _s(data.get('memo')).strip() or 'Canarytoken with no memo'
    token_type = _s(data.get('token_type'))
    exposed = bool(data.get('key_id') or data.get('exposed_time'))
    extra_data = data.get('additional_data')
    additional = extra_data if isinstance(extra_data, dict) else {}

    if exposed:
        headline = f"Canarytoken published: {memo}"
        lines = [
            'A canarytoken key was found published in a public place.',
            'Nobody has necessarily used it yet, but whoever put it there had '
            'access to the place it was planted.',
            '',
            f"Planted: {memo}",
            f"Token type: {token_type}",
            f"Key id: {_s(data.get('key_id'))}",
            f"Found at: {_s(data.get('public_location')) or 'not given'}",
            f"Found (UTC): {_s(data.get('exposed_time'))}",
        ]
    else:
        headline = f"Canarytoken fired: {memo}"
        lines = [
            'A canarytoken was used. Treat the place it was planted as '
            'compromised until proven otherwise.',
            '',
            f"Planted: {memo}",
            f"Token type: {token_type}",
            f"Channel: {_s(data.get('channel'))}",
            f"Time (UTC): {_s(data.get('time'))}",
            f"Source IP: {_s(data.get('src_ip')) or 'not given'}",
        ]
        user_agent = additional.get('useragent')
        if user_agent:
            lines.append(f"User agent: {_s(user_agent)}")
    manage_url = _s(data.get('manage_url'))
    if manage_url:
        lines += ['', f"Manage or history: {manage_url}"]

    return {
        'title': headline[:TITLE_MAX],
        'message': '\n'.join(lines),
        'type': 'bug',
        'priority': 'urgent',
        'source': 'canary',
        'status': 'new',
        'user_email': None,
        'notify_reporter': False,
        'extra': {
            'canary_token': token,
            'canary': {
                'kind': 'exposed' if exposed else 'alert',
                'memo': memo,
                'token_type': token_type,
                'channel': _s(data.get('channel')),
                'time': _s(data.get('time') or data.get('exposed_time')),
                'src_ip': _s(data.get('src_ip')),
                'key_id': _s(data.get('key_id')),
                'public_location': _s(data.get('public_location')),
                'manage_url': manage_url,
                'additional_data': {k: _s(v) for k, v in list(additional.items())[:20]},
            },
        },
    }


@bp.route('/canary', methods=['POST'])
@rate_limit(max_requests=60, window_seconds=60)
def canary_webhook():
    if not _authorized():
        logger.warning('Canary webhook rejected: bad or missing key')
        return jsonify({'error': 'unauthorized'}), 403

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'invalid payload'}), 400

    if str(data.get('token') or '') == TEST_TOKEN:
        logger.info('[CanaryWebhook] test alert from canarytokens.org acknowledged')
        return jsonify({'status': 'test acknowledged'}), 200

    try:
        record = _ticket_from_payload(data)
    except ValueError as e:
        logger.warning(f'Canary webhook dropped: {e}')
        return jsonify({'error': str(e)}), 400

    token = record['extra']['canary_token']
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    try:
        # bug_reports is deny-all RLS and only the Flask backend reads or
        # writes it; the URL secret above is the authorization.
        repo = BugReportRepository()
        previous = repo.find_latest_by_canary_token(token)
        if previous and previous.get('status') in OPEN_STATUSES:
            canary = record['extra']['canary']
            repo.append_triage_note(
                previous['id'],
                f"Canary fired again {now}: {canary['kind']} from "
                f"{canary['src_ip'] or canary['public_location'] or 'unknown source'}.",
            )
            logger.info(f"[CanaryWebhook] repeat noted on open ticket {previous['id']}")
            return jsonify({'status': 'noted', 'report_id': previous['id']}), 200

        if previous:
            record['triage_notes'] = (
                f"This token fired before: ticket {previous['id']} was "
                f"{previous.get('status')} on {previous.get('resolved_at') or 'an unknown date'}."
            )
        created = repo.create(record)
    except Exception as e:  # noqa: BLE001  # warning on purpose: see module docstring
        logger.warning(f'[CanaryWebhook] ticket not filed: {e}')
        return jsonify({'error': 'ticket not filed'}), 500

    logger.info(f"[CanaryWebhook] opened ticket {created.get('id')}")
    _notify_admin_email(record, created)
    return jsonify({'status': 'created', 'report_id': created.get('id')}), 201


def _notify_admin_email(record, created):
    """The regular new-ticket mail to ADMIN_EMAIL, from Canarytokens. Never raises."""
    try:
        from services.email_service import email_service
        email_service.send_bug_report_admin_email({
            'report_id': created.get('id'),
            'report_type': 'bug',
            'title': record.get('title'),
            'message': record.get('message'),
            'current_route': None,
            'reporter_email': None,
            'platform': None,
            'app_version': None,
            'source': 'canary',
        })
    except Exception as e:  # noqa: BLE001  # warning on purpose: see module docstring
        logger.warning(f"[CanaryWebhook] admin email notification skipped: {e}")
