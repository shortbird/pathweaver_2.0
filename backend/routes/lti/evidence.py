"""
Quest-scoped evidence for the Canvas SpeedGrader teacher view.

The grading teacher opens this unauthenticated (no Optio session in the
SpeedGrader iframe). Authorization is the signed evidence token minted by
grade-sync — the (user, quest) pair is read from the token itself, never
from a query param, so a teacher can only ever see the exact submission
Canvas linked.

Returns ONLY that one quest's tasks + non-private evidence blocks + earned
XP — not the student's whole portfolio (the previous behaviour, which
reused the full DiplomaPage).
"""

from __future__ import annotations

from typing import Any, Dict, List

from flask import jsonify, request

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from routes.lti import bp
from services.lti_service import decode_evidence_token
from utils.logger import get_logger

logger = get_logger(__name__)


@bp.route("/evidence", methods=["GET"])
@rate_limit(limit=60, per=60)
def lti_quest_evidence():
    """GET /lti/evidence?lti_token=<token> — quest-scoped evidence."""
    token = request.args.get("lti_token", "")
    claims = decode_evidence_token(token)
    if not claims:
        # Same opaque message for missing/invalid/expired — don't leak which.
        return jsonify({"error": "Invalid or missing evidence token"}), 401

    user_id = claims["uid"]
    quest_id = claims["qid"]

    # admin client justified: SpeedGrader is unauthenticated — the signed
    # token is the auth surface; cross-user reads of the student's quest
    # tasks/evidence are exactly the intended (token-scoped) access.
    supabase = get_supabase_admin_client()

    student = (
        supabase.table("users")
        .select("first_name, last_name, display_name")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not student.data:
        return jsonify({"error": "Student not found"}), 404
    student_row = student.data[0]

    quest = (
        supabase.table("quests")
        .select("id, title")
        .eq("id", quest_id)
        .limit(1)
        .execute()
    )
    if not quest.data:
        return jsonify({"error": "Quest not found"}), 404
    quest_row = quest.data[0]

    tasks = (
        supabase.table("user_quest_tasks")
        .select("id, title, pillar, xp_value")
        .eq("user_id", user_id)
        .eq("quest_id", quest_id)
        .execute()
    ).data or []
    task_ids = [t["id"] for t in tasks]

    # Completions (source of truth for "done"). XP comes from
    # user_quest_tasks.xp_value below — the completions table doesn't carry
    # an xp_awarded column; XP is the task's own value at completion time.
    completions_by_task: Dict[str, Dict[str, Any]] = {}
    if task_ids:
        comp = (
            supabase.table("quest_task_completions")
            .select("task_id, completed_at")
            .eq("user_id", user_id)
            .eq("quest_id", quest_id)
            .execute()
        ).data or []
        completions_by_task = {c["task_id"]: c for c in comp if c.get("task_id")}

    # Evidence docs → non-private blocks, grouped per task.
    blocks_by_task: Dict[str, List[Dict[str, Any]]] = {}
    if task_ids:
        docs = (
            supabase.table("user_task_evidence_documents")
            .select("id, task_id")
            .eq("user_id", user_id)
            .in_("task_id", task_ids)
            .execute()
        ).data or []
        doc_to_task = {d["id"]: d["task_id"] for d in docs}
        if doc_to_task:
            blocks = (
                supabase.table("evidence_document_blocks")
                .select("document_id, block_type, content, order_index, is_private")
                .in_("document_id", list(doc_to_task.keys()))
                .order("order_index")
                .execute()
            ).data or []
            for b in blocks:
                if b.get("is_private"):
                    continue  # teacher sees public evidence only
                tid = doc_to_task.get(b["document_id"])
                if not tid:
                    continue
                blocks_by_task.setdefault(tid, []).append(
                    {
                        "block_type": b.get("block_type"),
                        "content": b.get("content"),
                        "order_index": b.get("order_index"),
                    }
                )

    earned_xp = 0
    out_tasks: List[Dict[str, Any]] = []
    for t in tasks:
        c = completions_by_task.get(t["id"])
        is_completed = c is not None
        if is_completed:
            earned_xp += int(t.get("xp_value") or 0)
        out_tasks.append(
            {
                "id": t["id"],
                "title": t.get("title"),
                "pillar": t.get("pillar"),
                "xp_value": t.get("xp_value"),
                "is_completed": is_completed,
                "completed_at": (c or {}).get("completed_at"),
                "evidence_blocks": blocks_by_task.get(t["id"], []),
            }
        )

    full_name = (
        student_row.get("display_name")
        or f"{student_row.get('first_name','')} {student_row.get('last_name','')}".strip()
    )
    return (
        jsonify(
            {
                "student": {
                    "first_name": student_row.get("first_name"),
                    "last_name": student_row.get("last_name"),
                    "display_name": full_name,
                },
                "quest": {"id": quest_row["id"], "title": quest_row.get("title")},
                "earned_xp": earned_xp,
                "tasks": out_tasks,
            }
        ),
        200,
    )
