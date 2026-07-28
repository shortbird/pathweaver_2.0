"""
SIS waitlist routes — ordered queue + auto-offer management (spec §4.7).

NEW, additive (/api/sis), staff-gated, org-scoped. Admins view a class waitlist,
offer the open seat to the next student, accept/decline an offer (accept enrolls),
and remove entries.
"""

from flask import Blueprint, request, jsonify

from app_config import Config
from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_waitlist_service as waitlist
from repositories.sis_class_repository import SisClassRepository
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_waitlist', __name__, url_prefix='/api/sis')

# Admin tier: this whole module is org management, not teacher-facing.
STAFF_ROLES = ('org_admin', 'superadmin')


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


def _class_in_org(org_id, class_id):
    cls = SisClassRepository(client=get_supabase_admin_client()).find_by_id(class_id)
    return bool(cls and cls.get('organization_id') == org_id)


@bp.route('/classes/<class_id>/waitlist', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_waitlist(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    return jsonify({'success': True, 'waitlist': waitlist.list_for_class(org_id, class_id)})


@bp.route('/classes/<class_id>/waitlist', methods=['POST'])
@require_role(*STAFF_ROLES)
def add_waitlist(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    student_user_id = data.get('student_user_id')
    if not student_user_id:
        return jsonify({'success': False, 'error': 'student_user_id is required'}), 400
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    entry = waitlist.add_to_waitlist(org_id, class_id, student_user_id)
    return jsonify({'success': True, 'entry': entry}), 201


@bp.route('/classes/<class_id>/waitlist/offer-next', methods=['POST'])
@require_role(*STAFF_ROLES)
def offer_next(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    entry = waitlist.offer_next(org_id, class_id)
    if not entry:
        return jsonify({'success': True, 'entry': None, 'message': 'No one waiting'})
    return jsonify({'success': True, 'entry': entry})


@bp.route('/waitlist/<entry_id>/respond', methods=['POST'])
@require_role(*STAFF_ROLES)
def respond(user_id, entry_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    accept = bool(data.get('accept'))
    result = waitlist.respond_to_offer(org_id, entry_id, accept, enrolled_by=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


@bp.route('/waitlist/<entry_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def remove_entry(user_id, entry_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    waitlist.remove(org_id, entry_id)
    return jsonify({'success': True})


@bp.route('/internal/waitlist-offer-sweep', methods=['POST'])
def waitlist_offer_sweep():
    """Cron entrypoint: expire per-class waitlist offers past their TTL and
    re-alert admins that the seat is open. Auth via X-Cron-Secret, or a signed-in
    superadmin for manual triggering (mirrors /api/sis/internal/attendance-sweep)."""
    secret = request.headers.get('X-Cron-Secret')
    is_cron = bool(secret and Config.CRON_SECRET and secret == Config.CRON_SECRET)
    if not is_cron:
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        is_super = False
        if uid:
            row = (
                get_supabase_admin_client().table('users').select('role')
                .eq('id', uid).limit(1).execute()
            ).data
            is_super = bool(row and row[0].get('role') == 'superadmin')
        if not is_super:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    return jsonify({'success': True, **waitlist.expire_stale_offers()})
