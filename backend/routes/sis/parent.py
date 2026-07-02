"""
SIS Parent self-service routes — guardians register their own children.

NEW, additive (/api/sis/parent). Unlike the rest of /api/sis (staff-gated), these
use @require_auth and authorize by family relationship inside sis_parent_service
(the user must be a guardian of the student, in a SIS-enabled org). Self-service
stops at 'submitted'; staff invoice and full payment auto-enrolls.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.logger import get_logger
from services import sis_parent_service as parent

logger = get_logger(__name__)

bp = Blueprint('sis_parent', __name__, url_prefix='/api/sis/parent')


def _org(req):
    body = req.get_json(silent=True) or {}
    return req.args.get('organization_id') or body.get('organization_id')


@bp.route('/context', methods=['GET'])
@require_auth
def get_context(user_id):
    """Orgs + children this guardian can register. Empty if they're not a SIS guardian."""
    return jsonify({'success': True, **parent.context(user_id)})


@bp.route('/classes', methods=['GET'])
@require_auth
def open_classes(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    classes = parent.open_classes(user_id, org_id)
    if classes is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'classes': classes})


@bp.route('/registrations', methods=['GET'])
@require_auth
def list_registrations(user_id):
    return jsonify({'success': True, 'registrations': parent.list_my_registrations(user_id)})


@bp.route('/registrations', methods=['POST'])
@require_auth
def create_registration(user_id):
    data = request.json or {}
    org_id = _org(request)
    student_user_id = data.get('student_user_id')
    if not org_id or not student_user_id:
        return jsonify({'success': False, 'error': 'organization_id and student_user_id are required'}), 400
    result = parent.create_registration(user_id, org_id, student_user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 403
    return jsonify({'success': True, 'registration': result['registration']}), 201


@bp.route('/registrations/<reg_id>', methods=['GET'])
@require_auth
def get_registration(user_id, reg_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    reg = parent.get_registration(user_id, org_id, reg_id)
    if not reg:
        return jsonify({'success': False, 'error': 'Registration not found'}), 404
    return jsonify({'success': True, 'registration': reg})


@bp.route('/registrations/<reg_id>/items', methods=['POST'])
@require_auth
def add_item(user_id, reg_id):
    data = request.json or {}
    org_id = _org(request)
    class_id = data.get('class_id')
    if not org_id or not class_id:
        return jsonify({'success': False, 'error': 'organization_id and class_id are required'}), 400
    result = parent.add_item(user_id, org_id, reg_id, class_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Registration not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result}), 201


@bp.route('/registrations/<reg_id>/items/<item_id>', methods=['DELETE'])
@require_auth
def remove_item(user_id, reg_id, item_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.remove_item(user_id, org_id, reg_id, item_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True})


@bp.route('/registrations/<reg_id>/quote', methods=['GET'])
@require_auth
def quote(user_id, reg_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.quote(user_id, org_id, reg_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, 'quote': result})


@bp.route('/registrations/<reg_id>/submit', methods=['POST'])
@require_auth
def submit(user_id, reg_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.submit(user_id, org_id, reg_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Registration not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, 'registration': result['registration']})


# ── Planned absences (guardian reports a child will be out) ───────────────────
@bp.route('/absences', methods=['GET'])
@require_auth
def list_absences(user_id):
    org_id = _org(request)
    student_user_id = request.args.get('student_user_id')
    if not org_id or not student_user_id:
        return jsonify({'success': False, 'error': 'organization_id and student_user_id are required'}), 400
    result = parent.list_absences(user_id, org_id, student_user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 403
    return jsonify({'success': True, **result})


@bp.route('/absences', methods=['POST'])
@require_auth
def create_absence(user_id):
    data = request.json or {}
    org_id = _org(request)
    student_user_id = data.get('student_user_id')
    absence_date = data.get('absence_date')
    if not org_id or not student_user_id or not absence_date:
        return jsonify({'success': False,
                        'error': 'organization_id, student_user_id and absence_date are required'}), 400
    result = parent.create_absence(
        user_id, org_id, student_user_id, absence_date,
        class_id=data.get('class_id'), reason=data.get('reason'),
    )
    if result.get('error'):
        code = 403 if result['error'] == 'Not authorized for this student' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, 'absence': result['absence']}), 201


@bp.route('/absences/<absence_id>', methods=['DELETE'])
@require_auth
def cancel_absence(user_id, absence_id):
    result = parent.cancel_absence(user_id, absence_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Absence not found' else 403
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True})


# ── Schedule builder: add/drop/waitlist until the first day of school ─────────
@bp.route('/students/<student_id>/schedule', methods=['GET'])
@require_auth
def student_schedule(user_id, student_id):
    """The student's current schedule (active classes + waitlist) plus whether
    self-service changes are still open (locks on the first day of school)."""
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.student_schedule(user_id, org_id, student_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 403
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/classes', methods=['POST'])
@require_auth
def add_student_class(user_id, student_id):
    """Add a class to the student's schedule: enrolls if there's a seat, joins
    the waitlist when full (and allowed)."""
    data = request.json or {}
    org_id = _org(request)
    class_id = data.get('class_id')
    if not org_id or not class_id:
        return jsonify({'success': False, 'error': 'organization_id and class_id are required'}), 400
    result = parent.add_class(user_id, org_id, student_id, class_id)
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/classes/<class_id>', methods=['DELETE'])
@require_auth
def drop_student_class(user_id, student_id, class_id):
    """Drop a class from the student's schedule (and/or leave its waitlist)."""
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.drop_class(user_id, org_id, student_id, class_id)
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


# ── At-home learning: Optio courses (untimed) in the Schedule Builder ─────────
@bp.route('/courses', methods=['GET'])
@require_auth
def home_learning_courses(user_id):
    """Optio courses a family can add for at-home learning (empty when the org
    has the Optio-courses toggle off)."""
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    courses = parent.home_learning_courses(user_id, org_id)
    if courses is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'courses': courses})


@bp.route('/students/<student_id>/courses', methods=['POST'])
@require_auth
def add_student_course(user_id, student_id):
    data = request.json or {}
    org_id = _org(request)
    course_id = data.get('course_id')
    if not org_id or not course_id:
        return jsonify({'success': False, 'error': 'organization_id and course_id are required'}), 400
    result = parent.add_course(user_id, org_id, student_id, course_id)
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/courses/<course_id>', methods=['DELETE'])
@require_auth
def drop_student_course(user_id, student_id, course_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.drop_course(user_id, org_id, student_id, course_id)
    if result.get('error'):
        code = 403 if 'authorized' in result['error'] else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


# ── Org resources (family document library) ───────────────────────────────────
@bp.route('/resources', methods=['GET'])
@require_auth
def org_resources(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    resources = parent.org_resources(user_id, org_id)
    if resources is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'resources': resources})


# ── Family directory (opt-in) ─────────────────────────────────────────────────
@bp.route('/directory', methods=['GET'])
@require_auth
def family_directory(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    families = parent.family_directory(user_id, org_id)
    if families is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'families': families})


@bp.route('/directory/opt-in', methods=['GET'])
@require_auth
def directory_opt_in_status(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.directory_opt_in_status(user_id, org_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


@bp.route('/directory/opt-in', methods=['PUT'])
@require_auth
def set_directory_opt_in(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    opted_in = bool((request.json or {}).get('opted_in'))
    result = parent.set_directory_opt_in(user_id, org_id, opted_in)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})
