"""The database's idea of a valid org role has to match the code's.

Sentry, 2026-08-07:

    APIError: new row for relation "users" violates check constraint
    "valid_org_roles"
      routes/sis/__init__.py, in update_user_role
      services/sis_service.py:1575, in update_user_role

`campus_coordinator` shipped on 2026-08-04 through every layer of Python — the
`OrgRole` enum, the SIS access tiers, `ASSIGNABLE_ROLES`, `STAFF_ORG_ROLES` —
and then on 2026-08-06 got the two endpoints that assign it. Nobody told
Postgres. Both role CHECK constraints on `users` still held the five roles from
February, so the role validated cleanly all the way down and then blew up at the
write, as a 500 the admin could not read.

That failure is invisible to every mocked test in this suite, because a mocked
`.update()` accepts anything. So these tests read the migrations instead and
compare what the constraints allow against what `OrgRole` holds. Add a role to
the enum without a migration and this goes red — which is the whole point.
"""

import re
from pathlib import Path

import pytest

from utils.roles import OrgRole


REPO = Path(__file__).resolve().parents[2]
MIGRATION_DIRS = (REPO / 'supabase' / 'migrations', REPO / 'backend' / 'migrations')


def _migrations():
    """Every migration, oldest first — sorted by the YYYYMMDD filename prefix,
    which orders correctly across both directories."""
    files = [p for d in MIGRATION_DIRS if d.is_dir() for p in d.glob('*.sql')]
    return sorted(files, key=lambda p: p.name)


def _last_match(pattern):
    """The role list from the newest migration that redefines it.

    Latest-wins is what Postgres actually ends up with, so an older migration
    holding a stale list is not a failure — only the last one counts.
    """
    found = None
    for path in _migrations():
        # DOTALL: these lists wrap across lines once they hold six roles.
        for m in re.finditer(pattern, path.read_text(encoding='utf-8'), re.S):
            found = (path.name, m.group(1))
    assert found, f'No migration defines this constraint: {pattern}'
    return found


def _roles(sql_list):
    return {r for r in re.findall(r"'([a-z_]+)'", sql_list)}


# validate_org_roles()'s allow-list, i.e. the CHECK behind `valid_org_roles`.
ORG_ROLES_FN = r"valid_roles\s+TEXT\[\]\s*:=\s*ARRAY\[(.*?)\]"

# The `valid_org_role` CHECK on the single-value org_role column. Anchored on
# ADD CONSTRAINT so the DROP/rollback lines nearby are not mistaken for it.
ORG_ROLE_CHECK = (r"ADD\s+CONSTRAINT\s+valid_org_role\s+CHECK\s*\("
                  r"\s*org_role\s+IS\s+NULL\s+OR\s+org_role\s+IN\s*\((.*?)\)")


@pytest.mark.unit
class TestOrgRoleConstraintsMatchTheEnum:
    def test_org_roles_array_allows_every_org_role(self):
        """users.org_roles — the column both assignment endpoints write."""
        source, sql_list = _last_match(ORG_ROLES_FN)
        missing = {r.value for r in OrgRole} - _roles(sql_list)
        assert not missing, (
            f'{sorted(missing)} exist in OrgRole but not in validate_org_roles() '
            f'(latest definition: {source}). Writing one fails the '
            f'valid_org_roles CHECK at runtime — add a migration.'
        )

    def test_org_role_column_allows_every_org_role(self):
        """users.org_role — the legacy single-value column, still written
        alongside org_roles on every role change, so it fails just as hard."""
        source, sql_list = _last_match(ORG_ROLE_CHECK)
        missing = {r.value for r in OrgRole} - _roles(sql_list)
        assert not missing, (
            f'{sorted(missing)} exist in OrgRole but not in the valid_org_role '
            f'CHECK (latest definition: {source}).'
        )

    def test_campus_coordinator_specifically(self):
        """The role this whole file exists for."""
        for pattern in (ORG_ROLES_FN, ORG_ROLE_CHECK):
            _, sql_list = _last_match(pattern)
            assert 'campus_coordinator' in _roles(sql_list)

    def test_the_constraints_do_not_allow_more_than_the_enum(self):
        """Drift in the other direction: a role the database accepts but no
        code can produce is a role that will be read back and not understood."""
        for pattern in (ORG_ROLES_FN, ORG_ROLE_CHECK):
            source, sql_list = _last_match(pattern)
            extra = _roles(sql_list) - {r.value for r in OrgRole}
            assert not extra, f'{sorted(extra)} allowed by {source} but absent from OrgRole'


@pytest.mark.unit
class TestAssignableRolesMatchTheEnum:
    def test_every_assignable_role_is_an_org_role(self):
        """`ASSIGNABLE_ROLES` is what PATCH /api/sis/users/<id>/role accepts. A
        value in it that OrgRole lacks is a value the constraints will reject —
        the same 500, one list further out."""
        from services.sis_service import ASSIGNABLE_ROLES
        assert set(ASSIGNABLE_ROLES) <= {r.value for r in OrgRole}

    def test_every_staff_org_role_is_an_org_role(self):
        """Same for PUT /api/sis/staff/<id>/roles."""
        from services.sis_service import STAFF_ORG_ROLES
        assert set(STAFF_ORG_ROLES) <= {r.value for r in OrgRole}


@pytest.mark.unit
class TestIsOrgAdminIsDerivedNotWritten:
    """users.is_org_admin grants org admin access on its own in four gates
    (require_school_admin, require_org_admin, require_advisor, PrivateRoute.jsx)
    while ~15 code paths write the role columns and only 4 write the flag. A
    trigger derives it now, so those paths cannot leave it behind. Demotion was
    the dangerous direction: an org_admin made a campus coordinator kept the
    admin access — finance included — that the coordinator role exists to
    withhold.
    """

    TRIGGER = r"CREATE\s+TRIGGER\s+sync_is_org_admin_trigger(.*?);"
    FUNCTION = r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+sync_is_org_admin\(\)(.*?)\$func\$\s+LANGUAGE"

    def test_a_trigger_keeps_the_flag_in_step(self):
        source, body = _last_match(self.TRIGGER)
        assert 'BEFORE INSERT OR UPDATE ON users' in ' '.join(body.split()), source
        assert 'sync_is_org_admin()' in body

    def test_it_derives_from_all_three_role_columns(self):
        """Leaving `role` out would clear the flag for a platform-level org
        admin, who holds org_admin in users.role and nothing in org_role."""
        _, body = _last_match(self.FUNCTION)
        for column in ('NEW.role', 'NEW.org_role', 'NEW.org_roles'):
            assert column in body, f'{column} missing from the derivation'

    def test_existing_drifted_rows_are_backfilled(self):
        """The trigger only fixes rows on their next write. Everyone who is
        already carrying a wrong flag has to be corrected once, explicitly."""
        source, _ = _last_match(r"(UPDATE\s+users\s+SET\s+is_org_admin.*?);")
        assert source.endswith('.sql')

    def test_set_staff_roles_does_not_write_the_flag(self):
        """The one path iCreate uses to demote an admin. It must write the role
        columns and let the trigger derive — a hand-written flag here is how the
        two got out of step in the first place."""
        from tests.test_sis_staff_roles import _person, _run
        _, updates = _run({**_person(), 'org_roles': ['org_admin']}, ['campus_coordinator'],
                          actor_id='someone-else',
                          staff_list=[{'id': 'other', 'roles': ['org_admin']}])
        assert updates, 'expected the demotion to write'
        for payload in updates:
            assert 'is_org_admin' not in payload
        assert updates[0]['org_roles'] == ['campus_coordinator']
