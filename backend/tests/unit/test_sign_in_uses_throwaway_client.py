"""sign_in_with_password never runs on a shared Supabase client.

supabase-py listens for SIGNED_IN on the client the call is made on and
rebinds that client's PostgREST auth to the signed-in user's JWT. Done on the
process-wide anonymous singleton, every later anonymous read in that worker --
the public quest catalog, for one -- ran as whichever user last logged in
there, and failed with PGRST303 "JWT expired" an hour after they did (Sentry
OPTIO-BACKEND-98 and OPTIO-WEB-27, 2026-09-16). Login, org login and the
change-password check each take database.get_throwaway_auth_client() now.

This reads the source because the leak is in which object receives the call,
which no route test can see.
"""

import pathlib
import re

import pytest

BACKEND = pathlib.Path(__file__).resolve().parents[2]
SCAN = [BACKEND / 'routes', BACKEND / 'services', BACKEND / 'utils']
CALL = re.compile(r'(?P<receiver>[\w.]+(?:\(\))?)\.auth\.sign_in_with_password\(')
THROWAWAY = ('get_throwaway_auth_client()', 'create_client(')


def _sign_in_sites():
    for root in SCAN:
        for path in root.rglob('*.py'):
            lines = path.read_text().splitlines()
            for i, line in enumerate(lines):
                m = CALL.search(line)
                if m:
                    yield path, i + 1, m.group('receiver'), lines[max(0, i - 60):i]


def _receiver_source(receiver, window):
    """What the receiver IS: the call itself, or the last assignment to it."""
    if receiver.endswith('()'):
        return receiver
    bound = re.compile(r'^\s*' + re.escape(receiver) + r'\s*=\s*(?P<rhs>.+)$')
    for line in reversed(window):
        m = bound.match(line)
        if m:
            return m.group('rhs').strip()
    return None


@pytest.mark.unit
def test_every_sign_in_runs_on_a_throwaway_client():
    offenders = []
    for path, lineno, receiver, window in _sign_in_sites():
        source = _receiver_source(receiver, window)
        if not source or not any(source.startswith(t) for t in THROWAWAY):
            offenders.append(f'{path.relative_to(BACKEND)}:{lineno} ({receiver} = {source})')
    assert not offenders, (
        'sign_in_with_password on a shared client rebinds it to the user\'s JWT; '
        'use database.get_throwaway_auth_client(): ' + ', '.join(offenders))


@pytest.mark.unit
def test_there_are_sign_in_sites_to_check():
    # If this ever goes to zero the scan above is looking in the wrong place.
    assert sum(1 for _ in _sign_in_sites()) >= 3
