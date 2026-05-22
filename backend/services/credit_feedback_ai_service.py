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

import google.generativeai as genai

from app_config import Config
from database import get_supabase_admin_client
from prompts.components import (
    CORE_PHILOSOPHY,
    LANGUAGE_GUIDELINES,
    OPTIO_AI_PERSONA,
    TONE_LEVELS,
)
from services.ai_gen import generate_with_timeout
from services.base_service import BaseService
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
TONE — read carefully, this matters more than anything else:
- Simple, kind, and firm. Not warm. Not excited. Not cheerleady. No exclamation points.
- Think calm older sibling who respects the student enough to be honest, not a teacher
  trying to sound supportive.
- Do NOT say "great job", "I love this", "amazing", "awesome", "you're doing great",
  or anything that sounds like a pep talk. Do not start by complimenting the work.
- Do NOT use "we" or "let's" — this is about what the STUDENT does. Address them
  directly ("you", "your"). Never frame it as something you'll do together.

WHAT TO SAY:
- Somewhere in the response, plainly tell the student they need to add more to this
  task before it's ready. Say it gently but don't dance around it.
- Then point at something specific in their evidence and tell them what to add or do
  next. Be concrete. Reference what's actually there.
- When it would actually help, suggest they add a photo, a short video, a screenshot,
  or another piece of evidence that shows what they did. Don't force this if it
  doesn't fit (e.g. a written reflection probably doesn't need a video) — only mention
  it when it would make the work clearer.

FORMAT — strict, no exceptions:
- 3 to 5 short sentences. One paragraph. Plain prose only.
- Use simple, everyday words. Short sentences. The kind of language a 13-year-old
  would write. Avoid jargon, formal phrases, or anything that sounds like a teacher.
- NO markdown. NO bold (no **). NO italics (no *). NO underscores. NO bullets. NO
  headers. NO line breaks. Just sentences separated by spaces.
- Do NOT mention "credit", "grading", "approval", or "XP" — talk about the work itself.

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
            content = block.get("content")
            summary = self._summarize_block_content(btype, content)
            out.append(f"  [{i}] {btype}: {summary}")
        return "\n".join(out)

    def _summarize_block_content(self, btype: str, content: Any) -> str:
        if content is None:
            return "(empty)"
        if isinstance(content, str):
            return self._truncate(content)
        if isinstance(content, dict):
            # New block shape: {items: [...]} OR legacy single-item {url, ...}
            if isinstance(content.get("items"), list):
                items = content["items"]
                parts = [self._describe_item(it) for it in items if it]
                return "; ".join(parts) if parts else "(empty)"
            return self._describe_item(content)
        return self._truncate(str(content))

    def _describe_item(self, item: Any) -> str:
        if isinstance(item, str):
            return self._truncate(item)
        if not isinstance(item, dict):
            return self._truncate(str(item))
        # Common fields across image/link/video/file blocks.
        title = item.get("title") or item.get("caption") or item.get("alt")
        url = item.get("url") or item.get("filename")
        text = item.get("text")
        if text:
            return self._truncate(text)
        if title and url:
            return f"{self._truncate(title, 200)} ({url})"
        if title:
            return self._truncate(title, 400)
        if url:
            return str(url)
        return self._truncate(json.dumps(item))

    def _truncate(self, s: str, limit: Optional[int] = None) -> str:
        limit = limit or self.MAX_TEXT_BLOCK_CHARS
        s = s.strip()
        if len(s) <= limit:
            return s
        return s[:limit] + "… [truncated]"

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
        if not isinstance(feedback, str):
            return ""
        # Strip any markdown that slipped through despite the prompt rules.
        # LLMs sometimes ignore "no markdown" instructions and we don't want
        # raw asterisks/underscores showing up in the textarea.
        cleaned = self._strip_markdown(feedback)
        # Collapse any stray newlines — we asked for one paragraph.
        return " ".join(cleaned.strip().split())

    _MARKDOWN_PATTERNS = [
        # bold (**text** or __text__) → text
        (r"\*\*(.+?)\*\*", r"\1"),
        (r"__(.+?)__", r"\1"),
        # italics (*text* or _text_) → text  (require non-space on the inside
        # so multiplication / measurements aren't mangled)
        (r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"\1"),
        (r"(?<!_)_(?!\s)(.+?)(?<!\s)_(?!_)", r"\1"),
        # bullet markers at line start
        (r"(?m)^[\-\*•]\s+", ""),
        # numbered list markers at line start
        (r"(?m)^\d+\.\s+", ""),
        # markdown headers
        (r"(?m)^#+\s+", ""),
    ]

    def _strip_markdown(self, text: str) -> str:
        import re
        out = text
        for pattern, repl in self._MARKDOWN_PATTERNS:
            out = re.sub(pattern, repl, out)
        return out
