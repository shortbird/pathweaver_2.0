"""The FERPA audit log has to accept every role that can read a student record.

Sentry OPTIO-BACKEND-6K, 2026-08-17:

    new row for relation "student_access_logs" violates check constraint
    "valid_accessor_role"  (23514)
      routes/parent/child_overview.py, in get_child_overview

`valid_accessor_role` shipped on 2025-12-26 holding student, parent, advisor,
admin, observer. The platform has seven real roles and `admin` is not one of
them, so an access by a superadmin, an org_admin or a campus_coordinator failed
at the write. AccessLogger swallows its own failures on purpose -- a logging
outage must not break the read -- so this ran for eight months as a warning
nobody read. When it surfaced, all 2,320 rows in the table were 'advisor' or
'parent': the disclosure report had no entry for any of the accounts that can
see everything.

This is the same shape as test_org_role_constraints.py, and invisible for the
same reason: a mocked `.insert()` accepts anything, so no amount of unit testing
the route would catch it. These tests read the migrations and compare what the
CHECK allows against what the role enums hold.
"""

import re
from pathlib import Path

import pytest

from utils.access_logger import SENTINEL_ACCESSOR_ROLES, _constrained_role
from utils.roles import OrgRole, UserRole


REPO = Path(__file__).resolve().parents[2]
# migrations-archive holds the pre-baseline history (squashed 2026-08-12 so
# preview branches can replay supabase/migrations/ from an empty database).
MIGRATION_DIRS = (REPO / 'supabase' / 'migrations',
                  REPO / 'supabase' / 'migrations-archive',
                  REPO / 'backend' / 'migrations')

# Anchored on ADD CONSTRAINT so the DROP above it is not mistaken for the
# definition. DOTALL because the list wraps across lines with its comments.
ACCESSOR_ROLE_CHECK = (r"CONSTRAINT\s+valid_accessor_role\s+CHECK\s*\("
                       r"\s*\(?\s*accessor_role\s+(?:IN|=\s*ANY)\s*\((.*?)\)\s*\)")


def _migrations():
    files = [p for d in MIGRATION_DIRS if d.is_dir() for p in d.glob('*.sql')]
    return sorted(files, key=lambda p: p.name)


def _allowed_roles():
    """The role list from the newest migration that redefines the CHECK.

    Latest-wins is what Postgres ends up with, so an older migration holding a
    stale list is not a failure -- only the last one counts.
    """
    found = None
    for path in _migrations():
        for m in re.finditer(ACCESSOR_ROLE_CHECK, path.read_text(encoding='utf-8'), re.S):
            found = (path.name, m.group(1))
    assert found, 'No migration defines the valid_accessor_role CHECK'
    source, sql_list = found
    # Strip SQL comments first: the migration annotates the list inline, and the
    # prose mentions role names that are not themselves list entries.
    sql_list = re.sub(r'--[^\n]*', '', sql_list)
    return source, {r for r in re.findall(r"'([a-z_]+)'", sql_list)}


def _expected_roles():
    """Every value AccessLogger can put in the column.

    org_managed is excluded on both sides: get_effective_role always resolves it
    to the role the accessor actually acted in, and an audit row that says
    someone acted as 'org_managed' says nothing.
    """
    roles = {r.value for r in UserRole} | {r.value for r in OrgRole}
    roles.discard(UserRole.ORG_MANAGED.value)
    return roles | set(SENTINEL_ACCESSOR_ROLES)


@pytest.mark.unit
class TestAccessorRoleConstraintMatchesTheEnums:
    def test_the_check_allows_every_role_that_can_read_a_record(self):
        source, allowed = _allowed_roles()
        missing = _expected_roles() - allowed
        assert not missing, (
            f'{sorted(missing)} can be written to student_access_logs.accessor_role '
            f'but the valid_accessor_role CHECK rejects them (latest definition: '
            f'{source}). The insert fails and AccessLogger swallows it, so the '
            f'access goes unrecorded -- add a migration.'
        )

    def test_the_check_does_not_allow_more_than_the_enums(self):
        """Drift the other way. 'admin' sat in this list for eight months and is
        not a role this platform has ever had; a value the database accepts but
        no code produces is a value a disclosure report cannot explain."""
        source, allowed = _allowed_roles()
        extra = allowed - _expected_roles()
        assert not extra, f'{sorted(extra)} allowed by {source} but no code can produce them'

    def test_the_privileged_roles_specifically(self):
        """The three this file exists for: the accounts that see everything and
        whose accesses were the ones going unlogged."""
        _, allowed = _allowed_roles()
        for role in ('superadmin', 'org_admin', 'campus_coordinator'):
            assert role in allowed

    def test_the_sentinels_are_allowed(self):
        """An accessor whose role could not be resolved is the case where an
        audit row matters most, so it must not be the case that fails to write."""
        _, allowed = _allowed_roles()
        assert SENTINEL_ACCESSOR_ROLES <= allowed


@pytest.mark.unit
class TestConstrainedRole:
    def test_known_roles_pass_through(self):
        for role in _expected_roles():
            assert _constrained_role(role) == role

    def test_an_unknown_role_degrades_rather_than_losing_the_row(self):
        """Belt to the migration's braces: a role Postgres has not been told
        about must cost us the role name, not the disclosure record."""
        assert _constrained_role('org_managed') == 'unknown'
        assert _constrained_role('some_role_from_2027') == 'unknown'
        assert _constrained_role(None) == 'unknown'
