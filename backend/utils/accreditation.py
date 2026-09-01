"""
WASC accreditation resolution.

Optio Academy (Optio's own full-time online private school) is accredited by the
Accrediting Commission for Schools, Western Association of Schools and Colleges
(ACS WASC). This module decides, for a given student, whether their official
transcript is issued under Optio's accreditation.

Rules, in order:
- A student with an active `academy_enrollments` row IS an Optio Academy student
  -> 'optio', whatever organization their account belongs to. This is the only
  rule that holds for a credit-partner participant, who is org-managed under the
  partner (a sports club, a music studio) while enrolled in Optio Academy.
- Platform-direct students (organization_id IS NULL) are Optio Academy students
  -> 'optio'. Kept as a fallback for the students who predate enrollment rows.
- Org-managed students inherit their organization's `accreditation_source`
  ('optio' | 'self' | 'none'). Only 'optio' displays Optio's WASC mark; 'self'
  (org has its own accreditation) and 'none' do not.
- Unknown/missing values fall back to 'none' (under-claim rather than over-claim).

Why the enrollment row comes first: before it existed, "no organization" was the
only signal available, and it silently under-claimed for every org-managed
student. Every organization in prod carries accreditation_source='none' today,
Optio Academy's own org included, so there was no org-level value to inherit
either.

The frontend owns the display copy (frontend/src/constants/accreditation.js);
this module only returns the source decision so the DB is the source of truth
for WHO is covered.
"""

# Master kill-switch. If WASC accreditation ever lapses, set this to False to
# stop emitting an 'optio' source everywhere (guideline: discontinue on lapse).
# Keep in sync with ACCREDITATION_ACTIVE in the frontend constants file.
ACCREDITATION_ACTIVE = True

_VALID_SOURCES = ('optio', 'self', 'none')


def resolve_transcript_accreditation(organization_id, organization_row=None,
                                     academy_enrolled=None):
    """Return an accreditation descriptor for a student's transcript.

    Args:
        organization_id: the student's users.organization_id (may be None).
        organization_row: the org record (dict) if already fetched; may include
            'accreditation_source'. Safe to pass None or a partial row.
        academy_enrolled: True when the student holds an active Optio Academy
            enrollment. Pass it whenever a user_id is in hand; the caller does
            the lookup so this stays a pure function.

    Returns:
        dict: {'source': 'optio' | 'self' | 'none'}
    """
    if not ACCREDITATION_ACTIVE:
        return {'source': 'none'}

    # An Optio Academy enrollment settles it, whatever org the account sits in.
    if academy_enrolled:
        return {'source': 'optio'}

    # Platform-direct students are Optio Academy students.
    if not organization_id:
        return {'source': 'optio'}

    source = (organization_row or {}).get('accreditation_source')
    if source in _VALID_SOURCES:
        return {'source': source}

    # Column not set / not present yet -> safest is to not claim coverage.
    return {'source': 'none'}
