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

Consent policy: `deletion_status='pending'` is a request, not standing consent.
An account used after the request was made is rescinded, not erased — see
`_reactivation_signal` for the family this cost. Because the feature was dead
for so long, the first sweeps inherited a backlog of requests made by people
who had long since resumed using their accounts, and nothing tells a user their
old request is still armed.
"""

from datetime import datetime, timedelta, timezone
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

# How long after a deletion request activity still reads as the same sitting.
# Someone who clicks delete and then reads two more pages, or signs back in that
# evening to check it took, has not changed their mind. Someone who signs in a
# week later has. Set wider than a session and far narrower than the 30-day
# grace period, so the signal is "came back", not "finished leaving".
REACTIVATION_GRACE = timedelta(hours=24)


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
                .select('deletion_status, deletion_scheduled_for, deletion_attempts, '
                        'deletion_requested_at, last_active') \
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

        reactivation = _reactivation_signal(client, user_id, state)
        if reactivation:
            _rescind_request(client, user_id, reactivation)
            skipped.append({'user_id': user_id, 'reason': f'in use: {reactivation}'})
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


def _as_utc(value: Any) -> Optional[datetime]:
    """Parse a PostgREST timestamp to an aware UTC datetime, or None."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _reactivation_signal(client, user_id: str, state: Dict[str, Any]) -> Optional[str]:
    """Describe how the account was used after deletion was requested, if it was.

    A pending request is not standing consent to erase. On 2026-08-31 this sweep
    purged an iCreate parent who had asked to delete six minutes after signing up
    on 07-25, then came back: she added two children on 08-06, enrolled them in
    ten Thursday classes and paid on 08-27. The sweep saw only
    `deletion_status='pending'` and took the parent, both children and every
    enrollment with it. The family showed up to class the next Thursday holding
    printed schedules for classes no roster knew about, and with PITR off and
    daily backups already rolled past 08-31 none of it came back. The children
    had to be re-entered from the school's paper file.

    Cancelling is a button the user has no reason to press, because nothing tells
    them a months-old request is still armed. So treat use as the answer: signing
    in more than REACTIVATION_GRACE after the request, or gaining a dependent
    after it. Erasure is the one operation with no undo, and the cost of skipping
    wrongly is a deletion that happens late.

    The grace window matters. Activity in the hours right after the request is
    the same sitting — the confirmation page, an evening check that it took — and
    treating that as a change of heart would cancel the deletion of anyone who
    did not close the tab fast enough, which breaks the promise in the other
    direction. A dependent is exempt from the window: nobody adds a child to an
    account they are still in the middle of abandoning.
    """
    requested = _as_utc(state.get('deletion_requested_at'))
    if not requested:
        return None

    last_active = _as_utc(state.get('last_active'))
    if last_active and last_active > requested + REACTIVATION_GRACE:
        return f'signed in {last_active.isoformat()}'

    # A parent's erasure cascades to their dependents, so a child added after the
    # request is the loudest possible signal that the account is still wanted.
    try:
        recent = client.table('users').select('id') \
            .eq('managed_by_parent_id', user_id) \
            .gt('created_at', requested.isoformat()) \
            .limit(1).execute().data or []
    except Exception as e:  # noqa: BLE001 - a failed check must not authorise erasure
        logger.warning(f"[DELETION_SWEEP] dependent check failed for {user_id}: {e}")
        return 'dependent check failed'
    if recent:
        return 'dependent added after request'

    return None


def _rescind_request(client, user_id: str, reason: str) -> None:
    """Clear a pending deletion the account's own use has overtaken.

    Left `pending`, the row comes back due on every run and each one is another
    chance to erase a live family. Clearing it puts the user back where they
    would be had they pressed Cancel; they can always ask again. The fields
    written match /api/users/cancel-deletion exactly, so both routes out of a
    pending deletion leave the row in one shape.
    """
    try:
        client.table('users').update({
            'deletion_requested_at': None,
            'deletion_status': 'none',
            'deletion_scheduled_for': None,
            'deletion_attempts': 0,
            'deletion_last_attempt_at': None,
            'deletion_last_error': None,
        }).eq('id', user_id).execute()
        logger.warning(f"[DELETION_SWEEP] rescinded pending deletion for {user_id} ({reason})")
    except Exception as e:  # noqa: BLE001
        logger.error(f"[DELETION_SWEEP] could not rescind deletion for {user_id}: {e}")


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
