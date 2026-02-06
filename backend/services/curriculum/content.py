"""
Curriculum Content Processing

Handles content validation, cleaning, and transformation.
"""

import re
from typing import Dict, List, Any

from utils.logger import get_logger

logger = get_logger(__name__)


def validate_philosophy_alignment(result: Dict) -> Dict:
    """
    Validate and fix philosophy alignment result.

    Ensures we have required structure even if AI returns different format.

    Args:
        result: Raw AI result from philosophy alignment

    Returns:
        Validated result with required structure
    """
    # Ensure basic structure exists
    if 'course' not in result:
        result['course'] = {}

    course = result['course']

    # Extract title from nested locations
    if 'title' not in course or not course['title']:
        # Try to extract from various possible locations
        if 'metadata' in course and 'title' in course['metadata']:
            course['title'] = course['metadata']['title']
        elif 'name' in course:
            course['title'] = course['name']
        else:
            course['title'] = 'Untitled Course'

    # Ensure description exists
    if 'description' not in course or not course['description']:
        course['description'] = ''

    # Ensure projects array exists
    if 'projects' not in course:
        course['projects'] = []

    # Validate each project
    for project in course['projects']:
        if 'title' not in project or not project['title']:
            project['title'] = 'Untitled Project'
        if 'description' not in project:
            project['description'] = ''
        if 'lessons' not in project:
            project['lessons'] = []

        # Validate lessons
        for lesson in project.get('lessons', []):
            if 'title' not in lesson or not lesson['title']:
                lesson['title'] = 'Untitled Lesson'
            if 'content' not in lesson:
                lesson['content'] = ''

    return result


def clean_course_description(description: str) -> str:
    """
    Clean AI-generated course description.

    Removes:
    - Optio philosophy boilerplate
    - Meta-commentary about the description
    - Excessive length

    Args:
        description: Raw course description

    Returns:
        Cleaned description (max 500 chars)
    """
    if not description:
        return ''

    # Patterns to remove (Optio boilerplate)
    remove_patterns = [
        r'This course embodies.*?philosophy[.,]?\s*',
        r'Following (?:the )?Optio.*?approach[.,]?\s*',
        r'In (?:the )?Optio (?:way|style|approach).*?[.,]\s*',
        r'(?:The )?process is the goal.*?[.,]\s*',
        r'Students will discover.*?journey[.,]?\s*',
        r'This learning experience.*?growth[.,]?\s*',
        r'Embracing.*?philosophy[.,]?\s*',
        r'Through hands-on exploration[.,]?\s*',
        r'(?:This )?course description:?\s*',
        r'Here is (?:a |the )?(?:cleaned |refined )?(?:course )?description:?\s*',
    ]

    cleaned = description
    for pattern in remove_patterns:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)

    # Remove leading/trailing whitespace and excessive newlines
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    cleaned = cleaned.strip()

    # Truncate if too long
    if len(cleaned) > 500:
        # Try to break at sentence boundary
        truncated = cleaned[:500]
        last_period = truncated.rfind('.')
        if last_period > 300:
            cleaned = truncated[:last_period + 1]
        else:
            cleaned = truncated.rsplit(' ', 1)[0] + '...'

    return cleaned


def clean_quest_description(description: str) -> str:
    """
    Clean AI-generated quest/project description.

    Removes Optio boilerplate and meta-commentary.

    Args:
        description: Raw quest description

    Returns:
        Cleaned description (max 300 chars)
    """
    if not description:
        return ''

    # Similar patterns for quest descriptions
    remove_patterns = [
        r'This (?:quest|project) embodies.*?philosophy[.,]?\s*',
        r'Following (?:the )?Optio.*?[.,]\s*',
        r'(?:The )?process is the goal.*?[.,]\s*',
        r'Students will explore.*?journey[.,]?\s*',
        r'(?:This )?(?:quest|project) description:?\s*',
        r'Here is (?:a |the )?description:?\s*',
    ]

    cleaned = description
    for pattern in remove_patterns:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    cleaned = cleaned.strip()

    # Truncate if too long
    if len(cleaned) > 300:
        truncated = cleaned[:300]
        last_period = truncated.rfind('.')
        if last_period > 200:
            cleaned = truncated[:last_period + 1]
        else:
            cleaned = truncated.rsplit(' ', 1)[0] + '...'

    return cleaned


def process_course(course_data: Dict) -> Dict:
    """
    Process and clean course data.

    Args:
        course_data: Raw course data from AI

    Returns:
        Cleaned course data
    """
    return {
        'title': course_data.get('title', 'Untitled Course'),
        'description': clean_course_description(course_data.get('description', '')),
        'projects': process_projects(course_data.get('projects', []))
    }


def process_projects(projects_data: List) -> List[Dict]:
    """
    Process and clean project data.

    Args:
        projects_data: List of raw project data

    Returns:
        List of cleaned project data
    """
    processed = []
    for i, project in enumerate(projects_data):
        processed.append({
            'title': project.get('title', f'Project {i + 1}'),
            'description': clean_quest_description(project.get('description', '')),
            'sequence_order': i + 1,
            'lessons': process_lessons(project.get('lessons', []))
        })
    return processed


def process_lessons(lessons_data: List) -> List[Dict]:
    """
    Process and clean lesson data.

    Args:
        lessons_data: List of raw lesson data

    Returns:
        List of cleaned lesson data
    """
    processed = []
    for i, lesson in enumerate(lessons_data):
        lesson_content = lesson.get('content', '')

        # Handle nested content structures
        if isinstance(lesson_content, dict):
            # Extract text from various possible keys
            lesson_content = (
                lesson_content.get('text', '') or
                lesson_content.get('body', '') or
                lesson_content.get('description', '') or
                str(lesson_content)
            )

        processed.append({
            'title': lesson.get('title', f'Lesson {i + 1}'),
            'content': lesson_content,
            'sequence_order': i + 1
        })
    return processed


def build_preview(content_result: Dict) -> Dict:
    """
    Build preview data for UI display.

    Args:
        content_result: Generated content result

    Returns:
        Preview data structure
    """
    course = content_result.get('course', {})
    projects = course.get('projects', [])

    return {
        'course_title': course.get('title', 'Untitled'),
        'project_count': len(projects),
        'lesson_count': sum(len(p.get('lessons', [])) for p in projects),
        'projects': [
            {
                'title': p.get('title'),
                'lesson_count': len(p.get('lessons', []))
            }
            for p in projects
        ]
    }
