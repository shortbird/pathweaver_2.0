"""
Credit Dashboard - moving a quest's credit to another subject.

A family asks from Courses and Credits (routes/quest/courses_and_credits.py);
Optio decides here, in the same place it reviews credit. Approval runs
services/subject_credit_move_service.move_quest_subject_credit and tells the
family; a decline carries a note saying why.

Endpoints:
- GET  /api/credit-dashboard/subject-moves?status=pending      - The queue
- POST /api/credit-dashboard/subject-moves/<request_id>/approve - Move the credit
- POST /api/credit-dashboard/subject-moves/<request_id>/decline - Keep it, with a note

Superadmin only, like the approve and grow-this endpoints: Optio is the final
stamp on diploma credit, and a move changes where approved credit sits.
"""

from flask import request

from database import get_supabase_admin_singleton
from services import subject_credit_move_service as moves
from utils.api_response_v1 import error_response, success_response
from utils.auth.decorators import require_role
from utils.logger import get_logger

from . import bp

logger = get_logger(__name__)


def _move_error(e: moves.SubjectMoveError):
    return error_response(code=e.code, message=str(e), status=e.status)


@bp.route('/subject-moves', methods=['GET'])
@require_role('superadmin')
def list_subject_moves(user_id: str):
    # admin client justified: superadmin-only queue of every family's subject move requests
    supabase = get_supabase_admin_singleton()
    try:
        items = moves.list_requests(supabase, request.args.get('status') or 'pending')
    except moves.SubjectMoveError as e:
        return _move_error(e)
    return success_response(data={'items': items})


@bp.route('/subject-moves/<request_id>/approve', methods=['POST'])
@require_role('superadmin')
def approve_subject_move(user_id: str, request_id: str):
    data = request.get_json(silent=True) or {}
    # admin client justified: superadmin approval rewrites one student's review rounds, task splits and subject XP
    supabase = get_supabase_admin_singleton()
    try:
        out = moves.approve_move_request(supabase, request_id, user_id, note=data.get('note'))
    except moves.SubjectMoveError as e:
        return _move_error(e)
    logger.info(f'Superadmin {user_id[:8]} approved subject move {request_id[:8]}')
    return success_response(data=out)


@bp.route('/subject-moves/<request_id>/decline', methods=['POST'])
@require_role('superadmin')
def decline_subject_move(user_id: str, request_id: str):
    data = request.get_json(silent=True) or {}
    # admin client justified: superadmin decision on a family's subject move request
    supabase = get_supabase_admin_singleton()
    try:
        out = moves.decline_move_request(supabase, request_id, user_id, data.get('note'))
    except moves.SubjectMoveError as e:
        return _move_error(e)
    logger.info(f'Superadmin {user_id[:8]} declined subject move {request_id[:8]}')
    return success_response(data=out)
