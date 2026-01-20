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

            prompt = f"""Generate 3 simple, fun learning tasks for a student working on: "{quest_title}"

{interest_context}

IMPORTANT RULES:
- Titles must be SHORT (3-6 words max)
- Descriptions must be ONE simple sentence
- Tasks must be EASY and beginner-friendly
- Connect the quest to student's interests in a fun way
- Each task earns XP (100-150)

Valid subjects: science, math, language_arts, fine_arts, digital_literacy, pe, health, social_studies, financial_literacy, cte, electives

Return ONLY valid JSON:
{{
  "tasks": [
    {{
      "title": "Draw your robot design",
      "description": "Sketch what your robot will look like.",
      "xp": 100,
      "subjects": ["fine_arts", "science"]
    }},
    {{
      "title": "List 5 robot features",
      "description": "Write down five cool things your robot can do.",
      "xp": 100,
      "subjects": ["language_arts"]
    }},
    {{
      "title": "Find robot inspiration",
      "description": "Watch a video about robots you like.",
      "xp": 150,
      "subjects": ["digital_literacy", "science"]
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
