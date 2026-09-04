"""
Student XP Goals — read and set a student's weekly XP target.

One blueprint serving every surface that shows the goal card: the student's own
overview, the parent dashboard, the observer view, and the advisor check-in.
Deliberately one endpoint rather than four role-specific ones -- the question
("what is this student's goal, and may I change it?") is the same regardless of
who asks, and the four copies of the relationship check are exactly the drift
utils/portfolio_access was written to end.

Two independent gates, both server-side:

  * The org must have the feature on (feature_flags.xp_goals). Off is reported
    as ``{enabled: false}`` on GET rather than a 403, because "this school
    doesn't use goals" is a normal answer and the card simply doesn't render.
    Writes to a disabled org DO 403 -- a stale tab must not create rows a school
    never opted into.
  * The caller must have the relationship. Reading needs what reading the
    student's portfolio needs; setting is narrower, and excludes observers.

See services/xp_goal_service.py for the week math and why progress is derived
rather than stored.
"""

from datetime import date

from flask import Blueprint, request, jsonify

from services import xp_goal_service as goals
from utils.auth.decorators import require_auth
from utils.auth.relationships import require_relationship_to
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('xp_goals', __name__, url_prefix='/api/xp-goals')


def _parse_week_start(raw):
    """An explicit ?week_start=YYYY-MM-DD, normalized to that week's Monday.

    Returns (week_start_or_None, error_response_or_None). A malformed value is
    rejected rather than ignored: silently answering about a different week than
    the one asked for is worse than a 400.
    """
    if not raw:
        return None, None
    try:
        parsed = date.fromisoformat(str(raw)[:10])
    except (TypeError, ValueError):
        return None, (jsonify({
            'success': False,
            'error': 'week_start must be a date in YYYY-MM-DD form',
        }), 400)
    from datetime import timedelta
    return parsed - timedelta(days=parsed.weekday()), None


@bp.route('/student/<student_id>', methods=['GET'])
@require_auth
# can_view_goal is can_view_portfolio(allow_peers=False). PEER IS ABSENT
# from this set on purpose: peer connections were sold to families as
# "see each other's work", and a personal weekly XP target is not work.
@require_relationship_to('student_id', allow=(
    'self', 'parent', 'advisor', 'teacher', 'observer', 'org_staff'))
def get_student_goal(user_id, student_id):
    """The student's target and this week's progress, plus whether the caller
    may change it."""
    if not goals.can_view_goal(user_id, student_id):
        return jsonify({'success': False, 'error': 'Not authorized to view this student'}), 403

    week_start, error = _parse_week_start(request.args.get('week_start'))
    if error:
        return error

    return jsonify({'success': True, 'goal': goals.summary(student_id, user_id, week_start)}), 200


@bp.route('/student/<student_id>/history', methods=['GET'])
@require_auth
@require_relationship_to('student_id', allow=(
    'self', 'parent', 'advisor', 'teacher', 'observer', 'org_staff'))
def get_student_goal_history(user_id, student_id):
    """Past targets, newest first — what the goal was, and who set it.

    Separate from the summary because the card doesn't need it: this is for the
    teacher or parent who wants to see whether a met goal was met at the number
    it was originally set at.
    """
    if not goals.can_view_goal(user_id, student_id):
        return jsonify({'success': False, 'error': 'Not authorized to view this student'}), 403
    if not goals.enabled_for_student(student_id):
        return jsonify({'success': True, 'enabled': False, 'history': []}), 200

    return jsonify({
        'success': True,
        'enabled': True,
        'history': goals.goal_history(student_id),
    }), 200


@bp.route('/student/<student_id>', methods=['PUT'])
@require_auth
@require_relationship_to('student_id', allow=(
    'self', 'parent', 'advisor', 'teacher', 'observer', 'org_staff'))
def set_student_goal(user_id, student_id):
    """Set the standing weekly target, from this week forward."""
    role = goals.setter_role(user_id, student_id)
    if not role:
        return jsonify({
            'success': False,
            'error': "Not authorized to set this student's goal",
        }), 403

    if not goals.enabled_for_student(student_id):
        return jsonify({
            'success': False,
            'error': "This student's school does not have XP goals turned on",
        }), 403

    body = request.get_json(silent=True) or {}
    target = goals.clean_target(body.get('target_xp'))
    if target is None:
        return jsonify({
            'success': False,
            'error': (f'target_xp must be a whole number between '
                      f'{goals.MIN_TARGET_XP} and {goals.MAX_TARGET_XP}'),
        }), 400

    week_start, error = _parse_week_start(body.get('week_start'))
    if error:
        return error

    saved = goals.set_goal(
        student_id, target,
        set_by=user_id,
        set_by_role=role,
        note=goals.clean_note(body.get('note')),
        week_start=week_start,
    )
    if not saved:
        return jsonify({'success': False, 'error': 'Could not save the goal'}), 500

    logger.info(f'[xp_goals] {role} {user_id} set {student_id} weekly target to {target}')
    return jsonify({'success': True, 'goal': goals.summary(student_id, user_id, week_start)}), 200


@bp.route('/student/<student_id>', methods=['DELETE'])
@require_auth
@require_relationship_to('student_id', allow=(
    'self', 'parent', 'advisor', 'teacher', 'observer', 'org_staff'))
def clear_student_goal(user_id, student_id):
    """Remove the target set for this week, falling back to whatever stood before."""
    role = goals.setter_role(user_id, student_id)
    if not role:
        return jsonify({
            'success': False,
            'error': "Not authorized to change this student's goal",
        }), 403

    week_start, error = _parse_week_start(request.args.get('week_start'))
    if error:
        return error

    if not goals.clear_goal(student_id, week_start):
        return jsonify({'success': False, 'error': 'Could not clear the goal'}), 500

    logger.info(f'[xp_goals] {role} {user_id} cleared {student_id} weekly target')
    return jsonify({'success': True, 'goal': goals.summary(student_id, user_id, week_start)}), 200
