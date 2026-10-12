"""A platform student asks for a parent to be linked; a superadmin approves.

The rules live in services/parent_link_request_service.py, which says why the
last step is a person.

Student:
  GET    /api/parent-link-requests/mine     the student's card: linked parents or the open request
  POST   /api/parent-link-requests          {parent_email} send (or replace) the request
  DELETE /api/parent-link-requests/mine     cancel the open request
Parent (from the emailed link):
  GET    /api/parent-link-requests/invite/<token>          public preview
  POST   /api/parent-link-requests/invite/<token>/accept   signed in with the invited address
Superadmin:
  GET    /api/admin/parent-link-requests
  POST   /api/admin/parent-link-requests/<request_id>/decide   {approve: bool}
"""

from flask import Blueprint, request

from middleware.rate_limiter import rate_limit
from services import parent_link_request_service as svc
from services.parent_link_request_service import ParentLinkRequestError
from utils.api_response import error_response, success_response
from utils.auth.decorators import require_auth, require_role, require_superadmin

bp = Blueprint('parent_link_requests', __name__)


def _fail(e: ParentLinkRequestError):
    return error_response(str(e), status_code=400)


@bp.route('/api/parent-link-requests/mine', methods=['GET'])
@require_role('student', 'superadmin')
def get_mine(user_id):
    try:
        return success_response(data=svc.status_for_student(user_id))
    except ParentLinkRequestError as e:
        return _fail(e)


@bp.route('/api/parent-link-requests', methods=['POST'])
@require_role('student', 'superadmin')
@rate_limit(calls=5, period=86400, per_user=True)
def post_request(user_id):
    data = request.get_json() or {}
    try:
        return success_response(data=svc.create(user_id, data.get('parent_email')), status_code=201)
    except ParentLinkRequestError as e:
        return _fail(e)


@bp.route('/api/parent-link-requests/mine', methods=['DELETE'])
@require_role('student', 'superadmin')
def delete_mine(user_id):
    svc.cancel(user_id)
    return success_response(data={'cancelled': True})


@bp.route('/api/parent-link-requests/invite/<token>', methods=['GET'])
@rate_limit(calls=30, period=3600)
def get_invite(token):
    """Public: the token is the credential. Shows the student's first name
    and the invited address, so the parent knows which account to use."""
    try:
        return success_response(data=svc.preview(token))
    except ParentLinkRequestError as e:
        return _fail(e)


@bp.route('/api/parent-link-requests/invite/<token>/accept', methods=['POST'])
@require_auth
@rate_limit(calls=10, period=3600, per_user=True)
def post_accept(user_id, token):
    try:
        return success_response(data=svc.accept(token, user_id))
    except ParentLinkRequestError as e:
        return _fail(e)


@bp.route('/api/admin/parent-link-requests', methods=['GET'])
@require_superadmin
def admin_list(user_id):
    return success_response(data=svc.list_for_admin())


@bp.route('/api/admin/parent-link-requests/<request_id>/decide', methods=['POST'])
@require_superadmin
def admin_decide(user_id, request_id):
    data = request.get_json() or {}
    if not isinstance(data.get('approve'), bool):
        return error_response('approve must be true or false', status_code=400)
    try:
        return success_response(data=svc.decide(user_id, request_id, data['approve']))
    except ParentLinkRequestError as e:
        return _fail(e)
