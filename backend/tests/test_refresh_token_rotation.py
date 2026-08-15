"""Refresh-token rotation with reuse detection.

Before this, `/api/auth/refresh` minted a new pair and left the presented token
valid for the rest of its 30 days. A stolen refresh token therefore worked
alongside the victim's for a month, and nothing could tell that one credential
was in two pairs of hands.

Each test here pins one half of that: a token is spent by being used, and a
spent token being presented again ends the whole chain.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch
import uuid

import jwt as _jwt
import pytest

from app_config import Config


def _claims(token):
    return _jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=['HS256'])


class FakeFamilies:
    """An in-memory stand-in for the refresh_token_families table.

    Deliberately implements the same decisions as the real module rather than
    the same SQL: these tests are about what rotation DOES, and a mock built out
    of chained Supabase Mocks would only assert the shape of our query builder.
    The SQL itself is exercised by the integration suite.
    """

    def __init__(self):
        self.rows = {}
        self.reuse_reports = []

    def new_family_id(self):
        return str(uuid.uuid4())

    def new_jti(self):
        return str(uuid.uuid4())

    def start_family(self, user_id, ttl, family_id=None, jti=None,
                     superseded_jti=None):
        family_id = family_id or self.new_family_id()
        jti = jti or self.new_jti()
        self.rows[family_id] = {
            'user_id': user_id, 'current_jti': jti,
            'previous_jti': superseded_jti,
            'rotated_at': datetime.now(timezone.utc) if superseded_jti else None,
            'revoked': False,
            'expires_at': datetime.now(timezone.utc) + ttl,
        }
        return family_id, jti

    def rotate(self, user_id, family_id, jti, ttl):
        from utils import refresh_families as real
        if not family_id or not jti:
            fam, next_jti = self.start_family(user_id, ttl)
            return real.LEGACY, fam, next_jti
        row = self.rows.get(family_id)
        if row is None:
            fam, next_jti = self.start_family(user_id, ttl, family_id=family_id,
                                              superseded_jti=jti)
            return real.ADOPTED, fam, next_jti
        if row['revoked']:
            return real.REVOKED, family_id, None
        if datetime.now(timezone.utc) > row['expires_at']:
            return real.EXPIRED, family_id, None
        if jti == row['current_jti']:
            next_jti = self.new_jti()
            row['previous_jti'] = jti
            row['rotated_at'] = datetime.now(timezone.utc)
            row['current_jti'] = next_jti
            return real.OK, family_id, next_jti
        if row['previous_jti'] == jti and row['rotated_at'] and (
                datetime.now(timezone.utc) - row['rotated_at']
        ).total_seconds() <= real.REPLAY_GRACE_SECONDS:
            return real.GRACE, family_id, row['current_jti']
        row['revoked'] = True
        self.reuse_reports.append((user_id, family_id))
        return real.REUSE, family_id, None

    def maybe_cleanup(self):
        pass

    @property
    def DENY(self):
        from utils import refresh_families as real
        return real.DENY


@pytest.fixture
def families():
    fake = FakeFamilies()
    with patch.dict('sys.modules'):
        with patch('utils.refresh_families.rotate', fake.rotate), \
             patch('utils.refresh_families.new_family_id', fake.new_family_id), \
             patch('utils.refresh_families.new_jti', fake.new_jti), \
             patch('utils.refresh_families.maybe_cleanup', fake.maybe_cleanup):
            yield fake


@pytest.mark.unit
class TestTokensCarryTheirIdentity:
    def test_a_refresh_token_names_its_family_and_itself(self, app, families):
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            claims = _claims(sm.generate_refresh_token('u-1'))
        assert claims['fam'], 'a refresh token must name its rotation chain'
        assert claims['jti'], 'a refresh token must be individually identifiable'
        assert claims['fam'] != claims['jti']

    def test_two_logins_are_two_independent_chains(self, app, families):
        """Signing out one device must not be able to sign out the other, so
        each login starts a family of its own."""
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            a = _claims(sm.generate_refresh_token('u-1'))
            b = _claims(sm.generate_refresh_token('u-1'))
        assert a['fam'] != b['fam']

    def test_access_tokens_are_not_rotated(self, app, families):
        """Only the long-lived credential needs single-use semantics; an access
        token is already dead in 15 minutes."""
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            claims = _claims(sm.generate_access_token('u-1'))
        assert 'jti' not in claims


@pytest.mark.unit
class TestRotation:
    def _refresh(self, sm, token):
        with patch('utils.token_authority.session_revoked_since', return_value=False):
            return sm.refresh_session(refresh_token_override=token)

    def test_using_a_refresh_token_replaces_it(self, app, families):
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            first = sm.generate_refresh_token('u-1')
            result = self._refresh(sm, first)
            assert result is not None
            _, second, _, _ = result
        assert _claims(second)['jti'] != _claims(first)['jti']
        assert _claims(second)['fam'] == _claims(first)['fam'], \
            'rotation stays within the chain it started'

    def test_a_chain_can_be_refreshed_repeatedly(self, app, families):
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            token = sm.generate_refresh_token('u-1')
            for _ in range(5):
                result = self._refresh(sm, token)
                assert result is not None, 'an honest session must never be cut off'
                token = result[1]

    def test_replaying_a_spent_token_is_refused(self, app, families):
        """The theft case: the attacker's copy and the victim's are the same
        token, so whoever refreshes second is presenting one already spent."""
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            stolen = sm.generate_refresh_token('u-1')
            assert self._refresh(sm, stolen) is not None   # victim refreshes
            families.rows[_claims(stolen)['fam']]['rotated_at'] = (
                datetime.now(timezone.utc) - timedelta(minutes=5))
            assert self._refresh(sm, stolen) is None       # attacker replays

    def test_a_replay_ends_the_whole_chain_not_just_that_token(self, app, families):
        """Both parties are logged out on purpose. Once a token is in two hands
        we cannot tell which holder is the owner, and leaving the live one
        running means leaving the attacker running half the time."""
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            stolen = sm.generate_refresh_token('u-1')
            _, victims_current, _, _ = self._refresh(sm, stolen)
            families.rows[_claims(stolen)['fam']]['rotated_at'] = (
                datetime.now(timezone.utc) - timedelta(minutes=5))
            self._refresh(sm, stolen)                      # attacker replays
            assert self._refresh(sm, victims_current) is None

    def test_reuse_is_reported_as_a_security_event(self, app, families):
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            stolen = sm.generate_refresh_token('u-1')
            self._refresh(sm, stolen)
            families.rows[_claims(stolen)['fam']]['rotated_at'] = (
                datetime.now(timezone.utc) - timedelta(minutes=5))
            self._refresh(sm, stolen)
        assert families.reuse_reports, 'a replayed refresh token must be reported'

    def test_two_tabs_refreshing_at_once_do_not_look_like_an_attack(self, app, families):
        """Concurrent tabs present the same jti twice within milliseconds. It is
        byte-for-byte a replay, and treating it as one would sign users out of
        sessions nobody attacked -- so a just-superseded jti is served from the
        grace window instead."""
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            token = sm.generate_refresh_token('u-1')
            assert self._refresh(sm, token) is not None
            assert self._refresh(sm, token) is not None

    def test_a_revoked_family_cannot_be_refreshed(self, app, families):
        """What logout and password reset write."""
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            token = sm.generate_refresh_token('u-1')
            _, live, _, _ = self._refresh(sm, token)
            families.rows[_claims(live)['fam']]['revoked'] = True
            assert self._refresh(sm, live) is None


@pytest.mark.unit
class TestNobodyIsLoggedOutByTheDeploy:
    def test_a_token_minted_before_rotation_existed_is_accepted(self, app, families):
        """Every session live at deploy holds a token with no `fam`/`jti`.
        Rejecting those would have logged out the entire user base at once, so
        they are accepted ONCE and upgraded into a family.
        """
        from utils.session_manager import session_manager as sm
        with app.test_request_context():
            legacy = _jwt.encode({
                'sub': 'u-1', 'user_id': 'u-1', 'type': 'refresh',
                'iat': datetime.now(timezone.utc),
                'exp': datetime.now(timezone.utc) + timedelta(days=30),
            }, Config.JWT_SECRET_KEY, algorithm='HS256')
            with patch('utils.token_authority.session_revoked_since', return_value=False):
                result = sm.refresh_session(refresh_token_override=legacy)
            assert result is not None, 'a legacy token must not sign the user out'
            upgraded = _claims(result[1])
        assert upgraded['fam'] and upgraded['jti'], \
            'the legacy session must come out of its first refresh protected'


@pytest.mark.unit
class TestRotationStateLayer:
    """The real module's decisions, with the database stubbed at the row level."""

    def _client(self, rows):
        client, table = Mock(), Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'insert', 'update'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=rows)
        return client

    def test_a_database_outage_does_not_end_sessions(self):
        """Reuse detection sits on top of last_logout_at, not under it. A
        Supabase blip must not sign out the platform, so the lookup fails open
        and says so in the logs."""
        from utils import refresh_families
        client, table = Mock(), Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.side_effect = RuntimeError('db down')
        with patch.object(refresh_families, '_admin', return_value=client):
            outcome, fam, jti = refresh_families.rotate(
                'u-1', str(uuid.uuid4()), str(uuid.uuid4()), timedelta(days=30))
        assert outcome == refresh_families.UNAVAILABLE
        assert outcome not in refresh_families.DENY
        assert jti

    def test_a_malformed_family_claim_reads_as_no_family(self):
        """The columns are `uuid`; a junk claim would 400 PostgREST rather than
        return no rows, so it is normalized before it reaches the query."""
        from utils import refresh_families
        with patch.object(refresh_families, 'start_family',
                          return_value=('f', 'j')) as start:
            outcome, _, _ = refresh_families.rotate(
                'u-1', 'not-a-uuid', 'also-not-a-uuid', timedelta(days=30))
        assert outcome == refresh_families.LEGACY
        assert start.called

    def test_a_family_belonging_to_another_user_is_refused(self):
        """A token signed for one user naming another user's chain is a signing
        key problem, not a replay. Refuse it and kill the family."""
        from utils import refresh_families
        fam = str(uuid.uuid4())
        client = self._client([{
            'id': fam, 'user_id': 'someone-else', 'current_jti': str(uuid.uuid4()),
            'previous_jti': None, 'rotated_at': None, 'revoked': False,
            'expires_at': (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        }])
        with patch.object(refresh_families, '_admin', return_value=client):
            outcome, _, jti = refresh_families.rotate(
                'u-1', fam, str(uuid.uuid4()), timedelta(days=30))
        assert outcome in refresh_families.DENY
        assert jti is None

    def test_an_expired_family_is_refused(self):
        from utils import refresh_families
        fam, jti = str(uuid.uuid4()), str(uuid.uuid4())
        client = self._client([{
            'id': fam, 'user_id': 'u-1', 'current_jti': jti,
            'previous_jti': None, 'rotated_at': None, 'revoked': False,
            'expires_at': (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        }])
        with patch.object(refresh_families, '_admin', return_value=client):
            outcome, _, _ = refresh_families.rotate('u-1', fam, jti, timedelta(days=30))
        assert outcome == refresh_families.EXPIRED
        assert outcome in refresh_families.DENY

    def test_logout_revokes_every_live_family(self):
        from utils import refresh_families
        client = self._client([{'id': 'f-1'}, {'id': 'f-2'}])
        with patch.object(refresh_families, '_admin', return_value=client):
            assert refresh_families.revoke_user_families('u-1', 'logout') == 2

    def test_revocation_survives_a_database_error(self):
        """Logout must return 200 and clear cookies whatever the database does."""
        from utils import refresh_families
        client, table = Mock(), Mock()
        client.table.return_value = table
        for chained in ('update', 'eq'):
            getattr(table, chained).return_value = table
        table.execute.side_effect = RuntimeError('db down')
        with patch.object(refresh_families, '_admin', return_value=client):
            assert refresh_families.revoke_user_families('u-1', 'logout') == 0
