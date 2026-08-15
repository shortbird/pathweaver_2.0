"""Retention purge for AI tutor conversation history.

Scope, deliberately narrow
--------------------------
The platform had no retention machinery at all: AI tutor transcripts, evidence,
and the records of students detached from a deleted organization all persist
forever. This module purges exactly ONE category — **AI tutor conversation
history** — because it is the only category that is clearly not an education
record. Evidence, task completions, XP, transcripts and enrollment history are
student work and school records; a school may be legally required to retain
them, and deleting them on a timer would be worse than keeping them. Anything
ambiguous is reported, never deleted.

Off by default
--------------
`Config.TUTOR_RETENTION_ENABLED` defaults to **false**, so deploying this cannot
silently delete a customer's data. With it off the sweep still runs and reports
how many conversations *would* be purged at the configured window — which is the
number to look at before turning it on.

What is kept
------------
`tutor_safety_reports.conversation_id` is `ON DELETE SET NULL`, so safety flags
raised on a purged conversation survive as standalone records. That is
intentional: a child-safety report should outlive the chat that triggered it.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app_config import Config
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

_DAYS_PER_MONTH = 30  # retention windows are coarse by design; no calendar math


def retention_cutoff(now: Optional[datetime] = None) -> datetime:
    """Timestamp before which tutor conversations are eligible for purge."""
    now = now or datetime.now(timezone.utc)
    return now - timedelta(days=Config.TUTOR_RETENTION_MONTHS * _DAYS_PER_MONTH)


def run_tutor_retention_sweep(admin=None, now: Optional[datetime] = None,
                              limit: Optional[int] = None) -> Dict[str, Any]:
    """Purge (or, when disabled, just count) tutor conversations past the window.

    Deleting a `tutor_conversations` row cascades its `tutor_messages`, which is
    where the actual transcript lives. Conversations are selected by
    `last_message_at`, falling back to `created_at` for rows that never got a
    reply, so an active long-running conversation is never purged mid-use.

    Returns a report dict; `enabled: False` means nothing was deleted.
    """
    # admin client justified: unattended cron sweep with no signed-in user; ages out tutor conversations platform-wide
    client = admin or get_supabase_admin_client()
    cutoff = retention_cutoff(now).isoformat()
    batch = limit or Config.TUTOR_RETENTION_BATCH

    # Counted in Postgres (count='exact'), never by tallying fetched rows —
    # PostgREST truncates at 1000 and would under-report silently.
    try:
        eligible = client.table('tutor_conversations').select('id', count='exact') \
            .lt('last_message_at', cutoff).limit(1).execute().count or 0
    except Exception as e:  # noqa: BLE001
        logger.error(f"[RETENTION] could not count eligible conversations: {e}")
        raise

    # Conversations with no `last_message_at` cannot be aged and are left alone
    # rather than guessed at — reported so the gap is visible, not silent.
    try:
        undated = client.table('tutor_conversations').select('id', count='exact') \
            .is_('last_message_at', 'null').limit(1).execute().count or 0
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[RETENTION] could not count undated conversations: {e}")
        undated = None

    report: Dict[str, Any] = {
        'enabled': Config.TUTOR_RETENTION_ENABLED,
        'retention_months': Config.TUTOR_RETENTION_MONTHS,
        'cutoff': cutoff,
        'eligible': eligible,
        'skipped_no_timestamp': undated,
        'purged': 0,
    }

    if not Config.TUTOR_RETENTION_ENABLED:
        logger.info(f"[RETENTION] disabled; {eligible} tutor conversation(s) would be "
                    f"purged at a {Config.TUTOR_RETENTION_MONTHS}-month window")
        return report

    # Delete in bounded batches so one run can't hold a huge transaction open.
    try:
        stale = client.table('tutor_conversations').select('id') \
            .lt('last_message_at', cutoff).order('last_message_at') \
            .limit(batch).execute().data or []
    except Exception as e:  # noqa: BLE001
        logger.error(f"[RETENTION] could not read stale conversations: {e}")
        raise

    if not stale:
        return report

    ids = [row['id'] for row in stale]
    try:
        result = client.table('tutor_conversations').delete().in_('id', ids).execute()
        report['purged'] = len(result.data) if result.data else 0
    except Exception as e:  # noqa: BLE001
        logger.error(f"[RETENTION] purge failed: {e}")
        raise

    report['remaining'] = max(0, eligible - report['purged'])
    logger.info(f"[RETENTION] purged {report['purged']} tutor conversation(s) older than "
                f"{Config.TUTOR_RETENTION_MONTHS} months (cutoff {cutoff}); "
                f"{report['remaining']} still eligible")
    return report
