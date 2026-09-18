"""A story from a student's whole quest.

`load(user_quest_id)` pools every live completion in the enrolment: one
TaskSource per submitted task, subjects and XP summed across them, the primary
subject the one with the most XP, and the student's own reflections from
`user_quests.reflection_notes`. Merged-away completions are not part of it;
confidential ones are refused upstream by the orchestrator.

Credit is not a gate here (since 2026-09-15; it was). A story can start the
day the work is submitted. Each task carries whether its work has been
credited, and the source's `credit_state` says whether the story may call the
credit earned or must say the review is still open. `credited()` is the one
rule: a completion is credited when a reviewer finalized it, or when it
belongs to a credit class whose review awarded credit to the whole class
(`utils.quest_status`; POE is the case that made this explicit -- its days
never get a `diploma_status` or a review round of their own).

`is_complete` and `status()` are information for the grader panel and the
bookmark queue, not gates: whether the enrolment is finished, how many tasks
have a submission, how many are credited.
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
from utils.quest_status import enrollment_completed_at, is_class_credit_awarded

logger = get_logger(__name__)


class NothingSubmitted(Exception):
    """The enrolment has no live completion: there is no work to write about."""


def credited(completion: Optional[Dict[str, Any]], quest: Optional[Dict[str, Any]]) -> bool:
    """Whether this completion's work has earned credit: finalized on its
    own, or part of a class whose review awarded credit as a whole."""
    if not completion:
        return False
    if completion.get('diploma_status') == 'finalized':
        return True
    return is_class_credit_awarded(quest)


def live_completions(repo, user_quest_id: str) -> Tuple[List[Dict[str, Any]],
                                                       List[Dict[str, Any]]]:
    """(every live completion in task order, the quest's tasks).

    Live means not merged into a newer one. Status does not matter: a draft
    submission is work the student did, and the story says what state the
    credit is in.
    """
    tasks = repo.tasks_for_user_quest(user_quest_id)
    task_ids = [t['id'] for t in tasks if t.get('id')]
    completions = repo.completions_for_tasks(task_ids)
    order = {tid: i for i, tid in enumerate(task_ids)}
    completions.sort(key=lambda c: order.get(c.get('user_quest_task_id'), len(order)))
    return completions, tasks


def is_complete(user_quest: Dict[str, Any], tasks: List[Dict[str, Any]],
                completions: List[Dict[str, Any]]) -> bool:
    """Whether the enrolment is finished: `completed_at` set, its class review
    awarded credit, or every required task has a submission."""
    if user_quest.get('completed_at'):
        return True
    if is_class_credit_awarded(user_quest.get('quests')):
        return True
    required = [t['id'] for t in tasks if t.get('is_required') is not False and t.get('id')]
    if not required:
        return False
    done = {c.get('user_quest_task_id') for c in completions}
    return all(tid in done for tid in required)


def status(user_quest_id: str, *, repo=None, admin=None) -> Optional[Dict[str, Any]]:
    """For the grader panel and the bookmark queue: can a story start from
    this quest, and where its credit stands. None when the enrolment does not
    exist. No evidence is loaded.
    """
    from repositories.story_source_repository import StorySourceRepository

    repo = repo or StorySourceRepository(client=admin)
    user_quest = repo.user_quest(user_quest_id)
    if not user_quest:
        return None
    completions, tasks = live_completions(repo, user_quest_id)
    quest = user_quest.get('quests')
    return {
        'user_quest_id': user_quest_id,
        'can_start': bool(completions),
        'complete': is_complete(user_quest, tasks, completions),
        'submitted_task_count': len(completions),
        'credited_task_count': sum(1 for c in completions if credited(c, quest)),
        'task_count': len(tasks),
    }


def load(user_quest_id: str, *, repo=None, admin=None,
         load_images: bool = True, keep_first_name: bool = False) -> StorySource:
    from repositories.story_source_repository import StorySourceRepository

    repo = repo or StorySourceRepository(client=admin)
    user_quest = repo.user_quest(user_quest_id)
    if not user_quest:
        raise SourceNotFound(f'user_quest {user_quest_id} not found')

    student = build_student(repo, user_quest.get('user_id'))
    if student is None:
        raise SourceNotFound(f'student for user_quest {user_quest_id} not found')
    scrubber = scrubber_for(student, keep_first_name=keep_first_name)

    completions, _tasks = live_completions(repo, user_quest_id)
    if not completions:
        raise NothingSubmitted(f'user_quest {user_quest_id} has no submission')
    quest = user_quest.get('quests')

    task_sources = []
    image_offset = quote_offset = link_offset = 0
    for index, completion in enumerate(completions, start=1):
        task = build_task(repo, completion, index=index, scrubber=scrubber, admin=admin,
                          image_offset=image_offset, load_images=load_images,
                          quote_offset=quote_offset, link_offset=link_offset,
                          credited=credited(completion, quest))
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
        quest_completed_at=enrollment_completed_at(user_quest),
    )
