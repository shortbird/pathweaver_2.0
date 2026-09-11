"""What a student's classes have assigned to them, keyed by quest.

Three callers need the same answer and must not each grow their own version of
it:

* the home page, to put a due date on a quest card;
* the class list, to say how much of a class is still outstanding;
* the task-completion path, to know whether a quest is schoolwork before it
  ends the enrollment on the student's behalf.

Only *published* assignments count. `class_quests.publish_at` in the future is
a teacher scheduling work for later; the student is not late for it and should
not be told about it.

Only assignments *for this student* count. `class_quests.student_ids` NULL is
the whole class; a list is those students only (Gryffin, 2026-09-10). A quest
kept to three classmates is not this student's schoolwork and must not put a
due date on their home page.

Scope note: every read here is bounded by one student's own enrollments, so a
single request per table stays under PostgREST's 1000-row cap. Do not reuse
these for a whole-org sweep without paging (see utils/db_fetch.fetch_all_rows).
"""

from typing import Any, Dict, List, Optional, Set

from utils.logger import get_logger
from utils.timestamps import now_iso as _now_iso
from utils.validation.sanitizers import pgrst_timestamp

logger = get_logger(__name__)


def _published_filter():
    """PostgREST `or` clause for 'this assignment is visible to students now'."""
    return f'publish_at.is.null,publish_at.lte.{pgrst_timestamp(_now_iso(), "publish_at")}'


def assigned_to(link: Dict[str, Any], student_id: str) -> bool:
    """Is this student in the class quest's audience? NULL student_ids = everyone."""
    ids = link.get('student_ids')
    return ids is None or student_id in ids


def student_active_class_ids(client, student_id: str) -> List[str]:
    """Ids of the active classes this student is actively enrolled in.

    Both filters matter. An enrollment left behind by a withdrawal, or a class
    the school archived at the end of a term, must not put a due date on the
    student's home page months later.
    """
    enrollments = (client.table('class_enrollments')
                   .select('class_id')
                   .eq('student_id', student_id)
                   .eq('status', 'active')
                   .execute()).data or []
    class_ids = [e['class_id'] for e in enrollments if e.get('class_id')]
    if not class_ids:
        return []

    classes = (client.table('org_classes')
               .select('id')
               .in_('id', class_ids)
               .eq('status', 'active')
               .execute()).data or []
    return [c['id'] for c in classes]


def student_class_names(client, class_ids: List[str]) -> Dict[str, str]:
    if not class_ids:
        return {}
    rows = (client.table('org_classes')
            .select('id, name')
            .in_('id', class_ids)
            .execute()).data or []
    return {r['id']: r.get('name') for r in rows}


def student_class_assignments(client, student_id: str) -> Dict[str, Dict[str, Any]]:
    """Published class assignments for this student, keyed by quest id.

    Returns {quest_id: {'class_id', 'class_name', 'due_date'}}.

    A quest can be assigned to more than one of a student's classes, and at
    Gryffin one already is. The soonest due date wins, because that is the one
    the student is actually held to; showing the later one would tell them they
    have time they do not have. An assignment with no due date never displaces
    one that has a date.
    """
    try:
        class_ids = student_active_class_ids(client, student_id)
        if not class_ids:
            return {}
        names = student_class_names(client, class_ids)

        rows = (client.table('class_quests')
                .select('class_id, quest_id, due_date, student_ids')
                .in_('class_id', class_ids)
                .or_(_published_filter())
                .execute()).data or []
    except Exception as e:  # noqa: BLE001 — a missing due date must not cost the page
        logger.warning(f'Could not load class assignments for {student_id}: {e}')
        return {}

    by_quest: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        quest_id = r.get('quest_id')
        if not quest_id or not assigned_to(r, student_id):
            continue
        candidate = {
            'class_id': r.get('class_id'),
            'class_name': names.get(r.get('class_id')),
            'due_date': r.get('due_date'),
        }
        current = by_quest.get(quest_id)
        if current is None or _is_sooner(candidate['due_date'], current['due_date']):
            by_quest[quest_id] = candidate
    return by_quest


def _is_sooner(candidate: Optional[str], current: Optional[str]) -> bool:
    """Does `candidate` replace `current` as the date the student is held to?"""
    if candidate is None:
        return False
    if current is None:
        return True
    return candidate < current


def assigned_quest_ids_by_class(client, class_ids: List[str],
                                student_id: Optional[str] = None) -> Dict[str, Set[str]]:
    """{class_id: {quest_id, ...}} for the published assignments of these classes.

    With student_id, only the assignments that student is in the audience of.
    Without it, every published assignment on the class -- the staff view.
    """
    if not class_ids:
        return {}
    try:
        rows = (client.table('class_quests')
                .select('class_id, quest_id, student_ids')
                .in_('class_id', class_ids)
                .or_(_published_filter())
                .execute()).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not load class quest assignments: {e}')
        return {}

    by_class: Dict[str, Set[str]] = {}
    for r in rows:
        if not (r.get('class_id') and r.get('quest_id')):
            continue
        if student_id and not assigned_to(r, student_id):
            continue
        by_class.setdefault(r['class_id'], set()).add(r['quest_id'])
    return by_class


def is_class_assigned(client, student_id: str, quest_id: str) -> bool:
    """Is this quest schoolwork for this student, rather than their own pick?

    The distinction decides whether the platform may end the quest for them.
    Assigned work is finished when the teacher's tasks are turned in. A quest a
    student chose is theirs to keep open for as long as they want to add to it,
    which is the whole point of "The Process Is The Goal".
    """
    try:
        class_ids = student_active_class_ids(client, student_id)
        if not class_ids:
            return False
        rows = (client.table('class_quests')
                .select('quest_id, student_ids')
                .in_('class_id', class_ids)
                .eq('quest_id', quest_id)
                .or_(_published_filter())
                .execute()).data or []
        return any(assigned_to(r, student_id) for r in rows)
    except Exception as e:  # noqa: BLE001 — treat an unknown as "not assigned"
        logger.warning(f'Could not resolve class assignment for {quest_id}: {e}')
        return False
