"""
Sample Task Generator Service
==============================

Generates AI-powered sample tasks for Optio quests using Gemini API.
Aligned with core philosophy: process-focused, real-world application, present-tense language.
"""

import os
import json
from typing import List, Dict, Optional
from utils.logger import get_logger

logger = get_logger(__name__)

# Gemini API setup
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GEMINI_MODEL = 'gemini-2.0-flash-lite'  # Using the specified model from CLAUDE.md

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

    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not configured")

    prompt = _build_prompt(quest_title, quest_description, count)

    try:
        # Import here to avoid issues if google-generativeai not installed
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL)

        logger.info(f"Generating {count} sample tasks for quest: {quest_title}")

        response = model.generate_content(prompt)

        if not response or not response.text:
            raise Exception("Empty response from Gemini API")

        # Parse JSON response
        response_text = response.text.strip()

        # Remove markdown code blocks if present
        if response_text.startswith('```'):
            # Find first { and last }
            start = response_text.find('[')
            end = response_text.rfind(']') + 1
            if start != -1 and end > start:
                response_text = response_text[start:end]

        tasks = json.loads(response_text)

        if not isinstance(tasks, list):
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

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response as JSON: {str(e)}")
        logger.error(f"Response text: {response_text[:500]}")
        raise Exception("Invalid JSON response from AI")
    except Exception as e:
        logger.error(f"Error generating sample tasks: {str(e)}")
        raise


def _build_prompt(quest_title: str, quest_description: str, count: int) -> str:
    """
    Build the Gemini prompt for sample task generation.
    Aligned with core philosophy from core_philosophy.md.
    """

    return f"""You are creating sample tasks for a self-directed learning quest in the Optio platform.

CORE PHILOSOPHY (from core_philosophy.md):
- "The Process Is The Goal" - learning is about growth RIGHT NOW, not future outcomes
- Celebrate curiosity, creation, and discovery for its own sake
- Focus on how learning FEELS, not how it LOOKS
- Every step is valuable, mistakes are celebrated
- Use present-focused, process-oriented language
- NEVER use external validation language

LANGUAGE GUIDELINES:
✅ USE: "Discover...", "Explore...", "Create...", "Experiment with...", "Dive into..."
✅ USE: Present-tense, active verbs that celebrate the journey
✅ USE: Real-world application and personal connection

❌ NEVER USE: "Prove", "demonstrate", "show", "impress", "showcase"
❌ NEVER USE: Future-focused language ("will help you", "for college", "for your career")
❌ NEVER USE: Traditional study approaches (textbooks, lectures, practice tests, worksheets)
❌ NEVER USE: External validation language ("build resume", "stand out", "get ahead")
❌ NEVER USE: Competition language

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

TASK TITLE EXAMPLES (concise, inspiring, 3-8 words):
- "Explore [concept] Through Your Favorite Hobby"
- "Create [artifact] That Connects to Your Life"
- "Discover Patterns in [topic] Around You"
- "Experiment with [skill] in Nature"

TASK DESCRIPTION EXAMPLES (2-3 sentences, philosophy-aligned):
- "Dive into how [concept] appears in your favorite sport or hobby. Document what you discover through photos, videos, or drawings. You're becoming an explorer of everyday science!"
- "Create something unique that connects [topic] to what matters to you. Let your curiosity guide the process. You're making original connections!"
- "Observe [subject] in your daily routine for a week. Notice patterns, changes, and surprises. You're training your eye to see the world differently!"

For each task, provide:
- title: Concise, inspiring (3-8 words)
- description: 2-3 sentences, philosophy-aligned, specific but flexible
- pillar: Must be one of: "stem", "wellness", "communication", "civics", "art"
- xp_value: Integer between 50-200 (most should be 100-150, complex tasks can be 150-200)

Return ONLY a valid JSON array with exactly {count} task objects. No markdown formatting, no code blocks, just the raw JSON array.

Example format:
[
  {{
    "title": "Explore Geometry in Your Neighborhood",
    "description": "Take a walk and discover geometric shapes in buildings, nature, and everyday objects. Capture photos and create a visual collection. You're seeing math come alive around you!",
    "pillar": "stem",
    "xp_value": 100
  }},
  {{
    "title": "Create a Wellness Ritual You Love",
    "description": "Design a daily practice that helps you feel centered and energized. Experiment with movement, breathing, or mindfulness. You're discovering what makes you thrive!",
    "pillar": "wellness",
    "xp_value": 125
  }}
]"""


def _validate_task(task: Dict) -> Optional[Dict]:
    """
    Validate and normalize a generated task.

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

    # Validate pillar
    valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
    if pillar not in valid_pillars:
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

    Returns a report dict with scores and flagged issues.
    """

    # Forbidden words/phrases (external validation)
    forbidden_words = [
        'prove', 'demonstrate', 'show', 'impress', 'showcase',
        'resume', 'career', 'college', 'future', 'stand out',
        'get ahead', 'compete', 'better than', 'textbook',
        'lecture', 'test', 'worksheet', 'practice problems'
    ]

    # Encouraged words (process-focused)
    encouraged_words = [
        'explore', 'discover', 'create', 'experiment', 'dive',
        'observe', 'notice', 'feel', 'experience', 'play'
    ]

    issues = []
    pillar_distribution = {}
    xp_distribution = {'50-100': 0, '101-150': 0, '151-200': 0}

    for i, task in enumerate(tasks):
        # Check for forbidden words
        text = f"{task.get('title', '')} {task.get('description', '')}".lower()

        for word in forbidden_words:
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

    # Calculate encouraged word usage
    encouraged_count = 0
    for task in tasks:
        text = f"{task.get('title', '')} {task.get('description', '')}".lower()
        if any(word in text for word in encouraged_words):
            encouraged_count += 1

    return {
        'total_tasks': len(tasks),
        'pillar_distribution': pillar_distribution,
        'xp_distribution': xp_distribution,
        'encouraged_language_usage': f"{encouraged_count}/{len(tasks)}",
        'issues': issues,
        'quality_score': max(0, 100 - len(issues) * 5)  # Deduct 5 points per issue
    }
