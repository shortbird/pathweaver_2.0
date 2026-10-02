"""Courses and Credits endpoints: the diploma-by-subject page and own-curriculum courses.

    GET  /api/courses-and-credits           the student's subjects and the courses in each
    POST /api/courses-and-credits/courses   add an own-curriculum course
    POST /api/courses-and-credits/move-requests                     ask Optio to move a
                                                                    quest's credit to another subject
    POST /api/courses-and-credits/move-requests/<request_id>/cancel take that back

Both take family scope (`student_id`), because the person using this page is
almost always a parent. Check-ins themselves go through the ordinary task
endpoints (evidence document save, then /api/tasks/<id>/request-credit), so
the review queue, the AI draft and the reviewer's feedback all work as they do
for any other credit request. See services/courses_and_credits_service.py.
"""

from flask import Blueprint, request

from database import get_supabase_admin_client
from services import courses_and_credits_service as plan
from services import subject_credit_move_service as moves
from utils.api_response_v1 import error_response, success_response
from utils.auth.decorators import require_auth
from utils.auth.relationships import current_student_scope, student_scope
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('courses_and_credits', __name__, url_prefix='/api/courses-and-credits')


@bp.route('', methods=['GET'])
@require_auth
@student_scope('credits')
def get_courses_and_credits(user_id: str):
    # admin client justified: reads only the resolved student's own subject XP, enrollments, tasks, completions and transfer credit; @student_scope verified a guardian before swapping user_id to the child
    supabase = get_supabase_admin_client()
    from routes.quest.classes import _compute_class_progress

    def class_progress(quest_id, subject):
        return _compute_class_progress(supabase, quest_id, user_id, subject)['approved_xp']

    data = plan.build_plan(supabase, user_id, class_progress)
    # Moves the family asked for and Optio has not decided, so a quest row
    # can say "Move requested" instead of offering the move again.
    data['move_requests'] = moves.pending_requests_for_student(supabase, user_id)
    return success_response(data=data)


@bp.route('/courses', methods=['POST'])
@require_auth
@student_scope()
def add_own_curriculum_course(user_id: str):
    scope = current_student_scope()
    data = request.get_json(silent=True) or {}
    # admin client justified: creates the resolved student's own quest, enrollment and tasks (no student RLS write path on quests); @student_scope verified a guardian before swapping user_id to the child
    supabase = get_supabase_admin_client()
    try:
        quest_id = plan.create_course(
            supabase, user_id,
            title=data.get('title'),
            subject=(data.get('subject') or '').strip(),
            length=(data.get('length') or '').strip(),
            curriculum=data.get('curriculum'),
            enrolled_by=scope.caller_id if scope and scope.delegated else None,
        )
    except plan.CourseError as e:
        return error_response(code=e.code, message=str(e), status=400)
    return success_response(data={'quest_id': quest_id}, status=201)


def _move_error(e: moves.SubjectMoveError):
    return error_response(code=e.code, message=str(e), status=e.status)


@bp.route('/move-requests', methods=['POST'])
@require_auth
@student_scope()
def request_subject_move(user_id: str):
    """A student or their parent asks Optio to move one quest's credit from
    one subject to another. Optio decides in the credit dashboard
    (routes/credit_dashboard/subject_moves.py); nothing moves until then."""
    scope = current_student_scope()
    data = request.get_json(silent=True) or {}
    # admin client justified: reads the resolved student's own completions, review rounds and tasks on one quest, and writes their move request; @student_scope verified a guardian before swapping user_id to the child
    supabase = get_supabase_admin_client()
    try:
        created = moves.create_move_request(
            supabase, user_id,
            quest_id=str(data.get('quest_id') or ''),
            from_subject=str(data.get('from_subject') or ''),
            to_subject=str(data.get('to_subject') or ''),
            requested_by=scope.caller_id if scope else user_id,
            reason=data.get('reason'),
        )
    except moves.SubjectMoveError as e:
        return _move_error(e)
    return success_response(data=created, status=201)


@bp.route('/move-requests/<request_id>/cancel', methods=['POST'])
@require_auth
@student_scope()
def cancel_subject_move(user_id: str, request_id: str):
    """Take back a move request Optio has not decided. Only a request about
    the scoped student; anyone else's reads as not found."""
    scope = current_student_scope()
    # admin client justified: cancels a move request only after the service checks it belongs to the resolved student; @student_scope verified a guardian before swapping user_id to the child
    supabase = get_supabase_admin_client()
    try:
        cancelled = moves.cancel_move_request(
            supabase, request_id, user_id, scope.caller_id if scope else user_id)
    except moves.SubjectMoveError as e:
        return _move_error(e)
    return success_response(data=cancelled)
