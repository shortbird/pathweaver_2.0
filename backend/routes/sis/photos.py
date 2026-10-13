"""
SIS group photos (/api/sis/photos): a coach takes or uploads a picture, taps
every student in it, and saves. Each tagged student gets the photo in their
learning journal and their parents get a note (ticket 85949de5, Apogee Cache
Valley). The work is services/group_photo_service, shared with Treehouse's
Capture tab.

Every route is STAFF_ROLES (teachers and coaches included: at a microschool
the coach is who takes the picture), org-scoped through
sis_service.org_or_error, and refused with a 404 when the school has not
turned group_photos on. The 404 is checked here as well as by the blueprint's
module_guard, because the guard only logs until MODULE_ENFORCEMENT is
'enforce' -- and this module emails parents, so "off" has to mean off today.
"""

from flask import Blueprint, jsonify, request

from modules.enabled import module_enabled
from modules.gate import module_guard
from services import sis_service
from services.group_photo_service import GroupPhotoError, GroupPhotoService, upload_files
from utils.auth.decorators import require_role
from utils.sis_roles import STAFF_ROLES

bp = Blueprint('sis_photos', __name__, url_prefix='/api/sis/photos')

MODULE = 'group_photos'
module_guard(bp, MODULE)


def _module_org(user_id):
    org_id, error = sis_service.org_or_error(user_id)
    if error:
        return None, error
    if not module_enabled(org_id, MODULE):
        return None, (jsonify({'success': False, 'error': 'Not found'}), 404)
    return org_id, None


@bp.route('', methods=['GET'])
@require_role(*STAFF_ROLES)
def photos_home(user_id):
    """The students to tag (the school's current students) and the school's
    recent captures."""
    org_id, error = _module_org(user_id)
    if error:
        return error
    service = GroupPhotoService()
    students = service.roster(org_id)
    return jsonify({'success': True, 'students': students,
                    'recent': service.recent(org_id, [s['id'] for s in students])})


@bp.route('/upload', methods=['POST'])
@require_role(*STAFF_ROLES)
def photos_upload(user_id):
    """Multipart `files`: the photos for one capture, uploaded before it is
    saved. Answers the durable pointers to post back to POST /api/sis/photos."""
    _org_id, error = _module_org(user_id)
    if error:
        return error
    try:
        files = upload_files(request.files.getlist('files'), user_id, security_scan=True)
    except GroupPhotoError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status
    return jsonify({'success': True, 'files': files}), 201


@bp.route('', methods=['POST'])
@require_role(*STAFF_ROLES)
def photos_capture(user_id):
    """Body: {student_ids, caption?, event_date?, media: [{type, file_url,
    file_name, file_size}]}. Refused whole if any student is not in the
    school. Answers how many journals got it and how many families were told."""
    org_id, error = _module_org(user_id)
    if error:
        return error
    try:
        result = GroupPhotoService().capture(org_id, user_id, request.get_json(silent=True) or {})
    except GroupPhotoError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status
    return jsonify({'success': True, **result}), 201
