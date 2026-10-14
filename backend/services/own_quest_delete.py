"""Delete a quest a family made for itself, when nothing was done on it.

Ticket bd1be541, Karen Boyd (parent, Optio Academy): "I created a couple of
quests that I ended up not wanting to use... I can't see how to delete old
quests." The quest page had a "Delete Enrollment?" dialog and no button that
opened it.

Allowed only when all of these hold:
  - the quest is private (is_public false), belongs to no school
    (organization_id null), is no Canvas quest, and is on no course or class;
  - the student made it, or one of the student's guardians did
    (quests.created_by, or metadata.created_by_user_id for a quest a parent
    made in family scope);
  - the student's enrollment has no completed task and no evidence.

Anything else answers with a reason and deletes nothing. A quest with work
keeps the existing exit, Save for later > "I'm done with it", which hides it
and keeps the work. When no other learner has the quest, the quest row goes
too, so it does not linger in the family's quest list.
"""

from typing import Any, Dict, Optional

from postgrest.exceptions import APIError

from repositories.own_quest_repository import OwnQuestRepository
from utils.logger import get_logger

logger = get_logger(__name__)

NOT_FOUND = 'not_found'
NOT_FAMILY_MADE = 'not_family_made'
HAS_WORK = 'has_work'

REFUSAL_MESSAGES = {
    NOT_FOUND: 'Quest not found.',
    NOT_FAMILY_MADE: ('Only a quest your family made can be deleted. Use Save for later '
                      'and choose "I\'m done with it" to hide this one.'),
    HAS_WORK: ('This quest has finished tasks or evidence, so deleting it would erase '
               'that work. Use Save for later and choose "I\'m done with it" to hide it '
               'and keep the work.'),
}


def _family_ids(student_id: str) -> set:
    from utils.class_membership import guardians_by_student
    return {student_id} | set(guardians_by_student({student_id}).get(student_id, set()))


def refusal_reason(repo: OwnQuestRepository, student_id: str,
                   quest: Optional[Dict[str, Any]], enrollment_ids) -> Optional[str]:
    """None when the quest may be deleted, else one of the reason codes."""
    if not quest or not enrollment_ids:
        return NOT_FOUND
    if quest.get('is_public') or quest.get('organization_id') or quest.get('lms_platform'):
        return NOT_FAMILY_MADE
    if quest.get('quest_type') not in (None, 'optio', 'custom', 'class'):
        return NOT_FAMILY_MADE
    family = _family_ids(student_id)
    meta = quest.get('metadata') if isinstance(quest.get('metadata'), dict) else {}
    makers = {quest.get('created_by'), (meta or {}).get('created_by_user_id')} - {None}
    if not makers or not makers <= family:
        return NOT_FAMILY_MADE
    if repo.is_on_a_course_or_class(quest['id']):
        return NOT_FAMILY_MADE
    if repo.has_work(student_id, quest['id'], enrollment_ids):
        return HAS_WORK
    return None


def can_delete_own_quest(admin, student_id: str, quest_id: str) -> bool:
    repo = OwnQuestRepository(client=admin)
    quest = repo.quest(quest_id)
    ids = repo.enrollment_ids(student_id, quest_id)
    return refusal_reason(repo, student_id, quest, ids) is None


def delete_own_quest(admin, student_id: str, quest_id: str) -> Dict[str, Any]:
    """{'deleted': True, 'quest_deleted': bool, 'title': str} or
    {'deleted': False, 'reason': code}."""
    repo = OwnQuestRepository(client=admin)
    quest = repo.quest(quest_id)
    ids = repo.enrollment_ids(student_id, quest_id)
    reason = refusal_reason(repo, student_id, quest, ids)
    if reason:
        return {'deleted': False, 'reason': reason}

    repo.delete_enrollments(ids)
    quest_deleted = False
    if not repo.other_learner_count(quest_id, student_id):
        try:
            repo.delete_quest(quest_id)
            quest_deleted = True
        except APIError as e:
            # The enrollment is gone, which is what the family asked for; a
            # row something else still references stays.
            logger.warning(f"Own quest {quest_id[:8]} kept by the database: {e}")
    logger.info(f"Deleted own quest enrollment for {student_id[:8]} on {quest_id[:8]} "
                f"(quest row deleted: {quest_deleted})")
    return {'deleted': True, 'quest_deleted': quest_deleted, 'title': (quest or {}).get('title')}
