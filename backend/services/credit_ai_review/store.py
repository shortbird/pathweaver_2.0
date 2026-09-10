"""The credit_ai_reviews row: its lifecycle, and who owns it while it runs.

    queued --claim--> running --+--> complete
                                +--> failed      (out of attempts, or a real bug)
                                +--> skipped     (consent off, nothing readable)
                                +--> queued      (transient; try again next tick)

    running, older than the stale window --sweep--> queued

There is no job queue in this codebase, so the table IS the queue. Two things
arrive within seconds of each other -- the thread a student's submission started
and the cron sweep -- and the claim is what stops both reviewing the same work
and paying for the same multimodal call twice.

This module is the policy: what a claim means, how long abandoned work waits, how
many attempts a review gets before a human should look at it. The queries live in
repositories/credit_ai_review_repository.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from repositories.credit_ai_review_repository import CreditAIReviewRepository
from utils.logger import get_logger
from utils.timestamps import now_iso as _now

logger = get_logger(__name__)

TABLE = 'credit_ai_reviews'

#: Statuses a new run may not stomp on without ``force``.
ACTIVE_STATUSES = ('queued', 'running')

#: Where a completion has to be for a review to be worth running. Superadmins act
#: at both stages, so both are in scope.
REVIEWABLE_STATUSES = ('pending_review', 'pending_org_approval')

#: Three deaths is not bad luck. Past this, stop cycling a review through the
#: sweep and let a human see a failed row.
MAX_ATTEMPTS = 3


class AlreadyRunning(Exception):
    """A review for this round is already queued or in flight."""


def _repo(admin=None) -> CreditAIReviewRepository:
    return CreditAIReviewRepository(client=admin)


def get(admin, review_id: str) -> Optional[Dict[str, Any]]:
    return _repo(admin).get(review_id)


def get_by_round(admin, round_id: str) -> Optional[Dict[str, Any]]:
    return _repo(admin).get_by_round(round_id)


def queue_review(admin, *, round_id: str, completion_id: str,
                 requested_by: Optional[str] = None,
                 force: bool = False,
                 stale_minutes: Optional[int] = None) -> Dict[str, Any]:
    """Put this round's review in the queue and return the row.

    Idempotent for the automatic path: a round that already has a queued or
    running review is left alone, because the submission has not changed. A
    reviewer pressing "Re-run" passes ``force``, which resets a finished row --
    and a genuinely stuck one, since a 'running' row past the stale window is not
    running at all.

    Raises AlreadyRunning when a forced re-run collides with a live worker.
    Letting it through would leave two workers racing for one row's claim, which
    is the one thing the claim exists to prevent.
    """
    repo = _repo(admin)
    existing = repo.get_by_round(round_id)
    if existing:
        status = existing.get('status')
        if status in ACTIVE_STATUSES and not force:
            return existing
        if status == 'running' and force and not _is_stale(existing, stale_minutes):
            raise AlreadyRunning(f'A review of round {round_id} is already running')
        # Reset for another go. attempts starts over: a human asking again is not
        # the same as an automatic retry, and should get the full budget.
        update = {
            'status': 'queued',
            'attempts': 0,
            'claim_token': None,
            'started_at': None,
            'error': None,
            'skip_reason': None,
            'requested_by': requested_by,
        }
        return repo.update(existing['id'], update) or {**existing, **update}

    return repo.create({
        'round_id': round_id,
        'completion_id': completion_id,
        'status': 'queued',
        'requested_by': requested_by,
    })


def claim(admin, review_id: str) -> Optional[str]:
    """Take ownership of a queued review. Returns the claim token, or None.

    None means somebody else got there first. That is an ordinary outcome, not an
    error: the caller simply has nothing to do.
    """
    token = str(uuid.uuid4())
    return token if _repo(admin).claim(review_id, token, _now()) else None


def next_queued_ids(admin, limit: int) -> List[str]:
    """The oldest queued reviews. Reads only -- the claim happens in the worker.

    Deliberately not a claim. One row has one owner and the claim is what
    establishes it, so taking one here and handing it to a thread would mean
    either two owners or releasing it again before the worker starts.
    """
    return _repo(admin).queued_ids(limit)


def _is_stale(row: Dict[str, Any], stale_minutes: Optional[int] = None) -> bool:
    from app_config import Config
    minutes = stale_minutes if stale_minutes is not None else Config.CREDIT_AI_REVIEW_STALE_MINUTES
    started = row.get('started_at')
    if not started:
        return True
    try:
        when = datetime.fromisoformat(str(started).replace('Z', '+00:00'))
    except (TypeError, ValueError):
        return True
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when < datetime.now(timezone.utc) - timedelta(minutes=minutes)


def requeue_stale(admin, *, stale_minutes: Optional[int] = None) -> int:
    """Return abandoned 'running' rows to the queue. Returns how many.

    A worker does not get to say it died. A web process restarted by a deploy, an
    OOM kill, a dyno recycled mid-review -- each leaves a row claiming to be
    running forever, and the submission behind it never gets read.
    """
    from app_config import Config
    minutes = stale_minutes if stale_minutes is not None else Config.CREDIT_AI_REVIEW_STALE_MINUTES
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()

    repo = _repo(admin)
    requeued = 0
    for row in repo.running_since_before(cutoff):
        attempts = int(row.get('attempts') or 0) + 1
        if attempts >= MAX_ATTEMPTS:
            repo.release_if_running(row['id'], {
                'status': 'failed',
                'attempts': attempts,
                'claim_token': None,
                'error': 'Abandoned mid-review too many times.',
                'reviewed_at': _now(),
            })
        else:
            repo.release_if_running(row['id'], {
                'status': 'queued',
                'attempts': attempts,
                'claim_token': None,
                'started_at': None,
            })
        requeued += 1

    if requeued:
        logger.warning(f'Requeued {requeued} abandoned AI credit review(s)')
    return requeued


def _finish(admin, review_id: str, token: str, update: Dict[str, Any]) -> bool:
    """Write a terminal state, but only if we still hold the claim."""
    if _repo(admin).finish(review_id, token, update):
        return True
    logger.warning(
        f'AI credit review {str(review_id)[:8]} was re-claimed while running; '
        'discarding the result from this worker'
    )
    return False


def store_complete(admin, review_id: str, token: str, *, review: Dict[str, Any],
                   model: str, prompt_version: str,
                   usage: Optional[Dict[str, Any]] = None) -> bool:
    return _finish(admin, review_id, token, {
        'status': 'complete',
        'review': review,
        'model': model,
        'prompt_version': prompt_version,
        'usage': usage or {},
        'error': None,
        'skip_reason': None,
        'claim_token': None,
        'reviewed_at': _now(),
    })


def store_failure(admin, review_id: str, token: str, *, error: str,
                  retryable: bool, attempts: int) -> bool:
    """Record a failure. A retryable one goes back in the queue if budget remains.

    The error text is kept either way. A row that has been retried twice and is
    about to be marked failed should still say what kept going wrong.
    """
    if retryable and attempts < MAX_ATTEMPTS:
        return _finish(admin, review_id, token, {
            'status': 'queued',
            'attempts': attempts,
            'claim_token': None,
            'started_at': None,
            'error': (error or 'AI review failed')[:500],
        })
    return _finish(admin, review_id, token, {
        'status': 'failed',
        'attempts': attempts,
        'claim_token': None,
        'error': (error or 'AI review failed')[:500],
        'reviewed_at': _now(),
    })


def store_skipped(admin, review_id: str, token: str, *, reason: str,
                  detail: Optional[str] = None,
                  review: Optional[Dict[str, Any]] = None) -> bool:
    """Record that there was nothing to do, and why.

    Skipped is not failed. AI switched off for this student, no readable
    evidence, a completion that stopped being pending while we queued -- none of
    those are defects, and a reviewer seeing "failed" for any of them would go
    looking for a bug that is not there.
    """
    return _finish(admin, review_id, token, {
        'status': 'skipped',
        'skip_reason': reason,
        'error': (detail or None) and detail[:500],
        'review': review,
        'claim_token': None,
        'reviewed_at': _now(),
    })


def mark_reviewer_outcome(admin, *, round_id: str,
                          accepted_feedback: Optional[str] = None,
                          accepted_xp: Optional[bool] = None) -> None:
    """Record what the human actually took from the draft.

    Whether the reviewer used the feedback and accepted the XP figure is the only
    honest measure of whether this feature earns its cost. Best-effort: a failure
    here must never break an approval that has already happened.
    """
    update: Dict[str, Any] = {}
    if accepted_feedback is not None:
        update['accepted_feedback'] = accepted_feedback
    if accepted_xp is not None:
        update['accepted_xp'] = bool(accepted_xp)
    if not update:
        return
    try:
        _repo(admin).set_outcome_for_round(round_id, update)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not record reviewer outcome for round {round_id}: {e}')


def latest_for_completions(admin, completion_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """The newest review per completion, keyed by completion id.

    A resubmitted task has one row per round; the dashboard wants the current one.
    """
    ids = [c for c in (completion_ids or []) if c]
    if not ids:
        return {}
    latest: Dict[str, Dict[str, Any]] = {}
    for row in _repo(admin).for_completions(ids):
        latest[row['completion_id']] = row
    return latest


def by_round_ids(admin, round_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Reviews keyed by round id, for showing a verdict against each round."""
    ids = [r for r in (round_ids or []) if r]
    if not ids:
        return {}
    return {row['round_id']: row for row in _repo(admin).for_rounds(ids)}


def latest_verdicts(admin) -> Dict[str, Dict[str, Any]]:
    """Every completion's current AI verdict, for the dashboard's AI filter."""
    latest: Dict[str, Dict[str, Any]] = {}
    for row in sorted(_repo(admin).all_verdicts(), key=lambda r: r.get('created_at') or ''):
        latest[row['completion_id']] = row
    return latest


def missing_for_rounds(admin, round_ids: List[str]) -> List[str]:
    """Which of these rounds have no review row at all."""
    have = set(_repo(admin).existing_round_ids(round_ids))
    return [r for r in round_ids if r not in have]
