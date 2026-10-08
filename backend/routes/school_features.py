"""The school's own feature switches (org admin), at /api/school-features.

GET  /api/school-features          every feature, grouped; the ones only
                                   Optio turns on carry switchable: false
PUT  /api/school-features          {"billing": true, "tasks": false}
POST /api/school-features/request  {"key": "bloomy"} -- "Ask Optio": a ticket

Org admins and the superadmin only (require_org_admin): a campus coordinator
runs the office but does not decide what the school buys into, and billing is
on the list. A superadmin names the org with ?organization_id= (the console's
selected org). The rules live in services/school_features_service.py.
docs/MICROSCHOOL_FIRST_PLAN.md part 3.
"""

from flask import Blueprint, request

from utils.api_response import error_response, success_response
from utils.auth.decorators import require_org_admin

bp = Blueprint('school_features', __name__, url_prefix='/api/school-features')


def _org_id(organization_id, is_superadmin):
    """The caller's own org, or for a superadmin the one the console has
    selected. An org admin's ?organization_id= is ignored."""
    requested = request.args.get('organization_id')
    return (requested if is_superadmin and requested else None) or organization_id


@bp.route('', methods=['GET'])
@require_org_admin
def get_school_features(user_id, organization_id, is_superadmin):
    from services import school_features_service as svc
    org_id = _org_id(organization_id, is_superadmin)
    if not org_id:
        return error_response('organization_id is required', status_code=400)
    try:
        return success_response(svc.get_features(org_id))
    except LookupError as e:
        return error_response(str(e), status_code=404, error_code='not_found')


@bp.route('', methods=['PUT'])
@require_org_admin
def put_school_features(user_id, organization_id, is_superadmin):
    from services import school_features_service as svc
    org_id = _org_id(organization_id, is_superadmin)
    if not org_id:
        return error_response('organization_id is required', status_code=400)
    try:
        return success_response(
            svc.set_features(org_id, request.get_json(silent=True), actor_id=user_id))
    except LookupError as e:
        return error_response(str(e), status_code=404, error_code='not_found')
    except svc.FeatureChangeError as e:
        return error_response(e.message, status_code=e.status)


@bp.route('/request', methods=['POST'])
@require_org_admin
def request_school_feature(user_id, organization_id, is_superadmin):
    """Ask Optio to turn on a feature the school cannot switch itself."""
    from services import school_features_service as svc
    org_id = _org_id(organization_id, is_superadmin)
    if not org_id:
        return error_response('organization_id is required', status_code=400)
    try:
        return success_response(svc.request_feature(
            org_id, (request.get_json(silent=True) or {}).get('key'), actor_id=user_id))
    except svc.FeatureChangeError as e:
        return error_response(e.message, status_code=e.status)
