"""A partner's credit class: the buyer link and the partner's dashboard.

  GET  /api/offers/<slug>                 the public page's content, no login
  POST /api/offers/<slug>/claim           a signed-in student takes the class

  GET  /api/admin/organizations/<org_id>/partner-offerings
                                          the partner's classes, links, students
  POST /api/admin/organizations/<org_id>/partner-offerings/<offering_id>/students
                                          "Add a student"
  POST /api/admin/organizations/<org_id>/partner-offerings/<offering_id>/students/<enrollment_id>/remove
                                          stop billing a student

The rules are in services/partner_offering_service.py. Two blueprints because
the partner routes share the /api/admin/organizations prefix with the other
org blueprints (see routes/__init__.py) and the buyer routes do not.
"""

from flask import Blueprint, jsonify, request

from app_config import Config
from services import partner_offering_service as offerings
from services.partner_accounts import PartnerAccountError
# admin client justified: partner_offerings and partner_offering_enrollments
#   have RLS on with no policies (service role only), and provisioning writes a
#   quest, an enrollment and tasks for the student; every route below gates the
#   caller first (signed-in student for claim, the offering's own org admin or
#   a superadmin for the partner routes)
from utils.admin_client import admin_client as _admin
from utils.auth.decorators import require_auth, require_org_admin
from utils.logger import get_logger
from utils.validation import validate_uuid

logger = get_logger(__name__)

buyer_bp = Blueprint('partner_offer_buyer', __name__, url_prefix='/api/offers')
partner_bp = Blueprint('partner_offerings', __name__)

# Links are handed to families, so they point at the app host, never www
# (www 404s SPA routes it does not know).
PROD_APP_URL = 'https://app.optioeducation.com'


def _app_url():
    url = (Config.FRONTEND_URL or '').rstrip('/')
    return PROD_APP_URL if 'optioeducation.com' in url else (url or PROD_APP_URL)


def _refusal(err):
    if isinstance(err, offerings.OfferingError):
        return jsonify(err.payload()), err.status
    return jsonify({'error': err.message}), err.status


# ── buyer ─────────────────────────────────────────────────────────────────────

@buyer_bp.route('/<slug>', methods=['GET'])
def get_offer(slug):
    """Public: what the class is, before the visitor has an account."""
    try:
        return jsonify({'success': True, 'offer': offerings.public_view(_admin(), slug)})
    except offerings.OfferingError as err:
        return _refusal(err)


@buyer_bp.route('/<slug>/claim', methods=['POST'])
@require_auth
def claim_offer(user_id, slug):
    """The signed-in student takes the class. Safe to repeat."""
    data = request.get_json(silent=True) or {}
    try:
        result = offerings.claim_by_slug(_admin(), slug, user_id, dob_value=data.get('date_of_birth'))
    except offerings.OfferingError as err:
        return _refusal(err)
    return jsonify({'success': True, **result}), (201 if result['created'] else 200)


# ── partner ───────────────────────────────────────────────────────────────────

def _own_org(org_id, current_org_id, is_superadmin):
    ok, _ = validate_uuid(org_id or '')
    if not ok:
        return jsonify({'error': 'Organization not found'}), 404
    if not is_superadmin and current_org_id != org_id:
        return jsonify({'error': 'Access denied'}), 403
    return None


@partner_bp.route('/<org_id>/partner-offerings', methods=['GET'])
@require_org_admin
def list_partner_offerings(current_user_id, current_org_id, is_superadmin, org_id):
    denied = _own_org(org_id, current_org_id, is_superadmin)
    if denied:
        return denied
    return jsonify({'success': True, 'offerings': offerings.dashboard(_admin(), org_id, _app_url())})


@partner_bp.route('/<org_id>/partner-offerings/<offering_id>/students', methods=['POST'])
@require_org_admin
def add_partner_student(current_user_id, current_org_id, is_superadmin, org_id, offering_id):
    denied = _own_org(org_id, current_org_id, is_superadmin)
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    admin = _admin()
    try:
        offering = offerings.offering_for_partner(admin, offering_id, org_id)
        result = offerings.add_student(
            admin, offering, actor_id=current_user_id,
            first_name=data.get('first_name'), last_name=data.get('last_name'),
            email=data.get('email'), dob_value=data.get('date_of_birth'),
            student_id=(data.get('student_id') or '').strip() or None,
            frontend_url=_app_url())
    except (offerings.OfferingError, PartnerAccountError) as err:
        return _refusal(err)
    return jsonify({'success': True, **result}), (201 if result['created'] else 200)


@partner_bp.route('/<org_id>/partner-offerings/<offering_id>/students/<enrollment_id>/remove',
                  methods=['POST'])
@require_org_admin
def remove_partner_student(current_user_id, current_org_id, is_superadmin, org_id, offering_id,
                           enrollment_id):
    denied = _own_org(org_id, current_org_id, is_superadmin)
    if denied:
        return denied
    admin = _admin()
    try:
        offering = offerings.offering_for_partner(admin, offering_id, org_id)
        offerings.remove_student(admin, offering, enrollment_id)
    except offerings.OfferingError as err:
        return _refusal(err)
    return jsonify({'success': True})
