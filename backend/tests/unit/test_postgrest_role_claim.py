"""SEC-14: the tokens handed to PostgREST must name a Postgres role.

database.get_user_client() sends an app-signed JWT to PostgREST as the request's
Authorization header. PostgREST reads the `role` claim and runs the query as
that Postgres role; with no `role` claim it falls back to its configured
default, which on Supabase is `anon`.

Every token this app mints carried `sub` but no `role`, so even once the signing
key matches Supabase's, the 16 policies written TO authenticated (across
transfer_credits, contact_submissions, task_feedback, feed_item_views,
direct_messages, message_conversations, user_subject_xp and ai_usage_logs) would
have silently never matched. Not an error -- an empty result.

The claim also has to name a role Postgres HAS: PostgREST issues SET LOCAL ROLE
and errors otherwise. That is the trap this file mainly guards, because this
codebase has a second, unrelated notion of "role" -- student, advisor,
org_admin -- and none of those exist in Postgres.
"""

import pytest
from flask import Flask


USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
TARGET = '11111111-2222-3333-4444-555555555555'

# The roles Supabase actually creates. A `role` claim outside this set makes
# PostgREST fail the request when it tries to SET LOCAL ROLE.
POSTGRES_ROLES = {'anon', 'authenticated', 'service_role'}


@pytest.fixture(autouse=True)
def request_context():
    """Minting reads the device fingerprint off the request."""
    app = Flask(__name__)
    with app.test_request_context('/', headers={'User-Agent': 'pytest'}):
        yield


@pytest.fixture
def claims():
    import jwt
    from utils.session_manager import session_manager

    def _claims(token):
        return jwt.decode(token, options={'verify_signature': False})

    return lambda minter: _claims(minter(session_manager))


@pytest.mark.unit
class TestTokensThatReachPostgrest:
    """get_user_client() takes the access_token cookie or the Bearer header --
    and during an impersonation that header carries the masquerade or acting-as
    token, so all three have to be right."""

    @pytest.mark.parametrize('name, mint', [
        ('access', lambda sm: sm.generate_access_token(USER)),
        ('masquerade', lambda sm: sm.generate_masquerade_token(USER, TARGET)),
        ('acting_as', lambda sm: sm.generate_acting_as_token(USER, TARGET)),
    ])
    def test_it_claims_the_authenticated_role(self, claims, name, mint):
        assert claims(mint)['role'] == 'authenticated'

    @pytest.mark.parametrize('name, mint, expected_sub', [
        ('access', lambda sm: sm.generate_access_token(USER), USER),
        ('masquerade', lambda sm: sm.generate_masquerade_token(USER, TARGET), TARGET),
        ('acting_as', lambda sm: sm.generate_acting_as_token(USER, TARGET), TARGET),
    ])
    def test_sub_is_the_identity_rls_should_evaluate(self, claims, name, mint, expected_sub):
        """auth.uid() reads `sub`. During an impersonation that must be the
        person being viewed, not the admin or parent doing the viewing --
        otherwise RLS answers for the wrong account."""
        assert claims(mint)['sub'] == expected_sub


@pytest.mark.unit
class TestTheClaimNamesARealPostgresRole:
    def test_no_minted_token_carries_a_role_postgres_does_not_have(self, claims):
        """The trap: this codebase's own roles (student, advisor, org_admin...)
        are not Postgres roles. One of them in a `role` claim would make
        PostgREST fail the request outright."""
        from utils.session_manager import session_manager

        minters = [
            lambda sm: sm.generate_access_token(USER),
            lambda sm: sm.generate_refresh_token(USER),
            lambda sm: sm.generate_masquerade_token(USER, TARGET),
            lambda sm: sm.generate_masquerade_refresh_token(USER, TARGET),
            lambda sm: sm.generate_acting_as_token(USER, TARGET),
            lambda sm: sm.generate_acting_as_refresh_token(USER, TARGET),
            lambda sm: sm.generate_role_view_token(USER, 'advisor'),
        ]
        for mint in minters:
            role = claims(mint).get('role')
            assert role is None or role in POSTGRES_ROLES, (
                f'token carries role={role!r}, which Postgres has no such role '
                'for; PostgREST will fail SET LOCAL ROLE')
        assert session_manager is not None

    def test_a_role_view_keeps_its_platform_role_under_a_different_name(self, claims):
        """Role-view narrows the session to one PLATFORM role. It must not
        collide with the PostgREST claim, and it never goes to postgrest.auth()
        -- get_user_client reads the access_token cookie or the Bearer header,
        never the role_view_token cookie or the X-Role-View header."""
        payload = claims(lambda sm: sm.generate_role_view_token(USER, 'advisor'))
        assert payload['act_as_role'] == 'advisor'
        assert payload.get('role') != 'advisor'


@pytest.mark.unit
class TestTheAppItselfDoesNotReadThisClaim:
    def test_nothing_authorizes_on_the_role_claim(self):
        """`role` is for PostgREST. If application code started reading it off a
        token, the platform's own role system (users.role / users.org_role,
        resolved by get_effective_role) would gain a second and weaker source of
        truth -- one an attacker controls if they ever control a token.

        Scoped to modules that actually decode JWTs; `payload['role']` is a
        common enough name for a users-table update that scanning everything
        just produces noise.
        """
        from pathlib import Path
        import re

        backend = Path(__file__).resolve().parents[2]
        exempt = {'utils/session_manager.py'}  # mints the claim; never reads it
        # A READ of a role claim: excludes `payload['role'] = ...` assignments.
        read = re.compile(
            r"""(payload|claims|decoded|token_data)(?:\.get\(|\[)['"]role['"]\]?\)?"""
            r"""(?!\s*=[^=])""")
        offenders = []

        for sub in ('utils', 'routes', 'services'):
            for path in sorted((backend / sub).rglob('*.py')):
                rel = path.relative_to(backend).as_posix()
                if rel in exempt:
                    continue
                source = path.read_text(encoding='utf-8')
                if 'jwt.decode' not in source and 'verify_access_token' not in source:
                    continue
                for lineno, line in enumerate(source.splitlines(), 1):
                    if line.strip().startswith('#'):
                        continue
                    if read.search(line):
                        offenders.append(f'{rel}:{lineno}')

        assert not offenders, (
            "the `role` claim is PostgREST's, not an authorization input; use "
            f'get_effective_role() on the user row instead: {offenders}')
