"""Sentry alerts file tickets: POST /api/webhooks/sentry.

Every issue alert on the three Optio Sentry projects (optio-backend, optio-web,
optio-mobile) opens a row in bug_reports, so a production error sits in the
same /admin/tickets queue as a user report and gets triaged the same way. Perch
did this for its own projects through a Supabase edge function (dev/app
supabase/functions/sentry-hook); this is the Optio equivalent, on the Flask
side where the tracker already lives.

How the request gets here, set up once in the shortbird Sentry org:

  1. Settings -> Developer Settings -> Internal Integrations -> "Optio Tickets"
       webhook URL   https://api.optioeducation.com/api/webhooks/sentry
       Alert Rule Action  ON
     The integration's Client Secret is SENTRY_WEBHOOK_SECRET on the prod
     backend. Sentry signs every delivery with it (Sentry-Hook-Signature,
     HMAC-SHA256 hex over the raw body), and an unsigned or badly signed body
     is refused. Unset secret means refused too: an open URL that files
     tickets is a spam surface, not a half-configured feature.
  2. Each project's issue alert rule gets the action
     "Send a notification via Optio Tickets" next to the email it already sends.

One ticket per Sentry issue while it is open. The issue key
(`<project slug>:<issue id>`) is stored in extra.sentry_issue_id and looked up
before every insert; a repeat delivery for an open ticket appends a line to
triage_notes instead. Once the ticket is closed the next alert opens a fresh
one that names the old id -- a regression is a new bug, and the tickets skill's
rule that "resolved means the fix is on main" stays true.

Only issue alerts (`Sentry-Hook-Resource: event_alert`) file tickets. The
`installation` and `issue` resources are acknowledged and dropped; metric
alerts carry no issue to file against. Events from a non-production
environment are dropped as well: the dev Render services report to the same
Sentry projects and the alert rules have no environment filter, so without
this every dev-only stack trace would open a ticket.

A new ticket sends the same admin mail as a user-filed one
(email_service.send_bug_report_admin_email), with "From Sentry" in place of a
reporter. Best-effort, after the row is committed: a mail failure never
un-files the ticket.

Failures inside this handler are logged at WARNING, deliberately below the
level that opens a Sentry issue (app.py: logger.error() becomes an issue).
An error here that reported itself to Sentry would trigger the alert rule
that posts back here. The one exception is send_email's own logger.error on
a delivery failure: that message is constant, so it collapses into a single
Sentry issue, whose ticket this route then files once and only notes on.
"""

import hashlib
import hmac
import re
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from app_config import Config
from middleware.rate_limiter import rate_limit
from repositories.bug_report_repository import OPEN_STATUSES, BugReportRepository
from routes.bug_reports import TITLE_MAX
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('sentry_webhook', __name__, url_prefix='/api/webhooks')

SIGNATURE_HEADER = 'Sentry-Hook-Signature'
RESOURCE_HEADER = 'Sentry-Hook-Resource'

# Sentry event levels -> ticket priority. Sentry's own default is 'error',
# which is also what an uncaught exception reports as, so 'high' is the
# ordinary outcome and 'urgent' is reserved for a crash the SDK marked fatal.
_LEVEL_TO_PRIORITY = {
    'fatal': 'urgent',
    'error': 'high',
    'warning': 'normal',
    'info': 'low',
    'debug': 'low',
}
_DEFAULT_PRIORITY = 'high'

# Environments that never file tickets (see module docstring). Compared
# case-insensitively; an event with no environment at all is treated as
# production, because the mobile SDK only sets one in a dev build.
IGNORED_ENVIRONMENTS = frozenset({'development', 'dev', 'local', 'test', 'staging'})

# The event's API url is the one field in an alert payload that names the
# project by slug: https://sentry.io/api/0/projects/<org>/<project>/events/<id>/
_PROJECT_FROM_URL = re.compile(r'/api/0/projects/[^/]+/([^/]+)/')


def _signature_ok(secret, raw_body: bytes, given: str) -> bool:
    """Constant-time check of Sentry's HMAC over the raw request body."""
    if not secret or not given:
        return False
    expected = hmac.new(str(secret).encode('utf-8'), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, str(given))


def _tags(event) -> dict:
    """Sentry sends tags as [[key, value], ...]; some payloads use dicts."""
    raw = event.get('tags') or []
    if isinstance(raw, dict):
        return {str(k): v for k, v in raw.items()}
    out = {}
    for item in raw:
        if isinstance(item, (list, tuple)) and len(item) == 2:
            out[str(item[0])] = item[1]
        elif isinstance(item, dict) and 'key' in item:
            out[str(item['key'])] = item.get('value')
    return out


def _project_slug(event, tags) -> str:
    match = _PROJECT_FROM_URL.search(str(event.get('url') or ''))
    if match:
        return match.group(1)
    return str(tags.get('project') or event.get('project') or 'sentry')


def _short_project(slug: str) -> str:
    """'optio-backend' -> 'backend'; anything else stays as it is."""
    return slug[len('optio-'):] if slug.startswith('optio-') else slug


def _current_route(event, tags):
    """The page or endpoint the event names, in the tracker's `current_route`."""
    transaction = event.get('transaction') or tags.get('transaction') or tags.get('url')
    if transaction:
        return str(transaction)[:500]
    req = event.get('request')
    if isinstance(req, dict) and req.get('url'):
        return str(req['url'])[:500]
    return None


def _describe(event, rule, web_url, project_short) -> str:
    """The ticket body: what fired, where, and the link back to Sentry."""
    lines = [f"Sentry issue alert on optio-{project_short}: {rule or 'issue alert'}", '']
    lines.append(str(event.get('title') or 'Untitled Sentry issue'))
    if event.get('culprit'):
        lines.append(f"at {event['culprit']}")
    meta = [
        f"{label}: {event.get(key)}"
        for key, label in (('level', 'level'), ('environment', 'environment'), ('release', 'release'))
        if event.get(key)
    ]
    if meta:
        lines.append(' · '.join(meta))
    if web_url:
        lines.append('')
        lines.append(str(web_url))
    return '\n'.join(lines)


def _ticket_from_alert(data: dict) -> dict:
    """Build the bug_reports row for an event_alert payload, or raise ValueError."""
    event = data.get('event')
    if not isinstance(event, dict):
        raise ValueError('no event in payload')
    issue_id = event.get('issue_id')
    if not issue_id:
        raise ValueError('no issue_id in payload')

    tags = _tags(event)
    slug = _project_slug(event, tags)
    short = _short_project(slug)
    rule = data.get('triggered_rule')
    web_url = event.get('web_url')
    raw_user = event.get('user')
    user: dict = raw_user if isinstance(raw_user, dict) else {}
    level = str(event.get('level') or '').lower()

    title = f"[{short}] {event.get('title') or 'Untitled Sentry issue'}".strip()[:TITLE_MAX]

    return {
        'title': title,
        'message': _describe(event, rule, web_url, short),
        'type': 'bug',
        'priority': _LEVEL_TO_PRIORITY.get(level, _DEFAULT_PRIORITY),
        'source': 'sentry',
        'status': 'new',
        'platform': short,
        'current_route': _current_route(event, tags),
        'user_email': user.get('email') or None,
        'app_version': event.get('release') or None,
        'sentry_event_id': event.get('event_id') or None,
        'extra': {
            'sentry_issue_id': f"{slug}:{issue_id}",
            'sentry': {
                'project': slug,
                'issue_id': str(issue_id),
                'event_id': event.get('event_id'),
                'web_url': web_url,
                'issue_url': event.get('issue_url'),
                'level': event.get('level'),
                'environment': event.get('environment'),
                'release': event.get('release'),
                'culprit': event.get('culprit'),
                'triggered_rule': rule,
                'user': {k: user.get(k) for k in ('id', 'email', 'username') if user.get(k)},
                'tags': tags,
            },
        },
    }


@bp.route('/sentry', methods=['POST'])
@rate_limit(max_requests=120, window_seconds=60)
def sentry_webhook():
    raw = request.get_data()
    if not _signature_ok(Config.SENTRY_WEBHOOK_SECRET, raw, request.headers.get(SIGNATURE_HEADER, '')):
        logger.warning('Sentry webhook rejected: bad or missing signature')
        return jsonify({'error': 'unauthorized'}), 403

    resource = request.headers.get(RESOURCE_HEADER, '')
    if resource != 'event_alert':
        # installation (created/deleted), issue (created/resolved/...), and
        # metric_alert all land here when the integration subscribes to them.
        # Acknowledged so Sentry's request log stays green; nothing to file.
        return jsonify({'status': 'ignored', 'resource': resource}), 200

    payload = request.get_json(silent=True)
    data = payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return jsonify({'error': 'invalid payload'}), 400

    try:
        record = _ticket_from_alert(data)
    except ValueError as e:
        logger.warning(f'Sentry webhook dropped: {e}')
        return jsonify({'error': str(e)}), 400

    environment = str(record['extra']['sentry'].get('environment') or '').lower()
    if environment in IGNORED_ENVIRONMENTS:
        return jsonify({'status': 'ignored', 'environment': environment}), 200

    sentry_key = record['extra']['sentry_issue_id']
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    try:
        # bug_reports is deny-all RLS and only the Flask backend reads or
        # writes it; the verified Sentry signature above is the authorization.
        repo = BugReportRepository()
        previous = repo.find_latest_by_sentry_issue(sentry_key)
        if previous and previous.get('status') in OPEN_STATUSES:
            event_id = record.get('sentry_event_id') or '?'
            repo.append_triage_note(
                previous['id'],
                f"Sentry: fired again {now} (event {event_id}). {record['extra']['sentry'].get('web_url') or ''}".rstrip(),
            )
            logger.info(f"[SentryWebhook] {sentry_key} noted on open ticket {previous['id']}")
            return jsonify({'status': 'noted', 'report_id': previous['id']}), 200

        if previous:
            record['triage_notes'] = (
                f"Regression: ticket {previous['id']} for this Sentry issue was "
                f"{previous.get('status')} on {previous.get('resolved_at') or 'an unknown date'}."
            )
        created = repo.create(record)
    except Exception as e:  # noqa: BLE001  # warning on purpose: see module docstring
        logger.warning(f'[SentryWebhook] ticket not filed for {sentry_key}: {e}')
        return jsonify({'error': 'ticket not filed'}), 500

    logger.info(f"[SentryWebhook] {sentry_key} opened ticket {created.get('id')}")
    _notify_admin_email(record, created)
    return jsonify({'status': 'created', 'report_id': created.get('id')}), 201


def _notify_admin_email(record, created):
    """The regular new-ticket mail to ADMIN_EMAIL, from Sentry. Never raises."""
    try:
        from services.email_service import email_service
        email_service.send_bug_report_admin_email({
            'report_id': created.get('id'),
            'report_type': record.get('type') or 'bug',
            'title': record.get('title'),
            'message': record.get('message'),
            'current_route': record.get('current_route'),
            'reporter_email': record.get('user_email'),
            'platform': record.get('platform'),
            'app_version': record.get('app_version'),
            'source': 'sentry',
        })
    except Exception as e:  # noqa: BLE001  # warning on purpose: see module docstring
        logger.warning(f"[SentryWebhook] admin email notification skipped: {e}")
