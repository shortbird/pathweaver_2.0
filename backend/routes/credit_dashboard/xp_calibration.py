"""Credit Dashboard - tuning how the AI credit reviewer sizes XP.

- GET    /api/credit-dashboard/xp-calibration                         - the scale and every example
- PUT    /api/credit-dashboard/xp-calibration/guide                   - edit the scale
- POST   /api/credit-dashboard/xp-calibration/guide/reset             - back to the built-in scale
- POST   /api/credit-dashboard/xp-calibration/examples                - add an example
- PATCH  /api/credit-dashboard/xp-calibration/examples/<example_id>   - edit, approve, pause or resume one
- DELETE /api/credit-dashboard/xp-calibration/examples/<example_id>   - remove one

Superadmin only. What is saved here goes into the prompt of every AI credit
review from the next one on (services/credit_ai_review/calibration.py), so this
is the way to tune the reviewer without a deploy. Approvals that disagreed with
the AI arrive as 'suggested' examples (calibration_capture.py) and reach the
prompt only once approved here (status 'active'). The rules that protect the
student -- never raise the claim, never go below the floor -- are not editable.
"""

from typing import Any, Dict, Optional

from flask import request

from config.constants import TASK_XP_SIZES
from utils.api_response_v1 import error_response, success_response
from utils.auth.decorators import require_role
from utils.logger import get_logger

from . import bp

logger = get_logger(__name__)

MAX_GUIDE_CHARS = 4000
MAX_WORK_CHARS = 300
MAX_NOTE_CHARS = 300
EDITABLE_STATUSES = ('active', 'paused')


def _repo():
    from database import get_supabase_admin_client
    from repositories.credit_review_xp_example_repository import CreditReviewXpExampleRepository
    # admin client justified: credit_review_xp_examples is service-role only (RLS
    # on, no policies); every route here is superadmin by decorator.
    return CreditReviewXpExampleRepository(client=get_supabase_admin_client())


def _guide_payload() -> Dict[str, Any]:
    from services.credit_ai_review.calibration import XP_GUIDE_COMPONENT
    from services.prompt_management_service import PromptManagementService
    component = PromptManagementService().get_component(XP_GUIDE_COMPONENT) or {}
    return {
        'content': component.get('content') or '',
        'default_content': component.get('default_content') or '',
        'modified': bool(component.get('has_modifications')),
        'last_modified_at': component.get('last_modified_at'),
    }


def _clean_example(data: Dict[str, Any], *, partial: bool) -> tuple[Optional[Dict[str, Any]], Optional[tuple]]:
    """The writable fields from a request body, checked. (changes, error)."""
    changes: Dict[str, Any] = {}

    if 'work' in data or not partial:
        work = ' '.join(str(data.get('work') or '').split())
        if len(work) < 3:
            return None, error_response(code='VALIDATION_ERROR',
                                        message='Describe the work in a few words.', status=400)
        if len(work) > MAX_WORK_CHARS:
            return None, error_response(code='VALIDATION_ERROR',
                                        message=f'Keep the description under {MAX_WORK_CHARS} characters.',
                                        status=400)
        changes['work'] = work

    if 'xp' in data or not partial:
        try:
            xp = int(data.get('xp') or 0)
        except (TypeError, ValueError):
            return None, error_response(code='VALIDATION_ERROR',
                                        message='XP must be a whole number.', status=400)
        if xp not in TASK_XP_SIZES:
            sizes = ', '.join(str(x) for x in TASK_XP_SIZES)
            return None, error_response(code='VALIDATION_ERROR',
                                        message=f'XP must be one of {sizes}.', status=400)
        changes['xp'] = xp

    if 'note' in data:
        note = ' '.join(str(data.get('note') or '').split())
        if len(note) > MAX_NOTE_CHARS:
            return None, error_response(code='VALIDATION_ERROR',
                                        message=f'Keep the note under {MAX_NOTE_CHARS} characters.',
                                        status=400)
        changes['note'] = note or None

    if 'subjects' in data:
        from services.credit_ai_review.subject_mix import to_percent
        changes['subjects'] = to_percent(data.get('subjects')) or None

    if partial and 'status' in data:
        if data.get('status') not in EDITABLE_STATUSES:
            return None, error_response(code='VALIDATION_ERROR',
                                        message='Status must be active or paused.', status=400)
        changes['status'] = data['status']

    return changes, None


@bp.route('/xp-calibration', methods=['GET'])
@require_role('superadmin')
def get_xp_calibration(user_id: str):
    return success_response(data={'guide': _guide_payload(), 'examples': _repo().list_all()})


@bp.route('/xp-calibration/guide', methods=['PUT'])
@require_role('superadmin')
def update_xp_guide(user_id: str):
    from services.credit_ai_review.calibration import XP_GUIDE_COMPONENT
    from services.prompt_management_service import PromptManagementService

    content = str((request.get_json(silent=True) or {}).get('content') or '').strip()
    if not content:
        return error_response(code='VALIDATION_ERROR',
                              message='The scale cannot be empty. Reset it instead.', status=400)
    if len(content) > MAX_GUIDE_CHARS:
        return error_response(code='VALIDATION_ERROR',
                              message=f'Keep the scale under {MAX_GUIDE_CHARS} characters.',
                              status=400)

    PromptManagementService().update_component(XP_GUIDE_COMPONENT, content, user_id)
    logger.info(f'Superadmin {user_id[:8]} edited the credit review XP scale')
    return success_response(data={'guide': _guide_payload()})


@bp.route('/xp-calibration/guide/reset', methods=['POST'])
@require_role('superadmin')
def reset_xp_guide(user_id: str):
    from services.credit_ai_review.calibration import XP_GUIDE_COMPONENT
    from services.prompt_management_service import PromptManagementService

    PromptManagementService().reset_component(XP_GUIDE_COMPONENT, user_id)
    logger.info(f'Superadmin {user_id[:8]} reset the credit review XP scale')
    return success_response(data={'guide': _guide_payload()})


@bp.route('/xp-calibration/examples', methods=['POST'])
@require_role('superadmin')
def add_xp_example(user_id: str):
    data = request.get_json(silent=True) or {}
    changes, error = _clean_example(data, partial=False)
    if error:
        return error
    assert changes is not None

    completion_id = str(data.get('completion_id') or '').strip() or None
    row = _repo().add(work=changes['work'], xp=changes['xp'], note=changes.get('note'),
                      subjects=changes.get('subjects'), completion_id=completion_id,
                      created_by=user_id)
    logger.info(f'Superadmin {user_id[:8]} added an XP example ({changes["xp"]} XP)')
    return success_response(data={'example': row}, status=201)


@bp.route('/xp-calibration/examples/<example_id>', methods=['PATCH'])
@require_role('superadmin')
def update_xp_example(user_id: str, example_id: str):
    changes, error = _clean_example(request.get_json(silent=True) or {}, partial=True)
    if error:
        return error
    if not changes:
        return error_response(code='VALIDATION_ERROR', message='Nothing to change.', status=400)

    row = _repo().edit(example_id, changes)
    if not row:
        return error_response(code='NOT_FOUND', message='Example not found', status=404)
    return success_response(data={'example': row})


@bp.route('/xp-calibration/examples/<example_id>', methods=['DELETE'])
@require_role('superadmin')
def delete_xp_example(user_id: str, example_id: str):
    if not _repo().remove(example_id):
        return error_response(code='NOT_FOUND', message='Example not found', status=404)
    logger.info(f'Superadmin {user_id[:8]} removed XP example {example_id[:8]}')
    return success_response(data={'deleted': True})
