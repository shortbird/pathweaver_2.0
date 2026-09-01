"""SEC-06 (audit 2026-08-31): the daily advisor summary's rollout gate.

The job shipped with a whitelist hardcoded to one personal inbox under a
'TESTING MODE' comment — in production, every advisor except that inbox was
silently filtered out of their daily summary. The gate now lives in
Config.ADVISOR_SUMMARY_EMAIL_ALLOWLIST ('*' = everyone; default preserves the
pilot cohort). Widening the rollout is an env-var change, never a code edit.
"""
from jobs.daily_advisor_summary import filter_to_rollout

ADVISORS = [
    {'id': '1', 'email': 'a@school.org'},
    {'id': '2', 'email': 'B@School.org'},
    {'id': '3'},  # advisor_ids path builds dicts without an email
]


def test_star_sends_to_everyone():
    assert filter_to_rollout(ADVISORS, '*') == ADVISORS


def test_allowlist_matches_case_insensitively():
    assert [a['id'] for a in filter_to_rollout(ADVISORS, 'b@school.org')] == ['2']


def test_comma_separated_cohort():
    got = filter_to_rollout(ADVISORS, 'a@school.org, b@school.org')
    assert [a['id'] for a in got] == ['1', '2']


def test_empty_allowlist_sends_to_nobody():
    assert filter_to_rollout(ADVISORS, '') == []
    assert filter_to_rollout(ADVISORS, None) == []


def test_missing_email_never_matches_a_cohort():
    assert filter_to_rollout([{'id': '3'}], 'a@school.org') == []


def test_default_config_value_preserves_pilot_behavior():
    from app_config import Config
    # The default must stay a non-empty cohort (not '*') until the user
    # decides to widen the rollout via the env var.
    assert Config.ADVISOR_SUMMARY_EMAIL_ALLOWLIST.strip() != ''
