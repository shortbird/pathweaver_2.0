"""
OEA HS Diploma Phase 2 — per-course quarterly upload compliance (read-only counts).

For one course (an oea_credits row) in one quarter, counts the student's:
  - learning logs   -> learning_events linked to the course's quest, dated in the
                       quarter window (min 9/quarter)
  - artifacts       -> oea_credit_evidence (link/file blocks) on the credit, created
                       in the quarter window (min 3/quarter)
  - quarterly summary-> an oea_credit_grade_periods (term_type='quarter') row whose
                       summary is filled (min 1/quarter)

Counts are derived on demand from existing data — no duplicate counters to keep in
sync. Used by (a) the semester/annual grade-entry gate in routes/oea.py and (b) the
admin compliance sweep. Minimums + term windows come from oea_rules settings, so an
org can tune them.
"""

from typing import Any, Dict, List, Optional

from utils import oea_rules
from utils.logger import get_logger

logger = get_logger(__name__)


def _learning_log_count(client, student_id: str, quest_id: Optional[str], window: Dict[str, str]) -> int:
    """Count the student's learning logs for a course (via its quest) in a window."""
    if not quest_id:
        return 0
    links = client.table('learning_event_topics').select('learning_event_id') \
        .eq('topic_type', 'quest').eq('topic_id', quest_id).execute().data or []
    event_ids = [l['learning_event_id'] for l in links]
    if not event_ids:
        return 0
    # event_date is the authoritative learning date (supports retroactive entry);
    # fall back to created_at when an event predates that column being set.
    rows = client.table('learning_events') \
        .select('id, event_date, created_at') \
        .eq('user_id', student_id).in_('id', event_ids).execute().data or []
    start, end = window['start'], window['end']
    count = 0
    for r in rows:
        d = r.get('event_date') or (r.get('created_at') or '')[:10]
        if d and start <= d <= end:
            count += 1
    return count


def _artifact_count(client, credit_id: str, window: Dict[str, str]) -> int:
    """Count link/file evidence blocks on a credit created within a window."""
    rows = client.table('oea_credit_evidence') \
        .select('block_type, created_at').eq('credit_id', credit_id).execute().data or []
    start, end = window['start'], window['end']
    count = 0
    for r in rows:
        if r.get('block_type') in ('link', 'file'):
            d = (r.get('created_at') or '')[:10]
            if d and start <= d <= end:
                count += 1
    return count


def _summary_present(client, credit_id: str, school_year: str, term_index: int) -> bool:
    """Whether a quarterly summary exists for this course/quarter."""
    rows = client.table('oea_credit_grade_periods') \
        .select('summary').eq('credit_id', credit_id).eq('term_type', 'quarter') \
        .eq('term_index', term_index).eq('school_year', school_year).execute().data or []
    return any((r.get('summary') or '').strip() for r in rows)


def evaluate_course_quarter(
    client, credit: Dict[str, Any], settings: Dict[str, Any],
    school_year: str, term_index: int,
) -> Dict[str, Any]:
    """
    Count logs / artifacts / summary for one course in one quarter and compare to
    the program minimums. Returns the counts, requirements, per-item shortfall, and
    an overall is_compliant flag.
    """
    mins = settings['minimums']
    window = oea_rules.term_window(settings, 'quarter', term_index) or {'start': '', 'end': '9999-12-31'}

    logs = _learning_log_count(client, credit['student_id'], credit.get('quest_id'), window)
    artifacts = _artifact_count(client, credit['id'], window)
    summaries = 1 if _summary_present(client, credit['id'], school_year, term_index) else 0

    req_logs = int(mins['logs_per_quarter'])
    req_artifacts = int(mins['artifacts_per_quarter'])
    req_summaries = int(mins['summaries_per_quarter'])

    missing = {
        'logs': max(0, req_logs - logs),
        'artifacts': max(0, req_artifacts - artifacts),
        'summaries': max(0, req_summaries - summaries),
    }
    is_compliant = all(v == 0 for v in missing.values())

    return {
        'term_index': term_index,
        'school_year': school_year,
        'logs': logs, 'logs_required': req_logs,
        'artifacts': artifacts, 'artifacts_required': req_artifacts,
        'summaries': summaries, 'summaries_required': req_summaries,
        'missing': missing,
        'is_compliant': is_compliant,
    }


def quarters_compliant(
    client, credit: Dict[str, Any], settings: Dict[str, Any],
    school_year: str, term_indexes: List[int],
) -> Dict[str, Any]:
    """
    Evaluate a set of quarters for a course (used to gate a semester/annual grade).
    Returns {'is_compliant': bool, 'quarters': [evaluate_course_quarter ...]}.
    """
    results = [evaluate_course_quarter(client, credit, settings, school_year, q) for q in term_indexes]
    return {'is_compliant': all(r['is_compliant'] for r in results), 'quarters': results}


def evaluate_student(
    client, student_id: str, settings: Dict[str, Any], school_year: str,
    credits: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Per-course-per-quarter compliance for a student's direct, in-progress courses."""
    if credits is None:
        credits = client.table('oea_credits').select('*').eq('student_id', student_id).execute().data or []
    out = []
    for c in credits:
        # Only direct, still-in-progress courses are subject to upload minimums.
        if (c.get('credit_source') or 'direct') != 'direct':
            continue
        quarters = [evaluate_course_quarter(client, c, settings, school_year, q)
                    for q in oea_rules.all_quarter_indexes()]
        out.append({'credit_id': c['id'], 'course_name': c.get('course_name'),
                    'status': c.get('status'), 'quarters': quarters})
    return out
