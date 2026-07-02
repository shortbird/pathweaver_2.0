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

    def test_valid_program_key_accepts_registered_tag(self):
        assert is_valid_program_key('opened-academy') is True

    def test_valid_program_key_rejects_unknown_and_none(self):
        assert is_valid_program_key('bogus') is False
        assert is_valid_program_key(None) is False
        assert is_valid_program_key('') is False

    def test_program_for_org_slug_resolves_member_orgs(self):
        assert program_for_org_slug('hearthwood').name == 'Hearthwood Academy'
        # A second org slug maps to the same program (test org).
        assert program_for_org_slug('hearthwood-test').key == 'opened-academy'
        assert program_for_org_slug('treehouse').key == 'treehouse'
        assert program_for_org_slug('gryffin').key == 'gryffin'

    def test_program_for_org_slug_none_for_unknown_or_empty(self):
        assert program_for_org_slug('not-a-program') is None
        assert program_for_org_slug(None) is None

    def test_daily_cron_jobs_flattens_oea_sweep(self):
        jobs = daily_cron_jobs()
        by_name = {j.name: j for j in jobs}
        assert 'oea-compliance-sweep' in by_name
        sweep = by_name['oea-compliance-sweep']
        assert sweep.path == '/api/oea/internal/compliance-sweep'
        assert sweep.utc_hour == 13

    def test_every_program_has_stable_key_and_name(self):
        assert PROGRAMS
        for p in PROGRAMS:
            assert p.key, f"program missing key: {p}"
            assert p.name, f"program missing name: {p}"
        # keys are unique
        keys = [p.key for p in PROGRAMS]
        assert len(keys) == len(set(keys))
