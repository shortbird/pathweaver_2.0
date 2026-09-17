"""
The one API-wide hold: a held adult gets one screen and nothing else.

Two holds exist today. A guardian with an unsigned REQUIRED document is held
until they sign it (utils/signature_hold.py says who and why); an adult in an
org that requires verified phone numbers is held until they type back the
texted code (utils/phone_verification_hold.py). Each used to be its own
middleware -- the same allow-list shape, the same fail-open, the same cache
asymmetry, and the same masquerade bug, fixed twice on the same day
(docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, G6/G7). This module is the
one gate; a hold is a provider in HOLDS, and a third hold is a fourth entry,
not a third middleware.

Why middleware at all: a gate that only exists in the web router is a
suggestion. The API is reachable from a console, from a stale tab, and from
the mobile app, so the rule lives here, once, and the router mirrors it.

Shape of the response: 403 with a machine-readable `code` (the provider's:
`signature_required`, `phone_verification_required`), which the client keys
off to send the person to the right screen. A bare 403 would surface to the
family as "something went wrong" instead of "sign this" or "verify this".

The allow-list is the delicate part. It has to contain exactly the calls
needed to (a) stay logged in and (b) satisfy every hold -- and nothing else.
Too small and a hold is a dead end; too large and it is not a hold. It is one
list, the union of what each hold's flow needs, so a person under both holds
can reach both flows: with two lists, the signing endpoints were refused by
the phone gate and the verification endpoints by the signature gate, and the
only exit was an admin's masquerade.
"""

from dataclasses import dataclass
from types import ModuleType
from typing import Tuple

from flask import jsonify, request

from utils import phone_verification_hold, signature_hold
from utils.logger import get_logger
from utils.session_manager import session_manager

logger = get_logger(__name__)


@dataclass(frozen=True)
class Hold:
    """One reason a person may be held, and what to tell them."""
    code: str
    message: str
    #: The utils/<thing>_hold module: `is_blocked(user_id)` answers, with its
    #: own cache and its own fail-open. Held as the module, not the function,
    #: so a test that patches `<module>.is_blocked` is honoured.
    provider: ModuleType
    #: The calls this hold's own flow needs. Merged into the one allow-list.
    allowed_prefixes: Tuple[str, ...]


#: In order: the first hold that applies is the one reported. Signature first,
#: as the two middlewares were registered.
HOLDS: Tuple[Hold, ...] = (
    Hold(
        code='signature_required',
        message='Your school needs you to sign a document before you can '
                'continue using Optio.',
        provider=signature_hold,
        allowed_prefixes=(
            # What must be signed -- the payload the hold screen renders from.
            '/api/sis/parent/required-documents',
            # Read it and sign it. The family portal's own endpoints: the
            # checklist list, the item PATCH that records the signature, the
            # upload an item may ask for, and the signed URL that opens the
            # document itself.
            '/api/sis/parent/onboarding',
            '/api/sis/parent/my-documents/',
            # The org context the signing screen needs to name the school and
            # to pass organization_id on the calls above.
            '/api/sis/parent/context',
        ),
    ),
    Hold(
        code='phone_verification_required',
        message='Your school requires a verified phone number before '
                'you can continue using Optio.',
        provider=phone_verification_hold,
        allowed_prefixes=(
            # The verification flow itself: status (with its phone prefill),
            # send-code, verify.
            '/api/phone-verification/',
        ),
    ),
)

# Exact paths and prefixes a held person may still reach, whatever holds them.
_COMMON_PREFIXES = (
    # Stay logged in. Login, logout, refresh, /me, CSRF bootstrap. /me is also
    # how the web app learns about a hold in the first place, and holding
    # someone out of logout would leave them unable to leave.
    '/api/auth/',
    # Leaving a masquerade. A masquerade is exempt from every hold below, but
    # the exit stays listed so an admin can always get out even if that
    # exemption ever regresses. The route is already undecorated for the same
    # reason (routes/admin/masquerade.py).
    '/api/admin/masquerade/exit',
)

ALLOWED_PREFIXES: Tuple[str, ...] = _COMMON_PREFIXES + tuple(
    prefix for hold in HOLDS for prefix in hold.allowed_prefixes)

ALLOWED_EXACT: Tuple[str, ...] = (
    '/api/health',
    '/',
)


def is_allowed(path: str) -> bool:
    if path in ALLOWED_EXACT:
        return True
    return path.startswith(ALLOWED_PREFIXES)


class ApiHoldGate:
    """Blocks held people from everything but the flows that clear the hold."""

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
        if is_allowed(path):
            return None

        try:
            user_id = session_manager.get_effective_user_id()
        except Exception:
            # Unauthenticated or an unreadable token: not this middleware's
            # problem. The route's own decorator answers it.
            return None
        if not user_id:
            return None

        hold = self._first_hold(user_id)
        if hold is None:
            return None

        # An admin viewing as a held person is not held. An admin must not
        # sign a family's paperwork for them, and cannot type a code texted to
        # somebody else's phone, so holding the masquerade means every page
        # 403s with nothing the admin may do about it. The web router has
        # exempted masquerade since 2026-08-22 (useRequiredDocumentsGate,
        # usePhoneVerificationGate); the API caught up 2026-09-16, once per
        # gate. Checked after the hold so a clear person's cached result still
        # costs nothing extra.
        if session_manager.is_masquerading():
            return None

        return jsonify({
            'success': False,
            'code': hold.code,
            'error': hold.message,
        }), 403

    @staticmethod
    def _first_hold(user_id: str):
        for hold in HOLDS:
            try:
                if hold.provider.is_blocked(user_id):
                    return hold
            except Exception as e:
                # Fail open, deliberately and in step with the check itself:
                # a hold exists to stop ONE person over ONE thing, and no bug
                # in it should be able to take the platform down for everybody.
                logger.warning(f'Hold check {hold.code} failed for {user_id}: {e}')
        return None


api_hold_gate = ApiHoldGate()
