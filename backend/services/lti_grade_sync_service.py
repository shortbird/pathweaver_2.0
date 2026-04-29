"""
LTI grade-sync service.

When a Canvas-launched quest completes, we want a Score (and the artifact
URL) posted back to the Canvas gradebook so the teacher grades inside
SpeedGrader. The implementation has two pieces:

1. `enqueue_for_quest_completion(user_id, quest_id)` is called from
   `atomic_quest_service.check_and_complete_quest_atomically` once a quest
   is successfully marked complete. It only inserts a row when the quest
   is `lms_platform='canvas'` and has a captured AGS line item URL — for
   any other quest it's a no-op so we don't pollute the queue.

2. `process_pending(limit=N)` drains the queue. v1 calls this inline from
   `enqueue_for_quest_completion` so the user gets immediate feedback in
   Canvas — failures stay in the queue for a future retry. A future cron
   job can call this directly without touching the completion path.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app_config import Config
from database import get_supabase_admin_client
from services.lti_service import (
    LtiError,
    LtiRegistration,
    post_ags_score,
)
from utils.logger import get_logger

logger = get_logger(__name__)

MAX_SYNC_ATTEMPTS = 5


def _evidence_url_for_quest(user_id: str, quest_id: str) -> Optional[str]:
    """Build a public, time-stable URL for the user's quest evidence so the
    Canvas SpeedGrader can render it. We reuse the existing public portfolio
    page rather than minting a separate share link — it already handles
    block-based evidence rendering and is publicly viewable."""
    base = Config.FRONTEND_URL.rstrip("/")
    # Existing public route lives at /portfolio/<user_id>?quest=<quest_id>.
    return f"{base}/portfolio/{user_id}?quest={quest_id}"


def enqueue_for_quest_completion(user_id: str, quest_id: str) -> None:
    """Insert a pending lms_grade_sync row if this is a Canvas LTI quest."""
    # admin client justified: grade sync runs from a worker / completion hook with no per-user session; cross-user reads of quests + lms_grade_sync + lms_integrations
    supabase = get_supabase_admin_client()
    quest = (
        supabase.table("quests")
        .select("id, lms_platform, lti_ags_lineitem_url, lti_registration_id")
        .eq("id", quest_id)
        .limit(1)
        .execute()
    )
    if not quest.data:
        return
    quest_row = quest.data[0]
    if quest_row.get("lms_platform") != "canvas":
        return
    line_item_url = quest_row.get("lti_ags_lineitem_url")
    if not line_item_url:
        logger.info(
            f"[LTI grade sync] Quest {quest_id} has no AGS lineitem url yet; "
            "score will sync on the student's next launch."
        )
        return

    # Avoid duplicates — one pending row per (user, quest).
    existing = (
        supabase.table("lms_grade_sync")
        .select("id, sync_status")
        .eq("user_id", user_id)
        .eq("quest_id", quest_id)
        .eq("lms_platform", "canvas")
        .execute()
    )
    if existing.data:
        logger.debug(
            f"[LTI grade sync] Sync row already exists for user={user_id} quest={quest_id}"
        )
        return

    supabase.table("lms_grade_sync").insert(
        {
            "user_id": user_id,
            "quest_id": quest_id,
            "lms_platform": "canvas",
            "lms_assignment_id": quest_id,  # we use Optio quest id as the linkage
            "score": 100,
            "max_score": 100,
            "sync_status": "pending",
        }
    ).execute()
    logger.info(f"[LTI grade sync] Enqueued sync for user={user_id} quest={quest_id}")

    # Inline-process for v1 — single attempt; failures stay pending.
    try:
        process_pending(limit=1, only_user=user_id, only_quest=quest_id)
    except Exception as e:
        logger.warning(f"[LTI grade sync] Inline process failed (will retry): {e}")


def _load_registration(reg_id: str) -> Optional[LtiRegistration]:
    # admin client justified: grade sync runs from a worker / completion hook with no per-user session; cross-user reads of quests + lms_grade_sync + lms_integrations
    supabase = get_supabase_admin_client()
    row = (
        supabase.table("lti_registrations")
        .select("*")
        .eq("id", reg_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not row.data:
        return None
    return LtiRegistration.from_row(row.data[0])


def _canvas_user_id_for(user_id: str) -> Optional[str]:
    """Look up the Canvas-side user id from `lms_integrations`."""
    # admin client justified: grade sync runs from a worker / completion hook with no per-user session; cross-user reads of quests + lms_grade_sync + lms_integrations
    supabase = get_supabase_admin_client()
    row = (
        supabase.table("lms_integrations")
        .select("lms_user_id")
        .eq("user_id", user_id)
        .eq("lms_platform", "canvas")
        .limit(1)
        .execute()
    )
    if not row.data:
        return None
    return row.data[0]["lms_user_id"]


def process_pending(
    limit: int = 25,
    only_user: Optional[str] = None,
    only_quest: Optional[str] = None,
) -> Dict[str, int]:
    """Process pending Canvas grade-sync rows. Returns a tally of outcomes."""
    # admin client justified: grade sync runs from a worker / completion hook with no per-user session; cross-user reads of quests + lms_grade_sync + lms_integrations
    supabase = get_supabase_admin_client()
    query = (
        supabase.table("lms_grade_sync")
        .select("*")
        .eq("lms_platform", "canvas")
        .eq("sync_status", "pending")
        .lt("sync_attempts", MAX_SYNC_ATTEMPTS)
        .order("created_at")
        .limit(limit)
    )
    if only_user:
        query = query.eq("user_id", only_user)
    if only_quest:
        query = query.eq("quest_id", only_quest)
    rows = query.execute().data or []

    results = {"completed": 0, "failed": 0, "skipped": 0}

    for row in rows:
        result = _process_row(row)
        results[result] += 1

    return results


def _process_row(row: Dict[str, Any]) -> str:
    # admin client justified: grade sync runs from a worker / completion hook with no per-user session; cross-user reads of quests + lms_grade_sync + lms_integrations
    supabase = get_supabase_admin_client()
    sync_id = row["id"]
    user_id = row["user_id"]
    quest_id = row["quest_id"]

    # Load quest + registration
    quest = (
        supabase.table("quests")
        .select("lti_ags_lineitem_url, lti_registration_id")
        .eq("id", quest_id)
        .limit(1)
        .execute()
    )
    if not quest.data:
        _mark_failed(sync_id, row, "quest not found")
        return "failed"
    quest_row = quest.data[0]
    line_item_url = quest_row.get("lti_ags_lineitem_url")
    registration_id = quest_row.get("lti_registration_id")
    if not line_item_url or not registration_id:
        return "skipped"

    registration = _load_registration(registration_id)
    if not registration:
        _mark_failed(sync_id, row, "registration inactive or missing")
        return "failed"

    canvas_user_id = _canvas_user_id_for(user_id)
    if not canvas_user_id:
        _mark_failed(sync_id, row, "canvas user mapping missing")
        return "failed"

    submission_url = _evidence_url_for_quest(user_id, quest_id)

    try:
        response = post_ags_score(
            registration=registration,
            line_item_url=line_item_url,
            user_sub=canvas_user_id,
            score_given=float(row.get("score", 100)),
            score_maximum=float(row.get("max_score", 100)),
            submission_url=submission_url,
        )
    except LtiError as e:
        _mark_failed(sync_id, row, str(e))
        return "failed"

    if not response.ok:
        _mark_failed(sync_id, row, f"AGS responded {response.status_code}")
        return "failed"

    supabase.table("lms_grade_sync").update(
        {
            "sync_status": "completed",
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "last_attempt_at": datetime.now(timezone.utc).isoformat(),
            "sync_attempts": row.get("sync_attempts", 0) + 1,
        }
    ).eq("id", sync_id).execute()
    logger.info(
        f"[LTI grade sync] Posted score for user={user_id} quest={quest_id}"
    )
    return "completed"


def _mark_failed(sync_id: str, row: Dict[str, Any], reason: str) -> None:
    attempts = row.get("sync_attempts", 0) + 1
    new_status = "failed" if attempts >= MAX_SYNC_ATTEMPTS else "pending"
    # admin client justified: grade sync runs from a worker / completion hook with no per-user session; cross-user reads of quests + lms_grade_sync + lms_integrations
    supabase = get_supabase_admin_client()
    supabase.table("lms_grade_sync").update(
        {
            "sync_status": new_status,
            "sync_attempts": attempts,
            "last_attempt_at": datetime.now(timezone.utc).isoformat(),
            "error_message": reason[:500],
        }
    ).eq("id", sync_id).execute()
    logger.warning(
        f"[LTI grade sync] Sync row {sync_id} failed (attempt {attempts}): {reason}"
    )
