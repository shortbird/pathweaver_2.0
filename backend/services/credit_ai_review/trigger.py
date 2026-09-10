"""What starts a review, and what stops two of them starting at once.

Three things can queue a review, and all three end at the same claim:

  a student submitting or resubmitting (a background thread, best effort)
  the 10-minute cron sweep (the safety net that catches everything else)
  a superadmin pressing Re-run

The thread is the reason a reviewer usually opens a submission and finds the
review already there instead of waiting up to ten minutes for the cron. It is
deliberately best effort: a web process can be recycled a second after the
response goes out, so nothing may depend on it finishing. The sweep is what makes
the feature reliable; the thread is what makes it feel immediate.

Concurrency is bounded by a semaphore rather than by hope. Each review holds its
evidence bytes in memory and Render gives this process 512MB, so a burst of
submissions must not become a burst of simultaneous multimodal calls.
"""

from __future__ import annotations

import threading
from typing import Any, Dict, List, Optional

from app_config import Config
from utils.logger import get_logger

# admin client justified: credit_ai_reviews is a service-role-only table, and
# everything here runs with no request user -- a cron tick or a daemon thread.
# The rows it touches are its own queue, never a student's record.
from utils.admin_client import admin_client as _admin

from services.credit_ai_review import store

logger = get_logger(__name__)

#: How many reviews this process will run at once. Non-blocking acquire: a
#: worker that cannot get a slot leaves the row queued for the sweep rather than
#: parking a thread until one frees up.
_SLOTS = threading.BoundedSemaphore(max(1, int(Config.CREDIT_AI_REVIEW_MAX_INPROC)))


def enabled() -> bool:
    return bool(Config.CREDIT_AI_REVIEW_ENABLED)


def queue_and_kick(*, round_id: str, completion_id: str,
                   requested_by: Optional[str] = None,
                   force: bool = False,
                   admin=None) -> Optional[Dict[str, Any]]:
    """Queue a review for this round and try to run it now.

    Returns the queued row, or None when the feature is off. Raises
    store.AlreadyRunning only for a forced re-run that collides with a live
    worker -- the caller turns that into a 409 rather than starting a second one.
    """
    if not enabled():
        return None
    admin = admin or _admin()
    row = store.queue_review(admin, round_id=round_id, completion_id=completion_id,
                             requested_by=requested_by, force=force)
    if row and row.get('status') == 'queued' and row.get('id'):
        kick_background([row['id']])
    return row


def kick_background(review_ids: List[str], admin=None) -> bool:
    """Run these reviews on a daemon thread. False if there was no slot.

    False is not a failure. The rows stay queued and the next cron tick picks
    them up; the only thing lost is the few minutes of immediacy.
    """
    ids = [r for r in (review_ids or []) if r]
    if not ids or not enabled():
        return False

    if not _SLOTS.acquire(blocking=False):
        logger.info(f'AI credit review: no worker slot, leaving {len(ids)} queued for the sweep')
        return False

    app = None
    try:
        from flask import current_app
        app = current_app._get_current_object()
    except Exception:  # noqa: BLE001
        # Called from the cron script or a test, outside a request.
        app = None

    thread = threading.Thread(
        target=_run_batch, args=(ids, app), name='credit-ai-review', daemon=True)
    thread.start()
    return True


def _run_batch(review_ids: List[str], app) -> None:
    """Run each review in turn, releasing the slot whatever happens."""
    try:
        if app is not None:
            with app.app_context():
                _run_each(review_ids)
        else:
            _run_each(review_ids)
    finally:
        _SLOTS.release()


def _run_each(review_ids: List[str]) -> None:
    from services.credit_ai_review.service import CreditAIReviewService

    service = CreditAIReviewService()
    for review_id in review_ids:
        try:
            service.run(review_id)
        except Exception as e:  # noqa: BLE001
            # run() handles its own failures; this is the last line of defence,
            # and it must not stop the rest of the batch.
            logger.error(f'AI credit review {str(review_id)[:8]} raised: {e}')


# ── the sweep ────────────────────────────────────────────────────────────────

def sweep(limit: Optional[int] = None, admin=None) -> Dict[str, Any]:
    """One cron tick. Returns immediately; the reviews run on a thread.

    Deliberately does NOT wait for the model. The cron dispatcher gives an
    endpoint 120 seconds and gunicorn kills a worker at the same mark, so a sweep
    that ran even one multimodal review inline would time out and be retried,
    which is how you pay twice for the same review.
    """
    if not enabled():
        return {'disabled': True, 'claimed': 0}

    admin = admin or _admin()
    requeued = store.requeue_stale(admin)
    orphans = queue_orphans(admin)

    limit = limit if limit is not None else int(Config.CREDIT_AI_REVIEW_SWEEP_LIMIT)
    picked = store.next_queued_ids(admin, limit)

    # Picked, not claimed. Each worker claims its own row inside service.run(),
    # which is the one place the queued -> running transition happens. Claiming
    # here as well would mean either releasing the claim before handing it over
    # (a race window for nothing) or two different owners for one row.
    started = kick_background(picked) if picked else False

    return {
        'picked': len(picked),
        'started': started,
        'requeued_stale': requeued,
        'orphans_queued': orphans,
    }


def queue_orphans(admin, limit: int = 200) -> int:
    """Queue reviews for pending submissions that somehow have none.

    The request-time hook can miss: a deploy mid-request, an exception before it
    ran, a row created by a repair script. Without this, those submissions sit in
    the queue forever with no AI review and nothing says why.
    """
    completions = admin.table('quest_task_completions').select('id').in_(
        'diploma_status', list(store.REVIEWABLE_STATUSES)
    ).limit(limit).execute().data or []
    if not completions:
        return 0
    completion_ids = [c['id'] for c in completions]

    rounds = admin.table('diploma_review_rounds').select(
        'id, completion_id, round_number'
    ).in_('completion_id', completion_ids).order('round_number').execute().data or []

    latest: Dict[str, str] = {}
    for r in rounds:
        latest[r['completion_id']] = r['id']
    if not latest:
        return 0

    missing = set(store.missing_for_rounds(admin, list(latest.values())))

    queued = 0
    for completion_id, round_id in latest.items():
        if round_id not in missing:
            continue
        try:
            store.queue_review(admin, round_id=round_id, completion_id=completion_id)
            queued += 1
        except Exception as e:  # noqa: BLE001
            logger.warning(f'Could not queue an orphaned AI credit review: {e}')

    if queued:
        logger.info(f'AI credit review: queued {queued} submission(s) that had none')
    return queued
