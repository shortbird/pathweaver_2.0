"""Check a password against the HaveIBeenPwned breach corpus.

Supabase already runs this check and refuses the write with a 422. Doing it
ourselves first is not redundant — it is the difference between a message the
user can act on and a dead end. GoTrue's rejection arrives after the reset
route has already claimed the token, and its error has to be recognised from a
string; checking up front lets every password entry point say "this one is
breached, pick another" while the link is still untouched.

k-anonymity: we send the first 5 characters of the SHA-1 hash and nothing else.
The API returns every suffix under that prefix (~500 hashes) and we match
locally, so the password — and which of the 500 was ours — never leaves here.

FAILS OPEN. If the API is slow or down, the password is treated as clean. A
breached password that slips through is still caught by Supabase; an outage
that locked everyone out of registration and password resets would be a much
worse failure than the one we are preventing.
"""

import hashlib

import requests

from utils.logger import get_logger

logger = get_logger(__name__)

_HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/{prefix}'
_TIMEOUT_SECONDS = 2.5

BREACHED_PASSWORD_MESSAGE = (
    'This password has appeared in a known data breach, so it cannot be used. '
    'It may still be one you invented — breached simply means it now appears '
    'on public lists that attackers try first. Please choose a different one.'
)


def is_breached_password(password: str) -> bool:
    """True when the password appears in the HIBP corpus. False on any error."""
    if not password:
        return False

    digest = hashlib.sha1(password.encode('utf-8')).hexdigest().upper()
    prefix, suffix = digest[:5], digest[5:]

    try:
        response = requests.get(
            _HIBP_RANGE_URL.format(prefix=prefix),
            # Pads the response with random hashes so its SIZE can't be used to
            # infer anything about the prefix we asked for.
            headers={'Add-Padding': 'true', 'User-Agent': 'optio-platform'},
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[HIBP] lookup failed, treating password as clean: {e}")
        return False

    for line in response.text.splitlines():
        candidate, _, count = line.partition(':')
        # Padding entries are returned with a count of 0 — a real hit never is.
        if candidate.strip() == suffix and count.strip() not in ('', '0'):
            return True
    return False


def validate_password_not_breached(password: str):
    """(is_valid, error_message) — mirrors validate_password's shape."""
    if is_breached_password(password):
        return False, BREACHED_PASSWORD_MESSAGE
    return True, None
