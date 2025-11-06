"""
Task Quality Analysis Service

Analyzes student-created tasks using AI to determine quality scores and suggest
XP values, pillars, and diploma subjects. Based on Optio's core philosophy:
"The Process Is The Goal"
"""

import json
import logging
from typing import Dict, Any, Optional
import google.generativeai as genai
from .base_service import BaseService

logger = logging.getLogger(__name__)


class TaskQualityService(BaseService):
    """Service for analyzing quality of student-created tasks using AI"""

    def __init__(self, supabase_client=None):
        super().__init__(supabase_client)
        self.model_name = "gemini-2.0-flash-exp"

    def analyze_task_quality(
        self,
        title: str,
        description: str,
        pillar: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze a student-created task for quality and generate suggestions.

        Args:
            title: Task title (min 3 chars)
            description: Task description
            pillar: Optional pillar selection from student

        Returns:
            Dict containing:
                - quality_score: int (0-100)
                - feedback: dict with scores and comments for each criterion
                - suggested_xp: int (50-200)
                - suggested_pillar: str
                - diploma_subjects: dict
                - approval_status: 'approved' or 'pending_review'
                - overall_feedback: str
        """
        logger.info(f"Analyzing task quality for: {title}")

        # Validate inputs
        if not title or len(title.strip()) < 3:
            raise ValueError("Task title must be at least 3 characters")
        if not description or len(description.strip()) == 0:
            raise ValueError("Task description is required")

        try:
            # Generate quality analysis using Gemini
            analysis = self._call_gemini_for_analysis(title, description, pillar)

            # Calculate approval status based on quality score
            quality_score = analysis.get('quality_score', 0)
            if quality_score >= 70:
                approval_status = 'approved'
            else:
                approval_status = 'pending_review'

            # Add approval status to response
            analysis['approval_status'] = approval_status

            logger.info(
                f"Task analysis complete. Score: {quality_score}, "
                f"Status: {approval_status}"
            )

            return analysis

        except Exception as e:
            logger.error(f"Error analyzing task quality: {str(e)}", exc_info=True)
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
            model = genai.GenerativeModel(self.model_name)
            response = model.generate_content(
                prompt,
                generation_config={
                    "temperature": 0.3,  # Lower temperature for consistent scoring
                    "top_p": 0.8,
                    "top_k": 40,
                    "max_output_tokens": 1500,
                }
            )

            # Parse JSON response
            response_text = response.text.strip()

            # Remove markdown code blocks if present
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]

            analysis = json.loads(response_text.strip())

            # Validate and normalize response
            analysis = self._validate_analysis_response(analysis)

            return analysis

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response as JSON: {str(e)}")
            logger.error(f"Response text: {response_text}")
            raise ValueError("AI returned invalid response format")
        except Exception as e:
            logger.error(f"Gemini API error: {str(e)}", exc_info=True)
            raise

    def _build_analysis_prompt(
        self,
        title: str,
        description: str,
        pillar: Optional[str]
    ) -> str:
        """Build the prompt for Gemini quality analysis"""

        pillar_hint = f"\nStudent's pillar preference: {pillar}" if pillar else ""

        return f"""Analyze this student-created task for Optio (philosophy: "The Process Is The Goal").

TASK:
Title: {title}
Description: {description}{pillar_hint}

SCORE (0-25 pts each):

1. SPECIFICITY: Clear, measurable actions? Can you tell when you're done?
   Good: "Build a solar oven and test 3 recipes" | Bad: "Study renewable energy"

2. PRESENT-FOCUS: Emphasizes discovery NOW (not future benefits)?
   Good: "Explore what colors make you feel calm" | Bad: "Learn color theory for jobs"

3. PROCESS-ORIENTED: Values the journey and experimentation?
   Good: "Try 3 coding approaches and journal learnings" | Bad: "Code a perfect app"

4. AUTHENTICITY: Driven by personal curiosity (not resume-building)?
   Good: "Interview grandparent about their childhood" | Bad: "Research to boost applications"

Give brief, actionable feedback directly to the student. Keep comments under 15 words each.

Return ONLY valid JSON (no markdown):
{{
  "quality_score": 0-100,
  "feedback": {{
    "specificity": {{"score": 0-25, "comment": "brief tip"}},
    "present_focus": {{"score": 0-25, "comment": "brief tip"}},
    "process_oriented": {{"score": 0-25, "comment": "brief tip"}},
    "authenticity": {{"score": 0-25, "comment": "brief tip"}}
  }},
  "suggested_xp": 50-200,
  "suggested_pillar": "stem|wellness|communication|civics|art",
  "diploma_subjects": {{"Subject": percentage}},
  "overall_feedback": "1 concise sentence"
}}"""

    def _validate_analysis_response(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and normalize the AI analysis response.

        Ensures all required fields are present and values are within expected ranges.
        """
        # Validate quality_score
        if 'quality_score' not in analysis:
            raise ValueError("Missing quality_score in AI response")
        analysis['quality_score'] = max(0, min(100, int(analysis['quality_score'])))

        # Validate feedback structure
        if 'feedback' not in analysis or not isinstance(analysis['feedback'], dict):
            raise ValueError("Missing or invalid feedback in AI response")

        required_criteria = ['specificity', 'present_focus', 'process_oriented', 'authenticity']
        for criterion in required_criteria:
            if criterion not in analysis['feedback']:
                raise ValueError(f"Missing {criterion} in feedback")
            if 'score' not in analysis['feedback'][criterion]:
                raise ValueError(f"Missing score for {criterion}")
            if 'comment' not in analysis['feedback'][criterion]:
                analysis['feedback'][criterion]['comment'] = "No specific feedback"

            # Clamp scores to 0-25
            score = analysis['feedback'][criterion]['score']
            analysis['feedback'][criterion]['score'] = max(0, min(25, int(score)))

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

        # Validate overall_feedback
        if 'overall_feedback' not in analysis:
            analysis['overall_feedback'] = "Task analyzed successfully"

        return analysis
