"""Constant-time verification of the internal cron shared secret.

Cron endpoints (attendance sweeps, tuition autopay, billing reminders, engagement
digests) authenticate with the `CRON_SECRET` shared secret. Comparing it with
`==` is a timing side-channel: the comparison short-circuits on the first
differing byte, so response-time differences can leak the secret byte by byte.
Use `hmac.compare_digest`, matching how the rest of the codebase already checks
OAuth client secrets and per-registration tokens.
"""

import hmac

from app_config import Config


def is_valid_cron_secret(provided) -> bool:
    """True iff `provided` matches Config.CRON_SECRET (constant-time).

    Returns False when either side is empty, so an unset CRON_SECRET can never
    be satisfied by an empty/absent header.
    """
    expected = Config.CRON_SECRET
    if not expected or not provided:
        return False
    return hmac.compare_digest(str(provided), str(expected))
