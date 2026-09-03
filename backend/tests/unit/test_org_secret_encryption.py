"""Encryption at rest for organization_secrets (SEC-16).

Per-org Stripe secret keys and calendar feed tokens. The table is already
unreachable through PostgREST (RLS on, no policies, grants revoked), so this is
defence for the case where something reads the TABLE rather than the API -- a
backup, a support query, a leaked service-role key.

The property that makes it deployable, and what most of these tests are about:
the key being UNSET is a supported state, and it is what production runs today.
Shipping encryption that immediately starts writing ciphertext nobody can
decrypt would take card payment down for a school. Setting the key encrypts
writes and lazily upgrades each row as it is read -- no backfill, no window
where a row is unreadable, and no coordinated deploy.
"""

from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import Fernet

from utils import org_secrets

ORG = '11111111-1111-1111-1111-111111111111'
NAME = org_secrets.STRIPE_SECRET_KEY
SECRET = 'sk_live_notarealkey'


@pytest.fixture
def key():
    return Fernet.generate_key().decode()


def _client(stored=None):
    """Admin client whose select returns `stored`, capturing writes."""
    client = MagicMock()
    table = client.table.return_value
    for chained in ('select', 'eq', 'limit', 'update', 'upsert', 'delete'):
        getattr(table, chained).return_value = table
    table.execute.return_value = MagicMock(
        data=[{'value': stored}] if stored is not None else [])
    return client


def test_a_value_is_not_written_in_the_clear_when_a_key_is_set(key):
    client = _client()
    with patch.object(org_secrets, '_admin', return_value=client), \
         patch('app_config.Config.ORG_SECRETS_ENCRYPTION_KEY', key):
        org_secrets.set_org_secret(ORG, NAME, SECRET)

    written = client.table.return_value.upsert.call_args[0][0]['value']
    assert written.startswith('enc:v1:')
    assert SECRET not in written
    assert Fernet(key.encode()).decrypt(written[len('enc:v1:'):].encode()).decode() == SECRET


def test_a_round_trip_returns_the_original(key):
    ciphertext = 'enc:v1:' + Fernet(key.encode()).encrypt(SECRET.encode()).decode()
    client = _client(ciphertext)
    with patch.object(org_secrets, '_admin', return_value=client), \
         patch('app_config.Config.ORG_SECRETS_ENCRYPTION_KEY', key):
        assert org_secrets.get_org_secret(ORG, NAME) == SECRET


def test_without_a_key_everything_behaves_exactly_as_before():
    """The state production is in. Plaintext in, plaintext out, no new failure."""
    client = _client(SECRET)
    with patch.object(org_secrets, '_admin', return_value=client), \
         patch('app_config.Config.ORG_SECRETS_ENCRYPTION_KEY', ''):
        assert org_secrets.get_org_secret(ORG, NAME) == SECRET
        org_secrets.set_org_secret(ORG, NAME, SECRET)

    assert client.table.return_value.upsert.call_args[0][0]['value'] == SECRET


def test_a_legacy_plaintext_row_still_reads_once_the_key_is_turned_on(key):
    """The rows that exist today. They must not become unreadable."""
    client = _client(SECRET)
    with patch.object(org_secrets, '_admin', return_value=client), \
         patch('app_config.Config.ORG_SECRETS_ENCRYPTION_KEY', key):
        assert org_secrets.get_org_secret(ORG, NAME) == SECRET


def test_reading_a_legacy_row_upgrades_it_in_place(key):
    """The whole migration: no backfill script, no downtime window."""
    client = _client(SECRET)
    with patch.object(org_secrets, '_admin', return_value=client), \
         patch('app_config.Config.ORG_SECRETS_ENCRYPTION_KEY', key):
        org_secrets.get_org_secret(ORG, NAME)

    upgraded = client.table.return_value.update.call_args[0][0]['value']
    assert upgraded.startswith('enc:v1:')


def test_a_failed_upgrade_still_returns_the_secret(key):
    """The read is the caller's business; the upgrade is ours. A school losing
    card payment because a background re-encrypt failed would be our fault."""
    client = _client(SECRET)
    client.table.return_value.update.side_effect = RuntimeError('write denied')
    with patch.object(org_secrets, '_admin', return_value=client), \
         patch('app_config.Config.ORG_SECRETS_ENCRYPTION_KEY', key):
        assert org_secrets.get_org_secret(ORG, NAME) == SECRET


def test_an_encrypted_row_with_no_key_returns_none_rather_than_ciphertext(key):
    """Fail closed, loudly.

    Handing `enc:v1:...` back would send it to Stripe as an API key and produce
    an unreadable failure a long way from the cause. None routes into the
    "card payment is not set up for this school" path the callers already have.
    """
    ciphertext = 'enc:v1:' + Fernet(key.encode()).encrypt(SECRET.encode()).decode()
    client = _client(ciphertext)
    with patch.object(org_secrets, '_admin', return_value=client), \
         patch('app_config.Config.ORG_SECRETS_ENCRYPTION_KEY', ''):
        assert org_secrets.get_org_secret(ORG, NAME) is None


def test_the_wrong_key_returns_none_rather_than_garbage(key):
    other = Fernet.generate_key().decode()
    ciphertext = 'enc:v1:' + Fernet(other.encode()).encrypt(SECRET.encode()).decode()
    client = _client(ciphertext)
    with patch.object(org_secrets, '_admin', return_value=client), \
         patch('app_config.Config.ORG_SECRETS_ENCRYPTION_KEY', key):
        assert org_secrets.get_org_secret(ORG, NAME) is None


def test_a_malformed_key_raises_instead_of_writing_plaintext():
    """A typo in the env var must not read as "no key configured".

    Falling back to plaintext there would write cleartext secrets to a database
    the operator believes is encrypted -- the one outcome worse than not having
    turned it on.
    """
    client = _client()
    with patch.object(org_secrets, '_admin', return_value=client), \
         patch('app_config.Config.ORG_SECRETS_ENCRYPTION_KEY', 'not-a-fernet-key'):
        with pytest.raises(ValueError):
            org_secrets.set_org_secret(ORG, NAME, SECRET)
    client.table.return_value.upsert.assert_not_called()
