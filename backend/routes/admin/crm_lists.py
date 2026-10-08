"""
Email lists API for /admin/crm/lists (services/crm_email_lists.py).

Superadmin-only, same prefix as routes/admin/crm.py. The page pulls one
directory of every user with an email, filters it in the browser (role, org,
class), and copies the result for BCC on a Gmail draft. A saved list keeps
the filter plus hand edits, not a frozen set of people. Nothing here sends.
"""
from flask import Blueprint, jsonify, request

from repositories.crm_email_list_repository import CrmEmailListRepository
from services.crm_email_lists import build_directory, clean_list_payload
from utils.auth.decorators import require_superadmin
from utils.class_membership import guardians_by_student
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_crm_lists', __name__, url_prefix='/api/admin/crm')

# admin client justified: the directory spans every org and crm_email_lists
# is service-role only; every route here is behind require_superadmin.
from utils.admin_client import admin_client as _db


def _repo():
    return CrmEmailListRepository(client=_db())


def _audit(user_id, action_type, resource_id, metadata=None):
    try:
        from services.admin_audit_service import AdminAuditService
        AdminAuditService(user_id=user_id).log_action(
            admin_id=user_id, action_type=action_type,
            resource_type='crm_email_list', resource_id=str(resource_id),
            metadata=metadata or {})
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM list audit log failed ({action_type}): {e}')


@bp.route('/directory', methods=['GET'])
@require_superadmin
def directory(user_id):
    repo = _repo()
    users = repo.all_users()
    enrollments = repo.active_enrollments()
    classes = repo.all_classes()
    orgs = repo.all_organizations()
    suppressed = repo.suppressed_emails()

    classes_by_student = {}
    for e in enrollments:
        classes_by_student.setdefault(e['student_id'], set()).add(e['class_id'])
    # Anyone can be somebody's child: dependents carry no student role row of
    # their own until they log in, so ask about every user, not only students.
    guardians = guardians_by_student([u['id'] for u in users])

    people = build_directory(users, classes_by_student, guardians, suppressed)
    return jsonify({
        'people': people,
        'organizations': sorted(
            ({'id': o['id'], 'name': (o.get('name') or '').strip()} for o in orgs),
            key=lambda o: o['name'].lower()),
        'classes': sorted(
            ({'id': c['id'], 'name': c.get('name') or '', 'organization_id': c.get('organization_id'),
              'status': c.get('status')} for c in classes),
            key=lambda c: (c['name'] or '').lower()),
    })


@bp.route('/lists', methods=['GET'])
@require_superadmin
def list_lists(user_id):
    return jsonify({'lists': _repo().list_all()})


@bp.route('/lists', methods=['POST'])
@require_superadmin
def create_list(user_id):
    try:
        fields = clean_list_payload(request.get_json(silent=True) or {})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    fields['created_by'] = user_id
    row = _repo().create_list(fields)
    _audit(user_id, 'crm_email_list_created', row['id'], {'name': row['name']})
    return jsonify({'list': row}), 201


@bp.route('/lists/<list_id>', methods=['PUT'])
@require_superadmin
def update_list(user_id, list_id):
    try:
        fields = clean_list_payload(request.get_json(silent=True) or {}, partial=True)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    row = _repo().update_list(list_id, fields)
    if not row:
        return jsonify({'error': 'List not found'}), 404
    _audit(user_id, 'crm_email_list_updated', list_id)
    return jsonify({'list': row})


@bp.route('/lists/<list_id>', methods=['DELETE'])
@require_superadmin
def delete_list(user_id, list_id):
    _repo().delete_list(list_id)
    _audit(user_id, 'crm_email_list_deleted', list_id)
    return '', 204
