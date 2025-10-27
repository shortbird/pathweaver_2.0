"""
Student AI Assistant Service

Provides AI-powered assistance for students when:
- Submitting quest ideas
- Getting improvement suggestions
- Finding similar quests for inspiration
- Validating quest idea viability

Uses Gemini API for intelligent, context-aware feedback.
"""

import google.generativeai as genai
import os
import json
from typing import Dict, List, Optional, Tuple
from services.base_service import BaseService
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)


class StudentAIAssistantService(BaseService):
    """Service for AI-powered student assistance with quest ideas."""

    def __init__(self, user_id: Optional[str] = None):
        """Initialize the service with Gemini API."""
        super().__init__(user_id)
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")

        genai.configure(api_key=api_key)
        # Use gemini-2.5-flash-lite as per CLAUDE.md specification
        self.model = genai.GenerativeModel('gemini-2.5-flash-lite')

        # Optio philosophy and pillars for context
        self.philosophy = """
        Optio's Core Philosophy: "The Process Is The Goal"
        - Learning is about who you become through the journey
        - Celebrate growth happening RIGHT NOW, not future potential
        - Focus on how learning FEELS, not how it LOOKS
        - Every step, attempt, and mistake is valuable
        """

        self.pillars = [
            "STEM & Logic",
            "Life & Wellness",
            "Language & Communication",
            "Society & Culture",
            "Arts & Creativity"
        ]

        # XP guidelines for different complexity levels
        self.xp_guidelines = {
            "simple": "50-100 XP (10-30 minutes, basic task)",
            "moderate": "100-200 XP (30-60 minutes, requires some thought)",
            "challenging": "200-400 XP (1-2 hours, requires planning)",
            "complex": "400-800 XP (2-4 hours, multi-step project)"
        }

    def suggest_quest_improvements(
        self,
        title: str,
        description: str,
        user_context: Optional[Dict] = None
    ) -> Dict:
        """
        Analyze a student's quest idea and provide improvement suggestions.

        Args:
            title: The quest title
            description: The quest description
            user_context: Optional context about the user (age, interests, etc.)

        Returns:
            Dict with suggestions, pillar recommendations, XP estimates, and reasoning
        """
        # Build context string
        context_str = ""
        if user_context:
            context_str = f"\nStudent context: {json.dumps(user_context, indent=2)}"

        prompt = f"""{self.philosophy}

TASK: Analyze this student's quest idea and provide constructive, encouraging feedback.

QUEST IDEA:
Title: {title}
Description: {description}
{context_str}

PROVIDE ANALYSIS IN JSON FORMAT:
{{
    "overall_assessment": "Brief encouraging assessment (2-3 sentences)",
    "strengths": ["What's good about this idea (2-3 bullet points)"],
    "improvements": {{
        "title": "Suggested improved title (if needed, otherwise null)",
        "description": "Suggested improved description (if needed, otherwise null)",
        "reasoning": "Why these improvements help"
    }},
    "pillar_recommendations": [
        {{
            "pillar": "One of: {', '.join(self.pillars)}",
            "relevance_score": 0-100,
            "reasoning": "Why this pillar fits"
        }}
    ],
    "xp_recommendation": {{
        "estimated_xp": 100,
        "complexity_level": "simple|moderate|challenging|complex",
        "time_estimate": "10-30 minutes",
        "reasoning": "Why this XP value is appropriate"
    }},
    "philosophy_alignment": {{
        "score": 0-100,
        "feedback": "How well this aligns with 'The Process Is The Goal' philosophy",
        "suggestions": "How to better align with Optio's values"
    }},
    "engagement_score": 0-100,
    "missing_elements": ["What could make this quest more complete"]
}}

GUIDELINES:
- Be encouraging and positive
- Focus on the learning journey, not just outcomes
- Suggest improvements that align with Optio's philosophy
- Consider age-appropriateness and feasibility
- Recommend multiple pillars if the quest is interdisciplinary
- XP Guidelines: {json.dumps(self.xp_guidelines, indent=2)}
"""

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()

            # Extract JSON from response (may be wrapped in markdown code blocks)
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.startswith('```'):
                response_text = response_text[3:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]

            suggestions = json.loads(response_text.strip())

            return {
                "success": True,
                "suggestions": suggestions,
                "generated_at": datetime.utcnow().isoformat()
            }

        except json.JSONDecodeError as e:
            # Fallback if JSON parsing fails
            return {
                "success": False,
                "error": "Failed to parse AI response",
                "raw_response": response_text if 'response_text' in locals() else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def generate_similar_examples(
        self,
        title: str,
        description: str,
        existing_quests: List[Dict],
        limit: int = 3
    ) -> Dict:
        """
        Find similar existing quests to help inspire the student.

        Args:
            title: The student's quest title
            description: The student's quest description
            existing_quests: List of existing quests with title, description, pillar, xp
            limit: Maximum number of examples to return

        Returns:
            Dict with similar quests and reasoning
        """
        # Create a concise summary of existing quests
        quests_summary = []
        for quest in existing_quests[:50]:  # Limit to prevent token overflow
            quests_summary.append({
                "id": quest.get("id", ""),
                "title": quest.get("title", ""),
                "description": quest.get("description", "")[:200],  # Truncate long descriptions
                "pillar": quest.get("pillar", ""),
                "xp": quest.get("total_xp", 0)
            })

        prompt = f"""{self.philosophy}

TASK: Find {limit} existing quests most similar to the student's idea for inspiration.

STUDENT'S QUEST IDEA:
Title: {title}
Description: {description}

EXISTING QUESTS LIBRARY:
{json.dumps(quests_summary, indent=2)}

PROVIDE RECOMMENDATIONS IN JSON FORMAT:
{{
    "similar_quests": [
        {{
            "quest_id": "ID from library",
            "title": "Quest title",
            "similarity_score": 0-100,
            "why_similar": "Brief explanation",
            "inspiration_points": "What the student can learn from this example"
        }}
    ],
    "unique_aspects": "What makes the student's idea unique compared to these examples"
}}

Return the {limit} most relevant quests.
"""

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()

            # Extract JSON
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.startswith('```'):
                response_text = response_text[3:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]

            recommendations = json.loads(response_text.strip())

            return {
                "success": True,
                "recommendations": recommendations,
                "generated_at": datetime.utcnow().isoformat()
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def validate_quest_idea(
        self,
        title: str,
        description: str,
        suggested_tasks: Optional[List[str]] = None
    ) -> Dict:
        """
        Validate if a quest idea is viable and ready for submission.

        Args:
            title: Quest title
            description: Quest description
            suggested_tasks: Optional list of task descriptions

        Returns:
            Dict with validation results and feedback
        """
        tasks_str = ""
        if suggested_tasks:
            tasks_str = f"\nSuggested Tasks:\n" + "\n".join([f"- {task}" for task in suggested_tasks])

        prompt = f"""{self.philosophy}

TASK: Validate if this quest idea is ready for submission and provide constructive feedback.

QUEST IDEA:
Title: {title}
Description: {description}
{tasks_str}

VALIDATION CRITERIA:
1. Clarity: Is the quest clearly explained?
2. Feasibility: Can a student actually complete this?
3. Engagement: Is this interesting and motivating?
4. Philosophy Alignment: Does this align with "The Process Is The Goal"?
5. Completeness: Is there enough information to get started?
6. Age-Appropriateness: Is this suitable for students?

PROVIDE VALIDATION IN JSON FORMAT:
{{
    "is_ready": true/false,
    "overall_score": 0-100,
    "validation_results": {{
        "clarity": {{"score": 0-100, "feedback": "..."}},
        "feasibility": {{"score": 0-100, "feedback": "..."}},
        "engagement": {{"score": 0-100, "feedback": "..."}},
        "philosophy_alignment": {{"score": 0-100, "feedback": "..."}},
        "completeness": {{"score": 0-100, "feedback": "..."}},
        "age_appropriateness": {{"score": 0-100, "feedback": "..."}}
    }},
    "required_improvements": ["List critical improvements needed before submission"],
    "optional_improvements": ["List nice-to-have improvements"],
    "encouragement": "Positive, encouraging message for the student"
}}

Be constructive and encouraging. Focus on helping the student improve their idea.
"""

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()

            # Extract JSON
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.startswith('```'):
                response_text = response_text[3:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]

            validation = json.loads(response_text.strip())

            return {
                "success": True,
                "validation": validation,
                "generated_at": datetime.utcnow().isoformat()
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def recommend_tasks(
        self,
        title: str,
        description: str,
        num_tasks: int = 3
    ) -> Dict:
        """
        Generate task recommendations for a quest idea.

        Args:
            title: Quest title
            description: Quest description
            num_tasks: Number of tasks to recommend

        Returns:
            Dict with task recommendations
        """
        prompt = f"""{self.philosophy}

TASK: Suggest {num_tasks} concrete tasks for this quest idea.

QUEST IDEA:
Title: {title}
Description: {description}

PROVIDE RECOMMENDATIONS IN JSON FORMAT:
{{
    "tasks": [
        {{
            "title": "Task title",
            "description": "What the student will do",
            "pillar": "One of: {', '.join(self.pillars)}",
            "estimated_xp": 50-200,
            "estimated_time": "10-30 minutes",
            "evidence_suggestion": "What evidence the student should submit"
        }}
    ]
}}

Guidelines:
- Make tasks specific and actionable
- Focus on the learning process, not just outcomes
- Suggest evidence that showcases learning
- XP should reflect time and complexity
- Balance different skill pillars if possible
"""

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()

            # Extract JSON
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.startswith('```'):
                response_text = response_text[3:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]

            recommendations = json.loads(response_text.strip())

            return {
                "success": True,
                "task_recommendations": recommendations,
                "generated_at": datetime.utcnow().isoformat()
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
