"""Storage form for password-reset / invite tokens.

`password_reset_tokens.token` held the token verbatim. That row is a bearer
credential: whoever reads it can set the account's password, and for a staff
invite it also confirms the email address on the way through. So a read-only leak
of that one table -- a backup, a support export, a SQL-injection read, an
over-broad RLS policy -- was a password reset on every account with a live link,
without needing the mailbox the link was sent to.

Storing `sha256(token)` makes the stored value useless on its own. The token
itself is 32 bytes from `secrets.token_urlsafe`, so there is nothing to guess and
no need for a slow KDF here: unlike a password, the plaintext has full entropy
and a dictionary of candidates does not exist. What we need is one-wayness, and
SHA-256 gives that.

**Transition.** Links already in inboxes were minted in plaintext, and staff
invites live 14 days. Killing them would strand every invited teacher and every
family mid-reset with an error that reads like a bug. So lookups try the hash
first and fall back to the raw value: `lookup_values()` returns both forms and
callers match on either. New rows are hashed only.

That fallback is a migration, not a design. Once the longest-lived outstanding
link has expired -- 14 days from deploy, so after **2026-09-01** -- delete the
raw arm of `lookup_values()`, and consider a one-off UPDATE hashing whatever rows
remain.
"""

import hashlib


def hash_reset_token(token: str) -> str:
    """The value stored in `password_reset_tokens.token`."""
    return hashlib.sha256((token or '').encode('utf-8')).hexdigest()


def lookup_values(token: str):
    """Every stored form a presented token could match, hashed form first.

    Callers iterate this rather than comparing in Python, because the row has to
    be claimed with a conditional UPDATE (`.eq('used', False)`) for the
    single-use guarantee to survive two concurrent submits — the comparison has
    to happen in the database.
    """
    if not token:
        return []
    # Legacy raw value second: after 2026-09-01 no honest link can still be in
    # that form, and this list becomes just the hash.
    return [hash_reset_token(token), token]
