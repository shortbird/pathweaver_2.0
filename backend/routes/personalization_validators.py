"""
Input validation for quest personalization endpoints.
"""

from typing import Dict, List, Optional, Any
from utils.logger import get_logger

logger = get_logger(__name__)

VALID_APPROACHES = ['real_world_project', 'traditional_class', 'hybrid']

VALID_PILLARS = [
    'STEM & Logic',
    'Life & Wellness',
    'Language & Communication',
    'Society & Culture',
    'Arts & Creativity'
]


def validate_generate_tasks_request(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate request body for generate_tasks endpoint.

    Args:
        data: Request JSON data

    Returns:
        (is_valid, error_message) tuple
    """
    session_id = data.get('session_id')
    if not session_id:
        return False, 'session_id is required'

    approach = data.get('approach', 'hybrid')
    if approach and approach not in VALID_APPROACHES:
        return False, f'Invalid approach. Must be one of: {", ".join(VALID_APPROACHES)}'

    return True, None


def validate_edit_task_request(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate request body for edit_task endpoint.

    Args:
        data: Request JSON data

    Returns:
        (is_valid, error_message) tuple
    """
    session_id = data.get('session_id')
    task_index = data.get('task_index')
    student_edits = data.get('student_edits')

    if not session_id or task_index is None or not student_edits:
        return False, 'session_id, task_index, and student_edits are required'

    return True, None


def validate_manual_task(title: str, description: str) -> tuple[bool, Optional[str]]:
    """
    Validate manual task inputs.

    Args:
        title: Task title
        description: Task description

    Returns:
        (is_valid, error_message) tuple
    """
    if not title or len(title) < 3:
        return False, 'Task title must be at least 3 characters'

    if not description or len(description.strip()) == 0:
        return False, 'Task description is required'

    return True, None


def validate_pillar(pillar: str) -> tuple[bool, Optional[str]]:
    """
    Validate pillar name.

    Args:
        pillar: Pillar name

    Returns:
        (is_valid, error_message) tuple
    """
    if pillar not in VALID_PILLARS:
        return False, f'Invalid pillar. Must be one of: {", ".join(VALID_PILLARS)}'

    return True, None


def validate_finalize_tasks_request(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate request body for finalize_tasks endpoint.

    Args:
        data: Request JSON data

    Returns:
        (is_valid, error_message) tuple
    """
    session_id = data.get('session_id')
    if not session_id:
        return False, 'session_id is required'

    selected_tasks = data.get('tasks', [])
    if not selected_tasks:
        return False, 'No tasks selected'

    return True, None


def validate_accept_task_request(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate request body for accept_task endpoint.

    Args:
        data: Request JSON data

    Returns:
        (is_valid, error_message) tuple
    """
    session_id = data.get('session_id')
    task = data.get('task')

    if not session_id or not task:
        return False, 'session_id and task are required'

    return True, None


def validate_skip_task_request(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate request body for skip_task endpoint.

    Args:
        data: Request JSON data

    Returns:
        (is_valid, error_message) tuple
    """
    session_id = data.get('session_id')
    task = data.get('task')

    if not session_id or not task:
        return False, 'session_id and task are required'

    return True, None


def validate_manual_tasks_batch(tasks: List[Dict[str, Any]]) -> tuple[bool, Optional[str]]:
    """
    Validate batch manual tasks.

    Args:
        tasks: List of task objects

    Returns:
        (is_valid, error_message) tuple
    """
    if not tasks:
        return False, 'No tasks provided'

    return True, None


def clamp_xp_value(xp_value: int, min_xp: int = 50, max_xp: int = 200) -> int:
    """
    Clamp XP value to valid range.

    Args:
        xp_value: Raw XP value
        min_xp: Minimum XP (default 50)
        max_xp: Maximum XP (default 200)

    Returns:
        Clamped XP value
    """
    return min(max(xp_value, min_xp), max_xp)
