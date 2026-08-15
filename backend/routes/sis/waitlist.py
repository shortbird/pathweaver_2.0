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
# Admin tier: this whole module is org management, not teacher-facing.
from utils.sis_roles import ADMIN_ROLES as STAFF_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_waitlist', __name__, url_prefix='/api/sis')


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
    # admin client justified: org_classes ownership check used as the org-scoping gate by every staff-gated waitlist route
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
    # A student still waiting for a seat AT THE SCHOOL can't hold a seat in one
    # of its classes yet (iCreate, 2026-08-13: "I should not be able to put
    # someone onto a class waitlist if they are on the enrollment waitlist").
    # A warning, not a wall — the office sometimes queues a class ahead of an
    # admission it knows is coming — so it asks once, then honours force.
    if not data.get('force'):
        from services import sis_enrollment_waitlist_service as enrollment_waitlist
        try:
            pending = enrollment_waitlist.waiting_entry(org_id, student_user_id)
        except Exception:  # noqa: BLE001 — never block staff over the check itself
            pending = None
        if pending:
            return jsonify({
                'success': False,
                'enrollment_waitlisted': True,
                'error': 'This student is still on the enrollment waitlist for the '
                         'school, so they do not have a place yet.',
            }), 409
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
        # Say WHY nobody could be offered — the class row's waitlist count
        # includes students who already have an offer out, so a bare
        # "No one waiting" reads as a bug.
        return jsonify({'success': True, 'entry': None,
                        'message': waitlist.nobody_waiting_reason(org_id, class_id)})
    return jsonify({'success': True, 'entry': entry})


@bp.route('/waitlist/<entry_id>/offer', methods=['POST'])
@require_role(*STAFF_ROLES)
def offer_entry(user_id, entry_id):
    """Offer (or re-offer) the seat to one named student, resetting the clock.

    'Offer next seat' can only reach the front of the queue; this is how an
    expired or declined offer gets handed back out."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = waitlist.offer_entry(org_id, entry_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Waitlist entry not found' else 409
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/waitlist/<entry_id>/enroll', methods=['POST'])
@require_role(*STAFF_ROLES)
def enroll_entry(user_id, entry_id):
    """Admit a waitlisted student into the class directly, without waiting for
    the family to claim the offer. Capacity is not enforced — an admin doing
    this by hand is the override."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # An optional class_id enrolls them in ANOTHER section of the same class —
    # the seat they wanted, at a time that has room. That moves them to a
    # different time, so a clash with something they already attend comes back
    # as `conflicts` (409) until the caller re-sends with force.
    data = request.get_json(silent=True) or {}
    result = waitlist.enroll_entry(org_id, entry_id, enrolled_by=user_id,
                                   class_id=data.get('class_id'),
                                   force=bool(data.get('force')))
    if result.get('error'):
        code = 404 if result['error'] == 'Waitlist entry not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    if result.get('conflicts'):
        return jsonify({'success': False, 'conflicts': result['conflicts'],
                        'section': result.get('section')}), 409
    return jsonify({'success': True, **result})


@bp.route('/waitlist/<entry_id>/offer-section', methods=['POST'])
@require_role(*STAFF_ROLES)
def offer_other_section(user_id, entry_id):
    """Offer a waitlisted student a seat in a different section of the same class.

    The office can see the open seat; only the family can see whether that time
    works, so this hands them a claimable offer instead of enrolling them into a
    slot that may already be taken."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    class_id = data.get('class_id')
    if not class_id:
        return jsonify({'success': False, 'error': 'class_id is required'}), 400
    result = waitlist.offer_other_section(org_id, entry_id, class_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Waitlist entry not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/classes/<class_id>/sibling-sections', methods=['GET'])
@require_role(*STAFF_ROLES)
def sibling_sections(user_id, class_id):
    """Other sections of this class that still have room, so a waitlisted
    student can be offered a different time instead of just waiting."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    return jsonify({'success': True, 'sections': waitlist.sibling_sections(org_id, class_id)})


@bp.route('/waitlist/<entry_id>/respond', methods=['POST'])
@require_role(*STAFF_ROLES)
def respond(user_id, entry_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    accept = bool(data.get('accept'))
    result = waitlist.respond_to_offer(org_id, entry_id, accept, enrolled_by=user_id,
                                       force=bool(data.get('force')))
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    # Accepting into a class that clashes with something they already attend
    # comes back as `conflicts` (409) until the caller re-sends with force.
    if result.get('conflicts'):
        return jsonify({'success': False, 'conflicts': result['conflicts']}), 409
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
    from utils.cron_auth import is_valid_cron_secret
    is_cron = is_valid_cron_secret(secret)
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
