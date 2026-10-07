"""Unread teacher feedback, put where the student is already looking.

Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or the
inbox with a small badge, and students miss it. A banner or pop-up attached to
the quest itself would make sure they see it." Owner decision: a banner on the
quest page and a "New feedback" marker on the quest card, web and mobile.

What counts as unread, and why, is in repositories/task_feedback_repository.py.
This module only shapes it for two readers:

  * GET /api/quests/<id> -- per task `completion_id`, `feedback_count` and
    `unread_feedback`; on the quest `unread_feedback_count` and
    `latest_feedback` (the newest unread note: who, what task, a preview).
  * the quest lists (/api/quests/my-active, /api/users/dashboard) -- one
    `unread_feedback_count` per quest.

Both are best-effort: a banner is not worth a 500, so a failed read leaves the
counts at zero and the page loads.
"""

from typing import Any, Dict, Iterable, List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)

#: Characters of the newest note shown in the banner.
PREVIEW_CHARS = 140


def _preview(body: Optional[str]) -> str:
    text = ' '.join((body or '').split())
    if len(text) <= PREVIEW_CHARS:
        return text
    return text[:PREVIEW_CHARS].rstrip() + '...'


def _author_names(client, messages: Iterable[Dict[str, Any]]) -> Dict[str, str]:
    from utils.feedback_voice import _author_name
    ids = list({m['author_id'] for m in messages if m.get('author_id')})
    if not ids:
        return {}
    rows = (client.table('users').select('id, display_name, first_name, last_name')
            .in_('id', ids).execute()).data or []
    return {r['id']: _author_name(r) for r in rows}


def attach_to_quest_detail(client, *, student_id: str, viewer_is_student: bool,
                           quest_data: Dict[str, Any], tasks: List[Dict[str, Any]],
                           completion_id_by_task: Dict[str, str]) -> None:
    """Put feedback state on the quest and on each task, in place.

    `viewer_is_student` is False for a parent in family scope or staff reading
    through it: the unread rows are the student's own bell, so nobody else is
    told they are new (and nobody else's visit may clear them). They still get
    `feedback_count`, so the thread shows on the task for them.
    """
    for task in tasks:
        task['completion_id'] = completion_id_by_task.get(task['id'])
        task['feedback_count'] = 0
        task['unread_feedback'] = 0
    quest_data['unread_feedback_count'] = 0
    quest_data['latest_feedback'] = None
    if not completion_id_by_task:
        return
    try:
        from repositories.task_feedback_repository import TaskFeedbackRepository
        repo = TaskFeedbackRepository(client)
        completion_ids = list(completion_id_by_task.values())
        messages = repo.teacher_messages(student_id, completion_ids)
        unread = (repo.unread_by_completion(student_id, completion_ids)
                  if viewer_is_student else {})
    except Exception as e:  # noqa: BLE001 -- see module docstring
        logger.warning(f'[QUEST DETAIL] feedback state unavailable: {e}')
        return

    per_completion: Dict[str, int] = {}
    for m in messages:
        per_completion[m['completion_id']] = per_completion.get(m['completion_id'], 0) + 1
    for task in tasks:
        cid = task['completion_id']
        if cid:
            task['feedback_count'] = per_completion.get(cid, 0)
            task['unread_feedback'] = unread.get(cid, 0)
    quest_data['unread_feedback_count'] = sum(t['unread_feedback'] for t in tasks)

    # The banner names the newest note that is still unread. messages is
    # newest first, so the first one on an unread completion is it.
    newest = next((m for m in messages if unread.get(m['completion_id'])), None)
    if not newest:
        return
    from utils.feedback_voice import _is_optio_voice
    task = next((t for t in tasks if t['completion_id'] == newest['completion_id']), {})
    try:
        names = {} if _is_optio_voice(newest.get('author_role')) else _author_names(client, [newest])
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[QUEST DETAIL] feedback author unavailable: {e}')
        names = {}
    quest_data['latest_feedback'] = {
        'task_id': task.get('id'),
        'task_title': task.get('title'),
        'completion_id': newest['completion_id'],
        # Same voice rule as the thread and the notification: Optio's own
        # review is "Optio", a school's teacher is their real name.
        'author_name': ('Optio' if _is_optio_voice(newest.get('author_role'))
                        else names.get(newest['author_id'], 'Your teacher')),
        'preview': _preview(newest.get('body')),
        'created_at': newest.get('created_at'),
    }


def unread_counts_by_quest(client, user_id: str) -> Dict[str, int]:
    """{quest_id: unread feedback} for a student's own quest list; {} on failure."""
    try:
        from repositories.task_feedback_repository import TaskFeedbackRepository
        return TaskFeedbackRepository(client).unread_by_quest(user_id)
    except Exception as e:  # noqa: BLE001 -- a card marker is not worth a 500
        logger.warning(f'unread feedback counts unavailable for {user_id[:8]}: {e}')
        return {}
