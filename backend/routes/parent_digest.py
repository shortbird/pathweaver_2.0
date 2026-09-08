"""Weekly parent digest: the cron trigger, and the unsubscribe a parent can use.

Public (the signed token is the whole authorization — services/parent_digest_links):
  GET  /api/parent-digest/unsubscribe?token=   minimal HTML confirm page
  POST /api/parent-digest/unsubscribe          performs it, and is the RFC 8058
                                               one-click target

Internal (X-Cron-Secret, or a signed-in superadmin for manual triggering):
  POST /api/parent-digest/internal/sweep
       ?dry_run=1   build every digest and return it, sending nothing
       ?force=1     ignore the school's day/hour window (still sends once a week)
       ?organization_id=<uuid>   restrict to one school

The sweep lives under this prefix rather than /api/sis/internal, following the
CRM sweeps: it is a platform job with a cron secret, not a SIS surface a module
switch should be able to turn off half way.

The dry run exists because nobody should be asked to switch on an email to 300
families sight unseen. It is the same code path as a real send, minus the send.
"""

from flask import Blueprint, jsonify, request
from markupsafe import escape

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from repositories.parent_digest_repository import ParentDigestRepository
from services import parent_digest_links
from services import parent_weekly_digest_service as digest
from utils.logger import get_logger
from utils.validation import validate_uuid

logger = get_logger(__name__)

bp = Blueprint('parent_digest', __name__, url_prefix='/api/parent-digest')

_PAGE = """<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Optio</title></head>
<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f9fafb;
margin:0;padding:48px 16px;text-align:center;color:#111827;">
<div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;
border-radius:12px;padding:32px;">{body}</div></body></html>"""


def _repo() -> ParentDigestRepository:
    # admin client justified: the unsubscribe has no session (the signed token is
    #   the authorization) and the sweep runs from cron; both write/read rows no
    #   caller could reach under RLS.
    return ParentDigestRepository(client=get_supabase_admin_client())


@bp.route('/unsubscribe', methods=['GET'])
@rate_limit(max_requests=30, window_seconds=3600)
def unsubscribe_confirm():
    """Confirm page. GET never mutates — mail scanners prefetch every link in a
    message, and a GET that unsubscribed would opt families out silently."""
    token = (request.args.get('token') or '').strip()
    if not parent_digest_links.user_id_from_token(token):
        return _PAGE.format(body='<p>This link is not valid.</p>'), 404
    return _PAGE.format(body=(
        '<h2 style="margin:0 0 12px;">Stop the weekly digest?</h2>'
        '<p style="color:#6b7280;">You will still receive messages your school '
        'sends you directly.</p>'
        '<form method="POST" action="/api/parent-digest/unsubscribe">'
        f'<input type="hidden" name="token" value="{escape(token)}">'
        '<button type="submit" style="margin-top:16px;padding:12px 28px;border:0;'
        'border-radius:8px;background:linear-gradient(90deg,#6D469B,#EF597B);'
        'color:#fff;font-size:15px;cursor:pointer;">Stop these emails</button></form>'
    ))


@bp.route('/unsubscribe', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=3600)
def unsubscribe_perform():
    """Turns the digest off for the user the token names.

    Serves both the confirm-page form and the one-click POST a mail client makes
    from the List-Unsubscribe-Post header, which carries no session at all.
    """
    token = (request.args.get('token') or request.form.get('token')
             or (request.get_json(silent=True) or {}).get('token') or '').strip()
    user_id = parent_digest_links.user_id_from_token(token)
    if not user_id:
        return _PAGE.format(body='<p>This link is not valid.</p>'), 404
    try:
        _repo().set_preference(user_id, digest.NOTIFICATION_TYPE, False)
    except Exception as e:  # noqa: BLE001 — tell the parent the truth if it failed
        logger.error(f'digest unsubscribe failed for {user_id[:8]}: {e}')
        return _PAGE.format(body=(
            '<p>Something went wrong. Please reply to the email and we will '
            'take you off the list.</p>')), 500
    return _PAGE.format(body=(
        '<h2 style="margin:0 0 12px;">Done</h2>'
        '<p style="color:#6b7280;">You will not receive the weekly digest again. '
        'Messages your school sends you directly are unaffected.</p>'
    ))


@bp.route('/internal/sweep', methods=['POST'])
def digest_sweep():
    """Cron entrypoint: send each opted-in school's weekly parent digest.

    Auth via X-Cron-Secret, or a signed-in superadmin for manual triggering —
    the same dual gate as the SIS and CRM sweeps.
    """
    from utils.cron_auth import is_valid_cron_secret
    if not is_valid_cron_secret(request.headers.get('X-Cron-Secret')):
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        # The role lookup IS the access check, so it cannot be made under the
        # caller's own RLS view.
        if not (uid and _repo().role_of(uid) == 'superadmin'):
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    def _flag(name):
        return (request.args.get(name) or '').lower() in ('1', 'true', 'yes')

    org_id = (request.args.get('organization_id') or '').strip() or None
    if org_id:
        ok, _ = validate_uuid(org_id)
        if not ok:
            return jsonify({'success': False, 'error': 'Invalid organization_id'}), 400

    return jsonify({'success': True, **digest.run_sweep(
        org_id=org_id, force=_flag('force'), dry_run=_flag('dry_run'))})
