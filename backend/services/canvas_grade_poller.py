"""
Canvas grade polling.

Per locked product decision: Canvas grade is the source of truth for XP in
LTI quests. AGS is one-way (tool → platform), so to know what grade the
teacher recorded we have to poll Canvas's AGS Results endpoint.

Phase 1 scope (this module):
    * Poll the AGS Results endpoint for completed LTI quests.
    * Cache the latest score / scoreMaximum / gradingProgress on
      `user_quests.lti_canvas_*` columns.
    * Do NOT yet act on the polled state (no automatic XP revocation, no
      automatic reopen). That's a follow-up once we've watched real
      classroom behavior for a few weeks.

Future (deferred):
    * If teacher returns work (gradingProgress=Pending or score=0):
      auto-flip user_quests.is_active=true to invite revision.
    * If score is below the quest's xp_threshold equivalent: revoke XP.

Usage:
    poll_recent_completed(limit=20, max_age_hours=1)
        # Polls completed LTI quests last polled >1h ago.
    fetch_grade_for_user_quest(user_quest_id)
        # One-shot — useful for manual admin trigger.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from services.lti_service import (
    LtiError,
    LtiRegistration,
    get_ags_results,
)
from utils.logger import get_logger

logger = get_logger(__name__)


def _registration_for_quest(quest_id: str) -> Optional[LtiRegistration]:
    # admin client justified: poller runs from a worker / admin trigger with no per-user session; cross-user reads of quests + lti_registrations
    supabase = get_supabase_admin_client()
    quest = (
        supabase.table("quests")
        .select("lti_registration_id")
        .eq("id", quest_id)
        .limit(1)
        .execute()
    )
    if not quest.data:
        return None
    reg_id = quest.data[0].get("lti_registration_id")
    if not reg_id:
        return None
    reg_row = (
        supabase.table("lti_registrations")
        .select("*")
        .eq("id", reg_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not reg_row.data:
        return None
    return LtiRegistration.from_row(reg_row.data[0])


def _canvas_user_id_for(user_id: str) -> Optional[str]:
    # admin client justified: poller runs from a worker; reads lms_integrations across users to map Optio user → Canvas sub
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


def fetch_grade_for_user_quest(user_quest_id: str) -> Dict[str, Any]:
    """Fetch the current AGS result for a single user_quest row + persist it.

    Returns a small dict describing what happened: {found, score, max,
    grading_progress, polled_at, error?}.
    """
    # admin client justified: poller writes user_quests.lti_canvas_* across users (no per-caller session)
    supabase = get_supabase_admin_client()
    uq_row = (
        supabase.table("user_quests")
        .select("id, user_id, quest_id")
        .eq("id", user_quest_id)
        .limit(1)
        .execute()
    )
    if not uq_row.data:
        return {"found": False, "error": "user_quest not found"}
    uq = uq_row.data[0]

    quest = (
        supabase.table("quests")
        .select("lti_ags_lineitem_url, lms_platform")
        .eq("id", uq["quest_id"])
        .limit(1)
        .execute()
    )
    if not quest.data or quest.data[0].get("lms_platform") != "canvas":
        return {"found": False, "error": "not a canvas quest"}
    line_item_url = quest.data[0].get("lti_ags_lineitem_url")
    if not line_item_url:
        return {"found": False, "error": "no AGS lineitem url on quest"}

    registration = _registration_for_quest(uq["quest_id"])
    if not registration:
        return {"found": False, "error": "registration missing or inactive"}

    canvas_user_id = _canvas_user_id_for(uq["user_id"])
    if not canvas_user_id:
        return {"found": False, "error": "canvas user mapping missing"}

    try:
        results = get_ags_results(registration, line_item_url, user_sub=canvas_user_id)
    except LtiError as e:
        logger.warning(f"[grade poll] AGS results fetch failed for uq={user_quest_id}: {e}")
        # Still bump polled_at so we don't busy-loop on a permanently-broken row.
        _stamp_polled(user_quest_id)
        return {"found": False, "error": str(e)}

    polled_at = datetime.now(timezone.utc).isoformat()

    if not results:
        # Teacher hasn't graded yet. Stamp polled_at, leave score columns null.
        supabase.table("user_quests").update({
            "lti_canvas_polled_at": polled_at,
        }).eq("id", user_quest_id).execute()
        return {"found": False, "polled_at": polled_at}

    # Per AGS, when filtered by user_id we get at most one result row.
    result = results[0]
    score = result.get("resultScore")
    score_max = result.get("resultMaximum")
    # Note: AGS Results don't carry gradingProgress (that lives only on the
    # Score POST). Some platforms include a Canvas-extension field; if not
    # present we leave grading_progress null and infer state from score.
    grading_progress = result.get("gradingProgress") or result.get(
        "https://canvas.instructure.com/lti/grading_progress"
    )

    update_payload = {
        "lti_canvas_score": float(score) if score is not None else None,
        "lti_canvas_score_max": float(score_max) if score_max is not None else None,
        "lti_canvas_grading_progress": grading_progress,
        "lti_canvas_polled_at": polled_at,
    }
    supabase.table("user_quests").update(update_payload).eq("id", user_quest_id).execute()

    logger.info(
        f"[grade poll] uq={user_quest_id[:8]} score={score}/{score_max} "
        f"grading={grading_progress}"
    )
    return {
        "found": True,
        "score": score,
        "max": score_max,
        "grading_progress": grading_progress,
        "polled_at": polled_at,
    }


def _stamp_polled(user_quest_id: str) -> None:
    # admin client justified: poller writes user_quests.lti_canvas_polled_at across users (no per-caller session)
    supabase = get_supabase_admin_client()
    supabase.table("user_quests").update({
        "lti_canvas_polled_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_quest_id).execute()


def poll_recent_completed(
    limit: int = 25,
    max_age_hours: int = 1,
) -> Dict[str, int]:
    """Poll AGS results for completed LTI quests not polled recently.

    Strategy: pull `limit` user_quests where:
      - the quest is canvas-platform with a captured lineitem URL
      - the enrollment is completed (completed_at is not null)
      - lti_canvas_polled_at is null OR older than `max_age_hours` ago

    Returns a tally: {polled: N, found: N, not_found: N, errored: N}.
    """
    # admin client justified: poller scans all completed LTI user_quests across users; cross-tenant by design
    supabase = get_supabase_admin_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=max_age_hours)).isoformat()

    # Two queries (Supabase JS doesn't support OR-with-IS-NULL ergonomically
    # via the python client, so split):
    # a) never polled
    # b) polled before cutoff
    base_select = "id, user_id, quest_id, completed_at, lti_canvas_polled_at, quests!inner(lms_platform, lti_ags_lineitem_url)"
    a = (
        supabase.table("user_quests")
        .select(base_select)
        .eq("quests.lms_platform", "canvas")
        .not_.is_("quests.lti_ags_lineitem_url", "null")
        .not_.is_("completed_at", "null")
        .is_("lti_canvas_polled_at", "null")
        .limit(limit)
        .execute()
    )
    b_remaining = max(0, limit - len(a.data or []))
    b_data: List[Dict[str, Any]] = []
    if b_remaining:
        b = (
            supabase.table("user_quests")
            .select(base_select)
            .eq("quests.lms_platform", "canvas")
            .not_.is_("quests.lti_ags_lineitem_url", "null")
            .not_.is_("completed_at", "null")
            .lt("lti_canvas_polled_at", cutoff)
            .order("lti_canvas_polled_at")
            .limit(b_remaining)
            .execute()
        )
        b_data = b.data or []

    rows = (a.data or []) + b_data

    tally = {"polled": 0, "found": 0, "not_found": 0, "errored": 0}
    for row in rows:
        result = fetch_grade_for_user_quest(row["id"])
        tally["polled"] += 1
        if result.get("error"):
            tally["errored"] += 1
        elif result.get("found"):
            tally["found"] += 1
        else:
            tally["not_found"] += 1

    return tally
