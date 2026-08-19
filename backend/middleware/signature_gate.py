"""
Enforces the paperwork hold on every API request.

A guardian with an unsigned REQUIRED document gets one screen and nothing else
(see utils/signature_hold.py for who is held and why). The web app knows
about the hold and routes them to it -- but a gate that only exists in the
router is a suggestion, not a gate: the API is reachable from a console, from a
stale tab, and from the mobile app, which has never heard of it.

So the rule lives here, once, and the router mirrors it.

Shape of the response: 403 with `code: 'signature_required'`, which is what the
client keys off to send them to the signing page. A bare 403 would be
indistinguishable from an ordinary permission error and would surface to the
family as "something went wrong" instead of "sign this".

The allowlist is the delicate part. It has to contain exactly the calls needed
to (a) stay logged in, (b) see what must be signed, (c) read it, and (d) sign
it -- and nothing else. Too small and the hold is a dead end; too large and it
is not a hold. Every entry below is one of those four.
"""

from flask import request, jsonify

from utils import signature_hold
from utils.logger import get_logger
from utils.session_manager import session_manager

logger = get_logger(__name__)

# Exact paths and prefixes a held guardian may still reach.
_ALLOWED_PREFIXES = (
    # (a) Stay logged in. Login, logout, refresh, /me, CSRF bootstrap. Holding
    # someone out of logout would leave them unable to leave.
    '/api/auth/',
    # (b) What must be signed -- the payload the hold screen renders from.
    '/api/sis/parent/required-documents',
    # (c) + (d) Read it and sign it. The family portal's own endpoints: the
    # checklist list, the item PATCH that records the signature, the upload an
    # item may ask for, and the signed URL that opens the document itself.
    '/api/sis/parent/onboarding',
    '/api/sis/parent/my-documents/',
    # The org context the signing screen needs to name the school and to pass
    # organization_id on the calls above.
    '/api/sis/parent/context',
    # Leaving a masquerade. A held parent is held while an admin is viewing as
    # them -- that is deliberate, it is what the parent sees -- but the exit is
    # the admin's own way out, and gating it would strand the admin inside an
    # account they cannot use and cannot leave. The route is already undecorated
    # for the same reason (routes/admin/masquerade.py).
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


class SignatureGate:
    """Blocks held guardians from everything but the signing flow."""

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
        # Non-API traffic (health probes, static) is not gated.
        if not path.startswith('/api/'):
            return None
        if _is_allowed(path):
            return None

        try:
            user_id = session_manager.get_effective_user_id()
        except Exception:
            # Unauthenticated or an unreadable token: not this middleware's
            # problem. The route's own decorator answers it.
            return None
        if not user_id:
            return None

        try:
            if not signature_hold.is_blocked(user_id):
                return None
        except Exception as e:
            # Fail open, deliberately and in step with the check itself: the gate
            # exists to hold ONE family for ONE document, and no bug in it
            # should be able to take the platform down for everybody.
            logger.warning(f'Signature gate check failed for {user_id}: {e}')
            return None

        return jsonify({
            'success': False,
            'code': 'signature_required',
            'error': 'Your school needs you to sign a document before you can '
                     'continue using Optio.',
        }), 403


signature_gate = SignatureGate()
