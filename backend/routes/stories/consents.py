"""Promotional consent, from the admin side.

- GET  /api/admin/stories/consents/<student_user_id>
- POST /api/admin/stories/consents                     {student_user_id, scope, source, source_ref, notes}
- POST /api/admin/stories/consents/<consent_id>/revoke

Superadmin only in Phase 1. The parent-facing endpoint is Phase 2
(/api/parent/promotional-consent/<student_id>). A superadmin records a consent
on a family's behalf: consent_service names the approver find_approver()
would have chosen and requires source_ref, so the record says where the yes
came from.
"""

from __future__ import annotations

from flask import request

from utils.api_response_v1 import error_response, success_response
from utils.auth.decorators import require_superadmin
from utils.logger import get_logger

from services.stories import consent_service
from services.stories.consent_service import ConsentRefused

from . import admin_stories_bp as bp

logger = get_logger(__name__)

REFUSAL_STATUS = {
    'not_found': 404,
    'student_not_found': 404,
    'not_authorized': 403,
    'minor_self_grant': 403,
    'parent_outranks_org': 403,
    'no_approver': 409,
    'already_active': 409,
}


@bp.route('/consents/<student_user_id>', methods=['GET'])
@require_superadmin
def get_consent(user_id: str, student_user_id: str):
    status = consent_service.status_for(student_user_id)
    return success_response(data={'consent': {
        'student_user_id': student_user_id,
        'active': status['active'],
        'scope': status['scope'],
        'tier': status['tier'],
        'history': consent_service.history_summary(status['history']),
    }})


@bp.route('/consents', methods=['POST'])
@require_superadmin
def record_consent(user_id: str):
    body = request.get_json(silent=True) or {}
    student_id = body.get('student_user_id')
    if not student_id:
        return error_response(code='BAD_REQUEST', message='student_user_id is required.')
    try:
        row = consent_service.grant(
            student_id=str(student_id),
            caller_id=user_id,
            scope=body.get('scope'),
            source=body.get('source') or 'written',
            source_ref=body.get('source_ref'),
            notes=body.get('notes'),
        )
    except ConsentRefused as r:
        return error_response(code=r.code.upper(), message=r.message,
                              status=REFUSAL_STATUS.get(r.code, 400))
    return success_response(data={'consent': row}, status=201)


@bp.route('/consents/<consent_id>/revoke', methods=['POST'])
@require_superadmin
def revoke_consent(user_id: str, consent_id: str):
    try:
        row = consent_service.revoke(consent_id, caller_id=user_id)
    except ConsentRefused as r:
        return error_response(code=r.code.upper(), message=r.message,
                              status=REFUSAL_STATUS.get(r.code, 400))
    return success_response(data={'consent': row})
