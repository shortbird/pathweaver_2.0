"""
Check-in Email Service
Generates AI-powered parent recap emails from advisor meeting notes.
"""

from typing import Dict, Any
from services.base_ai_service import BaseAIService
from app_config import Config

from utils.logger import get_logger

logger = get_logger(__name__)


class CheckinEmailService(BaseAIService):
    """Generates parent recap emails from advisor meeting notes using Gemini."""

    def generate_parent_email(
        self,
        meeting_notes: str,
        advisor_name: str,
        student_name: str,
        parent_name: str
    ) -> Dict[str, Any]:
        """
        Use Gemini to read meeting notes and generate a parent recap email.

        Args:
            meeting_notes: Raw meeting notes/transcript text
            advisor_name: Advisor's display name
            student_name: Student's display name
            parent_name: Parent's display name

        Returns:
            Dict with 'subject' and 'body' keys
        """
        prompt = f"""You are a teacher/advisor writing an email to a parent after a check-in meeting with their child.
Write the email in first person from the teacher's voice. Read the meeting notes below and generate the email.

The email should follow this exact format:

Subject line: Check-in Recap: {student_name}

Email body (plain text, not HTML):
Hi {parent_name},

I just had a check-in with {student_name}. Here is a summary of what was discussed:

- [bullet point 1 summarizing a key topic discussed]
- [bullet point 2 summarizing another key topic]
- [bullet point 3 if applicable]
- [continue as needed - aim for 3-6 bullet points]

[One short closing sentence that is encouraging and forward-looking about the student's progress or next steps.]

Best,
{advisor_name}

RULES:
- Write in FIRST PERSON from the teacher's perspective ("I discussed...", "I noticed...", not "{advisor_name} discussed...")
- Use the actual names provided, not placeholders
- Only use the student's FIRST NAME, never their last name
- Each bullet point should be a concise but informative summary of a discussion topic
- Keep the tone warm, professional, and encouraging — parents value this type of communication
- Do NOT include any information not found in the meeting notes
- Do NOT use overly formal or stiff language
- The closing sentence should feel natural, not generic
- AUTO-CORRECT spelling errors from the transcript. The meeting notes come from speech-to-text and may contain misspellings. Fix them:
  - "Optio" (the platform name) may appear as "optio", "opto", "optiyo", "option", etc. — always correct to "Optio"
  - Fix common speech-to-text errors (homophones, run-together words, missing punctuation)
  - Correct any misspelled proper nouns you can confidently identify from context

NAMES:
- Teacher/Advisor: {advisor_name}
- Student (first name only): {student_name}
- Parent: {parent_name}

MEETING NOTES:
{meeting_notes}

Respond in JSON format:
{{
    "subject": "the email subject line",
    "body": "the full email body text"
}}"""

        result = self.generate_json(
            prompt,
            generation_config_preset='structured_output',
            strict=True
        )

        if not result.get('subject') or not result.get('body'):
            raise ValueError("AI failed to generate a valid email. Please try again.")

        return {
            'subject': result['subject'],
            'body': result['body']
        }
