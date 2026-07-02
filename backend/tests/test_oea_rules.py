"""
Unit tests for OEA HS Diploma Phase 2 program rules (backend/utils/oea_rules.py).

Pure functions -> no DB, no fixtures. Covers credit-source caps (transfer <= 6,
combined non-direct <= 18, per-student override), diploma eligibility (>= 6 direct
+ pathway complete), the transcript-grade derivation (semester overrides quarter;
annual wins), and the term-calendar helpers.
"""

import pytest

from utils import oea_rules
from middleware.error_handler import ValidationError


def credit(source='direct', value=1.0, status='complete', cid=None):
    return {'id': cid, 'credit_source': source, 'credits': value, 'status': status}


# ── Settings overlay ─────────────────────────────────────────────────────────

def test_build_settings_defaults_when_no_override():
    s = oea_rules.build_oea_settings(None)
    assert s['caps']['transfer'] == 6
    assert s['caps']['nondirect'] == 18
    assert s['minimums']['logs_per_quarter'] == 9


def test_build_settings_org_override_merges_group():
    s = oea_rules.build_oea_settings({'oea_settings': {'minimums': {'logs_per_quarter': 5}}})
    assert s['minimums']['logs_per_quarter'] == 5
    # untouched keys keep defaults
    assert s['minimums']['artifacts_per_quarter'] == 3
    assert s['caps']['transfer'] == 6


def test_build_settings_help_video_url_override():
    assert oea_rules.build_oea_settings(None)['help_video_url'] is None
    s = oea_rules.build_oea_settings({'oea_settings': {'help_video_url': 'https://example.com/v'}})
    assert s['help_video_url'] == 'https://example.com/v'


def test_describe_minimums_skips_zero_items():
    # Hearthwood config: 3 logs, no artifact minimum, 1 summary.
    text = oea_rules.describe_minimums(
        {'logs_per_quarter': 3, 'artifacts_per_quarter': 0, 'summaries_per_quarter': 1})
    assert text == '3 learning logs and a quarterly summary'
    assert 'artifact' not in text


def test_describe_minimums_full_set():
    text = oea_rules.describe_minimums(
        {'logs_per_quarter': 9, 'artifacts_per_quarter': 3, 'summaries_per_quarter': 1})
    assert text == '9 learning logs, 3 artifacts and a quarterly summary'


def test_current_quarter_index_inside_and_between_terms():
    s = oea_rules.build_oea_settings(None)  # default calendar: Q1 2026-08-25..2026-10-31
    assert oea_rules.current_quarter_index(s, '2026-09-15') == 1
    assert oea_rules.current_quarter_index(s, '2027-02-01') == 3
    assert oea_rules.current_quarter_index(s, '2026-07-02') is None  # summer gap


# ── Source totals + caps ─────────────────────────────────────────────────────

def test_source_totals_combines_nondirect():
    credits = [credit('transfer', 2), credit('earned_elsewhere', 3), credit('direct', 5)]
    totals = oea_rules.source_totals(credits)
    assert totals['transfer'] == 2
    assert totals['earned_elsewhere'] == 3
    assert totals['nondirect'] == 5


def test_direct_source_never_capped():
    settings = oea_rules.build_oea_settings(None)
    big = [credit('direct', 100)]
    oea_rules.check_credit_source_caps(big, 'direct', 50, None, settings)  # no raise


def test_transfer_cap_enforced_at_six():
    settings = oea_rules.build_oea_settings(None)
    existing = [credit('transfer', 5)]
    # 5 + 1 = 6 ok
    oea_rules.check_credit_source_caps(existing, 'transfer', 1, None, settings)
    # 5 + 2 = 7 > 6 -> raise
    with pytest.raises(ValidationError):
        oea_rules.check_credit_source_caps(existing, 'transfer', 2, None, settings)


def test_combined_nondirect_cap_enforced_at_eighteen():
    settings = oea_rules.build_oea_settings(None)
    existing = [credit('transfer', 6), credit('earned_elsewhere', 11)]  # 17 nondirect
    oea_rules.check_credit_source_caps(existing, 'earned_elsewhere', 1, None, settings)  # 18 ok
    with pytest.raises(ValidationError):
        oea_rules.check_credit_source_caps(existing, 'earned_elsewhere', 2, None, settings)  # 19


def test_transfer_counts_toward_nondirect_cap():
    settings = oea_rules.build_oea_settings(None)
    existing = [credit('earned_elsewhere', 17)]
    # a transfer credit also consumes the combined 18 ceiling
    with pytest.raises(ValidationError):
        oea_rules.check_credit_source_caps(existing, 'transfer', 2, None, settings)


def test_per_student_override_raises_ceiling():
    settings = oea_rules.build_oea_settings(None)
    enrollment = {'max_transfer_credits': 8}
    existing = [credit('transfer', 6)]
    # default would reject 6+2=8 > 6, but override lifts transfer cap to 8
    oea_rules.check_credit_source_caps(existing, 'transfer', 2, enrollment, settings)


def test_caps_exclude_credit_id_on_update():
    settings = oea_rules.build_oea_settings(None)
    existing = [credit('transfer', 6, cid='x')]
    # editing 'x' itself (excluded) to 5 should not double-count
    oea_rules.check_credit_source_caps(existing, 'transfer', 5, None, settings, exclude_credit_id='x')


# ── Diploma eligibility ──────────────────────────────────────────────────────

def test_diploma_requires_six_direct_and_pathway_complete():
    settings = oea_rules.build_oea_settings(None)
    credits = [credit('direct', 1) for _ in range(6)]
    elig = oea_rules.diploma_eligibility({'is_complete': True}, credits, settings)
    assert elig['meets_min_direct'] is True
    assert elig['diploma_eligible'] is True


def test_diploma_blocked_when_too_few_direct():
    settings = oea_rules.build_oea_settings(None)
    credits = [credit('direct', 1) for _ in range(5)] + [credit('transfer', 19)]
    elig = oea_rules.diploma_eligibility({'is_complete': True}, credits, settings)
    assert elig['meets_min_direct'] is False
    assert elig['diploma_eligible'] is False


def test_diploma_blocked_when_pathway_incomplete():
    settings = oea_rules.build_oea_settings(None)
    credits = [credit('direct', 1) for _ in range(10)]
    elig = oea_rules.diploma_eligibility({'is_complete': False}, credits, settings)
    assert elig['diploma_eligible'] is False


def test_in_progress_direct_credits_dont_count():
    settings = oea_rules.build_oea_settings(None)
    credits = [credit('direct', 1, status='in_progress') for _ in range(6)]
    elig = oea_rules.diploma_eligibility({'is_complete': True}, credits, settings)
    assert elig['direct_credits_earned'] == 0


# ── Transcript grade derivation (override, not average) ──────────────────────

def test_annual_grade_wins():
    periods = [
        {'term_type': 'quarter', 'term_index': 1, 'grade': 'C'},
        {'term_type': 'semester', 'term_index': 1, 'grade': 'B'},
        {'term_type': 'annual', 'term_index': 1, 'grade': 'A'},
    ]
    assert oea_rules.transcript_grade_for_credit(periods) == 'A'


def test_latest_semester_when_no_annual():
    periods = [
        {'term_type': 'semester', 'term_index': 1, 'grade': 'C'},
        {'term_type': 'semester', 'term_index': 2, 'grade': 'A'},
    ]
    assert oea_rules.transcript_grade_for_credit(periods) == 'A'


def test_quarter_grades_never_used_for_transcript():
    periods = [{'term_type': 'quarter', 'term_index': 1, 'grade': 'A'}]
    assert oea_rules.transcript_grade_for_credit(periods) is None


# ── Term calendar helpers ────────────────────────────────────────────────────

def test_quarters_covered_by_semester_and_annual():
    assert oea_rules.quarters_covered('semester', 1) == [1, 2]
    assert oea_rules.quarters_covered('semester', 2) == [3, 4]
    assert oea_rules.quarters_covered('annual', 1) == [1, 2, 3, 4]
    assert oea_rules.quarters_covered('quarter', 3) == [3]


def test_term_window_lookup():
    settings = oea_rules.build_oea_settings(None)
    w = oea_rules.term_window(settings, 'quarter', 1)
    assert w['start'] == '2026-08-25'


def test_is_valid_term():
    assert oea_rules.is_valid_term('quarter', 4)
    assert not oea_rules.is_valid_term('quarter', 5)
    assert oea_rules.is_valid_term('semester', 2)
    assert not oea_rules.is_valid_term('semester', 3)
    assert oea_rules.is_valid_term('annual', 1)
    assert not oea_rules.is_valid_term('annual', 2)
    assert not oea_rules.is_valid_term('bogus', 1)
