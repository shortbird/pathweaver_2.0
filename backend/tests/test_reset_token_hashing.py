"""Password-reset and invite tokens are stored hashed.

`password_reset_tokens.token` held the token verbatim, and that row is a bearer
credential: whoever can read it can set the account's password, and on a staff
invite it confirms the email address on the way through. So any read-only leak of
that one table -- a backup, a support export, an over-broad policy -- was a
password reset on every account holding a live link, with no access to the
mailbox it was sent to.

The link in the email is unchanged; only the stored form is.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import pytest


@pytest.mark.unit
class TestStorageForm:
    def test_the_stored_value_is_not_the_token(self):
        from utils.reset_tokens import hash_reset_token
        assert hash_reset_token('abc') != 'abc'

    def test_the_same_token_always_hashes_the_same(self):
        """The lookup is an equality match in the database, so the hash has to
        be deterministic -- which is also why there is no salt here. The token
        is 32 bytes from secrets.token_urlsafe: there is no dictionary of
        candidates to defend against, only a stored value to make useless."""
        from utils.reset_tokens import hash_reset_token
        assert hash_reset_token('abc') == hash_reset_token('abc')
        assert hash_reset_token('abc') != hash_reset_token('abd')

    def test_lookup_tries_the_hash_first(self):
        from utils.reset_tokens import hash_reset_token, lookup_values
        assert lookup_values('abc')[0] == hash_reset_token('abc')

    def test_links_already_in_inboxes_still_resolve(self):
        """Staff invites live 14 days. Killing the outstanding ones would strand
        every invited teacher behind an error that reads like a bug, so the raw
        form is still matched -- until 2026-09-01, per utils/reset_tokens.py."""
        from utils.reset_tokens import lookup_values
        assert 'abc' in lookup_values('abc')

    def test_an_empty_token_matches_nothing(self):
        from utils.reset_tokens import lookup_values
        assert lookup_values('') == []
        assert lookup_values(None) == []


class _Table:
    """Records what was written, and answers the claim query for one stored
    value only -- which is how these tests tell hashed from raw."""

    def __init__(self, matches=None, row=None):
        self.matches = matches
        self.row = row
        self.inserted = []
        self._eq = {}

    def insert(self, payload):
        self.inserted.append(payload)
        return self

    def update(self, payload):
        self._payload = payload
        return self

    def select(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._eq[column] = value
        return self

    def execute(self):
        if 'token' in self._eq and self._eq['token'] != self.matches:
            return Mock(data=[])
        return Mock(data=[self.row] if self.row else [{'ok': True}])


def _client(table):
    client = Mock()
    client.table.return_value = table
    return client


@pytest.mark.unit
class TestMintingSitesStoreTheHash:
    def test_the_invite_minter_stores_a_hash(self):
        from utils import invite_tokens
        from utils.reset_tokens import hash_reset_token
        table = _Table()
        token = invite_tokens.mint_invite_token('u-1', admin=_client(table))
        assert token, 'the caller still gets the real token to put in the link'
        assert table.inserted[0]['token'] == hash_reset_token(token)
        assert table.inserted[0]['token'] != token


@pytest.mark.unit
class TestConsumingAToken:
    def _row(self, user_id='u-1', hours=1):
        return {
            'user_id': user_id,
            'expires_at': (datetime.now(timezone.utc)
                           + timedelta(hours=hours)).isoformat(),
            'used': False,
        }

    def test_a_hashed_token_is_claimed(self):
        from routes.auth.password import _claim_reset_token
        from utils.reset_tokens import hash_reset_token
        table = _Table(matches=hash_reset_token('tok'), row=self._row())
        row, stored = _claim_reset_token(_client(table), 'tok',
                                         datetime.now(timezone.utc))
        assert row and stored == hash_reset_token('tok')

    def test_a_legacy_plaintext_row_is_still_claimed(self):
        from routes.auth.password import _claim_reset_token
        table = _Table(matches='tok', row=self._row())
        row, stored = _claim_reset_token(_client(table), 'tok',
                                         datetime.now(timezone.utc))
        assert row and stored == 'tok', 'in-flight links must not die at deploy'

    def test_an_unknown_token_claims_nothing(self):
        from routes.auth.password import _claim_reset_token
        table = _Table(matches='something-else')
        row, stored = _claim_reset_token(_client(table), 'tok',
                                         datetime.now(timezone.utc))
        assert row is None and stored is None

    def test_the_claim_is_still_conditional_on_being_unused(self):
        """Single-use survives the change: the claim is a conditional UPDATE, so
        two concurrent submits cannot both spend the link. That is also why the
        comparison cannot move into Python."""
        from routes.auth.password import _claim_reset_token
        from utils.reset_tokens import hash_reset_token
        table = _Table(matches=hash_reset_token('tok'), row=self._row())
        _claim_reset_token(_client(table), 'tok', datetime.now(timezone.utc))
        assert table._eq.get('used') is False

    def test_release_un_claims_the_row_that_was_claimed(self):
        """The release path takes the STORED value, not the token from the link
        -- handing it the raw token would match nothing and quietly burn a link
        the user did nothing wrong with."""
        from routes.auth.password import _release_reset_token
        from utils.reset_tokens import hash_reset_token
        table = _Table(matches=hash_reset_token('tok'))
        _release_reset_token(_client(table), hash_reset_token('tok'))
        assert table._eq['token'] == hash_reset_token('tok')
        assert table._payload == {'used': False, 'used_at': None}
