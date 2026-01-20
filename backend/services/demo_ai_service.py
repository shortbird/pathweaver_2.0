"""
Demo AI Service
===============

Provides AI-powered task generation for the public demo experience.
Uses Gemini to create personalized tasks based on user interests.

Designed for unauthenticated demo users - keeps prompts simple and focused.
"""

from typing import Dict, List, Optional
from services.base_ai_service import BaseAIService

from utils.logger import get_logger

logger = get_logger(__name__)


# Valid subject identifiers that map to credit categories
VALID_SUBJECTS = [
    'science', 'math', 'language_arts', 'fine_arts', 'digital_literacy',
    'pe', 'health', 'social_studies', 'financial_literacy', 'cte', 'electives'
]


class DemoAIService(BaseAIService):
    """
    AI service for generating personalized demo tasks.

    Uses Gemini to create 3 engaging, personalized tasks based on:
    - Selected quest type (robot, music, business, etc.)
    - User's stated interests
    - Optional free-text description of interests
    """

    def generate_personalized_tasks(
        self,
        quest_id: str,
        quest_title: str,
        interests: List[str],
        custom_input: Optional[str] = None
    ) -> Dict:
        """
        Generate 3 personalized tasks for a demo quest.

        Args:
            quest_id: Quest identifier (e.g., 'build-robot')
            quest_title: Human-readable quest title
            interests: List of interest tags (e.g., ['gaming', 'technology'])
            custom_input: Optional free-text description of interests

        Returns:
            Dict with 'success', 'tasks' (list of task objects), and 'error' if failed
        """
        try:
            # Build interest context
            interest_context = ""
            if interests:
                interest_context = f"The student is interested in: {', '.join(interests)}. "
            if custom_input:
                interest_context += f"They also mentioned: {custom_input}"

            if not interest_context:
                interest_context = "The student has general interests."

            prompt = f"""Generate 3 personalized learning tasks for a student working on the quest: "{quest_title}"

{interest_context}

Requirements:
1. Each task should connect the quest topic to the student's interests
2. Tasks should be achievable by a high school student
3. Tasks should be creative and engaging, not generic
4. Each task earns XP (100-150 per task)
5. Each task maps to 1-2 academic subjects

Valid subjects: science, math, language_arts, fine_arts, digital_literacy, pe, health, social_studies, financial_literacy, cte, electives

Return ONLY valid JSON (no markdown, no explanation):
{{
  "tasks": [
    {{
      "title": "Short action-oriented title",
      "description": "1-2 sentence description of what to do",
      "xp": 100,
      "subjects": ["subject1", "subject2"]
    }},
    {{
      "title": "...",
      "description": "...",
      "xp": 150,
      "subjects": ["subject1"]
    }},
    {{
      "title": "...",
      "description": "...",
      "xp": 100,
      "subjects": ["subject1", "subject2"]
    }}
  ]
}}"""

            # Generate with AI
            result = self.generate_json(prompt, strict=False)

            if not result or 'tasks' not in result:
                logger.warning("Demo AI returned empty or invalid response")
                return {
                    'success': False,
                    'error': 'AI returned invalid response'
                }

            tasks = result['tasks']

            # Validate and clean tasks
            validated_tasks = []
            for task in tasks[:3]:  # Limit to 3 tasks
                if not isinstance(task, dict):
                    continue

                title = str(task.get('title', '')).strip()
                description = str(task.get('description', '')).strip()
                xp = task.get('xp', 100)
                subjects = task.get('subjects', [])

                if not title or not description:
                    continue

                # Validate XP
                try:
                    xp = int(xp)
                    xp = max(50, min(200, xp))  # Clamp between 50-200
                except (ValueError, TypeError):
                    xp = 100

                # Validate subjects
                if not isinstance(subjects, list):
                    subjects = ['electives']
                subjects = [s for s in subjects if s in VALID_SUBJECTS]
                if not subjects:
                    subjects = ['electives']

                validated_tasks.append({
                    'title': title[:100],  # Limit length
                    'description': description[:250],  # Limit length
                    'xp': xp,
                    'subjects': subjects[:2]  # Max 2 subjects
                })

            if len(validated_tasks) < 2:
                logger.warning(f"Demo AI only generated {len(validated_tasks)} valid tasks")
                return {
                    'success': False,
                    'error': 'Insufficient valid tasks generated'
                }

            return {
                'success': True,
                'tasks': validated_tasks
            }

        except Exception as e:
            logger.error(f"Demo AI task generation error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
