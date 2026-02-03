"""
AI-powered course showcase field generation service using Google Gemini API.
Analyzes course projects and lessons to generate parent-focused showcase fields.

Usage:
    from services.course_showcase_ai_service import CourseShowcaseAIService

    service = CourseShowcaseAIService()
    result = service.generate_showcase_fields(course_data, projects, lessons)
"""

from typing import Dict, List, Optional, Any

from services.base_ai_service import BaseAIService
from utils.logger import get_logger

logger = get_logger(__name__)


class CourseShowcaseAIService(BaseAIService):
    """Service for AI-powered course showcase field generation.

    Extends BaseAIService to leverage:
    - Unified retry logic with exponential backoff
    - Robust JSON extraction from AI responses
    - Token usage tracking and cost monitoring
    """

    def __init__(self):
        """Initialize the AI service with Gemini configuration."""
        super().__init__()

    def generate_showcase_fields(
        self,
        course: Dict[str, Any],
        projects: List[Dict[str, Any]],
        lessons: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Generate showcase fields for a course based on its projects and lessons.

        Args:
            course: Course data including title, description
            projects: List of projects/quests in the course
            lessons: List of lessons across all projects

        Returns:
            Dict with generated showcase fields:
            - learning_outcomes: List of things students will do
            - educational_value: How course helps kids learn and grow
            - parent_guidance: Age-specific tips for parents
        """
        try:
            prompt = self._build_showcase_prompt(course, projects, lessons)

            result = self.generate_json(
                prompt,
                generation_config_preset='structured_output',
                max_output_tokens=2048
            )

            if not result:
                raise Exception("Empty response from AI")

            # Validate and normalize the response
            validated = self._validate_response(result)

            logger.info(
                f"Generated showcase fields for course '{course.get('title', 'Unknown')}': "
                f"{len(validated.get('learning_outcomes', []))} outcomes"
            )

            return {
                'success': True,
                'showcase': validated
            }

        except Exception as e:
            logger.error(f"Showcase field generation failed: {str(e)}")
            raise

    def _build_showcase_prompt(
        self,
        course: Dict[str, Any],
        projects: List[Dict[str, Any]],
        lessons: List[Dict[str, Any]]
    ) -> str:
        """Build the prompt for showcase field generation."""

        # Format projects summary
        projects_text = ""
        for i, project in enumerate(projects, 1):
            projects_text += f"\n{i}. {project.get('title', 'Untitled Project')}"
            if project.get('description'):
                projects_text += f"\n   Description: {project['description']}"
            if project.get('quest_type'):
                projects_text += f"\n   Type: {project['quest_type']}"

        if not projects_text:
            projects_text = "\n(No projects added yet)"

        # Format lessons summary
        lessons_text = ""
        import re
        for i, lesson in enumerate(lessons[:15], 1):  # Limit to 15 lessons to control prompt size
            lessons_text += f"\n{i}. {lesson.get('title', 'Untitled Lesson')}"
            # Include brief content preview if available
            content = lesson.get('content', '')
            if content:
                # Handle content that might be a dict (JSONB) or string
                if isinstance(content, dict):
                    # Extract text from JSONB content structure
                    content_str = content.get('text', '') or content.get('html', '') or str(content)
                elif isinstance(content, str):
                    content_str = content
                else:
                    content_str = str(content) if content else ''

                # Strip HTML and truncate
                if content_str:
                    clean_content = re.sub('<[^<]+?>', '', content_str)
                    if len(clean_content) > 150:
                        clean_content = clean_content[:150] + "..."
                    if clean_content.strip():
                        lessons_text += f"\n   Content preview: {clean_content}"

        if len(lessons) > 15:
            lessons_text += f"\n... and {len(lessons) - 15} more lessons"

        if not lessons_text:
            lessons_text = "\n(No lessons added yet)"

        prompt = f"""You're helping a homeschool course creator describe their course to parents looking for fun, hands-on classes for their kids.

COURSE INFO:
Title: {course.get('title', 'Untitled Course')}
Description: {course.get('description', 'No description provided')}

PROJECTS:{projects_text}

LESSONS:{lessons_text}

Write simple, clear descriptions that tell parents what their kid will actually DO in this course.

Return a JSON object with these fields:

{{
  "learning_outcomes": [
    // 4-6 things students will DO in this course
    // Use action words: "write", "build", "design", "solve", "create"
    // Keep it simple and specific to this course
    // Example: "Write a short story with a beginning, middle, and end"
    // NOT: "Develop narrative composition skills through structured storytelling"
  ],
  "educational_value": "How does this course help kids learn and grow? Focus on real-world skills, not school subjects. What will they get out of this that a textbook can't give them? Think: hands-on experience, creative thinking, problem-solving through doing, building confidence, etc.",
  "parent_guidance": {{
    "ages_5_9": "Specific tips for parents of younger kids (5-9) taking THIS course. What will they need help with? How can parents be involved without doing it for them? Be specific to the course content.",
    "ages_10_14": "Tips for parents of middle-schoolers. Where might they still need support? What can they do independently? Be specific to this course.",
    "ages_15_18": "Tips for parents of teens. How can parents stay connected to their work without hovering? What makes this course work well for independent learners?"
  }}
}}

WRITING RULES:
- Use simple words a parent would use talking to a friend
- Focus on what kids DO, not abstract skills they "develop"
- No education jargon (avoid: "competencies", "methodologies", "frameworks", "foster", "cultivate", "facilitate")
- No excited language (avoid: "amazing", "exciting", "incredible", "transformative", "empower")
- Be specific to THIS course content
- Keep sentences short
- For parent_guidance: be practical and specific. "Younger kids will need help with X" not "Provide scaffolded support"
- Student independent work is encouraged at all ages, but be clear that younger kids need more parent involvement
- IMPORTANT: Use plain text only. No HTML tags, no markdown formatting, no *asterisks*, no <p> tags, no bold/italic

Return ONLY the JSON object."""

        return prompt

    def _validate_response(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and normalize the AI response."""

        validated = {}

        # Learning outcomes - ensure it's a list of strings
        outcomes = result.get('learning_outcomes', [])
        if isinstance(outcomes, list):
            validated['learning_outcomes'] = [
                str(o).strip() for o in outcomes
                if o and str(o).strip()
            ][:8]  # Limit to 8 outcomes
        else:
            validated['learning_outcomes'] = []

        # Educational value - ensure it's a string
        edu_value = result.get('educational_value', '')
        validated['educational_value'] = str(edu_value).strip() if edu_value else ''

        # Parent guidance - ensure it's a dict with the expected keys
        parent_guidance = result.get('parent_guidance', {})
        if isinstance(parent_guidance, dict):
            validated['parent_guidance'] = {
                'ages_5_9': str(parent_guidance.get('ages_5_9', '')).strip(),
                'ages_10_14': str(parent_guidance.get('ages_10_14', '')).strip(),
                'ages_15_18': str(parent_guidance.get('ages_15_18', '')).strip()
            }
        else:
            validated['parent_guidance'] = {
                'ages_5_9': '',
                'ages_10_14': '',
                'ages_15_18': ''
            }

        return validated
