"""Size a family- or student-written task's XP after it is saved.

The family's own number stays in ``user_quest_tasks.xp_value``: it is their claim
about the task. This writes the AI's size for the same task into
``ai_suggested_xp`` so the credit reviewer can see the two side by side and find
the inflated ones (a 200 XP task whose checklist is one photo) without
re-reading every task.

Best effort, on a daemon thread, the same shape as the AI credit review trigger
(services/credit_ai_review/trigger.py): the family's save has already
succeeded, a web process can be recycled a second after the response goes out,
and a task that never gets sized just shows no AI number at review. Nothing
depends on it finishing.

Only hand-written tasks are sized. AI-generated and library tasks already carry
an AI-sized XP, and a teacher's number is not a claim to check.
"""

from __future__ import annotations

import sys
import threading
from typing import Any, Dict, List

from utils.logger import get_logger


logger = get_logger(__name__)

#: Sizing calls this process runs at once. A family adding ten tasks in one
#: batch should not become ten simultaneous model calls.
_SLOTS = threading.BoundedSemaphore(2)


def size_family_tasks(learner_id: str, rows: List[Dict[str, Any]]) -> bool:
    """Size these rows unless the learner's AI access is off.

    The task text is the child's (or written for the child), so the parent's AI
    toggle for that child decides whether it may go to the model -- the same gate
    "Help me finish this" and task generation use. Never raises.
    """
    try:
        from utils.ai_access import check_ai_access
        has_access, _, _ = check_ai_access(learner_id)
        if not has_access:
            return False
        return size_in_background(rows)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Task XP sizing not queued for {str(learner_id)[:8]}: {e}')
        return False


def size_in_background(tasks: List[Dict[str, Any]]) -> bool:
    """Queue XP sizing for these just-created task rows. False if skipped.

    Each row needs ``id`` and ``title``; ``description`` and
    ``success_criteria`` are used when present. Skipped under the test app, so
    no suite ever reaches the model through this path.
    """
    rows = [t for t in (tasks or []) if isinstance(t, dict) and t.get('id') and t.get('title')]
    if not rows:
        return False

    app = None
    try:
        from flask import current_app
        # The thread outlives this request, so it needs the real app object
        # rather than a proxy that will point at nothing once the request ends.
        app = current_app._get_current_object()  # type: ignore[attr-defined]
    except (RuntimeError, AttributeError):
        app = None

    # Never reach the model from a test run: TESTING covers the app fixture, and
    # a loaded pytest covers a route called under a bare Flask() in a unit test.
    if (app is not None and app.config.get('TESTING')) or 'pytest' in sys.modules:
        return False

    thread = threading.Thread(target=_run, args=(rows, app), name='task-xp-sizing', daemon=True)
    thread.start()
    return True


def _run(rows: List[Dict[str, Any]], app) -> None:
    with _SLOTS:
        if app is not None:
            with app.app_context():
                _size_each(rows)
        else:
            _size_each(rows)


def _size_each(rows: List[Dict[str, Any]]) -> None:
    from repositories.task_repository import TaskRepository
    from services.task_quality_service import TaskQualityService

    service = TaskQualityService()
    for row in rows:
        try:
            result = service.analyze_task_quality(
                title=row.get('title') or '',
                description=row.get('description') or '',
                pillar=row.get('pillar'),
                success_criteria=row.get('success_criteria') or [],
            )
            TaskRepository().set_ai_suggested_xp(row['id'], result['suggested_xp'])
        except Exception as e:  # noqa: BLE001
            # One task failing must not stop the rest; an unsized task simply
            # shows no AI number at review.
            logger.warning(f'Task XP sizing failed for {str(row.get("id"))[:8]}: {e}')
