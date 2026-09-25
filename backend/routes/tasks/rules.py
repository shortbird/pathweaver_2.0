"""What the task creator and edit forms should enforce for this learner.

The forms need three answers before they render: may this person set XP, must
the task have a Definition of Done, and (when editing) has that Definition of
Done been locked by a credit submission. All three depend on the LEARNER's
school, which the web client could not see when a parent works as their child:
its org context is the parent's, so a Hearthwood parent acting for an Optio
Academy child was shown the parent's rules. This asks the server, which already
resolves the child (services/task_rules.py, utils/xp_permissions.py).
"""

from flask import jsonify, request

from repositories.task_repository import TaskRepository
from routes.tasks import bp
from utils.auth.decorators import require_auth
from utils.auth.relationships import current_student_scope, student_scope
from utils.org_features import user_org_has_feature
from services.task_rules import (
    criteria_locked,
    pillars_hidden_by_age,
    requires_success_criteria,
)
from utils.xp_permissions import (
    get_effective_role_for,
    is_xp_guide,
    xp_locked_for_learner,
)


@bp.route('/authoring-rules', methods=['GET'])
@require_auth
@student_scope()
def authoring_rules(user_id: str):
    """
    Query: student_id (optional, via @student_scope), task_id (optional).

    Returns:
        requires_success_criteria: the learner's school requires a Definition of Done
        can_edit_xp: the CALLER may set XP on this learner's tasks
        hide_pillars: the task creator shows only the diploma subject picker
            (learner 13+, or the learner's school hides the pillars)
        criteria_locked: (only with task_id) the Definition of Done can no longer
            be changed by this caller, because the task was sent for credit
    """
    scope = current_student_scope()
    caller_id = scope.caller_id if scope else user_id
    guide = is_xp_guide(get_effective_role_for(caller_id))

    rules = {
        'requires_success_criteria': (not guide) and requires_success_criteria(user_id),
        'can_edit_xp': guide or not xp_locked_for_learner(user_id),
        # The task creator shows only the diploma subject picker: the learner
        # is 13+ or their school switched the pillars off. The server derives
        # the pillar from the subject either way.
        'hide_pillars': pillars_hidden_by_age(user_id)
        or user_org_has_feature(user_id, 'hide_pillars'),
    }

    task_id = (request.args.get('task_id') or '').strip()
    if task_id:
        if not TaskRepository().is_owned_by(task_id, user_id):
            return jsonify({'success': False, 'error': 'Task not found'}), 404
        rules['criteria_locked'] = (not guide) and criteria_locked(task_id)

    return jsonify({'success': True, **rules})
