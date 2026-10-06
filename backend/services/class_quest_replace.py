"""
A teacher's copy takes the original's place on their class.

iCreate, ticket 987218e0 (2026-10-06): a teacher cannot edit a quest the office
or the Optio library wrote (services/quest_edit_rules, on purpose: other
classes share it), so they make their own copy (services/class_quest_copy) and
change that. But the copy went on the class BESIDE the original, so the
students got both.

"Replace the original on this class" does three things, on THIS class only:

  1. the copy is on the class for at least the original's students (its own
     audience is widened to cover them, never narrowed);
  2. the original's class_quests row for this class is removed -- every other
     class that carries the original keeps it exactly as it was;
  3. students who had the original from this class lose it ONLY when they
     have not started it: no completed task, no evidence, no task of their own
     (class_quest_enrollment.withdraw_students_from_quest with
     set_down_started=False). A student who started keeps the original, their
     work and its XP, and stays on it. A finished one is never touched. A
     student who also gets the original through another class they are in
     keeps it too -- it is still that class's work.

Which original a copy came from: the copy's draft marker records
`copied_from` (class_quest_copy). Publishing strips the draft marker, so the
publish route moves it to metadata.copied_from (record_copied_from), which is
what lets the class page offer the replace on a copy published earlier.
"""

from typing import Any, Dict, List, Optional

from repositories.class_curriculum_repository import ClassCurriculumRepository
from repositories.class_quest_audience_repository import ClassQuestAudienceRepository
from repositories.quest_editor_repository import QuestEditorRepository
from services.class_quest_enrollment import (
    active_student_ids,
    assigned_to,
    audience,
    set_class_quest_audience,
    withdraw_students_from_quest,
)


class ReplaceError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message, self.status = message, status


def copied_from(quest: Optional[Dict[str, Any]]) -> Optional[str]:
    """The original this quest was copied from, draft or published, or None."""
    meta = (quest or {}).get('metadata') or {}
    draft = meta.get('draft')
    marker: Dict[str, Any] = draft if isinstance(draft, dict) else {}
    return marker.get('copied_from') or meta.get('copied_from') or None


def record_copied_from(admin, quest_id: str, original_id: Optional[str]) -> None:
    """Keep the copy's origin after publish took the draft marker off."""
    if not original_id:
        return
    repo = QuestEditorRepository(client=admin)
    quest = repo.get_quest(quest_id) or {}
    meta = dict(quest.get('metadata') or {})
    if meta.get('copied_from') == original_id:
        return
    repo.update_quest(quest_id, {'metadata': {**meta, 'copied_from': original_id}})


def replaceable_originals(class_rows: List[Dict[str, Any]]) -> Dict[str, str]:
    """{copy_quest_id: original_quest_id} for the class's quests (rows of the
    class quest list, each with its embedded `quests` row and metadata) whose
    original is ALSO still on this class -- the ones the page offers to replace."""
    on_class = {r['quest_id'] for r in class_rows}
    out = {}
    for r in class_rows:
        original = copied_from(r.get('quests'))
        if original and original in on_class and original != r['quest_id']:
            out[r['quest_id']] = original
    return out


def _holds_elsewhere(repo, student_id: str, class_id: str, quest_id: str) -> bool:
    """Does the student get this quest through another live class they are in?"""
    others = repo.student_active_class_ids(student_id, exclude_class_id=class_id)
    return any(assigned_to(link, student_id)
               for link in repo.links_for_quests(others, [quest_id]))


def replace_original(admin, *, class_row: Dict[str, Any], copy_quest: Dict[str, Any]) -> Dict[str, Any]:
    """Swap `copy_quest`'s original for the copy on this class. The caller has
    passed the class gate and put the copy on the class.

    Returns {'original_quest_id', 'removed', 'kept_started', 'kept_elsewhere'}.
    Raises ReplaceError, before any write, when the quest is not a copy or its
    original is not on this class.
    """
    class_id = class_row['id']
    original_id = copied_from(copy_quest)
    if not original_id:
        raise ReplaceError('This quest is not a copy of another quest.', 409)
    if copy_quest.get('organization_id') != class_row['organization_id']:
        raise ReplaceError('Only your school’s own copy can replace a quest.', 403)
    audience_repo = ClassQuestAudienceRepository(admin)
    original_link = audience_repo.link(class_id, original_id)
    if not original_link:
        raise ReplaceError('The original is no longer on this class.', 404)
    copy_link = audience_repo.link(class_id, copy_quest['id'])
    if not copy_link:
        raise ReplaceError('Put your copy on the class first.', 409)

    roster = active_student_ids(admin, class_id)
    had_original = audience(original_link, roster)
    # 1. The copy reaches at least the original's students. Never narrowed.
    if copy_link.get('student_ids') is not None:
        wanted = (None if original_link.get('student_ids') is None
                  else sorted(set(copy_link['student_ids']) | set(had_original)))
        if wanted is None or set(wanted) != set(copy_link['student_ids']):
            set_class_quest_audience(admin, class_id, copy_quest['id'], wanted, roster_ids=roster)

    # 2. Off THIS class only.
    ClassCurriculumRepository(admin).remove_link(class_id, original_id)

    # 3. Taken back from the students who never started it.
    elsewhere = [s for s in had_original
                 if _holds_elsewhere(audience_repo, s, class_id, original_id)]
    who = [s for s in had_original if s not in set(elsewhere)]
    taken = withdraw_students_from_quest(admin, who, original_id, set_down_started=False)
    return {'original_quest_id': original_id, 'removed': taken['removed'],
            'kept_started': taken['kept'], 'kept_elsewhere': len(elsewhere)}


def summary(result: Dict[str, Any]) -> str:
    """One sentence for the teacher after a replace."""
    n, k = result.get('removed', 0), result.get('kept_started', 0)
    parts = [f"Replaced the original on this class. Removed it for {n} student{'s' if n != 1 else ''}."]
    if k:
        parts.append(f"{k} student{'s' if k != 1 else ''} already started it and keep{'s' if k == 1 else ''} it.")
    return ' '.join(parts)
