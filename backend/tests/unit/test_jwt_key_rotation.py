"""Rotating JWT_SECRET_KEY must not void tokens that are already out there.

SEC-14 needs prod's JWT_SECRET_KEY replaced with the Supabase JWT secret, which
means every app-signed token in circulation is re-keyed at once. session_manager
has handled that since M5 -- all six of its verify methods try the previous key.
The three token types signed OUTSIDE session_manager did not:

    lti_service evidence tokens    180 days
    lti_service OIDC state          10 min
    google_oauth TOS acceptance     15 min

The evidence tokens are the reason this is a blocker rather than a nicety. They
authorize a Canvas teacher to open one student's evidence from SpeedGrader with
no Optio session, they live half a year, and prod has live LTI registrations --
so a rotation would have left teachers clicking dead links in a real gradebook
with nothing to retry.
"""

from datetime import timedelta
from unittest.mock import patch

import jwt
import pytest


OLD_KEY = 'old-secret-' + 'o' * 40
NEW_KEY = 'new-secret-' + 'n' * 40

USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
QUEST = '11111111-2222-3333-4444-555555555555'


@pytest.fixture
def rotated():
    """Sign under the old key, then rotate: new key live, old key still trusted.

    Mirrors the cutover exactly -- JWT_SECRET_KEY becomes the Supabase secret
    and the outgoing value moves to FLASK_SECRET_KEY_OLD.
    """
    from app_config import Config

    def _sign(minter):
        with patch.object(Config, 'JWT_SECRET_KEY', OLD_KEY), \
             patch.object(Config, 'JWT_PREVIOUS_SECRET_KEY', None):
            return minter()

    class Rotation:
        sign = staticmethod(_sign)

        @staticmethod
        def after():
            return patch.multiple(Config, JWT_SECRET_KEY=NEW_KEY,
                                  JWT_PREVIOUS_SECRET_KEY=OLD_KEY)

        @staticmethod
        def after_the_window_closes():
            """The rotation is finished and FLASK_SECRET_KEY_OLD is removed."""
            return patch.multiple(Config, JWT_SECRET_KEY=NEW_KEY,
                                  JWT_PREVIOUS_SECRET_KEY=None)

    return Rotation


@pytest.mark.unit
class TestTokensSignedOutsideSessionManagerSurviveARotation:
    def test_a_speedgrader_evidence_link_still_opens(self, rotated):
        """The blocker. 180-day tokens, live in Canvas gradebooks today."""
        from services import lti_service
        token = rotated.sign(lambda: lti_service.issue_evidence_token(USER, QUEST))

        with rotated.after():
            claims = lti_service.decode_evidence_token(token)

        assert claims == {'uid': USER, 'qid': QUEST}

    def test_an_in_flight_canvas_launch_still_completes(self, rotated):
        """OIDC state is short-lived, but a launch mid-handshake at cutover
        should land rather than error the teacher out."""
        from services import lti_service

        class Reg:
            id = 'reg-1'
            issuer = 'https://canvas.test'
            client_id = 'client-1'

        token = rotated.sign(lambda: lti_service.issue_state(Reg, 'hint'))

        with rotated.after():
            payload = lti_service.verify_state(token, Reg)

        assert payload['purpose'] == 'lti_oidc_state'

    def test_a_signup_mid_tos_acceptance_still_completes(self, rotated):
        from routes.auth import google_oauth
        token = rotated.sign(lambda: google_oauth.generate_tos_acceptance_token(USER))

        with rotated.after():
            assert google_oauth.verify_tos_acceptance_token(token) == USER


@pytest.mark.unit
class TestTheFallbackIsAWindow:
    def test_old_tokens_stop_working_once_the_previous_key_is_removed(self, rotated):
        """The fallback is a cutover window, not a permanent second key.
        Dropping FLASK_SECRET_KEY_OLD is what finishes the rotation."""
        from services import lti_service
        token = rotated.sign(lambda: lti_service.issue_evidence_token(USER, QUEST))

        with rotated.after_the_window_closes():
            assert lti_service.decode_evidence_token(token) is None

    def test_a_token_signed_with_neither_key_is_refused(self, rotated):
        from services import lti_service
        forged = jwt.encode({'purpose': 'lti_evidence', 'uid': USER, 'qid': QUEST,
                             'exp': 9999999999}, 'attacker-key', algorithm='HS256')
        with rotated.after():
            assert lti_service.decode_evidence_token(forged) is None

    def test_expiry_is_still_enforced_on_both_keys(self, rotated):
        """A rotation must not become a way to revive an expired token."""
        from app_config import Config
        from services import lti_service

        with patch.object(Config, 'JWT_SECRET_KEY', OLD_KEY), \
             patch.object(lti_service, 'EVIDENCE_TOKEN_TTL', timedelta(seconds=-1)):
            expired = lti_service.issue_evidence_token(USER, QUEST)

        with rotated.after():
            assert lti_service.decode_evidence_token(expired) is None


@pytest.mark.unit
class TestNothingElseDecodesTheSigningKeyByHand:
    def test_no_module_outside_session_manager_uses_the_key_directly(self):
        """Guard on the shape. A fourth hand-rolled decode would be invisible
        until the next rotation silently voided whatever it signs.

        session_manager is exempt: it carries its own previous-key fallback in
        every verify method, checked by test_auth_resolvers_fail_closed.
        """
        from pathlib import Path

        backend = Path(__file__).resolve().parents[2]
        exempt = {'utils/session_manager.py', 'utils/jwt_keys.py'}
        offenders = []

        for path in sorted((backend / 'utils').rglob('*.py')) + \
                    sorted((backend / 'routes').rglob('*.py')) + \
                    sorted((backend / 'services').rglob('*.py')):
            rel = path.relative_to(backend).as_posix()
            if rel in exempt:
                continue
            source = path.read_text(encoding='utf-8')
            for lineno, line in enumerate(source.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith('#'):
                    continue
                if 'jwt.decode(' in stripped and 'JWT_SECRET_KEY' in stripped:
                    offenders.append(f'{rel}:{lineno}')

        assert not offenders, (
            'these decode with JWT_SECRET_KEY directly and will reject every '
            'outstanding token the next time the key rotates; use '
            f'utils.jwt_keys.decode_app_jwt(): {offenders}')
