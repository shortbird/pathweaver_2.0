"""
SIS Parent forms — guardians submit family requests (at-home learning day,
records request, meeting request, general request) that land in the SAME staff
forms queue teachers/admins already triage, tagged submitter_role='parent'.

NEW, additive. Shares the /api/sis/parent prefix with routes/sis/parent.py (Flask
allows multiple blueprints on one prefix). Like the rest of /api/sis/parent, these
use @require_auth and authorize by family relationship (via sis_parent_service),
NOT the staff role gate.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.logger import get_logger
from services import sis_parent_service as parent
from services import sis_forms_service as forms

logger = get_logger(__name__)

bp = Blueprint('sis_parent_forms', __name__, url_prefix='/api/sis/parent')


def _org(req):
    body = req.get_json(silent=True) or {}
    return req.args.get('organization_id') or body.get('organization_id')


def _available_form_types(org_id):
    """The family form picker's options for THIS org.

    'schedule_change' is the school's add/drop window, not a standing option:
    outside it the office is not taking add/drop requests, so the type is not
    offered (and create_form rejects it) rather than filing work nobody will
    pick up.
    """
    types = dict(forms.PARENT_FORM_TYPES)
    if not parent.add_drop_open(org_id):
        types.pop('schedule_change', None)
    return types


@bp.route('/forms', methods=['GET'])
@require_auth
def list_forms(user_id):
    """The caller's own family form submissions for an org, plus the form-type
    options the family picker offers."""
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    if not any(s['org_id'] == org_id for s in parent.registerable_students(user_id)):
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True,
                    'submissions': forms.list_mine(org_id, user_id),
                    'form_types': _available_form_types(org_id)})


@bp.route('/forms', methods=['POST'])
@require_auth
def create_form(user_id):
    """File a family request. Validates the form type against PARENT_FORM_TYPES
    and (when given) that student_user_id is a child the caller may act for."""
    data = request.json or {}
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400

    students = parent.registerable_students(user_id)
    if not any(s['org_id'] == org_id for s in students):
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403

    form_type = data.get('form_type')
    if form_type not in forms.PARENT_FORM_TYPES:
        return jsonify({'success': False, 'error': 'Unknown form type'}), 400
    if form_type == 'schedule_change' and not parent.add_drop_open(org_id):
        return jsonify({'success': False,
                        'error': 'The add/drop window is closed — contact the school office'}), 400

    body = (data.get('body') or data.get('details') or '').strip()
    if not body:
        return jsonify({'success': False, 'error': 'Please describe your request'}), 400

    student_user_id = data.get('student_user_id') or None
    if student_user_id and not any(
            s['student_id'] == student_user_id and s['org_id'] == org_id for s in students):
        return jsonify({'success': False, 'error': 'Not authorized for this student'}), 403

    result = forms.submit(org_id, user_id, {
        'form_type': form_type,
        'title': data.get('title'),
        'body': body,
        'student_user_id': student_user_id,
    }, submitter_role='parent')
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, 'submission': result['submission']}), 201
