"""Reading a Postgres foreign-key violation back to the person who caused it.

Deleting an account is the one operation where the schema, not the code, has the
final say. `sis_person_service` and `sis_staff_service` each clear the child rows
they know about and then delete the `users` row — but ~50 tables reference
users(id), the list changes every month, and any one they missed surfaces as a
raw 500.

2026-08-19, iCreate: an admin removing a person got
    update or delete on table "users" violates foreign key constraint
    "group_members_added_by_fkey" on table "group_members"
(Sentry OPTIO-BACKEND-6W / -6X). Nothing in the confirm dialog predicted it,
because `removal_preview` only probes five tables.

Migration 20260819010000 fixed the class of the problem — every *nullable*
"who did this" column is now ON DELETE SET NULL. What is left is the columns that
are NOT NULL, where a delete genuinely cannot proceed. This module turns that
refusal into a sentence an admin can act on.
"""

import re
from typing import Optional

# The NOT NULL columns still pointing at users(id) as of 20260819010000, phrased
# the way the front office would say them. Anything not listed falls back to the
# table name, which is still better than a 500.
FK_TABLE_LABELS = {
    'class_advisors': 'class advisor assignments they made',
    'class_enrollments': 'class enrolments they recorded',
    'class_quests': 'quests they added to a class',
    'course_generation_jobs': 'course generation jobs',
    'courses': 'courses they created',
    'credit_review_messages': 'credit review messages they wrote',
    'curriculum_attachments': 'curriculum files they uploaded',
    'curriculum_lessons': 'curriculum lessons they created',
    'curriculum_uploads': 'curriculum uploads they made',
    'feed_share_tokens': 'shared portfolio links',
    'group_members': 'message groups they added people to',
    'org_classes': 'classes they created',
    'parental_consent_log': 'parental consent records',
    'prior_learning_evidence': 'prior learning evidence they uploaded',
    'prior_learning_records': 'prior learning records they submitted',
    'sis_secure_documents': 'secure documents they uploaded',
    'student_weekly_xp_goals': 'weekly goals they set',
    'task_feedback': 'task feedback they left',
    'transcript_share_tokens': 'transcript links they issued',
}


def fk_blocker(exc: Exception) -> Optional[str]:
    """The referencing table named by a foreign-key violation, or None when the
    exception is something else entirely (which must not be swallowed).

    Postgres phrases it as:
        update or delete on table "users" violates foreign key constraint
        "group_members_added_by_fkey" on table "group_members"
    The first quoted table is the row being deleted; the referencing table is the
    one that follows.
    """
    text = str(exc)
    if 'foreign key' not in text and '23503' not in text:
        return None
    for table in re.findall(r'on table "([^"]+)"', text):
        if table != 'users':
            return table
    return None


def fk_blocker_label(table: str) -> str:
    """A human phrase for the blocking table, falling back to its name."""
    return FK_TABLE_LABELS.get(table, table)
