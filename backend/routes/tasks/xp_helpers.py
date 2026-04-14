"""Subject XP helpers shared across task completion and credit-request flows.

Split out from ``routes/tasks.py`` on 2026-04-14. Previously the
SUBJECT_NORMALIZATION dict and four helper functions were duplicated
inside ``finalize_task`` plus module-level copies; this module is now
the single source of truth.
"""

from datetime import datetime
from typing import Any, Dict

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
                for subject, percentage in diploma_subjects.items():
                    if isinstance(percentage, (int, float)) and percentage > 0:
                        subject_xp = int(xp_value * percentage / 100)
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


def add_pending_subject_xp(admin_supabase, user_id: str, subject_xp_distribution: Dict[str, int]) -> None:
    """Add subject XP to pending_xp in user_subject_xp table."""
    if not subject_xp_distribution:
        return

    subject_names = list(subject_xp_distribution.keys())

    existing_records = admin_supabase.table('user_subject_xp')\
        .select('school_subject, xp_amount, pending_xp')\
        .eq('user_id', user_id)\
        .in_('school_subject', subject_names)\
        .execute()

    existing_map = {
        record['school_subject']: record.get('pending_xp', 0) or 0
        for record in existing_records.data
    }

    now = datetime.utcnow().isoformat()
    for subject, new_xp in subject_xp_distribution.items():
        if subject in existing_map:
            new_pending = existing_map[subject] + new_xp
            admin_supabase.table('user_subject_xp')\
                .update({'pending_xp': new_pending, 'updated_at': now})\
                .eq('user_id', user_id)\
                .eq('school_subject', subject)\
                .execute()
        else:
            admin_supabase.table('user_subject_xp').insert({
                'user_id': user_id,
                'school_subject': subject,
                'xp_amount': 0,
                'pending_xp': new_xp,
                'updated_at': now,
            }).execute()


def remove_pending_subject_xp(admin_supabase, user_id: str, subject_xp_distribution: Dict[str, int]) -> None:
    """Remove subject XP from pending_xp in user_subject_xp table."""
    if not subject_xp_distribution:
        return

    now = datetime.utcnow().isoformat()
    for subject, xp_to_remove in subject_xp_distribution.items():
        existing = admin_supabase.table('user_subject_xp')\
            .select('id, pending_xp')\
            .eq('user_id', user_id)\
            .eq('school_subject', subject)\
            .execute()

        if existing.data:
            current_pending = existing.data[0].get('pending_xp', 0) or 0
            new_pending = max(0, current_pending - xp_to_remove)
            admin_supabase.table('user_subject_xp')\
                .update({'pending_xp': new_pending, 'updated_at': now})\
                .eq('id', existing.data[0]['id'])\
                .execute()


def finalize_subject_xp(admin_supabase, user_id: str, subject_xp_distribution: Dict[str, int]) -> int:
    """Move subject XP from pending to finalized (xp_amount). Returns total moved."""
    if not subject_xp_distribution:
        return 0

    now = datetime.utcnow().isoformat()
    total = 0

    for subject, subject_xp in subject_xp_distribution.items():
        existing = admin_supabase.table('user_subject_xp')\
            .select('id, xp_amount, pending_xp')\
            .eq('user_id', user_id)\
            .eq('school_subject', subject)\
            .execute()

        if existing.data:
            record = existing.data[0]
            new_xp = record['xp_amount'] + subject_xp
            new_pending = max(0, (record.get('pending_xp') or 0) - subject_xp)
            admin_supabase.table('user_subject_xp')\
                .update({'xp_amount': new_xp, 'pending_xp': new_pending, 'updated_at': now})\
                .eq('id', record['id'])\
                .execute()
        else:
            admin_supabase.table('user_subject_xp').insert({
                'user_id': user_id,
                'school_subject': subject,
                'xp_amount': subject_xp,
                'pending_xp': 0,
                'updated_at': now,
            }).execute()

        total += subject_xp

    return total
