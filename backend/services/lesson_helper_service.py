"""
Lesson Helper Service
=====================

Powers the in-lesson AI helper ("Need help with this?"). A student can ask for
a hint, a simpler explanation, an example, etc. while working through a lesson;
this service answers in a friendly teacher voice using the lesson content as
context.

Replaces the removed AI Tutor stack (deleted 2026-04-13) for the narrow
lesson-helper use case. Extends BaseAIService so it inherits the resilient
model + fallback handling (transient 503 "high demand" errors fall back to an
alternate model automatically).
"""

from typing import Optional

from services.base_ai_service import BaseAIService
from utils.logger import get_logger

logger = get_logger(__name__)


class LessonHelperService(BaseAIService):
    """AI helper that answers a student's question about a lesson step."""

    def answer(
        self,
        lesson_title: str,
        lesson_text: str,
        current_step_text: str,
        student_message: str,
        action_type: Optional[str] = None,
    ) -> str:
        """
        Generate a helpful, encouraging response to a student's lesson question.

        Args:
            lesson_title: Title of the lesson.
            lesson_text: Plain-text of the whole lesson (fallback context).
            current_step_text: Plain-text of the step the student is on.
            student_message: The student's question / requested help.
            action_type: Optional hint about the requested action (e.g. 'hint').

        Returns:
            The response text (empty string if generation produced nothing).
        """
        prompt = self._build_prompt(lesson_title, lesson_text, current_step_text, student_message)
        response = self.generate_with_fallback(prompt)
        text = getattr(response, 'text', None) or ''
        return text.strip()

    def _build_prompt(
        self,
        lesson_title: str,
        lesson_text: str,
        current_step_text: str,
        student_message: str,
    ) -> str:
        # The instruction ("Simplify it", "Give me an example", "Draw a diagram",
        # etc.) refers to the specific lesson content the student is reading.
        content_for_instruction = current_step_text or lesson_text
        context = ''
        if lesson_title:
            context += f'Lesson: "{lesson_title}"\n'
        if content_for_instruction:
            context += (
                "The instruction below applies to THIS lesson content:\n"
                f'"""\n{content_for_instruction[:2000]}\n"""\n'
            )

        return (
            "You are an AI lesson assistant. The student selected an action to help "
            "them with the lesson content they are reading. Carry out that instruction "
            "directly, applied to the content below, and output the result itself.\n\n"
            f"{context}\n"
            f'Instruction: "{student_message}"\n\n'
            "Rules:\n"
            "- Do the instruction; produce the actual result (e.g. the simplified text, "
            "the example, the analogy, the ASCII diagram).\n"
            "- Do NOT greet the student, ask them questions, hedge, or describe what you "
            "are about to do. No preamble or sign-off.\n"
            "- Do NOT withhold the answer to make them think harder — just deliver what "
            "was asked.\n"
            "- Write clearly for a middle or high school student and keep it focused. "
            "Short paragraphs, simple lists, or an ASCII diagram (when asked) are fine."
        )
