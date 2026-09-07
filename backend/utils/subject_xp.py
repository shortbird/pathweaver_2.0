"""Reading a task's diploma-subject split, independent of the HTTP layer.

Lives in utils/ rather than routes/ because the credit split is asked about
from three layers -- the credit-request route, the review dashboards, and
PersonalizationService when it writes a task. A service reaching up into
routes/ to get this was a cross-layer import (tests/unit/test_import_layers.py),
and the alternative -- a fourth copy of the fallback logic -- is exactly what
put a task's displayed credit and its paid credit out of step to begin with.

``routes/tasks/xp_helpers`` re-exports both names, so existing call sites are
untouched.
"""

from typing import Any, Dict

from utils.logger import get_logger

logger = get_logger(__name__)

# Subject name normalization map. Legacy data had a mix of display names
# ("Language Arts") and machine keys ("language_arts"); this collapses both
# into the canonical machine key.
SUBJECT_NORMALIZATION: Dict[str, str] = {
    'Electives': 'electives',
    'Language Arts': 'language_arts',
    'Math': 'math',
    'Mathematics': 'math',
    'Science': 'science',
    'Social Studies': 'social_studies',
    'Financial Literacy': 'financial_literacy',
    'Health': 'health',
    'PE': 'pe',
    'Physical Education': 'pe',
    'Fine Arts': 'fine_arts',
    'Arts': 'fine_arts',
    'CTE': 'cte',
    'Career & Technical Education': 'cte',
    'Digital Literacy': 'digital_literacy',
    'Technology': 'digital_literacy',
    'Business': 'cte',
    'Music': 'fine_arts',
    'Communication': 'language_arts',
}


def get_subject_xp_distribution(task_data: Dict[str, Any], xp_value: int) -> Dict[str, int]:
    """Compute normalized subject XP distribution from task data.

    Reads ``subject_xp_distribution`` first; falls back to computing from
    ``diploma_subjects`` (dict of subject → percentage, or list of subjects).
    Normalizes subject names, rounds XP values to multiples of 5, and
    adjusts the largest entry so the total matches ``xp_value`` exactly.
    """
    subject_xp_distribution = task_data.get('subject_xp_distribution', {}) or {}

    if not subject_xp_distribution:
        diploma_subjects = task_data.get('diploma_subjects')
        if diploma_subjects:
            if isinstance(diploma_subjects, dict):
                # Values are treated as relative WEIGHTS, not percentages.
                # Producers disagree on the unit: normalize_diploma_subjects and
                # the class override both write raw XP amounts ({'Social Studies':
                # 150} on a 200 XP task), while older rows carried percentages
                # summing to 100. Reading amounts as percentages inflated every
                # multi-subject task, and the sum-to-xp_value correction below
                # then clawed the overflow out of the LARGEST subject only --
                # a 200 XP task tagged {'Social Studies': 150, 'Financial
                # Literacy': 50} credited 100/100 instead of 150/50. Scaling by
                # share of total is correct under either unit.
                weights = {
                    subject: weight
                    for subject, weight in diploma_subjects.items()
                    if isinstance(weight, (int, float)) and weight > 0
                }
                total_weight = sum(weights.values())
                if total_weight > 0:
                    for subject, weight in weights.items():
                        subject_xp = int(round(xp_value * weight / total_weight))
                        if subject_xp > 0:
                            subject_xp_distribution[subject] = subject_xp
            elif isinstance(diploma_subjects, list) and diploma_subjects:
                per_subject_xp = xp_value // len(diploma_subjects)
                for subject in diploma_subjects:
                    if per_subject_xp > 0:
                        subject_xp_distribution[subject] = per_subject_xp

    normalized: Dict[str, int] = {}
    for subject, xp in subject_xp_distribution.items():
        norm_name = SUBJECT_NORMALIZATION.get(subject, subject.lower().replace(' ', '_'))
        normalized[norm_name] = normalized.get(norm_name, 0) + xp

    if normalized:
        rounded = {
            subject: max(5, 5 * round(xp / 5))
            for subject, xp in normalized.items()
        }
        current_total = sum(rounded.values())
        if current_total != xp_value:
            diff = xp_value - current_total
            largest_subject = max(rounded.items(), key=lambda x: x[1])[0]
            rounded[largest_subject] += diff
        return rounded

    return normalized


def pending_subjects_for_completion(admin_supabase, completion_id: str,
                                    task_data: Dict[str, Any],
                                    xp_value: int) -> Dict[str, int]:
    """The subject split that was actually ADDED to pending for this completion.

    Credit is requested and approved at two different moments, and the task's
    subject split can move in between (a reviewer edits it, an XP change
    rescales it, a data repair realigns it). Backing the withdrawal out with
    the task's split as it reads TODAY then removes an amount that was never
    added, and the pending ledger drifts.

    The review round records what was added, so use that. Falls back to the
    task's current split for completions predating the rounds table.
    """
    try:
        rounds = admin_supabase.table('diploma_review_rounds')\
            .select('subject_suggestion')\
            .eq('completion_id', completion_id)\
            .order('round_number', desc=True)\
            .limit(1)\
            .execute()
        if rounds.data and rounds.data[0].get('subject_suggestion'):
            return rounds.data[0]['subject_suggestion']
    except Exception as e:
        logger.warning(
            "Could not read the requested subject split for completion %s (%s); "
            "falling back to the task's current split", completion_id, e)

    return get_subject_xp_distribution(task_data or {}, xp_value)
