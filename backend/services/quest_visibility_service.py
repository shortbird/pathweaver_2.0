"""May this person open, or enroll in, this quest by its id?

Owner decision, 2026-09-24. Quest discovery already hides a school quest
nobody assigned (fd9a5019, QuestRepository.get_quests_for_user). A direct link
did not: GET /api/quests/<id> and POST /api/quests/<id>/enroll answered for
any active quest, including another school's, to anyone who knew the id. This
is the one answer every by-id door asks.

Global Optio quests (organization_id NULL) are out of scope and pass exactly as
before. A school quest opens when the person:

  * is staff (utils.sis_roles.STAFF_ROLES, the discovery exemption,
    repositories.quest_repository.is_school_staff) of THAT school, or is a
    superadmin;
  * created it;
  * already has a user_quests row for it (active, set down or completed), so
    nobody loses a quest they were given;
  * belongs to the quest's school and the quest is assigned (on a class, a
    curriculum or the training catalog: quest_is_assigned);
  * can reach it as a released Project in a course (enrolled in the course,
    or the course is published and visible to them).

The request may be about a child (family scope, `student_id`): then the child
and the caller are each asked, so a parent opens what the child may open and a
staff parent may start their child on a quest they could open themselves.
Reads also accept any student the caller is guardian (utils.class_membership.
children_of_parent: managed_by_parent_id, parent_student_links, households)
or observer of, so a parent or observer who follows a child's quest link
without family scope still lands on it. Enrollment does not take that last
widening: a child is enrolled on their own claim or the caller's.

Denied is a 404 at every door, the same answer as a quest that does not exist.

Personal quests (owner decision, 2026-09-24, second half). A global quest
(organization_id NULL) that is public (is_public true) is the Optio catalog and
opens for everyone, as before. A global quest that is NOT public is someone's
own: made through /api/quests/create (a student's or a teacher's quest, which
never carries an organization_id) or /api/family/quests/create (a parent's).
Discovery already lists those only to their creator
(QuestRepository.get_quests_for_user), yet a direct link opened them for
anybody. One opens when the person:

  * created it, or has a user_quests row for it, or is a superadmin;
  * can reach it as a released Project in a course (Optio's own course
    projects are non-public global quests -- 168 of them on 2026-09-24);
  * or, for the caller only, has a relationship to its creator or to a student
    enrolled in it (PERSONAL_QUEST_RELATIONSHIPS through
    utils.auth.relationships.relationship_between, the require_relationship_to
    machinery): a guardian by any of the three links, an observer, the
    student's advisor or teacher. Enrollment narrows that to a guardian of the
    creator, so a parent can start a child on a sibling's quest and nobody
    else joins a stranger's.

may_work_on_quest is the stricter question the AI personalization doors ask:
may open it AND is enrolled (or acts for an enrolled child, or is staff of the
quest's school).
"""

from typing import Any, Dict, List, Optional, Set

from repositories.quest_repository import QuestRepository, is_school_staff
from utils.logger import get_logger

logger = get_logger(__name__)


def _may_open_as(repo: QuestRepository, user_id: str, quest: Dict[str, Any]) -> bool:
    """The rule for one person and one school quest."""
    if not user_id:
        return False
    if quest.get('created_by') == user_id:
        return True
    user = repo.get_visibility_user(user_id)
    if not user:
        return False
    quest_org = quest.get('organization_id')
    user_org = user.get('organization_id')
    if is_school_staff(user):
        from utils.roles import get_effective_roles
        if user_org == quest_org or 'superadmin' in get_effective_roles(user):
            return True
    quest_id = quest['id']
    if repo.has_any_enrollment(user_id, quest_id):
        return True
    if user_org and user_org == quest_org and repo.is_quest_assigned(quest_id):
        return True
    return repo.reachable_through_course(user_id, user_org, quest_id)


def _linked_students(caller_id: str) -> Set[str]:
    """Students the caller is a guardian or an observer of. Fails closed."""
    linked: Set[str] = set()
    try:
        from utils.class_membership import children_of_parent
        linked |= children_of_parent(caller_id)
    except Exception as e:  # noqa: BLE001 -- a failed lookup grants nothing
        logger.warning(f"[QUEST VISIBILITY] guardian lookup failed for {caller_id[:8]}: {e}")
    try:
        from utils.portfolio_access import students_observed_by
        linked |= students_observed_by(caller_id)
    except Exception as e:  # noqa: BLE001 -- a failed lookup grants nothing
        logger.warning(f"[QUEST VISIBILITY] observer lookup failed for {caller_id[:8]}: {e}")
    return linked


#: Who may follow a link to someone's personal quest because of who they are
#: to its creator or to a student on it. Names from utils.auth.relationships;
#: 'parent' already covers all three guardian links (managed_by_parent_id,
#: parent_student_links, household_members).
PERSONAL_QUEST_RELATIONSHIPS = ('parent', 'observer', 'advisor', 'teacher')

#: The one relationship that also lets a caller ENROLL (their child) in a
#: personal quest: guardian of its creator, i.e. a sibling's or their own
#: child's quest.
PERSONAL_QUEST_ENROLL_RELATIONSHIPS = ('parent',)

#: How many enrolled students a relationship check walks. A personal quest has
#: a handful (62 other enrollments across 460 on 2026-09-24); the cap bounds the
#: lookups on the rare large one, which is then reachable through its course or
#: its enrollment instead.
_RELATED_ENROLLEE_CAP = 25


def _is_superadmin(user: Optional[Dict[str, Any]]) -> bool:
    if not user:
        return False
    from utils.roles import get_effective_roles
    return 'superadmin' in get_effective_roles(user)


def _may_open_personal_as(repo: QuestRepository, user_id: str,
                          quest: Dict[str, Any]) -> bool:
    """The rule for one person and one non-public global quest, before any
    relationship is asked."""
    if not user_id:
        return False
    if quest.get('created_by') == user_id:
        return True
    quest_id = quest['id']
    if repo.has_any_enrollment(user_id, quest_id):
        return True
    user = repo.get_visibility_user(user_id)
    if not user:
        return False
    if _is_superadmin(user):
        return True
    return repo.reachable_through_course(user_id, user.get('organization_id'), quest_id)


def _related_to_quest_people(repo: QuestRepository, caller_id: str,
                             quest: Dict[str, Any], allow: tuple,
                             include_enrolled: bool) -> bool:
    """Does the caller hold one of `allow` to the quest's creator (or, with
    include_enrolled, to a student enrolled in it)? Fails closed."""
    from utils.auth.relationships import relationship_between
    people: List[str] = []
    if quest.get('created_by'):
        people.append(quest['created_by'])
    if include_enrolled:
        try:
            for uid in repo.enrolled_user_ids(quest['id'], limit=_RELATED_ENROLLEE_CAP):
                if uid not in people:
                    people.append(uid)
        except Exception as e:  # noqa: BLE001 -- a failed lookup grants nothing
            logger.warning(f"[QUEST VISIBILITY] enrollee lookup failed for "
                           f"{str(quest.get('id'))[:8]}: {e}")
    for person in people:
        if person != caller_id and relationship_between(caller_id, person, allow):
            return True
    return False


def _is_public_global(repo: QuestRepository, quest: Dict[str, Any]) -> bool:
    """is_public for a global quest, re-read when the caller's row omitted it
    (a missing key must not read as private for a catalog quest, nor as
    public for a personal one)."""
    if 'is_public' not in quest:
        fresh = repo.find_by_id(quest['id']) or {}
        return bool(fresh.get('is_public'))
    return bool(quest.get('is_public'))


def _asked(caller_id: str, subject_id: Optional[str]) -> List[str]:
    asked: List[str] = []
    for person in (subject_id or caller_id, caller_id):
        if person and person not in asked:
            asked.append(person)
    return asked


def _may_open_personal(repo: QuestRepository, caller_id: str, quest: Dict[str, Any],
                       subject_id: Optional[str], include_linked_students: bool) -> bool:
    for person in _asked(caller_id, subject_id):
        if _may_open_personal_as(repo, person, quest):
            return True
    if include_linked_students:
        allowed = _related_to_quest_people(repo, caller_id, quest,
                                           PERSONAL_QUEST_RELATIONSHIPS, include_enrolled=True)
    else:
        allowed = _related_to_quest_people(repo, caller_id, quest,
                                           PERSONAL_QUEST_ENROLL_RELATIONSHIPS,
                                           include_enrolled=False)
    if allowed:
        return True
    logger.info(
        f"[QUEST VISIBILITY] {caller_id[:8]} may not open personal quest "
        f"{str(quest.get('id'))[:8]} (subject {(subject_id or caller_id)[:8]})"
    )
    return False


def may_open_quest(caller_id: str, quest: Optional[Dict[str, Any]],
                   subject_id: Optional[str] = None, *,
                   include_linked_students: bool = True,
                   repo: Optional[QuestRepository] = None) -> bool:
    """True when `caller_id` may open (or enroll `subject_id` in) `quest`.

    `quest` needs id, organization_id, created_by and is_public (re-read when
    absent). `subject_id` is the student the request is about when it is not
    the caller (already verified by the route's student-scope gate). See the
    module docstring for the rule.
    """
    if not quest:
        return False
    repo = repo or QuestRepository()
    if not quest.get('organization_id'):
        if _is_public_global(repo, quest):
            return True  # the Optio catalog: open to everyone
        return _may_open_personal(repo, caller_id, quest, subject_id,
                                  include_linked_students)

    asked = _asked(caller_id, subject_id)
    for person in asked:
        if _may_open_as(repo, person, quest):
            return True

    if include_linked_students:
        for student_id in sorted(_linked_students(caller_id) - set(asked)):
            if _may_open_as(repo, student_id, quest):
                return True

    logger.info(
        f"[QUEST VISIBILITY] {caller_id[:8]} may not open school quest "
        f"{str(quest.get('id'))[:8]} (subject {(subject_id or caller_id)[:8]})"
    )
    return False


def may_open_quest_id(caller_id: str, quest_id: str,
                      subject_id: Optional[str] = None, *,
                      include_linked_students: bool = True) -> bool:
    """may_open_quest for a door that holds only the id. A missing quest is
    False, so the caller answers 404 either way."""
    repo = QuestRepository()
    return may_open_quest(caller_id, repo.find_by_id(quest_id), subject_id,
                          include_linked_students=include_linked_students, repo=repo)


def may_work_on_quest(caller_id: str, quest_id: str,
                      subject_id: Optional[str] = None) -> bool:
    """May the caller run the AI personalization doors on this quest?

    Stricter than opening it: POST /api/quests/<id>/generate-tasks sends the
    quest's text to the AI vendor and start-personalization writes a session
    row, so a person must be able to open the quest AND be on it. On it means
    the learner (`subject_id` in family scope, else the caller) has a
    user_quests row, or the caller is staff of the quest's school (or a
    superadmin) building tasks for it. A missing quest is False; the route
    answers 404 either way.
    """
    repo = QuestRepository()
    quest = repo.find_by_id(quest_id)
    if not may_open_quest(caller_id, quest, subject_id,
                          include_linked_students=False, repo=repo):
        return False
    if quest is None:  # may_open_quest already said no; this narrows the type
        return False
    learner = subject_id or caller_id
    if repo.has_any_enrollment(learner, quest_id):
        return True
    caller = repo.get_visibility_user(caller_id)
    if _is_superadmin(caller):
        return True
    quest_org = quest.get('organization_id')
    if (quest_org and caller is not None and is_school_staff(caller)
            and caller.get('organization_id') == quest_org):
        return True
    logger.info(
        f"[QUEST VISIBILITY] {caller_id[:8]} may not personalize quest "
        f"{str(quest_id)[:8]}: learner {learner[:8]} is not on it"
    )
    return False
