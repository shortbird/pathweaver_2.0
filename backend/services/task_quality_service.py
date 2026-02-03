"""
Task Quality Analysis Service

Analyzes student-created tasks using AI to determine quality scores and suggest
XP values, pillars, and diploma subjects. Based on Optio's core philosophy:
"The Process Is The Goal"

Refactored (Jan 2026): Extended BaseAIService for unified AI handling.
"""

import json
from typing import Dict, Any, Optional

from services.base_ai_service import BaseAIService
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


class TaskQualityService(BaseAIService):
    """
    Service for analyzing quality of student-created tasks using AI.

    Extends BaseAIService to leverage:
    - Unified retry logic with exponential backoff
    - Robust JSON extraction from AI responses
    - Token usage tracking and cost monitoring
    - Consistent model access
    """

    def __init__(self):
        """Initialize the service with BaseAIService."""
        # Initialize BaseAIService (uses gemini-2.5-flash-lite by default per CLAUDE.md)
        super().__init__()
        self.supabase = get_supabase_admin_client()

    def analyze_task_quality(
        self,
        title: str,
        description: str,
        pillar: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze a student-created task and generate helpful suggestions.

        Args:
            title: Task title (min 3 chars)
            description: Task description
            pillar: Optional pillar selection from student

        Returns:
            Dict containing:
                - suggestions: list of strings (3-5 actionable suggestions)
                - suggested_xp: int (50-200)
                - suggested_pillar: str
                - diploma_subjects: dict
        """
        logger.info(f"Generating suggestions for task: {title}")

        # Validate inputs
        if not title or len(title.strip()) < 3:
            raise ValueError("Task title must be at least 3 characters")
        if not description or len(description.strip()) == 0:
            raise ValueError("Task description is required")

        try:
            # Generate suggestions using Gemini
            analysis = self._call_gemini_for_analysis(title, description, pillar)

            # Log internal quality score for analytics (not sent to frontend)
            internal_score = analysis.get('internal_quality_score', 0)
            logger.info(
                f"Task suggestion generation complete. "
                f"Internal score: {internal_score}, "
                f"Suggestions: {len(analysis.get('suggestions', []))}"
            )

            # Remove internal_quality_score from response (frontend doesn't need it)
            analysis.pop('internal_quality_score', None)

            return analysis

        except Exception as e:
            logger.error(f"Error generating task suggestions: {str(e)}", exc_info=True)
            raise

    def _call_gemini_for_analysis(
        self,
        title: str,
        description: str,
        pillar: Optional[str]
    ) -> Dict[str, Any]:
        """
        Call Gemini API to analyze task quality.

        Returns JSON with quality scores, feedback, and suggestions.
        """
        prompt = self._build_analysis_prompt(title, description, pillar)

        try:
            # Use inherited generate_json with quality_scoring preset
            # (lower temperature for consistent, reproducible analysis)
            analysis = self.generate_json(
                prompt,
                generation_config_preset='quality_scoring',
                strict=True  # Raise on parse failure
            )

            # Validate and normalize response
            analysis = self._validate_analysis_response(analysis)

            return analysis

        except Exception as e:
            logger.error(f"Gemini API error: {str(e)}", exc_info=True)
            raise

    def _build_analysis_prompt(
        self,
        title: str,
        description: str,
        pillar: Optional[str]
    ) -> str:
        """Build the prompt for Gemini suggestion generation"""

        pillar_hint = f"\nStudent's pillar preference: {pillar}" if pillar else ""

        return f"""You are a supportive learning coach helping a teenage student design their own learning task. Generate 3-5 specific, actionable suggestions that could make their task more engaging and meaningful.

STUDENT'S TASK:
Title: {title}
Description: {description}{pillar_hint}

YOUR ROLE:
- Suggest concrete rewordings or additions they can click to incorporate
- Each suggestion should be a complete sentence or phrase they can add to their description
- Focus on making tasks specific, present-focused, process-oriented, and curiosity-driven
- Keep suggestions practical and achievable for a teenage student
- Be encouraging and collaborative, not prescriptive

SUGGESTION QUALITY GUIDELINES:
- Add specificity: "Interview 3 people about X" instead of "Research X"
- Emphasize present discovery: "Explore what happens when..." instead of "Learn for future career"
- Celebrate process: "Try 3 different approaches and document what works" instead of "Create perfect result"
- Build authenticity: "Document your personal reactions" instead of "Make it look professional"

EVALUATION CRITERIA (use internally, don't show scores):
1. Specificity: Clear actions with measurable outcomes
2. Present-focus: Values learning happening NOW
3. Process-oriented: Celebrates journey and experimentation
4. Authenticity: Driven by genuine curiosity

Return ONLY valid JSON (no markdown):
{{
  "suggestions": [
    "Complete sentence suggestion 1",
    "Complete sentence suggestion 2",
    "Complete sentence suggestion 3"
  ],
  "suggested_xp": 50-200,
  "suggested_pillar": "stem|wellness|communication|civics|art",
  "diploma_subjects": {{"Subject": percentage}},
  "internal_quality_score": 0-100
}}

Make suggestions conversational and specific to their task idea."""

    def _validate_analysis_response(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and normalize the AI analysis response.

        Ensures all required fields are present and values are within expected ranges.
        """
        # Validate suggestions array
        if 'suggestions' not in analysis:
            raise ValueError("Missing suggestions in AI response")
        if not isinstance(analysis['suggestions'], list):
            raise ValueError("Suggestions must be a list")
        if len(analysis['suggestions']) < 1:
            raise ValueError("At least one suggestion is required")

        # Ensure suggestions are strings
        analysis['suggestions'] = [str(s) for s in analysis['suggestions']]

        # Validate internal_quality_score (used for logging/analytics, not sent to frontend)
        if 'internal_quality_score' not in analysis:
            logger.warning("Missing internal_quality_score in AI response, defaulting to 50")
            analysis['internal_quality_score'] = 50
        analysis['internal_quality_score'] = max(0, min(100, int(analysis['internal_quality_score'])))

        # Validate suggested_xp (50-200 range for manual tasks)
        if 'suggested_xp' not in analysis:
            raise ValueError("Missing suggested_xp in AI response")
        analysis['suggested_xp'] = max(50, min(200, int(analysis['suggested_xp'])))

        # Validate suggested_pillar
        valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
        if 'suggested_pillar' not in analysis:
            raise ValueError("Missing suggested_pillar in AI response")
        if analysis['suggested_pillar'] not in valid_pillars:
            logger.warning(
                f"Invalid pillar '{analysis['suggested_pillar']}', defaulting to 'stem'"
            )
            analysis['suggested_pillar'] = 'stem'

        # Validate diploma_subjects (optional)
        if 'diploma_subjects' not in analysis:
            analysis['diploma_subjects'] = {}
        if not isinstance(analysis['diploma_subjects'], dict):
            analysis['diploma_subjects'] = {}

        return analysis
