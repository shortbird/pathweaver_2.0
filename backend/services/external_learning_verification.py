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


def verified_by_platform(completion: Dict[str, Any], source_label: str) -> bool:
    """Did the named platform verify this completion, by the columns
    platform_verified_fields wrote? Needs subject_verified_at,
    verified_by_advisor_id and verification_notes on the row.

    All three must agree: a teacher who approves a row writes their own id and
    note over these, and from then on it is the teacher's verification.
    """
    if not isinstance(completion, dict) or not (source_label or '').strip():
        return False
    return (bool(completion.get('subject_verified_at'))
            and not completion.get('verified_by_advisor_id')
            and completion.get('verification_notes') == f'Verified by {source_label.strip()}')


#: feature_flags.sis_settings key: leave work Bloomy already verified out of
#: the SIS Submissions inbox (ticket bc68a12e, Apogee Cache Valley: "Bloomy
#: submissions are the only ones that I'd prefer not to review"). Off unless
#: a school turns it on, so every other school's inbox is unchanged.
SKIP_BLOOMY_IN_INBOX_KEY = 'skip_bloomy_in_inbox'


def skips_bloomy_in_inbox(flags: Optional[Dict[str, Any]]) -> bool:
    """Is the school's skip switch on? Only a stored True counts."""
    sis = (flags or {}).get('sis_settings') if isinstance(flags, dict) else None
    return isinstance(sis, dict) and sis.get(SKIP_BLOOMY_IN_INBOX_KEY) is True
