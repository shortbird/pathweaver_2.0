"""
The one door a class seat ends through.

iCreate, 2026-10-01 (ticket d8a2a8d4, Marika, org_admin): "how does one get rid
of quests that shouldn't be there. AJ should not have any elementary
classes/quests on his since he is in high school". Joining a class enrolls the
student in its quests; leaving it did nothing, so every drop left the class's
quests on the student's Learning Snapshot.

The first fix (2026-10-01) taught only the office's roster drop to take the
quests back. The owner's rule (2026-10-02) is that EVERY way a student leaves a
class does the same, so a seat now ends here and nowhere else:

  * the office drops one student (routes/sis/catalog.unenroll_student)
  * the office archives a class (routes/sis/catalog.archive_class)
  * a parent drops a class in the Schedule Builder (sis_parent_service.drop_class)
  * an exception approval that drops same-time classes (sis_exception_service.resolve)
  * a person or a whole family leaves the school (sis_person_service._release_class_seats:
    archive, delete, household withdraw, standing set to withdrawn)
  * a cohort archive or a cohort withdraw (class_service, routes/treehouse)

A new drop path should call withdraw_class_enrollments, and inherits the quest
rule for free. Waitlist moves and registration cancels never end a seat (they
act on waitlist entries and registrations), so they do not come through here.

The quest rule itself is class_quest_enrollment.withdraw_student_from_class_quests:
untouched enrollments are deleted, worked ones set down, finished ones left
alone, and a quest still on another live class the student is in (and in the
audience of) is skipped.

The quests are best-effort. The drop is what somebody asked for, so a failure
taking quests back is logged and never fails it.
"""

from typing import Any, Dict, List, Optional

from repositories.sis_class_repository import SisClassRepository
from utils.logger import get_logger

logger = get_logger(__name__)


def withdraw_quests_after_drop(admin, class_id: Optional[str],
                               student_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Take the class's quests back from one dropped student. Never raises.

    Returns withdraw_student_from_class_quests' summary, or None when there was
    nothing to do or it failed (the failure is logged as a warning).
    """
    if not class_id or not student_id:
        return None
    # Looked up on the module at call time, so a test that patches the rule
    # patches every drop path at once.
    from services import class_quest_enrollment
    try:
        return class_quest_enrollment.withdraw_student_from_class_quests(
            admin, class_id, student_id)
    except Exception as e:  # noqa: BLE001 -- the drop already happened and must stand
        logger.warning(f'Dropped {student_id} from {class_id}; quest withdraw failed: {e}')
        return None


def withdraw_class_enrollments(admin, *, actor_id: Optional[str] = None,
                               enrollment_ids: Optional[List[str]] = None,
                               class_ids: Optional[List[str]] = None,
                               student_id: Optional[str] = None,
                               active_only: bool = True) -> List[Dict[str, Any]]:
    """End class seats and take each dropped student off the class's quests.

    Filters as SisClassRepository.withdraw_enrollments (every one given
    narrows; none, or an empty list, writes nothing). Returns the rows it
    withdrew, each with a 'quests' key: the quest summary for that drop, or
    None when the quest step did nothing or failed.

    The quests go AFTER the seat is withdrawn, because the rule asks which
    classes the student is still in.
    """
    rows = SisClassRepository(client=admin).withdraw_enrollments(
        actor_id=actor_id, enrollment_ids=enrollment_ids, class_ids=class_ids,
        student_id=student_id, active_only=active_only)
    out = []
    for r in rows:
        r = dict(r)
        r['quests'] = withdraw_quests_after_drop(
            admin, r.get('class_id'), r.get('student_id') or student_id)
        out.append(r)
    return out
