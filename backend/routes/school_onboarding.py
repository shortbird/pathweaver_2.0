"""School setup links: the link Optio staff send a new school's operator.

  GET  /api/school-setup/<token>          the link's state, no login
  POST /api/school-setup/<token>          submit the form: creates the org and
                                          makes the caller its org_admin

  GET  /api/admin/school-setup-links      staff: recent links and their answers
  POST /api/admin/school-setup-links      staff: make a link
  POST /api/admin/school-setup-links/<link_id>/revoke
                                          staff: turn an unused link off

The rules are in services/school_onboarding_service.py. Two blueprints because
the public and staff routes share no prefix.
"""

from flask import Blueprint, jsonify, request

from app_config import Config
from repositories.organization_repository import OrganizationRepository
from repositories.school_onboarding_repository import SchoolOnboardingRepository
from services import school_onboarding_service as setup
from utils.auth.decorators import require_auth, require_superadmin
from utils.validation import validate_uuid

public_bp = Blueprint('school_setup', __name__, url_prefix='/api/school-setup')
admin_bp = Blueprint('school_setup_links', __name__, url_prefix='/api/admin/school-setup-links')

# Links go to school operators, so they point at the app host, never www
# (www 404s SPA routes it does not know).
PROD_APP_URL = 'https://app.optioeducation.com'


def _app_url():
    url = (Config.FRONTEND_URL or '').rstrip('/')
    return PROD_APP_URL if 'optioeducation.com' in url else (url or PROD_APP_URL)


def _repo():
    return SchoolOnboardingRepository()


def _refusal(err: setup.SchoolSetupError):
    return jsonify(err.payload()), err.status


# ── the school operator ───────────────────────────────────────────────────────

@public_bp.route('/<token>', methods=['GET'])
def get_setup_link(token):
    """Public: whether the link is still open, before the visitor signs in."""
    try:
        return jsonify({'success': True, 'link': setup.public_view(_repo(), token)})
    except setup.SchoolSetupError as err:
        return _refusal(err)


@public_bp.route('/<token>', methods=['POST'])
@require_auth
def submit_setup(user_id, token):
    repo = _repo()
    # admin client justified: inserts the organizations row, which only a
    # superadmin may do through the user-scoped client; the caller holds an
    # open single-use token, checked inside submit() before anything is written
    org_repo = OrganizationRepository(client=repo.client)
    try:
        result = setup.submit(repo, org_repo, token, user_id, request.get_json(silent=True) or {})
    except setup.SchoolSetupError as err:
        return _refusal(err)
    return jsonify({'success': True, **result}), 201


# ── Optio staff ───────────────────────────────────────────────────────────────

@admin_bp.route('', methods=['GET'])
@require_superadmin
def list_setup_links(superadmin_user_id):
    links = [setup.staff_view(link, _app_url()) for link in _repo().recent()]
    return jsonify({'success': True, 'links': links})


@admin_bp.route('', methods=['POST'])
@require_superadmin
def create_setup_link(superadmin_user_id):
    data = request.get_json(silent=True) or {}
    link = setup.create_link(_repo(), superadmin_user_id,
                             school_name_hint=data.get('school_name_hint', ''),
                             contact_email=data.get('contact_email', ''),
                             note=data.get('note', ''))
    return jsonify({'success': True, 'link': setup.staff_view(link, _app_url())}), 201


@admin_bp.route('/<link_id>/revoke', methods=['POST'])
@require_superadmin
def revoke_setup_link(superadmin_user_id, link_id):
    ok, _ = validate_uuid(link_id or '')
    if not ok:
        return jsonify({'error': 'Link not found.'}), 404
    try:
        setup.revoke_link(_repo(), link_id)
    except setup.SchoolSetupError as err:
        return _refusal(err)
    return jsonify({'success': True})
