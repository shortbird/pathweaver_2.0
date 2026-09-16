"""The platform ticket tracker: /api/bug-reports.

One table for every Optio platform report. Four senders write to it:

  * the mobile app's shake-to-report sheet (message + steps + a diagnostics
    blob: current route, recent API calls, console errors, device/build, an
    optional screenshot);
  * the staff reporter on the web platform and SIS console
    (web/src/components/feedback/IssueReporter.jsx), which replaced the Perch
    widget on 2026-09-14 so reports stop leaving for a separate app;
  * a hand-filed row (source 'hq'), and the open Perch tickets imported the
    day Perch was retired (source 'perch');
  * Sentry issue alerts on the three Optio projects, through the signed
    webhook in routes/sentry_webhook.py (source 'sentry', since 2026-09-15).

Superadmin triages in /admin/tickets. Claude Code reads and resolves rows over
the Supabase MCP (see .claude/skills/tickets/SKILL.md), which is why the
vocabulary below is small and fixed: a status, a type and a priority are the
whole state machine, and `resolution` is where the fix is written down.

Screenshots live in the PRIVATE `bug-reports` bucket and are surfaced to
superadmin via short-lived signed URLs, never public.

No notifications beyond the admin inbox email that predates this: the tracker
is a list, not an inbox, by decision (2026-09-14).
"""

import json
import uuid

from flask import Blueprint, request, jsonify

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from repositories.bug_report_repository import BugReportRepository
from utils.auth.decorators import require_auth, require_role
from utils.logger import get_logger
from utils.roles import get_effective_role

logger = get_logger(__name__)

bp = Blueprint('bug_reports', __name__, url_prefix='/api/bug-reports')

SCREENSHOT_BUCKET = 'bug-reports'
MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024  # 10MB (matches bucket file_size_limit)
ALLOWED_STATUSES = {'new', 'triaged', 'fixing', 'resolved', 'wont_fix'}
ALLOWED_TYPES = {'bug', 'feature', 'question', 'tweak'}
ALLOWED_PRIORITIES = {'low', 'normal', 'high', 'urgent'}
# What a sender may claim about itself. 'perch' and 'hq' are set by hand and
# 'sentry' by the webhook, never over this API.
CLIENT_SOURCES = {'mobile', 'web'}
TITLE_MAX = 120

# The old web FAB and the mobile sheet describe intent in extra.report_type.
_REPORT_TYPE_TO_TYPE = {'bug': 'bug', 'idea': 'feature', 'confusion': 'question'}

# Columns we accept from the client diagnostics blob (allow-list — never trust
# the client to set status/triage fields).
_CONTEXT_TEXT_FIELDS = (
    'message', 'steps', 'app_version', 'build_number', 'ota_update_id',
    'platform', 'os_version', 'device_model', 'current_route', 'sentry_event_id',
)
_CONTEXT_JSON_FIELDS = ('breadcrumbs', 'recent_api_calls', 'recent_console_errors', 'extra')


def _lookup_user_identity(user_id: str):
    """Best-effort email, effective role and org for the report row (never fatal)."""
    try:
        # admin client justified: reads the reporter's own identity row to stamp the report
        supabase = get_supabase_admin_client()
        res = supabase.table('users').select(
            'email, role, org_role, organization_id'
        ).eq('id', user_id).limit(1).execute()
        if res.data:
            row = res.data[0]
            return row.get('email'), get_effective_role(row), row.get('organization_id')
    except Exception as e:
        logger.warning(f"[BugReport] identity lookup failed for {user_id}: {e}")
    return None, None, None


def _derive_title(message: str) -> str:
    """The first line of the message, trimmed to fit the list view."""
    first = message.strip().split('\n', 1)[0].strip()
    return (first or message.strip())[:TITLE_MAX] or 'Untitled report'


def _upload_screenshot(file, user_id: str):
    """Validate + upload a screenshot to the private bucket. Returns path or None."""
    if not file or not file.filename:
        return None

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size == 0 or size > MAX_SCREENSHOT_BYTES:
        logger.warning(f"[BugReport] screenshot skipped (size={size})")
        return None

    file_bytes = file.read()
    content_type = file.content_type or 'image/jpeg'

    # Security scan (magic-byte / polyglot detection) before it touches storage.
    from utils.file_validator import validate_file as _security_validate
    scan = _security_validate(file.filename, file_bytes, content_type)
    if not scan.is_valid:
        logger.warning(f"[BugReport] screenshot rejected by security scan: {scan.error_message}")
        return None

    # The known-CSAM hash match. Only superadmins ever see a screenshot, so
    # the classifier does not run; the match is not about who sees it.
    from services import upload_safety_service as gate
    if not gate.check_image(file_bytes, content_type, user_id=user_id, purpose='bug_report',
                            filename=file.filename, classify=False).allowed:
        logger.warning('[BugReport] screenshot refused by the safety gate')
        return None

    ext = 'jpg'
    if content_type == 'image/png':
        ext = 'png'
    elif content_type == 'image/webp':
        ext = 'webp'
    storage_path = f"{user_id}/{uuid.uuid4()}.{ext}"

    try:
        # admin client justified: writes to the private bug-reports bucket scoped to the caller
        supabase = get_supabase_admin_client()
        supabase.storage.from_(SCREENSHOT_BUCKET).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": content_type},
        )
        return storage_path
    except Exception as e:
        logger.error(f"[BugReport] screenshot upload failed: {e}")
        return None


@bp.route('', methods=['POST'])
@rate_limit(limit=20, per=3600)  # 20 reports/hour/user
@require_auth
def create_bug_report(user_id):
    """Create a bug report (multipart: `context` JSON + optional `screenshot`)."""
    raw_context = request.form.get('context')
    if not raw_context:
        # Allow a plain JSON body too, for clients that don't send a screenshot.
        raw_context = request.get_json(silent=True)
        context = raw_context if isinstance(raw_context, dict) else None
    else:
        try:
            context = json.loads(raw_context)
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid context JSON'}), 400

    if not isinstance(context, dict):
        return jsonify({'error': 'Missing report context'}), 400

    message = (context.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'A description of the problem is required'}), 400

    email, effective_role, organization_id = _lookup_user_identity(user_id)

    title = (context.get('title') or '').strip()[:TITLE_MAX] or _derive_title(message)
    extra = context.get('extra') if isinstance(context.get('extra'), dict) else {}
    ticket_type = context.get('type')
    if ticket_type not in ALLOWED_TYPES:
        ticket_type = _REPORT_TYPE_TO_TYPE.get(extra.get('report_type'), 'bug')
    source = context.get('source') if context.get('source') in CLIENT_SOURCES else 'mobile'

    record = {
        'user_id': user_id,
        'user_email': email,
        'user_role': effective_role,
        'organization_id': organization_id,
        'title': title,
        'type': ticket_type,
        'source': source,
        'status': 'new',
    }
    for field in _CONTEXT_TEXT_FIELDS:
        value = context.get(field)
        if value is not None:
            record[field] = value
    for field in _CONTEXT_JSON_FIELDS:
        if field in context and context[field] is not None:
            record[field] = context[field]
    record['message'] = message  # normalized (stripped)

    # Screenshot is strictly best-effort: a problem reading/scanning/uploading it
    # must never fail the report itself. (Previously this ran outside the
    # try/except, so a bad screenshot 500'd the whole request and dropped the report.)
    try:
        screenshot_path = _upload_screenshot(request.files.get('screenshot'), user_id)
        if screenshot_path:
            record['screenshot_path'] = screenshot_path
            record['screenshot_bucket'] = SCREENSHOT_BUCKET
    except Exception as e:
        logger.error(f"[BugReport] screenshot handling failed (saving report without it): {e}")

    try:
        repo = BugReportRepository()  # admin client (custom-JWT app)
        created = repo.create(record)
    except Exception as e:
        logger.error(f"[BugReport] create failed for user {user_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to submit bug report'}), 500

    logger.info(f"[BugReport] created {created.get('id')} from user {user_id} route={record.get('current_route')}")

    _notify_admin_email(record, created, user_id)
    return jsonify({'success': True, 'report_id': created.get('id')}), 201


def _notify_admin_email(record, created, user_id):
    """Email the admin inbox on every new report so feedback isn't only visible
    in Sentry / the DB. Best-effort: never fails the request, no-op if email
    isn't configured (local dev)."""
    try:
        org_name = None
        try:
            # admin client justified: resolves the reporter's org for email context
            supabase = get_supabase_admin_client()
            res = supabase.table('users').select(
                'organization_id, organizations(name)'
            ).eq('id', user_id).limit(1).execute()
            if res.data:
                org = res.data[0].get('organizations')
                if isinstance(org, dict):
                    org_name = org.get('name')
        except Exception as e:
            logger.warning(f"[BugReport] org lookup for email failed: {e}")

        extra = record.get('extra') if isinstance(record.get('extra'), dict) else {}
        from services.email_service import email_service
        email_service.send_bug_report_admin_email({
            'report_id': created.get('id'),
            'report_type': record.get('type') or extra.get('report_type') or 'bug',
            'title': record.get('title'),
            'message': record.get('message'),
            'steps': record.get('steps'),
            'current_route': record.get('current_route'),
            'reporter_email': record.get('user_email'),
            'reporter_role': record.get('user_role'),
            'org_name': org_name,
            'platform': record.get('platform'),
            'app_version': record.get('app_version'),
            'build_number': record.get('build_number'),
        })
    except Exception as e:
        logger.warning(f"[BugReport] admin email notification skipped: {e}")


def _capture_to_sentry(record, created, user_id, message):
    """Forward the report to Sentry (optio-backend) so beta feedback lands next to
    crashes with full context. Best-effort: never fails the report, no-op if Sentry
    isn't initialized (local dev). Distinguishes bug / idea / confusion via a tag so
    feature ideas and "I don't get this" don't read as errors.

    NO LONGER CALLED (2026-08-13). Every submission opened its own Sentry issue
    — 99 of them, against 1 real error — so the issue stream stopped being a
    list of things that are broken. Feedback still lands in the bug_reports
    table (queried directly) and in the admin email below, which is where it
    gets triaged from. Kept for the tags/context if a feedback-to-Sentry route
    is ever wanted again; wire it behind a filter, not on every submission.
    """
    try:
        import sentry_sdk

        extra = record.get('extra') if isinstance(record.get('extra'), dict) else {}
        rtype = (extra.get('report_type') or 'bug')
        surface = extra.get('surface') or record.get('platform') or 'unknown'
        # Ideas/confusion are not errors — keep them at info so alerting stays sane.
        level = 'warning' if rtype == 'bug' else 'info'

        with sentry_sdk.push_scope() as scope:
            scope.set_tag('source', 'bug_report')
            scope.set_tag('report_type', rtype)
            scope.set_tag('surface', surface)
            scope.set_user({'id': user_id, 'email': record.get('user_email')})
            scope.set_context('bug_report', {
                'report_id': created.get('id'),
                'current_route': record.get('current_route'),
                'steps': record.get('steps'),
                'user_role': record.get('user_role'),
                'screenshot_path': record.get('screenshot_path'),
                **extra,
            })
            sentry_sdk.capture_message(f"Bug report [{rtype}]: {message}", level=level)
    except Exception as e:
        logger.warning(f"[BugReport] sentry capture skipped: {e}")


# The client the superadmin triage endpoints read and write reports with.
#
# It must be the admin client. `bug_reports` has RLS enabled and ZERO
# policies, which is deny-all: a user-scoped client sees no rows no matter
# who is holding it, so the triage list came back empty while looking
# healthy -- 200, `count: 0`, nothing in the logs. Superadmin is not an
# exception to a policy that does not exist.
#
# Authorization for these endpoints is @require_role('superadmin') at the
# route, above. RLS was never what gated them; it was only ever able to
# silence them.
#
# Fixing this with a policy instead was considered and rejected. Reports
# carry the reporter's email, role and a diagnostics blob, and nothing but
# the Flask backend reads this table -- both frontends use the Supabase
# client for OAuth only. A policy would open a PostgREST path to that data
# that no caller needs.
#
# admin client justified: bug_reports is deny-all RLS (0 policies), so a user
# client reads nothing; these endpoints are superadmin-gated at the route
from utils.admin_client import admin_client as _triage_client


def _int_arg(name, default, ceiling):
    try:
        return max(0, min(int(request.args.get(name, default)), ceiling))
    except (ValueError, TypeError):
        return default


@bp.route('', methods=['GET'])
@require_role('superadmin')
def list_bug_reports(user_id):
    """List reports for the tracker (superadmin only).

    `status` may be one of the five statuses or `open` (new + triaged +
    fixing). `total` is the exact count for the filter; `count` is the number
    of rows in this page.
    """
    status = request.args.get('status') or None
    if status and status != 'open' and status not in ALLOWED_STATUSES:
        return jsonify({'error': 'Invalid status filter'}), 400
    ticket_type = request.args.get('type') or None
    if ticket_type and ticket_type not in ALLOWED_TYPES:
        return jsonify({'error': 'Invalid type filter'}), 400
    limit = _int_arg('limit', 50, 200) or 50
    offset = _int_arg('offset', 0, 100000)

    repo = BugReportRepository(client=_triage_client())
    reports, total = repo.list_filtered(
        limit=limit,
        offset=offset,
        status=status,
        ticket_type=ticket_type,
        organization_id=request.args.get('organization_id') or None,
        search=(request.args.get('q') or '').strip()[:100] or None,
    )
    return jsonify({
        'reports': reports,
        'count': len(reports),
        'total': total,
        'limit': limit,
        'offset': offset,
    }), 200


@bp.route('/summary', methods=['GET'])
@require_role('superadmin')
def bug_report_summary(user_id):
    """How many tickets sit in each status (superadmin only)."""
    repo = BugReportRepository(client=_triage_client())
    counts = repo.counts_by_status()
    counts['open'] = sum(counts.get(s, 0) for s in ('new', 'triaged', 'fixing'))
    return jsonify({'counts': counts}), 200


@bp.route('/<report_id>', methods=['GET'])
@require_role('superadmin')
def get_bug_report(user_id, report_id):
    """Get a single report + a signed URL for its screenshot (superadmin only)."""
    repo = BugReportRepository(client=_triage_client())
    report = repo.find_detail(report_id)
    if not report:
        return jsonify({'error': 'Bug report not found'}), 404

    screenshot_url = None
    if report.get('screenshot_path'):
        try:
            # admin client justified: signs a private-bucket object for superadmin triage
            supabase = get_supabase_admin_client()
            signed = supabase.storage.from_(
                report.get('screenshot_bucket') or SCREENSHOT_BUCKET
            ).create_signed_url(report['screenshot_path'], 3600)
            screenshot_url = signed.get('signedURL') or signed.get('signedUrl')
        except Exception as e:
            logger.warning(f"[BugReport] could not sign screenshot for {report_id}: {e}")

    report['screenshot_url'] = screenshot_url
    return jsonify({'report': report}), 200


# What a triage edit may change, and the values each field accepts. Anything
# else in the body is ignored: the reporter's identity, the diagnostics and the
# timestamps are the record, not the triage.
_PATCH_ENUMS = {
    'status': ALLOWED_STATUSES,
    'type': ALLOWED_TYPES,
    'priority': ALLOWED_PRIORITIES,
}
_PATCH_TEXT = ('title', 'triage_notes', 'resolution')


@bp.route('/<report_id>', methods=['PATCH'])
@require_role('superadmin')
def update_bug_report(user_id, report_id):
    """Update a ticket's triage fields (superadmin only).

    Accepts status, type, priority, title, triage_notes and resolution.
    Resolving stamps resolved_at; moving back to an open status clears it.
    """
    data = request.get_json(silent=True) or {}
    changes = {}
    for field, allowed in _PATCH_ENUMS.items():
        if field in data:
            if data[field] not in allowed:
                return jsonify({'error': f'Invalid {field}'}), 400
            changes[field] = data[field]
    for field in _PATCH_TEXT:
        if field in data:
            value = data[field]
            if value is not None and not isinstance(value, str):
                return jsonify({'error': f'Invalid {field}'}), 400
            changes[field] = value.strip() if isinstance(value, str) else None
    if changes.get('title') == '':
        return jsonify({'error': 'Title cannot be empty'}), 400
    if changes.get('title'):
        changes['title'] = changes['title'][:TITLE_MAX]
    if not changes:
        return jsonify({'error': 'Nothing to update'}), 400

    repo = BugReportRepository(client=_triage_client())
    try:
        updated = repo.update_fields(report_id, changes)
    except Exception as e:
        logger.error(f"[BugReport] update failed for {report_id}: {e}")
        return jsonify({'error': 'Failed to update bug report'}), 500

    return jsonify({'success': True, 'report': updated}), 200
