"""A story from one credit submission.

`load(completion_id)` returns a StorySource with exactly one TaskSource. The
gates (not merged, not confidential) are NOT applied here: the orchestrator
reads the flags off the dataclass and decides, so the reason a story was
refused is one place, not two. Whether the work has been credited is a fact
on the task (source_quest.credited), not a gate.
"""

from __future__ import annotations

from typing import Optional

from utils.logger import get_logger

from services.stories.source import (
    StorySource,
    build_quest,
    build_student,
    build_task,
    reflections_from,
    scrubber_for,
)

logger = get_logger(__name__)


class SourceNotFound(Exception):
    """The completion, or the student behind it, does not exist."""


def load(completion_id: str, *, repo=None, admin=None,
         load_images: bool = True, keep_first_name: bool = False) -> StorySource:
    from repositories.story_source_repository import StorySourceRepository

    repo = repo or StorySourceRepository(client=admin)
    completion = repo.completion(completion_id)
    if not completion:
        raise SourceNotFound(f'completion {completion_id} not found')

    student = build_student(repo, completion.get('user_id'))
    if student is None:
        raise SourceNotFound(f'student for completion {completion_id} not found')
    scrubber = scrubber_for(student, keep_first_name=keep_first_name)

    from services.stories.source_quest import credited

    quest_row = repo.quest(completion.get('quest_id')) if completion.get('quest_id') else None
    task = build_task(repo, completion, index=1, scrubber=scrubber, admin=admin,
                      load_images=load_images, credited=credited(completion, quest_row))

    user_quest = None
    task_row = repo.task(completion.get('user_quest_task_id')) or {}
    user_quest_id: Optional[str] = task_row.get('user_quest_id')
    if user_quest_id:
        user_quest = repo.user_quest(user_quest_id)

    return StorySource(
        source_type='credit_submission',
        source_id=completion_id,
        student=student,
        quest=build_quest(repo, completion.get('quest_id'), scrubber),
        tasks=[task],
        reflections=reflections_from((user_quest or {}).get('reflection_notes'), scrubber),
        user_quest_id=user_quest_id,
        quest_completed_at=(user_quest or {}).get('completed_at'),
    )
