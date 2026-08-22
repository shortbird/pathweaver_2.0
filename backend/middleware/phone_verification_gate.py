"""
Enforces the phone-verification hold on every API request.

An adult in an org that requires verified phone numbers (see
utils/phone_verification_hold.py for who is held and why) gets one screen --
enter a phone, type back the texted code -- and nothing else. As with the
signature gate directly above this one in app setup: a gate that only exists
in the web router is a suggestion, so the rule lives here, once, and the
router mirrors it.

Shape of the response: 403 with `code: 'phone_verification_required'`, which
the client keys off to send them to the verification screen. A bare 403 would
surface as "something went wrong" instead of "verify your phone".

The allowlist contains exactly what a held adult needs to (a) stay logged in
and (b) verify a phone number -- and nothing else.
"""

from flask import request, jsonify

from utils import phone_verification_hold
from utils.logger import get_logger
from utils.session_manager import session_manager

logger = get_logger(__name__)

_ALLOWED_PREFIXES = (
    # (a) Stay logged in. Login, logout, refresh, /me, CSRF bootstrap. /me is
    # also how the web app learns about the hold in the first place.
    '/api/auth/',
    # (b) The verification flow itself: status (with its phone prefill),
    # send-code, verify.
    '/api/phone-verification/',
    # Leaving a masquerade. A held adult is held while an admin views as them
    # -- deliberate, it is what the adult sees -- but the exit is the admin's
    # own way out (see signature_gate, same entry, same reason).
    '/api/admin/masquerade/exit',
)

_ALLOWED_EXACT = (
    '/api/health',
    '/',
)


def _is_allowed(path: str) -> bool:
    if path in _ALLOWED_EXACT:
        return True
    return path.startswith(_ALLOWED_PREFIXES)


class PhoneVerificationGate:
    """Blocks held adults from everything but the verification flow."""

    def __init__(self, app=None):
        if app:
            self.init_app(app)

    def init_app(self, app):
        app.before_request(self.before_request)

    def before_request(self):
        # CORS preflight carries no credentials and decides nothing.
        if request.method == 'OPTIONS':
            return None
        path = request.path or ''
        if not path.startswith('/api/'):
            return None
        if _is_allowed(path):
            return None

        try:
            user_id = session_manager.get_effective_user_id()
        except Exception:
            # Unauthenticated or unreadable token: the route's own decorator
            # answers it.
            return None
        if not user_id:
            return None

        try:
            if not phone_verification_hold.is_blocked(user_id):
                return None
        except Exception as e:
            # Fail open, in step with the check itself (see the hold module).
            logger.warning(f'Phone gate check failed for {user_id}: {e}')
            return None

        return jsonify({
            'success': False,
            'code': 'phone_verification_required',
            'error': 'Your school requires a verified phone number before '
                     'you can continue using Optio.',
        }), 403


phone_verification_gate = PhoneVerificationGate()
