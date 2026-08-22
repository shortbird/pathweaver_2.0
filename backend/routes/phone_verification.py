"""
Phone verification (SMS code) — the flow that lifts the phone-verification hold.

Three endpoints under /api/phone-verification, all authenticated: the hold
applies to logged-in adults, so unlike the registration funnel's OTP there is
no pre-session path here and CSRF applies as normal. The middleware
(middleware/phone_verification_gate.py) allowlists this prefix — these are,
with /api/auth/, the only calls a held adult can make.

Who is required to verify is decided in utils/phone_verification_hold; this
blueprint never re-derives it. A user the hold doesn't apply to can still
verify a phone voluntarily — there is nothing to protect the flow FROM, and
scoping it would just add a second copy of the eligibility rule to drift.
"""

from flask import Blueprint, request, jsonify

from middleware.rate_limiter import rate_limit
from services import phone_verification_service as phone_verification
from utils.auth.decorators import require_auth
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('phone_verification', __name__,
               url_prefix='/api/phone-verification')


@bp.route('/status', methods=['GET'])
@require_auth
def verification_status(user_id):
    """Whether this caller must verify, and the best prefill we hold.

    Asked by the router gate before the app renders anything, so like the
    required-documents endpoint it takes no parameters: `required: false` is
    the one answer for everybody who is not held.
    """
    return jsonify({'success': True, **phone_verification.status(user_id)})


@bp.route('/send-code', methods=['POST'])
@require_auth
@rate_limit(max_requests=5, window_seconds=300, per_user=True)
def send_code(user_id):
    """Text a 6-digit code to the number in the body. The service adds its own
    DB-backed cooldown + hourly cap on top of this per-worker limit — SMS cost
    real money per message, so both layers are load-bearing."""
    data = request.get_json(silent=True) or {}
    payload, status_code = phone_verification.send_code(
        user_id, data.get('phone') or '')
    return jsonify(payload), status_code


@bp.route('/verify', methods=['POST'])
@require_auth
@rate_limit(max_requests=15, window_seconds=300, per_user=True)
def verify(user_id):
    """Check the code; success stamps users.phone_verified_at and the hold
    lifts on the very next request (held answers are never cached)."""
    data = request.get_json(silent=True) or {}
    payload, status_code = phone_verification.verify_code(
        user_id, data.get('code') or '')
    return jsonify(payload), status_code
