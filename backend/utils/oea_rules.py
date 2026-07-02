"""
OEA / Hearthwood HS Diploma — Phase 2 program rules (pure functions, no DB).

Adds three program concepts on top of the existing pathway/credit/GPA layer
(oea_pathways.py + oea_grades.py):

  1. Credit source + caps. A self-attested credit is one of:
       - 'direct'            earned through Optio uploads (learning logs + artifacts)
       - 'transfer'          Hearthwood-internal transfer; renders as a native credit
                             with NO transcript note; capped at 6 credits
       - 'earned_elsewhere'  outside credit; transcript note "Accepted transfer
                             credit from previous school."; capped (with transfer,
                             combined) at 18 credits
     The two non-direct types COMBINE, they do not stack: transfer <= 6 AND
     (transfer + earned_elsewhere) <= 18. A Hearthwood admin may raise either
     ceiling per-student (oea_enrollments.max_transfer_credits /
     max_nondirect_credits).

  2. Diploma eligibility. At least 6 of the 24 credits must be 'direct'
     (min_direct_for_diploma) AND all pathway requirements met.

  3. Term calendar + per-course quarterly minimums. The academic calendar
     (quarter/semester windows) and the upload minimums (9 logs, 3 artifacts,
     1 summary per quarter) are program config: code defaults here, overridable
     per-org via organizations.feature_flags.oea_settings (mirrors sis_settings).
     OEA sets the real calendars; the defaults keep the system working until they do.

These are plain-dict pure functions so routes, the transcript, the compliance
evaluator, and unit tests all share one source of truth. DB access lives in
load_oea_settings() (the one impure helper, kept thin).
"""

from copy import deepcopy
from typing import Any, Dict, List, Optional

from middleware.error_handler import ValidationError

# Transcript notation shown for 'earned_elsewhere' credits (none for 'transfer').
TRANSFER_NOTE = "Accepted transfer credit from previous school."

CREDIT_SOURCES = ('direct', 'transfer', 'earned_elsewhere')
NONDIRECT_SOURCES = ('transfer', 'earned_elsewhere')

TERM_TYPES = ('quarter', 'semester', 'annual')

# Program defaults. OEA overrides the calendar (and may override minimums/caps)
# per-org via feature_flags.oea_settings; per-student cap overrides live on the
# enrollment row.
DEFAULT_OEA_SETTINGS: Dict[str, Any] = {
    'school_year': '2026-2027',
    # Parent getting-started/tutorial video (per-org; UI hides the card when unset).
    'help_video_url': None,
    'minimums': {
        'logs_per_quarter': 9,
        'artifacts_per_quarter': 3,
        'summaries_per_quarter': 1,
    },
    'caps': {
        'transfer': 6,
        'nondirect': 18,
        'min_direct_for_diploma': 6,
    },
    # Placeholder 2026-2027 calendar. OEA replaces these dates per org.
    'terms': {
        'quarters': [
            {'index': 1, 'start': '2026-08-25', 'end': '2026-10-31'},
            {'index': 2, 'start': '2026-11-01', 'end': '2027-01-15'},
            {'index': 3, 'start': '2027-01-16', 'end': '2027-03-20'},
            {'index': 4, 'start': '2027-03-21', 'end': '2027-06-05'},
        ],
        'semesters': [
            {'index': 1, 'start': '2026-08-25', 'end': '2027-01-15'},
            {'index': 2, 'start': '2027-01-16', 'end': '2027-06-05'},
        ],
    },
}


# ── Settings (defaults <- per-org override) ──────────────────────────────────

def build_oea_settings(org_feature_flags: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Overlay an org's feature_flags.oea_settings onto the program defaults.

    Shallow-merges the top-level groups (minimums, caps, terms, school_year) so an
    org can override just the calendar without restating minimums/caps. Returns a
    fresh dict; never mutates the defaults.
    """
    settings = deepcopy(DEFAULT_OEA_SETTINGS)
    override = ((org_feature_flags or {}).get('oea_settings') or {})
    for group in ('minimums', 'caps', 'terms'):
        if isinstance(override.get(group), dict):
            settings[group] = {**settings[group], **override[group]}
    if override.get('school_year'):
        settings['school_year'] = override['school_year']
    if override.get('help_video_url'):
        settings['help_video_url'] = override['help_video_url']
    return settings


def load_oea_settings(admin_client, org_id: Optional[str]) -> Dict[str, Any]:
    """Load an org's OEA settings (defaults when org_id is None / unknown)."""
    if not org_id:
        return build_oea_settings(None)
    rows = admin_client.table('organizations').select('feature_flags') \
        .eq('id', org_id).limit(1).execute().data
    flags = (rows[0].get('feature_flags') if rows else None) or {}
    return build_oea_settings(flags)


# ── Credit source + caps ─────────────────────────────────────────────────────

def _credit_value(c: Dict[str, Any]) -> float:
    try:
        return float(c.get('credits') or 0)
    except (TypeError, ValueError):
        return 0.0


def source_totals(credits: List[Dict[str, Any]], exclude_credit_id: Optional[str] = None) -> Dict[str, float]:
    """
    Sum credit VALUES by source across a student's credits (any status — a credit
    is "entered" the moment it exists). Optionally exclude one credit id (used when
    re-checking caps on an update so the row being changed isn't double counted).

    Returns {'transfer': x, 'earned_elsewhere': y, 'nondirect': x + y}.
    """
    transfer = 0.0
    elsewhere = 0.0
    for c in credits or []:
        if exclude_credit_id and c.get('id') == exclude_credit_id:
            continue
        src = c.get('credit_source') or 'direct'
        if src == 'transfer':
            transfer += _credit_value(c)
        elif src == 'earned_elsewhere':
            elsewhere += _credit_value(c)
    return {'transfer': transfer, 'earned_elsewhere': elsewhere, 'nondirect': transfer + elsewhere}


def caps_for(enrollment: Optional[Dict[str, Any]], settings: Dict[str, Any]) -> Dict[str, float]:
    """Effective per-student caps: enrollment override wins over program default."""
    caps = settings['caps']
    enr = enrollment or {}
    transfer_cap = enr.get('max_transfer_credits')
    nondirect_cap = enr.get('max_nondirect_credits')
    return {
        'transfer': float(transfer_cap if transfer_cap is not None else caps['transfer']),
        'nondirect': float(nondirect_cap if nondirect_cap is not None else caps['nondirect']),
    }


def check_credit_source_caps(
    credits: List[Dict[str, Any]],
    new_source: str,
    new_credit_value: float,
    enrollment: Optional[Dict[str, Any]],
    settings: Dict[str, Any],
    exclude_credit_id: Optional[str] = None,
) -> None:
    """
    Raise ValidationError if adding/retagging a credit with `new_source` and
    `new_credit_value` credits would breach the transfer (<=6) or combined
    non-direct (<=18) cap, honoring any per-student override on the enrollment.

    'direct' credits are never capped.
    """
    if new_source == 'direct':
        return
    if new_source not in NONDIRECT_SOURCES:
        raise ValidationError(f"credit_source must be one of {', '.join(CREDIT_SOURCES)}")

    totals = source_totals(credits, exclude_credit_id=exclude_credit_id)
    caps = caps_for(enrollment, settings)
    val = float(new_credit_value or 0)

    if new_source == 'transfer':
        if totals['transfer'] + val > caps['transfer'] + 1e-9:
            raise ValidationError(
                f"Transfer-credit limit reached ({_fmt(caps['transfer'])} credits). "
                f"A Hearthwood admin can raise this student's limit."
            )
    if totals['nondirect'] + val > caps['nondirect'] + 1e-9:
        raise ValidationError(
            f"Limit reached: at most {_fmt(caps['nondirect'])} of the 24 credits may be "
            f"transfer or credit-earned-elsewhere. The rest must be earned with learning "
            f"logs and artifacts. A Hearthwood admin can raise this student's limit."
        )


def _fmt(n: float) -> str:
    return str(int(n)) if float(n).is_integer() else str(n)


# ── Diploma eligibility ──────────────────────────────────────────────────────

def direct_credits_earned(credits: List[Dict[str, Any]]) -> float:
    """Sum of completed 'direct' credit values (earned through Optio uploads)."""
    total = 0.0
    for c in credits or []:
        if (c.get('credit_source') or 'direct') == 'direct' and c.get('status') == 'complete':
            total += _credit_value(c)
    return total


def diploma_eligibility(
    progress: Optional[Dict[str, Any]],
    credits: List[Dict[str, Any]],
    settings: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Whether the student may apply for the diploma. Requires all pathway
    requirements met AND at least `min_direct_for_diploma` (6) direct credits.

    A "direct" credit is simply credit_source == 'direct' (per product decision):
    the per-course upload minimums are enforced elsewhere (semester-grade gating).
    """
    min_direct = float(settings['caps']['min_direct_for_diploma'])
    earned_direct = direct_credits_earned(credits)
    meets_min_direct = earned_direct >= min_direct - 1e-9
    pathway_complete = bool(progress and progress.get('is_complete'))
    return {
        'direct_credits_earned': round(earned_direct, 2),
        'min_direct_required': min_direct,
        'meets_min_direct': meets_min_direct,
        'pathway_complete': pathway_complete,
        'diploma_eligible': pathway_complete and meets_min_direct,
    }


# ── Transcript grade derivation (override, not average) ──────────────────────

def transcript_grade_for_credit(period_rows: List[Dict[str, Any]]) -> Optional[str]:
    """
    The single transcript grade for a course from its grade-period rows:
    the annual grade if present, else the latest semester grade. Quarter grades
    are progress-only and are NEVER averaged in (PRD: a semester grade overrides
    quarter grades, does not average them). Returns None if no semester/annual
    grade exists yet.
    """
    annual = [r for r in (period_rows or []) if r.get('term_type') == 'annual' and r.get('grade')]
    if annual:
        return annual[0]['grade']
    semesters = [r for r in (period_rows or []) if r.get('term_type') == 'semester' and r.get('grade')]
    if semesters:
        latest = max(semesters, key=lambda r: r.get('term_index') or 0)
        return latest['grade']
    return None


# ── Term calendar helpers ────────────────────────────────────────────────────

def term_window(settings: Dict[str, Any], term_type: str, term_index: int) -> Optional[Dict[str, str]]:
    """Return {'start','end'} ISO dates for a quarter/semester, or None."""
    key = 'quarters' if term_type == 'quarter' else 'semesters'
    for t in settings['terms'].get(key, []):
        if int(t['index']) == int(term_index):
            return {'start': t['start'], 'end': t['end']}
    return None


def current_quarter_index(settings: Dict[str, Any], today: str) -> Optional[int]:
    """The quarter whose window contains `today` (ISO date), or None between terms."""
    for q in settings['terms'].get('quarters', []):
        if q.get('start') and q.get('end') and q['start'] <= today <= q['end']:
            return int(q['index'])
    return None


def describe_minimums(minimums: Dict[str, Any]) -> str:
    """
    Human-readable quarterly minimums, omitting any set to zero — e.g.
    "3 learning logs and a quarterly summary". Used in parent-facing copy and
    the grade-entry gate message so orgs with no artifact minimum never see
    "0 artifacts".
    """
    parts = []
    logs = int(minimums.get('logs_per_quarter') or 0)
    artifacts = int(minimums.get('artifacts_per_quarter') or 0)
    summaries = int(minimums.get('summaries_per_quarter') or 0)
    if logs:
        parts.append(f"{logs} learning log{'s' if logs != 1 else ''}")
    if artifacts:
        parts.append(f"{artifacts} artifact{'s' if artifacts != 1 else ''}")
    if summaries:
        parts.append('a quarterly summary' if summaries == 1 else f"{summaries} quarterly summaries")
    if not parts:
        return 'no uploads'
    if len(parts) == 1:
        return parts[0]
    return ', '.join(parts[:-1]) + f" and {parts[-1]}"


def quarter_indexes_for_semester(term_index: int) -> List[int]:
    """The two quarters that make up a semester (S1 -> Q1,Q2; S2 -> Q3,Q4)."""
    return [1, 2] if int(term_index) == 1 else [3, 4]


def all_quarter_indexes() -> List[int]:
    return [1, 2, 3, 4]


def quarters_covered(term_type: str, term_index: int) -> List[int]:
    """Which quarters a semester/annual transcript grade spans (for upload gating)."""
    if term_type == 'semester':
        return quarter_indexes_for_semester(term_index)
    if term_type == 'annual':
        return all_quarter_indexes()
    return [int(term_index)]


def is_valid_term(term_type: str, term_index: int) -> bool:
    if term_type not in TERM_TYPES:
        return False
    if term_type == 'quarter':
        return int(term_index) in (1, 2, 3, 4)
    if term_type == 'semester':
        return int(term_index) in (1, 2)
    return int(term_index) == 1  # annual
