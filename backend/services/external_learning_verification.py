"""Completions that an outside platform already verified.

A sync from an outside learning platform (Bloomy today) writes a task and its
completion for work the platform has already checked: a Bloomy skill is
"mastered" only after the student passed Bloomy's own assessment. No Optio
teacher has anything to review, but a completion with subject_verified_at NULL
sits in the teacher Verifications queue (routes/teacher_verification.py) until
someone clicks Approve on it (ticket 1237ae13).

These are the columns a teacher's approval writes (migration
20260925120000_task_completion_teacher_verification.sql), filled in for the
platform: the time of the sync, no reviewing teacher, and a note naming the
platform so the record says who vouched for the work.
"""

from typing import Any, Dict, Optional

from utils.timestamps import now_iso


def platform_verified_fields(source_label: str, *, at: Optional[str] = None) -> Dict[str, Any]:
    """The verification columns for a completion the named platform verified.

    Merge into the quest_task_completions insert. verified_by_advisor_id stays
    None: no person reviewed it, and the teacher's review history reads that
    column, so a synced row never appears there as somebody's review.
    """
    if not (source_label or '').strip():
        raise ValueError('source_label is required')
    return {
        'subject_verified_at': at or now_iso(),
        'verified_by_advisor_id': None,
        'verification_notes': f'Verified by {source_label.strip()}',
    }
