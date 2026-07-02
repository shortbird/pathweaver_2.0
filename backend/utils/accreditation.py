"""
WASC accreditation resolution.

Optio Academy (Optio's own full-time online private school) is accredited by the
Accrediting Commission for Schools, Western Association of Schools and Colleges
(ACS WASC). This module decides, for a given student, whether their official
transcript is issued under Optio's accreditation.

Rules:
- Platform-direct students (organization_id IS NULL) are Optio Academy students
  -> 'optio'.
- Org-managed students inherit their organization's `accreditation_source`
  ('optio' | 'self' | 'none'). Only 'optio' displays Optio's WASC mark; 'self'
  (org has its own accreditation) and 'none' do not.
- Unknown/missing values fall back to 'none' (under-claim rather than over-claim).

The frontend owns the display copy (frontend/src/constants/accreditation.js);
this module only returns the source decision so the DB is the source of truth
for WHO is covered.
"""

# Master kill-switch. If WASC accreditation ever lapses, set this to False to
# stop emitting an 'optio' source everywhere (guideline: discontinue on lapse).
# Keep in sync with ACCREDITATION_ACTIVE in the frontend constants file.
ACCREDITATION_ACTIVE = True

_VALID_SOURCES = ('optio', 'self', 'none')


def resolve_transcript_accreditation(organization_id, organization_row=None):
    """Return an accreditation descriptor for a student's transcript.

    Args:
        organization_id: the student's users.organization_id (may be None).
        organization_row: the org record (dict) if already fetched; may include
            'accreditation_source'. Safe to pass None or a partial row.

    Returns:
        dict: {'source': 'optio' | 'self' | 'none'}
    """
    if not ACCREDITATION_ACTIVE:
        return {'source': 'none'}

    # Platform-direct students are Optio Academy students.
    if not organization_id:
        return {'source': 'optio'}

    source = (organization_row or {}).get('accreditation_source')
    if source in _VALID_SOURCES:
        return {'source': source}

    # Column not set / not present yet -> safest is to not claim coverage.
    return {'source': 'none'}
