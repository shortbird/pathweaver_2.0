"""A story from a student's whole quest.

`load(user_quest_id)` pools every FINALIZED completion in the enrolment: one
TaskSource per finalized task, subjects and XP summed across them, the primary
subject the one with the most XP, and the student's own reflections from
`user_quests.reflection_notes`. Pending, returned and merged-away completions
are not part of it; a story about credit earned cannot cite work still under
review.

A quest is complete for this purpose when `completed_at` is set, or when every
required task has a finalized completion. Both are checked here because the
grader's eligibility panel needs the same answer, without loading evidence.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from utils.logger import get_logger

from services.stories.source import (
    StorySource,
    build_quest,
    build_student,
    build_task,
    reflections_from,
    scrubber_for,
)
from services.stories.source_completion import SourceNotFound

logger = get_logger(__name__)


class QuestNotComplete(Exception):
    """The quest is still open and has unfinished required tasks."""


def finalized_completions(repo, user_quest_id: str) -> Tuple[List[Dict[str, Any]],
                                                              List[Dict[str, Any]]]:
    """(finalized completions in task order, the quest's tasks)."""
    tasks = repo.tasks_for_user_quest(user_quest_id)
    task_ids = [t['id'] for t in tasks if t.get('id')]
    completions = repo.finalized_completions_for_tasks(task_ids)
    order = {tid: i for i, tid in enumerate(task_ids)}
    completions.sort(key=lambda c: order.get(c.get('user_quest_task_id'), len(order)))
    return completions, tasks


def is_complete(user_quest: Dict[str, Any], tasks: List[Dict[str, Any]],
                completions: List[Dict[str, Any]]) -> bool:
    if user_quest.get('completed_at'):
        return True
    required = [t['id'] for t in tasks if t.get('is_required') is not False and t.get('id')]
    if not required:
        return False
    done = {c.get('user_quest_task_id') for c in completions}
    return all(tid in done for tid in required)


def status(user_quest_id: str, *, repo=None, admin=None) -> Optional[Dict[str, Any]]:
    """For the grader panel: is the quest complete, and how many tasks count.

    None when the enrolment does not exist. No evidence is loaded.
    """
    from repositories.story_source_repository import StorySourceRepository

    repo = repo or StorySourceRepository(client=admin)
    user_quest = repo.user_quest(user_quest_id)
    if not user_quest:
        return None
    completions, tasks = finalized_completions(repo, user_quest_id)
    return {
        'user_quest_id': user_quest_id,
        'complete': is_complete(user_quest, tasks, completions),
        'finalized_task_count': len(completions),
        'task_count': len(tasks),
    }


def load(user_quest_id: str, *, repo=None, admin=None,
         load_images: bool = True) -> StorySource:
    from repositories.story_source_repository import StorySourceRepository

    repo = repo or StorySourceRepository(client=admin)
    user_quest = repo.user_quest(user_quest_id)
    if not user_quest:
        raise SourceNotFound(f'user_quest {user_quest_id} not found')

    student = build_student(repo, user_quest.get('user_id'))
    if student is None:
        raise SourceNotFound(f'student for user_quest {user_quest_id} not found')
    scrubber = scrubber_for(student)

    completions, tasks = finalized_completions(repo, user_quest_id)
    if not is_complete(user_quest, tasks, completions):
        raise QuestNotComplete(
            f'user_quest {user_quest_id} has unfinished required tasks')
    if not completions:
        raise QuestNotComplete(f'user_quest {user_quest_id} has no finalized task')

    task_sources = []
    image_offset = quote_offset = link_offset = 0
    for index, completion in enumerate(completions, start=1):
        task = build_task(repo, completion, index=index, scrubber=scrubber, admin=admin,
                          image_offset=image_offset, load_images=load_images,
                          quote_offset=quote_offset, link_offset=link_offset)
        image_offset += len(task.images)
        quote_offset += len(task.quotes)
        link_offset += len(task.links)
        task_sources.append(task)

    return StorySource(
        source_type='quest',
        source_id=user_quest_id,
        student=student,
        quest=build_quest(repo, user_quest.get('quest_id'), scrubber),
        tasks=task_sources,
        reflections=reflections_from(user_quest.get('reflection_notes'), scrubber),
        user_quest_id=user_quest_id,
        quest_completed_at=user_quest.get('completed_at'),
    )
