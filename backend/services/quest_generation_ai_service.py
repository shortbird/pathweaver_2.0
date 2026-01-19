"""
Quest Generation AI Service
============================

AI-powered features for generating Quest structures from learning moments,
including task generation and gap analysis.

Uses BaseAIService for Gemini integration.
"""

from typing import Dict, List, Optional, Any
from services.base_ai_service import BaseAIService

from utils.logger import get_logger

logger = get_logger(__name__)


class QuestGenerationAIService(BaseAIService):
    """AI service for generating Quest structures from learning moments."""

    VALID_PILLARS = [
        'arts_creativity',
        'stem_logic',
        'life_wellness',
        'language_communication',
        'society_culture'
    ]

    def generate_quest_structure(
        self,
        moments: List[Dict],
        track_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a Quest structure from a list of learning moments.

        Args:
            moments: List of learning moments to convert
            track_name: Optional name of the interest track

        Returns:
            Dict with quest structure (title, description, tasks with XP)
        """
        if not moments:
            return {
                'success': False,
                'error': 'No moments provided'
            }

        # Format moments for the prompt
        moments_text = '\n---\n'.join([
            f"Title: {m.get('title', 'Untitled')}\n"
            f"Description: {m.get('description', '')[:500]}\n"
            f"Pillars: {', '.join(m.get('pillars', []))}\n"
            f"Date: {m.get('created_at', '')[:10]}"
            for m in moments
        ])

        # Calculate time span
        dates = [m.get('created_at', '') for m in moments if m.get('created_at')]
        date_range = f"{dates[0][:10]} to {dates[-1][:10]}" if len(dates) >= 2 else "Unknown"

        prompt = f"""Generate a Quest structure from these learning moments.

CONTEXT:
- Interest Track: {track_name or 'General Learning'}
- Number of moments: {len(moments)}
- Date range: {date_range}

LEARNING MOMENTS:
{moments_text}

Create a Quest that:
1. Has a compelling title that captures the learning journey
2. Has a description explaining what the learner accomplished
3. Converts each moment into a Task with appropriate XP
4. Maintains the learning narrative

XP Guidelines:
- Small discovery/observation: 25-50 XP
- Medium learning activity: 50-100 XP
- Significant project/creation: 100-200 XP
- Major accomplishment: 200-300 XP

Return JSON:
{{
  "title": "Quest title (2-6 words)",
  "description": "2-3 sentence description of the learning journey",
  "quest_type": "personal|project|skill|exploration",
  "primary_pillar": "one of the five pillars",
  "tasks": [
    {{
      "title": "Task title based on moment",
      "description": "What was learned/accomplished",
      "xp_value": 50,
      "pillar": "pillar for this task",
      "source_moment_id": "original moment id if known"
    }}
  ],
  "total_xp": 250,
  "learning_outcomes": ["What the learner can now do", "Skills developed"]
}}

Valid pillars: {', '.join(self.VALID_PILLARS)}
"""

        try:
            result = self.generate_json(prompt, strict=False)

            if not result:
                return {
                    'success': False,
                    'error': 'Failed to generate quest structure'
                }

            # Validate pillars
            tasks = result.get('tasks', [])
            for task in tasks:
                if task.get('pillar') not in self.VALID_PILLARS:
                    task['pillar'] = 'life_wellness'  # Default

            primary = result.get('primary_pillar')
            if primary not in self.VALID_PILLARS:
                result['primary_pillar'] = 'life_wellness'

            # Recalculate total XP
            total_xp = sum(task.get('xp_value', 50) for task in tasks)
            result['total_xp'] = total_xp

            return {
                'success': True,
                'quest_structure': result
            }

        except Exception as e:
            logger.error(f"Error generating quest structure: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def suggest_missing_areas(
        self,
        moments: List[Dict]
    ) -> Dict[str, Any]:
        """
        Identify gaps in learning coverage and suggest additional areas.

        Args:
            moments: List of learning moments

        Returns:
            Dict with suggested areas to explore
        """
        if not moments:
            return {
                'success': True,
                'suggestions': []
            }

        # Format moments
        moments_text = '\n'.join([
            f"- {m.get('title', 'Untitled')}: {m.get('description', '')[:200]}"
            for m in moments[:15]
        ])

        # Get pillar distribution
        pillar_counts = {}
        for m in moments:
            for p in m.get('pillars', []):
                pillar_counts[p] = pillar_counts.get(p, 0) + 1

        pillar_summary = ', '.join([f"{k}: {v}" for k, v in pillar_counts.items()])

        prompt = f"""Analyze these learning moments and suggest areas that could strengthen the learning.

MOMENTS:
{moments_text}

PILLAR DISTRIBUTION: {pillar_summary or 'No pillars assigned'}

Identify:
1. Topics touched but not deeply explored
2. Natural extensions of current learning
3. Complementary skills that would round out the learning
4. Practical applications not yet covered

Return JSON:
{{
  "missing_areas": [
    {{
      "area": "Area name",
      "why_valuable": "Why this would strengthen the learning",
      "suggested_activity": "Specific activity to address this",
      "pillar": "relevant pillar",
      "priority": "high|medium|low"
    }}
  ],
  "overall_assessment": "1-2 sentences on learning coverage quality",
  "strongest_area": "What's been covered well",
  "biggest_gap": "Most important area to address"
}}

Maximum 5 suggestions, prioritize actionable ones.
"""

        try:
            result = self.generate_json(prompt, strict=False)

            if not result:
                return {
                    'success': True,
                    'suggestions': []
                }

            return {
                'success': True,
                'missing_areas': result.get('missing_areas', []),
                'overall_assessment': result.get('overall_assessment', ''),
                'strongest_area': result.get('strongest_area', ''),
                'biggest_gap': result.get('biggest_gap', '')
            }

        except Exception as e:
            logger.error(f"Error analyzing missing areas: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def generate_quest_title(
        self,
        moments: List[Dict],
        track_name: Optional[str] = None
    ) -> str:
        """Generate a compelling quest title from moments."""
        sample_descriptions = ' '.join([
            m.get('description', '')[:100]
            for m in moments[:5]
        ])

        prompt = f"""Generate a short, compelling Quest title based on this learning:

Track: {track_name or 'General'}
Sample content: {sample_descriptions}

Return JSON:
{{"title": "Quest title (2-6 words)"}}
"""

        try:
            result = self.generate_json(prompt, strict=False)
            return result.get('title', track_name or 'My Learning Quest')
        except Exception:
            return track_name or 'My Learning Quest'
