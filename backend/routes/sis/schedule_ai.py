"""
SIS Schedule AI routes — plain-English schedule editing for staff.

POST /api/sis/schedule-ai/propose {prompt} -> {summary, operations, warnings}
POST /api/sis/schedule-ai/apply {operations} -> {applied, errors}

Two calls by design: the AI only PROPOSES; a staff member reviews the
operations in the UI and explicitly applies them. The apply endpoint accepts
the (already validated, structurally simple) operations back and re-checks
class ownership before writing.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from middleware.rate_limiter import rate_limit
from routes.sis import _org_or_error, ADMIN_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_schedule_ai', __name__, url_prefix='/api/sis/schedule-ai')


@bp.route('/propose', methods=['POST'])
@require_role(*ADMIN_ROLES)
@rate_limit(max_requests=20, window_seconds=300)
def propose(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    prompt = ((request.json or {}).get('prompt') or '').strip()
    if not prompt:
        return jsonify({'success': False, 'error': 'Describe the schedule change you want'}), 400
    if len(prompt) > 4000:
        return jsonify({'success': False, 'error': 'That request is too long'}), 400

    from services.sis_schedule_ai_service import SisScheduleAIService
    from services.base_ai_service import AIServiceOverloadedError, AIServiceError
    try:
        result = SisScheduleAIService().propose(org_id, prompt)
    except AIServiceOverloadedError:
        return jsonify({'success': False,
                        'error': 'The AI is busy right now — try again in a moment.'}), 503
    except AIServiceError as e:
        logger.error(f'schedule AI propose failed: {e}')
        return jsonify({'success': False,
                        'error': 'Could not understand that request — try rephrasing it.'}), 502
    return jsonify({'success': True, **result})


@bp.route('/apply', methods=['POST'])
@require_role(*ADMIN_ROLES)
@rate_limit(max_requests=30, window_seconds=300)
def apply(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    operations = (request.json or {}).get('operations') or []
    if not isinstance(operations, list) or not operations:
        return jsonify({'success': False, 'error': 'No operations to apply'}), 400

    from services.sis_schedule_ai_service import apply_operations
    result = apply_operations(org_id, user_id, operations)
    return jsonify({'success': True, **result})
