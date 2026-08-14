"""
SIS staff prior-learning review — the office's queue of guardian-submitted
prior-learning records, and where credit is awarded.

NEW, additive (/api/sis/prior-learning), ADMIN_ROLES: this is front-office
paperwork, not money, so a campus coordinator runs it alongside registration and
attendance. Org-scoped through sis_service.resolve_org_id like the rest of the
console.

Gated per-org on feature_flags.sis_settings.prior_learning_enabled — the same
flag the family side checks, so a school can't end up with a queue nobody can
file into, or vice versa.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from utils.sis_roles import ADMIN_ROLES
from utils.school_subjects import SCHOOL_SUBJECTS, SCHOOL_SUBJECT_DISPLAY_NAMES
from services import sis_service
from services import sis_prior_learning_service as prior

logger = get_logger(__name__)

bp = Blueprint('sis_prior_learning', __name__, url_prefix='/api/sis/prior-learning')


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    if not prior.enabled_for_org(org_id):
        return None, (jsonify({
            'success': False,
            'error': 'Prior learning records are not enabled for this school'
        }), 403)
    return org_id, None


@bp.route('', methods=['GET'])
@require_role(*ADMIN_ROLES)
def list_records(user_id):
    """The review queue. ?status= filters; drafts are never listed."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    status = request.args.get('status') or None
    if status and status not in ('submitted', 'under_review', 'accepted', 'rejected'):
        return jsonify({'success': False, 'error': 'Unknown status'}), 400
    return jsonify({
        'success': True,
        'records': prior.list_for_org(org_id, status=status,
                                      student_id=request.args.get('student_id')),
        'counts': prior.queue_counts(org_id),
        # The award vocabulary, so the reviewer's boxes and the future analyzer's
        # suggestions can never drift apart.
        'subjects': [{'key': key, 'name': SCHOOL_SUBJECT_DISPLAY_NAMES.get(key, key)}
                     for key in SCHOOL_SUBJECTS],
    })


@bp.route('/<record_id>', methods=['GET'])
@require_role(*ADMIN_ROLES)
def get_record(user_id, record_id):
    """One record, with its evidence and what this student has already been
    granted — a reviewer awarding 1.0 math needs to know about the 1.0 math
    another record already carried."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    record = prior.get_record(record_id, org_id)
    if not record:
        return jsonify({'success': False, 'error': 'Record not found'}), 404
    return jsonify({
        'success': True,
        'record': record,
        'accepted_totals': prior.accepted_credit_totals(record['student_user_id']),
    })


@bp.route('/<record_id>/review', methods=['POST'])
@require_role(*ADMIN_ROLES)
def review_record(user_id, record_id):
    """Move a record through review. Accepting carries the credit award with it:
    {status: 'accepted', awarded_credits: {math: 1.0}, review_notes: '...'}"""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    result = prior.review(
        record_id, org_id, user_id,
        status=(data.get('status') or '').strip(),
        notes=data.get('review_notes'),
        awarded_credits=data.get('awarded_credits'),
    )
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/accepted', methods=['GET'])
@require_role(*ADMIN_ROLES)
def student_accepted(user_id, student_id):
    """Everything accepted for one student — the transcript-side view of this
    queue, and what the credit-application step will read when it's built."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    records = [r for r in prior.accepted_for_student(student_id)
               if r.get('organization_id') == org_id]
    return jsonify({
        'success': True,
        'records': records,
        'totals': prior.accepted_credit_totals(student_id),
    })
