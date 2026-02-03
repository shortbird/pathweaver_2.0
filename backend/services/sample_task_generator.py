"""
Sample Task Generator Service
==============================

Generates AI-powered sample tasks for Optio quests using Gemini API.
Aligned with core philosophy: process-focused, real-world application, present-tense language.

Refactored (Jan 2026): Now uses shared prompt components and BaseAIService.
"""

import json
from typing import List, Dict, Optional
from utils.logger import get_logger

# Import shared components
from prompts.components import (
    CORE_PHILOSOPHY,
    LANGUAGE_GUIDELINES,
    PILLAR_DEFINITIONS,
    VALID_PILLARS,
    JSON_OUTPUT_INSTRUCTIONS,
    FORBIDDEN_WORDS,
    ENCOURAGED_WORDS,
    TONE_LEVELS,
)
from services.base_ai_service import get_gemini_model, BaseAIService

logger = get_logger(__name__)

def generate_sample_tasks(quest_title: str, quest_description: str, count: int = 20) -> List[Dict]:
    """
    Generate diverse sample tasks for an Optio quest using Gemini AI.

    Args:
        quest_title: The quest title
        quest_description: The quest big idea/description
        count: Number of sample tasks to generate (default 20)

    Returns:
        List of task dictionaries with title, description, pillar, xp_value

    Raises:
        Exception: If API call fails or response is invalid
    """
    # Get singleton Gemini model from BaseAIService
    model = get_gemini_model()

    prompt = _build_prompt(quest_title, quest_description, count)

    try:
        logger.info(f"Generating {count} sample tasks for quest: {quest_title}")

        response = model.generate_content(prompt)

        if not response or not response.text:
            raise Exception("Empty response from Gemini API")

        # Use unified JSON extraction from BaseAIService
        service = BaseAIService()
        tasks = service.extract_json(response.text)

        if not tasks:
            raise Exception("Failed to parse JSON from response")

        if not isinstance(tasks, list):
            # Handle case where response is wrapped in an object
            if isinstance(tasks, dict) and 'tasks' in tasks:
                tasks = tasks['tasks']
            else:
                raise Exception("Response is not a JSON array")

        # Validate and normalize tasks
        validated_tasks = []
        for task in tasks:
            validated_task = _validate_task(task)
            if validated_task:
                validated_tasks.append(validated_task)

        if len(validated_tasks) < 10:
            logger.warning(f"Only generated {len(validated_tasks)} valid tasks out of {count} requested")

        logger.info(f"Successfully generated {len(validated_tasks)} sample tasks")

        return validated_tasks

    except Exception as e:
        logger.error(f"Error generating sample tasks: {str(e)}")
        raise


def _build_prompt(quest_title: str, quest_description: str, count: int) -> str:
    """
    Build the Gemini prompt for sample task generation.
    Uses shared components from prompts.components.
    """

    return f"""You are creating sample tasks for a self-directed learning quest in the Optio platform.

{CORE_PHILOSOPHY}

{LANGUAGE_GUIDELINES}

{TONE_LEVELS['content_generation']}

QUEST DETAILS:
Title: {quest_title}
Description: {quest_description}

Generate exactly {count} diverse sample tasks that:
1. Cover all 5 pillars (STEM, Wellness, Communication, Civics, Art) with flexible distribution based on quest content
2. Focus EXCLUSIVELY on REAL-WORLD APPLICATION (sports, hobbies, interests, creative projects, daily life)
3. Inspire personal exploration and curiosity
4. Use process-focused, present-tense language
5. Celebrate the journey, not the destination
6. Avoid ALL traditional study approaches (no textbooks, lectures, practice tests)

{PILLAR_DEFINITIONS}

TASK TITLE EXAMPLES (concise, clear, 3-8 words):
- "Explore [concept] Through Your Favorite Hobby"
- "Create [artifact] That Connects to Your Life"
- "Discover Patterns in [topic] Around You"
- "Experiment with [skill] in Nature"

TASK DESCRIPTION EXAMPLES (2-3 sentences, process-focused, no exclamation points):
- "Dive into how [concept] appears in your favorite sport or hobby. Document what you discover through photos, videos, or drawings."
- "Create something unique that connects [topic] to what matters to you. Let your curiosity guide the process and see what connections emerge."
- "Observe [subject] in your daily routine for a week. Notice patterns, changes, and surprises as you pay closer attention."

IMPORTANT - TONE RULES:
- NO exclamation points
- NO "You're becoming..." or similar motivational phrases
- Focus on WHAT they will do, not how they will feel
- Let the activity speak for itself without hype
- Simple, direct, inviting language

For each task, provide:
- title: Concise, clear (3-8 words)
- description: 2-3 sentences, process-focused, specific but flexible
- pillar: Must be one of: "stem", "wellness", "communication", "civics", "art"
- xp_value: Integer between 50-200 (most should be 100-150, complex tasks can be 150-200)

{JSON_OUTPUT_INSTRUCTIONS}

Example format:
[
  {{
    "title": "Explore Geometry in Your Neighborhood",
    "description": "Take a walk and notice geometric shapes in buildings, nature, and everyday objects. Capture photos and create a visual collection of the patterns you find.",
    "pillar": "stem",
    "xp_value": 100
  }},
  {{
    "title": "Create a Wellness Ritual",
    "description": "Design a daily practice that helps you feel centered and energized. Experiment with movement, breathing, or mindfulness to find what works for you.",
    "pillar": "wellness",
    "xp_value": 125
  }}
]"""


def _validate_task(task: Dict) -> Optional[Dict]:
    """
    Validate and normalize a generated task.
    Uses VALID_PILLARS from shared components.

    Returns None if task is invalid, otherwise returns normalized task.
    """

    # Required fields
    if not task.get('title') or not isinstance(task['title'], str):
        logger.warning(f"Invalid task: missing or invalid title")
        return None

    if not task.get('pillar') or not isinstance(task['pillar'], str):
        logger.warning(f"Invalid task: missing or invalid pillar")
        return None

    # Normalize pillar to lowercase
    pillar = task['pillar'].lower().strip()

    # Validate pillar using shared constant
    if pillar not in VALID_PILLARS:
        logger.warning(f"Invalid pillar: {pillar}")
        return None

    # Validate XP value
    xp_value = task.get('xp_value', 100)
    if not isinstance(xp_value, (int, float)):
        xp_value = 100
    xp_value = int(xp_value)
    if xp_value < 50:
        xp_value = 50
    if xp_value > 200:
        xp_value = 200

    # Description is optional but should be string if present
    description = task.get('description', '')
    if not isinstance(description, str):
        description = ''

    return {
        'title': task['title'].strip(),
        'description': description.strip(),
        'pillar': pillar,
        'xp_value': xp_value
    }


def validate_sample_tasks_quality(tasks: List[Dict]) -> Dict:
    """
    Analyze quality of generated sample tasks for philosophy alignment.
    Uses FORBIDDEN_WORDS and ENCOURAGED_WORDS from shared components.

    Returns a report dict with scores and flagged issues.
    """
    issues = []
    pillar_distribution = {}
    xp_distribution = {'50-100': 0, '101-150': 0, '151-200': 0}

    for i, task in enumerate(tasks):
        # Check for forbidden words using shared constant
        text = f"{task.get('title', '')} {task.get('description', '')}".lower()

        for word in FORBIDDEN_WORDS:
            if word in text:
                issues.append(f"Task {i+1} contains forbidden word: '{word}'")

        # Track pillar distribution
        pillar = task.get('pillar', 'unknown')
        pillar_distribution[pillar] = pillar_distribution.get(pillar, 0) + 1

        # Track XP distribution
        xp = task.get('xp_value', 100)
        if xp <= 100:
            xp_distribution['50-100'] += 1
        elif xp <= 150:
            xp_distribution['101-150'] += 1
        else:
            xp_distribution['151-200'] += 1

    # Check pillar coverage
    if len(pillar_distribution) < 5:
        issues.append(f"Only {len(pillar_distribution)} pillars covered, should have all 5")

    # Calculate encouraged word usage using shared constant
    encouraged_count = 0
    for task in tasks:
        text = f"{task.get('title', '')} {task.get('description', '')}".lower()
        if any(word in text for word in ENCOURAGED_WORDS):
            encouraged_count += 1

    return {
        'total_tasks': len(tasks),
        'pillar_distribution': pillar_distribution,
        'xp_distribution': xp_distribution,
        'encouraged_language_usage': f"{encouraged_count}/{len(tasks)}",
        'issues': issues,
        'quality_score': max(0, 100 - len(issues) * 5)  # Deduct 5 points per issue
    }
