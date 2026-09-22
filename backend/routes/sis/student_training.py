"""
Training links a school set for its students -- the student's own list.

"I would like to link to a video or document option in the 'for families' (and
students if it's not there too). For example, it'd be nice to be able to upload
the training from last friday without creating an entire quest." (iCreate,
Molly, 2026-09-22, ae16c5da.)

A student-audience training QUEST already reached students: it lands on their
account like any other quest. A training LINK has no account to land on, so it
needs a list with a Done button, the way families got one on /family/forms
(routes/sis/parent.py /parent/training). The web /school page renders this list
under the student's class materials.

Its own small module because routes/sis/staff_training.py sits at the route-file
size cap, and these are not staff routes anyway: they are self-scoped to the
caller, whose org is their own users.organization_id. The services do the
authorization (sis_training_service.student_training_links and
set_student_training_link_done): the caller must hold the student role at that
school, and a link must be a student link of that school.
"""

from flask import Blueprint, jsonify

from modules.gate import require_module
from services import sis_training_service
from utils.auth.decorators import require_auth

bp = Blueprint('sis_student_training', __name__, url_prefix='/api/sis')


@bp.route('/student/training', methods=['GET'])
@require_auth
@require_module('training')
def my_student_training(user_id):
    """The school's student training links, with whether I have done each.

    Empty (not an error) for anybody who is not a student: the list sits on
    every member's /school page and renders nothing when there is nothing."""
    return jsonify({'success': True,
                    'training': sis_training_service.student_training_links(user_id)})


@bp.route('/student/training/<training_id>/done', methods=['POST'])
@require_auth
@require_module('training')
def mark_my_student_training_done(user_id, training_id):
    """I watched or read it. Self-scoped: the id is the caller's own, from the
    decorator, never from the body."""
    return _set_done(user_id, training_id, True)


@bp.route('/student/training/<training_id>/done', methods=['DELETE'])
@require_auth
@require_module('training')
def unmark_my_student_training_done(user_id, training_id):
    """The undo, for the row somebody pressed by mistake."""
    return _set_done(user_id, training_id, False)


def _set_done(user_id, training_id, done):
    # One 404 for "not a student", "not this school's" and "not a student link":
    # telling them apart would tell a guesser which staff training ids exist.
    link = sis_training_service.set_student_training_link_done(user_id, training_id, done)
    if link is None:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    return jsonify({'success': True, 'training': link})
