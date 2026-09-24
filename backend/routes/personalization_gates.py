"""The quest gates the personalization routes ask before they do anything.

Kept beside routes/personalization_validators.py so routes/quest_personalization.py
stays under the route-file cap (tests/unit/test_route_file_sizes.py). Each
returns a (response, status) tuple to send back, or None to carry on.
"""

from flask import jsonify

from utils.auth.relationships import current_student_scope


def quest_not_workable(user_id: str, quest_id: str):
    """404 payload unless this learner may run the AI personalization doors on
    this quest, else None.

    services/quest_visibility_service.may_work_on_quest: the caller may open
    the quest AND the learner (`user_id`, the child in family scope) is on it,
    or the caller is staff of the quest's school. Before 2026-09-24 these doors
    took any quest id at all: generate-tasks sent another school's quest text
    to the AI vendor for anyone who asked, and start-personalization wrote a
    session row against it. A refusal answers like a missing quest.
    """
    from services.quest_visibility_service import may_work_on_quest
    scope = current_student_scope()
    caller_id = scope.caller_id if scope else user_id
    if may_work_on_quest(caller_id, quest_id, subject_id=user_id):
        return None
    return jsonify({'success': False, 'error': 'Quest not found'}), 404


def quest_not_openable(user_id: str, quest_id: str):
    """404 payload unless the learner may be put on this quest, else None.

    The task-writing doors (add-manual-tasks, add-path-tasks, finalize-tasks,
    accept-task) write through get_or_create_enrollment, which
    creates the user_quests row when there is none -- an enrollment by another
    name. So they are held to the rule POST /api/quests/<id>/enroll applies
    (services/quest_visibility_service.may_open_quest, enrollment form: the
    learner or the caller may open it, no widening to other children). Without
    it, adding one task to another school's quest enrolled you, and being
    enrolled then opened every other door.
    """
    from services.quest_visibility_service import may_open_quest_id
    scope = current_student_scope()
    caller_id = scope.caller_id if scope else user_id
    if may_open_quest_id(caller_id, quest_id, subject_id=user_id,
                         include_linked_students=False):
        return None
    return jsonify({'success': False, 'error': 'Quest not found'}), 404
