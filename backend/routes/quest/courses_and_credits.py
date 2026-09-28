"""Courses and Credits endpoints: the diploma-by-subject page and own-curriculum courses.

    GET  /api/courses-and-credits           the student's subjects and the courses in each
    POST /api/courses-and-credits/courses   add an own-curriculum course

Both take family scope (`student_id`), because the person using this page is
almost always a parent. Check-ins themselves go through the ordinary task
endpoints (evidence document save, then /api/tasks/<id>/request-credit), so
the review queue, the AI draft and the reviewer's feedback all work as they do
for any other credit request. See services/courses_and_credits_service.py.
"""

from flask import Blueprint, request

from database import get_supabase_admin_client
from services import courses_and_credits_service as plan
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

    return success_response(data=plan.build_plan(supabase, user_id, class_progress))


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
