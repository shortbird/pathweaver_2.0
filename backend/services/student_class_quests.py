"""A student's own quest, made for one of their classes (Gryffin, 2026-09-25).

Katie Bird, Earth Science: "I gave my earth science class the assignment to
create their own quest ... if they create their own quest I won't be able to
see it, right?" A quest a student creates is personal -- private, no school --
and nothing tied it to the class it was written for.

Now the create form can name one of the student's classes. The quest stays
exactly as private as before (organization_id NULL, is_public False): putting a
school on it would make it discoverable to every student in that school, since
discovery lists an org quest as soon as it sits on any class
(quest_is_assigned). What changes is one class_quests row, kept to the student
who made it, which is all the teacher's pages key off: the Quests tab, the
progress grid, one student's work and the submissions inbox.

`made_by` is how those pages tell a student's quest from the teacher's, so the
teacher is offered the student's work rather than an editor that cannot load
it, and is not offered to hand one student's quest to the rest of the class.
"""

from typing import Dict, Iterable, Optional

from repositories.class_repository import ClassRepository


def attachable_class(student_id: str, class_id: str,
                     repo: Optional[ClassRepository] = None) -> Optional[dict]:
    """The class, when the student is actively in it and it is running."""
    repo = repo or ClassRepository()
    for enrollment in repo.get_student_enrollments(student_id, status='active'):
        cls = enrollment.get('org_classes') or {}
        if cls.get('id') == class_id and cls.get('status') == 'active':
            return cls
    return None


def attach(student_id: str, quest_id: str, class_id: str,
           repo: Optional[ClassRepository] = None) -> dict:
    """Put the student's quest on their class, for them alone.

    Deliberately not ClassService.add_quest: that enrolls the class's audience
    and notifies guardians. The creator is already enrolled by the create
    route, and nobody else should be.
    """
    repo = repo or ClassRepository()
    return repo.add_student_quest(class_id, quest_id, student_id)


def maker_of(class_id: str, quest_id: str, client=None) -> Optional[str]:
    """The student who made this one class quest, or None if it is not theirs."""
    from repositories.quest_repository import QuestRepository
    quest = QuestRepository(client=client).find_by_id(quest_id)
    if not quest:
        return None
    return made_by(class_id, [{'quest_id': quest_id,
                               'organization_id': quest.get('organization_id'),
                               'created_by': quest.get('created_by')}]).get(quest_id)


def made_by(class_id: str, quests: Iterable[dict],
            repo: Optional[ClassRepository] = None) -> Dict[str, str]:
    """quest_id -> the student who made it, for the class's student-made quests.

    Each item needs quest_id, organization_id and created_by. A quest counts
    when it has no school and its author is (or was) a student in this class; a
    teacher is never a student of their own class, and a library quest's
    author is Optio staff.
    """
    candidates: Dict[str, str] = {
        q['quest_id']: q['created_by'] for q in quests
        if q.get('quest_id') and q.get('created_by') and not q.get('organization_id')}
    if not candidates:
        return {}
    repo = repo or ClassRepository()
    students = repo.enrolled_student_ids(class_id, list(candidates.values()))
    return {qid: author for qid, author in candidates.items() if author in students}
