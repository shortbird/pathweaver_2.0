"""Guard: no personal identity hardcoded in application code (OPS-07).

`tannerbowman@gmail.com` appeared in four source files: the platform-staff
access list, and twice as the public API documentation's support contact. The
first is a real access decision and belongs in configuration; the second was
simply wrong -- a personal Gmail published as the support address of the API.

`Config.PLATFORM_STAFF_EMAILS` now holds the list (default unchanged, so
behaviour did not move) and `Config.SUPPORT_EMAIL` the contact.

WHAT THIS DOES NOT COVER, deliberately: `backend/scripts/`. Nineteen one-off
operational scripts look this account up by email, which is OPS-08's problem
and a different fix -- those want a `--user-email` argument, not a config
constant. Tests are excluded for the same kind of reason: a fixture naming a
real account is a fixture, not a deployment decision.
"""

from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]

#: Directories that make up the deployed application.
APP_DIRS = ('routes', 'services', 'repositories', 'utils', 'middleware', 'jobs', 'modules')

#: Plus these top-level modules, which is where two of the four lived.
APP_FILES = ('app_config.py', 'swagger_config.py', 'api_spec_generator.py',
             'app.py', 'database.py')

PERSONAL = 'tannerbowman@gmail.com'


def _app_sources():
    for d in APP_DIRS:
        for p in sorted((BACKEND / d).glob('**/*.py')):
            if '__pycache__' not in p.parts:
                yield p
    for name in APP_FILES:
        p = BACKEND / name
        if p.exists():
            yield p


def test_no_personal_email_in_application_code():
    offenders = []
    for path in _app_sources():
        for i, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if PERSONAL in line:
                # app_config carries it as the documented DEFAULT of the env
                # var, which is the point of the change -- one place, not four.
                if path.name == 'app_config.py':
                    continue
                offenders.append(f'{path.relative_to(BACKEND)}:{i}')
    assert not offenders, (
        f'A personal email is hardcoded in {len(offenders)} place(s):\n  '
        + '\n  '.join(offenders)
        + '\n\nUse Config.PLATFORM_STAFF_EMAILS for access, or '
          'Config.SUPPORT_EMAIL for anything a user or an API consumer reads.')


def test_the_default_staff_list_is_unchanged():
    """Moving a list to config must not quietly change who is on it."""
    from app_config import Config
    assert set(Config.PLATFORM_STAFF_EMAILS) == {
        'tannerbowman@gmail.com', 'tyler@zionforge.com'}


def test_the_staff_check_reads_config_at_call_time(monkeypatch):
    """Not at import time.

    Import-time capture freezes whatever the environment held when the first
    module imported this one -- which in a test run is whatever the previous
    test left behind.
    """
    from utils import platform_staff

    monkeypatch.setattr('app_config.Config.PLATFORM_STAFF_EMAILS',
                        ('someone@example.com',))
    assert platform_staff.is_optio_platform_user({'email': 'someone@example.com'})
    assert not platform_staff.is_optio_platform_user({'email': 'tannerbowman@gmail.com'})


def test_superadmin_role_still_qualifies_regardless_of_the_list(monkeypatch):
    """The role is the real control; the email list is an addition to it."""
    from utils import platform_staff

    monkeypatch.setattr('app_config.Config.PLATFORM_STAFF_EMAILS', ())
    assert platform_staff.is_optio_platform_user(
        {'role': 'superadmin', 'email': 'anyone@example.com'})


@pytest.mark.parametrize('name', APP_FILES)
def test_the_scan_covers_the_named_top_level_files(name):
    """A guard on the guard: these are where two of the four offenders lived."""
    assert (BACKEND / name).exists(), f'{name} moved; update APP_FILES'
