"""
Credit Feedback AI Service

Drafts "Grow This" feedback for credit reviewers. A reviewer clicks
"AI Suggest" on the Grow This form, the backend gathers context (quest,
task, student evidence, suggested subject XP distribution) and asks
Gemini for a few constructive, growth-oriented suggestions the student
can act on. The reviewer edits the draft before sending.

Uses the same lightweight Gemini pattern as student_ai_assistant_service.py.
"""

import json
from typing import Any, Dict, List, Optional

from app_config import Config
from database import get_supabase_admin_client
from prompts.credit_review_tone import FORMAT_RULES, GROW_THIS_TONE
from services.ai_gen import generate_with_timeout
from services.base_service import BaseService
from utils.evidence_labels import (
    describable_ref,
    describe_item,
    plain_paragraph,
    summarize_block_content,
    truncate,
)
from utils.logger import get_logger

logger = get_logger(__name__)


class CreditFeedbackAIService(BaseService):
    """Suggest Grow This feedback for a pending credit review item."""

    # Cap evidence text we send to Gemini so a wall-of-text submission
    # doesn't blow up the prompt size.
    MAX_EVIDENCE_BLOCKS = 25
    MAX_TEXT_BLOCK_CHARS = 2000

    def __init__(self) -> None:
        super().__init__()
        # admin client justified: service layer — called from a credit-review
        # route guarded by @require_role('superadmin', 'org_admin').
        self.supabase = get_supabase_admin_client()
        if not Config.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        # Lazy: see the note in topic_generation_service — genai costs ~31MB of
        # RSS at import, and every service is imported at app boot.
        import google.generativeai as genai
        genai.configure(api_key=Config.GEMINI_API_KEY)
        self.model = genai.GenerativeModel(Config.GEMINI_MODEL)

    # ------------------------------------------------------------------ public

    def suggest_grow_this_feedback(self, completion_id: str) -> Dict[str, Any]:
        """
        Look up everything we know about this completion and ask Gemini for
        a short, plain-prose Grow This note the reviewer can edit.

        Returns:
            {
              "success": bool,
              "suggested_feedback": "<3-5 short sentences>",  # on success
              "error": "<message>"                            # on failure
            }
        """
        context = self._load_context(completion_id)
        if not context:
            return {
                "success": False,
                "error": "Completion not found or missing required data.",
            }

        # The parent/org AI toggles belong to the STUDENT whose work is about to
        # be pasted into a Gemini prompt, not to the reviewer who clicked the
        # button. A parent who switched AI off for their child did not consent
        # to that child's evidence text leaving the platform because a staff
        # member wanted a drafting shortcut. The reviewer keeps the form and
        # writes the note themselves — nothing else about the review changes.
        student_id = context.get("student_id")
        if student_id:
            from utils.ai_access import check_ai_access
            has_access, denial, _ = check_ai_access(student_id)
            if not has_access:
                logger.info(
                    f"Grow-this AI draft blocked for completion {completion_id[:8]}: "
                    f"student AI access denied ({(denial or {}).get('code')})"
                )
                return {
                    "success": False,
                    "error": "AI features are turned off for this student. "
                             "Write the feedback yourself.",
                }

        prompt = self._build_prompt(context)

        try:
            response = generate_with_timeout(self.model, prompt)
            response_text = (response.text or "").strip()
        except Exception as e:
            logger.error(f"Gemini call failed for grow-this feedback: {e}")
            return {"success": False, "error": "AI request failed. Try again."}

        feedback = self._parse_feedback(response_text)
        if not feedback:
            return {
                "success": False,
                "error": "Could not parse AI response.",
            }

        return {
            "success": True,
            "suggested_feedback": feedback,
        }

    # ----------------------------------------------------------------- context

    def _load_context(self, completion_id: str) -> Optional[Dict[str, Any]]:
        """Pull quest, task, evidence, and subject-XP context for the prompt."""
        completion = self.supabase.table("quest_task_completions").select(
            "id, user_id, quest_id, user_quest_task_id, diploma_status, revision_number"
        ).eq("id", completion_id).single().execute()
        if not completion.data:
            return None

        task_id = completion.data.get("user_quest_task_id")
        quest_id = completion.data.get("quest_id")
        student_id = completion.data.get("user_id")

        # Task
        task: Dict[str, Any] = {}
        if task_id:
            task_result = self.supabase.table("user_quest_tasks").select(
                "id, title, description, pillar, xp_value, diploma_subjects, "
                "subject_xp_distribution"
            ).eq("id", task_id).single().execute()
            task = task_result.data or {}

        # Quest
        quest: Dict[str, Any] = {}
        if quest_id:
            quest_result = self.supabase.table("quests").select(
                "id, title, description"
            ).eq("id", quest_id).single().execute()
            quest = quest_result.data or {}

        # Evidence blocks
        evidence_blocks: List[Dict[str, Any]] = []
        if task_id and student_id:
            doc = self.supabase.table("user_task_evidence_documents").select(
                "id"
            ).eq("task_id", task_id).eq("user_id", student_id).limit(1).execute()
            if doc.data:
                blocks = self.supabase.table("evidence_document_blocks").select(
                    "block_type, content"
                ).eq("document_id", doc.data[0]["id"]).order(
                    "order_index"
                ).limit(self.MAX_EVIDENCE_BLOCKS).execute()
                evidence_blocks = blocks.data or []

        # Suggested subject XP distribution (use the same helper the
        # dashboard uses so we keep one source of truth).
        from routes.tasks import get_subject_xp_distribution
        xp_value = task.get("xp_value", 0) or 0
        suggested_subjects = (
            get_subject_xp_distribution(task, xp_value) if task else {}
        )

        # Most recent review round (so we don't recycle the exact same
        # feedback the student saw last time).
        prior_feedback = None
        rounds = self.supabase.table("diploma_review_rounds").select(
            "reviewer_feedback, reviewer_action, round_number"
        ).eq("completion_id", completion_id).order(
            "round_number", desc=True
        ).limit(1).execute()
        if rounds.data:
            prior_feedback = (rounds.data[0] or {}).get("reviewer_feedback")

        return {
            # Whose work this is. Carried so the caller can check that
            # student's AI toggles before their evidence goes to Gemini.
            "student_id": student_id,
            "quest": quest,
            "task": task,
            "evidence_blocks": evidence_blocks,
            "suggested_subjects": suggested_subjects,
            "prior_feedback": prior_feedback,
        }

    # ------------------------------------------------------------------ prompt

    def _build_prompt(self, ctx: Dict[str, Any]) -> str:
        quest = ctx["quest"]
        task = ctx["task"]
        subjects = ctx["suggested_subjects"]
        evidence_lines = self._format_evidence(ctx["evidence_blocks"])
        prior = ctx.get("prior_feedback")

        subjects_str = (
            ", ".join(f"{s}: {xp} XP" for s, xp in subjects.items())
            if subjects else "(none specified)"
        )

        prior_block = (
            f"\nPRIOR REVIEWER FEEDBACK (this is a resubmission — avoid repeating it verbatim):\n{prior}\n"
            if prior else ""
        )

        return f"""You are drafting "Grow This" feedback for a credit reviewer to send to a
student. The student turned in a task for review, but the work isn't enough yet — they
need to add more before it counts. Your job: tell them that clearly, then point at
what specifically would help.

QUEST: {quest.get('title', 'Unknown')}
Quest description: {quest.get('description', '(no description)')}

TASK: {task.get('title', 'Unknown')}
Task description: {task.get('description', '(no description)')}
Pillar: {task.get('pillar', 'unspecified')}
XP value: {task.get('xp_value', 0)}
Suggested subject XP distribution: {subjects_str}

STUDENT'S EVIDENCE SUBMISSION ({len(ctx['evidence_blocks'])} block(s)):
{evidence_lines}
{prior_block}
{GROW_THIS_TONE}

{FORMAT_RULES}

RETURN JSON ONLY (no prose before/after):
{{
  "feedback": "Three to five short sentences as one paragraph, plain text, no markdown."
}}
"""

    def _format_evidence(self, blocks: List[Dict[str, Any]]) -> str:
        if not blocks:
            return "(no evidence submitted yet)"

        out: List[str] = []
        for i, block in enumerate(blocks, start=1):
            btype = block.get("block_type", "unknown")
            summary = summarize_block_content(
                block.get("content"), self.MAX_TEXT_BLOCK_CHARS)
            out.append(f"  [{i}] {btype}: {summary}")
        return "\n".join(out)

    # The item/label/truncation helpers moved to utils/evidence_labels.py when
    # the AI credit reviewer needed the same "never put a storage URL in a
    # prompt" rule. Kept as thin delegates so existing tests and any subclass
    # calling them still work.
    def _summarize_block_content(self, btype: str, content: Any) -> str:
        return summarize_block_content(content, self.MAX_TEXT_BLOCK_CHARS)

    def _describe_item(self, item: Any) -> str:
        return describe_item(item, self.MAX_TEXT_BLOCK_CHARS)

    @staticmethod
    def _describable_ref(item: dict) -> str:
        return describable_ref(item)

    def _truncate(self, s: str, limit: Optional[int] = None) -> str:
        return truncate(s, limit or self.MAX_TEXT_BLOCK_CHARS)

    # ----------------------------------------------------------------- parsing

    def _parse_feedback(self, raw: str) -> str:
        text = raw.strip()
        # Strip code fences if Gemini wrapped the JSON in ```json ... ```
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse AI feedback JSON: {e}; raw={text[:200]!r}")
            return ""

        feedback = parsed.get("feedback") if isinstance(parsed, dict) else None
        # Strip any markdown that slipped through despite the prompt rules, and
        # collapse stray newlines -- we asked for one paragraph. LLMs ignore
        # "no markdown" often enough that raw asterisks reached the textarea.
        return plain_paragraph(feedback, limit=4000) or ""
