"""Regression guard for SEC-01 (audit 2026-08-31): every role name handed to
@require_role must be a role that can actually exist on a user.

A name that isn't real never matches anyone, so the route silently becomes
superadmin-only (the decorator's superadmin early-break is the only path in) —
and silently becomes a live grant if the name is ever added as a role. Seven
routes shipped that way with @require_role('admin'), including the COPPA
parental-consent review endpoints.

Two layers:
1. require_role itself now raises ValueError at decoration time (import time),
   so a bad name can't register at all. Tested directly here.
2. A static sweep over routes/ catches quoted role names in files the test
   suite never imports.
"""
import re
from pathlib import Path

import pytest

from utils.auth.decorators import require_role
from utils.roles import VALID_ROLES, VALID_ORG_ROLES

REPO_ROOT = Path(__file__).resolve().parents[3]
ROUTES_DIR = REPO_ROOT / 'backend' / 'routes'

ALL_VALID = VALID_ROLES | VALID_ORG_ROLES

DECORATOR_LINE = re.compile(r'^\s*@require_role\((.*)\)\s*$')
QUOTED_NAME = re.compile(r"""['"]([a-z_]+)['"]""")


def test_invalid_role_name_raises_at_decoration_time():
    with pytest.raises(ValueError, match="not a valid role"):
        require_role('admin')


def test_unpacked_tuple_mistake_raises_at_decoration_time():
    # require_role(ADMIN_ROLES) instead of require_role(*ADMIN_ROLES):
    # the tuple would never match any role string and the route would be
    # silently superadmin-only.
    with pytest.raises(ValueError, match="not a valid role"):
        require_role(('org_admin', 'superadmin'))


def test_platform_and_org_role_names_are_accepted():
    # Smoke: decoration succeeds; no request context needed.
    for name in ('student', 'superadmin', 'campus_coordinator'):
        assert callable(require_role(name))


def test_no_route_decorator_names_an_unknown_role():
    offenders = []
    for path in ROUTES_DIR.rglob('*.py'):
        for lineno, line in enumerate(path.read_text(errors='replace').splitlines(), 1):
            m = DECORATOR_LINE.match(line)
            if not m:
                continue
            for name in QUOTED_NAME.findall(m.group(1)):
                if name not in ALL_VALID:
                    offenders.append(f"{path.relative_to(REPO_ROOT)}:{lineno} -> {name!r}")
    assert not offenders, (
        "Unknown role name(s) in @require_role — the route is silently "
        "superadmin-only today and becomes a grant if the name is ever "
        "created:\n" + "\n".join(offenders)
    )
