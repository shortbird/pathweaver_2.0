"""Credit Dashboard - AI review endpoints.

- POST /api/credit-dashboard/items/<completion_id>/ai-review        - re-run for one item
- POST /api/credit-dashboard/internal/ai-review-sweep               - cron entrypoint

Superadmin only, and that is a product decision rather than a technical one. The
AI's verdict, its confidence and its opinion that a student asked for too much XP
are working notes for whoever makes the final call. A partner org admin seeing
"AI recommends approve, 91%" would be reading a recommendation addressed to
somebody else, on a queue they are only the first stage of. The table it lives in
has no policy for them either, so this is enforced twice.
"""

from flask import jsonify, request

from utils.api_response_v1 import error_response, success_response
from utils.auth.decorators import require_role
from utils.logger import get_logger
from middleware.rate_limiter import rate_limit

from . import bp

logger = get_logger(__name__)


@bp.route('/items/<completion_id>/ai-review', methods=['POST'])
@require_role('superadmin')
@rate_limit(max_requests=10, window_seconds=60, per_user=True)
def rerun_ai_review(user_id: str, completion_id: str):
    """Queue a fresh AI review of this submission's current round.

    202 with a queued row is the normal answer: the review runs on a background
    thread and the dashboard polls for it. A 409 means one is genuinely in
    flight, which the UI treats as "already running" rather than an error.
    """
    from services.credit_ai_review import store, trigger

    if not trigger.enabled():
        return error_response(code='AI_REVIEW_DISABLED',
                              message='AI credit review is turned off.', status=503)

    # admin client justified: credit_ai_reviews is service-role only; caller is
    # superadmin by decorator and the write is pinned to one completion.
    from database import get_supabase_admin_client
    admin = get_supabase_admin_client()

    completions = admin.table('quest_task_completions').select(
        'id, diploma_status').eq('id', completion_id).limit(1).execute().data
    if not completions:
        return error_response(code='NOT_FOUND', message='Completion not found', status=404)

    rounds = admin.table('diploma_review_rounds').select('id, round_number').eq(
        'completion_id', completion_id).order('round_number', desc=True).limit(1).execute().data
    # Narrowed, not just truth-tested: a row arrives typed as JSON, so it has to
    # be a mapping before it can be indexed. Same reason as _is_superadmin below.
    latest_round = rounds[0] if rounds else None
    if not isinstance(latest_round, dict):
        return error_response(code='NOT_FOUND',
                              message='This submission has no review round yet.', status=404)

    try:
        row = trigger.queue_and_kick(
            round_id=str(latest_round['id']), completion_id=completion_id,
            requested_by=user_id, force=True, admin=admin)
    except store.AlreadyRunning:
        return error_response(code='AI_REVIEW_RUNNING',
                              message='An AI review of this submission is already running.',
                              status=409)

    logger.info(f'Superadmin {user_id[:8]} re-ran the AI review for {completion_id[:8]}')
    return success_response(data={'ai': serialize_review(row)}, status=202)


@bp.route('/internal/ai-review-sweep', methods=['POST'])
def ai_review_sweep():
    """Cron entrypoint: pick up queued and abandoned reviews.

    Returns before any model call. The cron dispatcher gives an endpoint 120
    seconds and gunicorn kills a worker at the same mark, so a sweep that ran a
    multimodal review inline would time out, be retried, and pay for the same
    review twice.

    Auth via X-Cron-Secret, or a signed-in superadmin for manual triggering --
    the same dual gate as the SIS, CRM and parent-digest sweeps.
    """
    from utils.cron_auth import is_valid_cron_secret

    if not is_valid_cron_secret(request.headers.get('X-Cron-Secret')):
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        if not (uid and _is_superadmin(uid)):
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    from services.credit_ai_review import trigger
    limit = request.args.get('limit', type=int)
    return jsonify({'success': True, **trigger.sweep(limit)})


def _is_superadmin(user_id: str) -> bool:
    """The role lookup IS the access check, so it cannot run under the caller's RLS."""
    try:
        from database import get_supabase_admin_client
        # admin client justified: the role lookup IS the access check for this
        # endpoint, so it cannot be made under the caller's own RLS view -- a
        # non-superadmin reading their own row would decide their own answer.
        rows = get_supabase_admin_client().table('users').select('role').eq(
            'id', user_id).limit(1).execute().data
        # isinstance rather than bool(rows) + rows[0].get: the client types a row
        # as JSON, so .get is only valid once it is narrowed to a mapping. It
        # also fails this check closed on a row that came back the wrong shape,
        # which is the right direction for the predicate that decides superadmin.
        row = rows[0] if rows else None
        return isinstance(row, dict) and row.get('role') == 'superadmin'
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not check superadmin for the AI review sweep: {e}')
        return False


# ── serialization ────────────────────────────────────────────────────────────

def serialize_review(row) -> dict:
    """The shape the dashboard reads. Safe to send to a superadmin.

    Carries no student identity of its own -- the caller already has the student
    on the item -- and no claim token, which is internal bookkeeping.
    """
    if not row:
        return {'status': 'not_run'}
    return {
        'status': row.get('status') or 'not_run',
        'skip_reason': row.get('skip_reason'),
        'review': row.get('review'),
        'model': row.get('model'),
        'prompt_version': row.get('prompt_version'),
        'reviewed_at': row.get('reviewed_at'),
        'error': row.get('error'),
        'attempts': row.get('attempts') or 0,
        'requested_by': row.get('requested_by'),
        'accepted_feedback': row.get('accepted_feedback'),
        'accepted_xp': row.get('accepted_xp'),
    }


def summarize_review(row) -> dict:
    """The one-line version for a queue row: a badge and a number.

    A skipped or failed review still gets a status, because "the AI could not
    read this one" is worth seeing in the list rather than only on the detail.
    """
    if not row:
        return {'ai_status': 'not_run'}
    review = row.get('review') or {}
    xp = review.get('xp') or {}
    return {
        'ai_status': row.get('status') or 'not_run',
        'ai_recommendation': review.get('recommendation'),
        'ai_confidence': review.get('confidence'),
        'ai_xp_recommended': xp.get('recommended') if xp.get('changed') else None,
        'ai_skip_reason': row.get('skip_reason'),
    }
