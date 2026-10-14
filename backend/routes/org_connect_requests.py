"""The account owner's side of a school's connect request (ticket af8469aa).

A school admin who meets an email that already has a platform Optio account
sends a request from the add wizard (POST /api/sis/connect-requests). The
email and the bell link to /invitation/<code>, the page that already accepts
the school's email invitations; for a connect request it asks the signed-in
owner -- or a minor student's parent -- to Accept or Decline here.

  POST /api/connect-requests/<code>/accept
  POST /api/connect-requests/<code>/decline

Signed in, and only the account the request names (or its parent): the code
alone is not enough, so a forwarded email cannot attach anyone. The rules live
in services/org_membership_service.py.
"""

from flask import Blueprint, jsonify

from middleware.rate_limiter import rate_limit
from services import org_membership_service as svc
from utils.auth.decorators import require_auth

bp = Blueprint('org_connect_requests', __name__)


def _fail(e: svc.ConnectRequestError):
    return jsonify({'success': False, 'error': str(e), 'code': e.code}), e.status


@bp.route('/api/connect-requests/<code>/accept', methods=['POST'])
@require_auth
@rate_limit(calls=20, period=3600, per_user=True)
def accept_connect_request(user_id, code):
    try:
        return jsonify({'success': True, **svc.accept(code, user_id)}), 200
    except svc.ConnectRequestError as e:
        return _fail(e)


@bp.route('/api/connect-requests/<code>/decline', methods=['POST'])
@require_auth
@rate_limit(calls=20, period=3600, per_user=True)
def decline_connect_request(user_id, code):
    try:
        return jsonify({'success': True, **svc.decline(code, user_id)}), 200
    except svc.ConnectRequestError as e:
        return _fail(e)
