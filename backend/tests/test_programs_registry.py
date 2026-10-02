"""
Unit tests for the backend program registry (programs/registry.py).

The registry is the seam that lets core code (registration, cron dispatch,
blueprint wiring) consult program config instead of naming a specific program.
These tests pin the lookups core relies on.
"""

import pytest

from programs.registry import (
    PROGRAMS,
    is_valid_program_key,
    program_for_org_slug,
    daily_cron_jobs,
)


@pytest.mark.unit
class TestProgramRegistry:

    def test_retired_hearthwood_program_key_is_refused(self):
        # The Hearthwood diploma program was retired on 2026-10-02; a stale
        # ?partner=opened-academy signup must not tag a new account into it.
        assert is_valid_program_key('opened-academy') is False

    def test_valid_program_key_rejects_unknown_and_none(self):
        assert is_valid_program_key('bogus') is False
        assert is_valid_program_key(None) is False
        assert is_valid_program_key('') is False

    def test_program_for_org_slug_resolves_member_orgs(self):
        assert program_for_org_slug('treehouse').key == 'treehouse'
        assert program_for_org_slug('treehouse').name == 'The Treehouse'
        assert program_for_org_slug('gryffin').key == 'gryffin'

    def test_program_for_org_slug_none_for_unknown_or_empty(self):
        assert program_for_org_slug('not-a-program') is None
        assert program_for_org_slug(None) is None
        # Retired 2026-10-02 with the Hearthwood orgs.
        assert program_for_org_slug('hearthwood') is None
        assert program_for_org_slug('hearthwood-test') is None

    def test_daily_cron_jobs_no_longer_dispatch_the_oea_sweep(self):
        # The OEA compliance sweep and its endpoint were removed with the
        # Hearthwood program; the cron must not call a route that 404s.
        assert 'oea-compliance-sweep' not in {j.name for j in daily_cron_jobs()}
        assert all('/api/oea/' not in j.path for j in daily_cron_jobs())

    def test_every_program_has_stable_key_and_name(self):
        assert PROGRAMS
        for p in PROGRAMS:
            assert p.key, f"program missing key: {p}"
            assert p.name, f"program missing name: {p}"
        # keys are unique
        keys = [p.key for p in PROGRAMS]
        assert len(keys) == len(set(keys))
