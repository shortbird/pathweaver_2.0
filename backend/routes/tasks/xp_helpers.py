"""Subject XP helpers shared across task completion and credit-request flows.

Split out from ``routes/tasks.py`` on 2026-04-14. Previously the
SUBJECT_NORMALIZATION dict and four helper functions were duplicated
inside ``finalize_task`` plus module-level copies; this module is now
the single source of truth.

The read-side helpers moved again on 2026-09-07, to ``utils/subject_xp.py``:
PersonalizationService needs them, and services must not import from routes.
They are re-exported here so every existing call site keeps working.
"""

from datetime import datetime
from typing import Dict

from utils.subject_xp import (  # noqa: F401
    SUBJECT_NORMALIZATION,
    get_subject_xp_distribution,
    pending_subjects_for_completion,
)

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
    """Add approved subject XP to the earned total (xp_amount). Returns total added.

    Deliberately does NOT touch pending_xp. It used to also subtract the
    approved amount from pending, while every caller had already withdrawn the
    requested amount with remove_pending_subject_xp -- so approving a credit
    decremented pending TWICE and silently deleted pending credit the student
    had earned but not yet had reviewed. The two amounts are not even the same
    number when a reviewer overrides the split: the requested amount comes out
    of pending, the approved amount goes into earned. Keeping them in one
    function is what let them be confused.
    """
    if not subject_xp_distribution:
        return 0

    now = datetime.utcnow().isoformat()
    total = 0

    for subject, subject_xp in subject_xp_distribution.items():
        existing = admin_supabase.table('user_subject_xp')\
            .select('id, xp_amount')\
            .eq('user_id', user_id)\
            .eq('school_subject', subject)\
            .execute()

        if existing.data:
            record = existing.data[0]
            new_xp = record['xp_amount'] + subject_xp
            admin_supabase.table('user_subject_xp')\
                .update({'xp_amount': new_xp, 'updated_at': now})\
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
