"""Scheduled account deletion: the executor for the 30-day grace period.

`POST /api/users/delete-account` marked a user `deletion_status='pending'` with
a `deletion_scheduled_for` date 30 days out and told the user their account was
scheduled for deletion. Nothing in the codebase ever read those columns again,
so the deletion never happened — including for parents deleting a child's
account. This is the sweep that keeps the promise, dispatched daily by
jobs/cron_dispatch.py.

The erasure itself (rows, storage objects, auth user) lives in
repositories/user_erasure_repository.py, so this endpoint, the permanent-delete
route and parent-initiated dependent deletion all delete the same things.

Failure policy: an account that fails to erase STAYS `pending` with the error
recorded on the row, so the next run retries it. A half-deleted account is
never marked complete, and a failure is never parked in a terminal status that
nothing re-reads — which is how this feature came to be dead code originally.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app_config import Config
from database import get_supabase_admin_client
from repositories.user_erasure_repository import (  # re-exported for callers
    AccountDeletionError,
    purge_user,
)
from utils.logger import get_logger

logger = get_logger(__name__)

__all__ = ['AccountDeletionError', 'purge_user', 'run_pending_deletion_sweep']


# ---------------------------------------------------------------------------
# The sweep (cron entrypoint)
# ---------------------------------------------------------------------------

def run_pending_deletion_sweep(admin=None, limit: Optional[int] = None,
                               now: Optional[datetime] = None) -> Dict[str, Any]:
    """Erase every account whose 30-day grace period has expired.

    Picks up `deletion_status='pending'` rows whose `deletion_scheduled_for` has
    passed, oldest first, capped at `limit` (default
    `Config.ACCOUNT_DELETION_SWEEP_BATCH`) so one run can't stall on a backlog.
    The cap is well under the PostgREST row limit, so no truncation risk.

    Re-reads each account immediately before erasing it, so a cancellation that
    lands mid-sweep wins. On failure the account stays `pending` with the error
    recorded, and the next run retries it.
    """
    # admin client justified: unattended cron sweep with no signed-in user; reads pending-deletion accounts across all orgs and erases them
    client = admin or get_supabase_admin_client()
    batch = limit or Config.ACCOUNT_DELETION_SWEEP_BATCH
    cutoff = (now or datetime.now(timezone.utc)).isoformat()

    try:
        due = client.table('users').select('id, deletion_scheduled_for, deletion_attempts') \
            .eq('deletion_status', 'pending') \
            .lte('deletion_scheduled_for', cutoff) \
            .order('deletion_scheduled_for') \
            .limit(batch).execute().data or []
    except Exception as e:  # noqa: BLE001
        logger.error(f"[DELETION_SWEEP] could not read due accounts: {e}")
        raise

    deleted, failed, skipped = [], [], []

    for row in due:
        user_id = row['id']

        # Cancellation race: the user may have cancelled between the query and
        # now. Re-read; only 'pending' and still-due accounts are erased.
        try:
            current = client.table('users') \
                .select('deletion_status, deletion_scheduled_for, deletion_attempts') \
                .eq('id', user_id).execute().data
        except Exception as e:  # noqa: BLE001
            failed.append({'user_id': user_id, 'error': f'recheck failed: {e}'})
            continue

        if not current:
            skipped.append({'user_id': user_id, 'reason': 'already gone'})
            continue
        state = current[0]
        if state.get('deletion_status') != 'pending':
            skipped.append({'user_id': user_id, 'reason': f"status={state.get('deletion_status')}"})
            continue
        scheduled = state.get('deletion_scheduled_for')
        if scheduled and scheduled > cutoff:
            skipped.append({'user_id': user_id, 'reason': 'rescheduled'})
            continue

        try:
            purge_user(user_id, admin=client, deletion_type='scheduled')
            deleted.append(user_id)
        except Exception as e:  # noqa: BLE001 - per-account isolation; the sweep continues
            attempts = (state.get('deletion_attempts') or 0) + 1
            _record_failure(client, user_id, attempts, e)
            failed.append({'user_id': user_id, 'attempts': attempts, 'error': str(e)[:300]})

    result = {
        'due': len(due),
        'deleted': len(deleted),
        'failed': len(failed),
        'skipped': len(skipped),
        'failures': failed,
        'skips': skipped,
    }
    if failed:
        logger.error(f"[DELETION_SWEEP] {len(failed)} account(s) could not be deleted: {failed}")
    logger.info(f"[DELETION_SWEEP] due={result['due']} deleted={result['deleted']} "
                f"failed={result['failed']} skipped={result['skipped']}")
    return result


def _record_failure(client, user_id: str, attempts: int, error: Exception) -> None:
    """Mark the attempt on the user row. Status stays 'pending' on purpose: a
    failed erasure must remain in the queue, not be parked in a terminal state
    nothing re-reads (which is how this whole feature broke in the first place).
    """
    try:
        client.table('users').update({
            'deletion_attempts': attempts,
            'deletion_last_attempt_at': datetime.now(timezone.utc).isoformat(),
            'deletion_last_error': str(error)[:1000],
        }).eq('id', user_id).execute()
    except Exception as e:  # noqa: BLE001
        logger.error(f"[DELETION_SWEEP] could not record failure for {user_id}: {e}")
