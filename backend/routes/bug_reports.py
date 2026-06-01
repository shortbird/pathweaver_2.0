"""Beta bug-report endpoints.

In-app "shake to report a bug" flow for the v2 mobile app. A POST carries a
structured diagnostics blob (current route, recent API calls, console errors,
device/build) plus an optional screenshot, so reports are machine-actionable —
Claude reads new rows via the Supabase MCP and goes straight to the failing
code. Screenshots live in the PRIVATE `bug-reports` bucket and are surfaced to
superadmin via short-lived signed URLs, never public.
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

# Columns we accept from the client diagnostics blob (allow-list — never trust
# the client to set status/triage fields).
_CONTEXT_TEXT_FIELDS = (
    'message', 'steps', 'app_version', 'build_number', 'ota_update_id',
    'platform', 'os_version', 'device_model', 'current_route', 'sentry_event_id',
)
_CONTEXT_JSON_FIELDS = ('breadcrumbs', 'recent_api_calls', 'recent_console_errors', 'extra')


def _lookup_user_identity(user_id: str):
    """Best-effort email + effective role for the report row (never fatal)."""
    try:
        # admin client justified: reads the reporter's own identity row to stamp the report
        supabase = get_supabase_admin_client()
        res = supabase.table('users').select(
            'email, role, org_role, organization_id'
        ).eq('id', user_id).limit(1).execute()
        if res.data:
            row = res.data[0]
            return row.get('email'), get_effective_role(row)
    except Exception as e:
        logger.warning(f"[BugReport] identity lookup failed for {user_id}: {e}")
    return None, None


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

    email, effective_role = _lookup_user_identity(user_id)

    record = {
        'user_id': user_id,
        'user_email': email,
        'user_role': effective_role,
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

    screenshot_path = _upload_screenshot(request.files.get('screenshot'), user_id)
    if screenshot_path:
        record['screenshot_path'] = screenshot_path
        record['screenshot_bucket'] = SCREENSHOT_BUCKET

    try:
        repo = BugReportRepository()  # admin client (custom-JWT app)
        created = repo.create(record)
    except Exception as e:
        logger.error(f"[BugReport] create failed for user {user_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to submit bug report'}), 500

    logger.info(f"[BugReport] created {created.get('id')} from user {user_id} route={record.get('current_route')}")
    return jsonify({'success': True, 'report_id': created.get('id')}), 201


@bp.route('', methods=['GET'])
@require_role('superadmin')
def list_bug_reports(user_id):
    """List recent reports for triage (superadmin only)."""
    status = request.args.get('status')
    if status and status not in ALLOWED_STATUSES:
        return jsonify({'error': 'Invalid status filter'}), 400
    try:
        limit = min(int(request.args.get('limit', 50)), 200)
    except (ValueError, TypeError):
        limit = 50

    repo = BugReportRepository(user_id=user_id)
    reports = repo.list_recent(limit=limit, status=status)
    return jsonify({'reports': reports, 'count': len(reports)}), 200


@bp.route('/<report_id>', methods=['GET'])
@require_role('superadmin')
def get_bug_report(user_id, report_id):
    """Get a single report + a signed URL for its screenshot (superadmin only)."""
    repo = BugReportRepository(user_id=user_id)
    report = repo.find_by_id(report_id)
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


@bp.route('/<report_id>', methods=['PATCH'])
@require_role('superadmin')
def update_bug_report(user_id, report_id):
    """Update a report's triage status / notes (superadmin only)."""
    data = request.get_json(silent=True) or {}
    status = data.get('status')
    if status is not None and status not in ALLOWED_STATUSES:
        return jsonify({'error': 'Invalid status'}), 400
    if status is None and 'triage_notes' not in data:
        return jsonify({'error': 'Nothing to update'}), 400

    repo = BugReportRepository(user_id=user_id)
    try:
        updated = repo.update_status(
            report_id,
            status=status or repo.find_by_id(report_id).get('status', 'new'),
            triage_notes=data.get('triage_notes'),
        )
    except Exception as e:
        logger.error(f"[BugReport] update failed for {report_id}: {e}")
        return jsonify({'error': 'Failed to update bug report'}), 500

    return jsonify({'success': True, 'report': updated}), 200
