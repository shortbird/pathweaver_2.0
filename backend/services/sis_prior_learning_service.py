"""
Prior learning records — the guardian-filed evidence of learning done before or
outside Optio, and the staff review that turns it into high-school credit.

Two callers, two authorization models, one store:

  Family  routes/sis/parent_prior_learning.py — @require_auth, authorized by
          family relationship (sis_parent_service.registerable_students), which
          is also what answers "which of my kids is this for".
  Staff   routes/sis/prior_learning.py — ADMIN_ROLES, org-scoped.

Neither may act on an org that hasn't turned the feature on; `enabled_for_org`
is checked at the top of both route modules rather than here on every call, so
one disabled-org read doesn't cost a flag lookup per row.

A record moves draft -> submitted -> under_review -> accepted|rejected. Draft
exists because evidence is attached AFTER the record is created (a file needs a
record id to hang off), so there has to be a state where the family is still
assembling and the office isn't looking yet.

Evidence is the same five kinds a student attaches to a task, stored in the same
public quest-evidence bucket through the same MediaUploadService. That is
deliberate and it is the point: this material is portfolio material, and a
transcript scan a parent uploaded should render next to the student's own work
rather than in a parallel document system that the portfolio can't see.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.org_features import org_has_feature
from utils.school_subjects import SCHOOL_SUBJECTS
from utils.storage_urls import parse_object_ref, sign_in_place

logger = get_logger(__name__)

# The evidence kinds routes/tasks/completion.py accepts, unchanged.
EVIDENCE_TYPES = ('text', 'link', 'video', 'image', 'document')

# Statuses a guardian may still edit or withdraw in. Once the office has picked
# the record up (under_review and later), the family's copy is frozen.
FAMILY_EDITABLE = ('draft', 'submitted')

REVIEW_STATUSES = ('under_review', 'accepted', 'rejected')

MAX_TITLE = 200
MAX_TEXT = 20000
MAX_EVIDENCE_PER_RECORD = 25

# No single body of prior learning is worth more than a few Carnegie units; a
# typo of 100 in the credits box would otherwise land straight on a transcript.
MAX_CREDITS_PER_SUBJECT = 12


def _admin():
    # admin client justified: prior_learning_* have RLS on with no policies
    # (service-role only, the SIS convention). Every caller is either role-gated
    # (staff) or relationship-gated (family) before reaching this module, and
    # every query below pins organization_id.
    return get_supabase_admin_client()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def enabled_for_org(org_id: Optional[str]) -> bool:
    """True when this org has prior-learning submissions turned on.

    Nested under sis_settings like the other per-org SIS toggles, so
    org_has_feature (which reads the top level of feature_flags) can't answer it.
    """
    if not org_id:
        return False
    try:
        row = (_admin().table('organizations').select('feature_flags')
               .eq('id', org_id).single().execute().data or {})
    except Exception as e:  # noqa: BLE001 — fail closed, as org_has_feature does
        logger.error(f'prior-learning flag lookup failed for {org_id}: {e}')
        return False
    settings = ((row.get('feature_flags') or {}).get('sis_settings') or {})
    return settings.get('prior_learning_enabled') is True


# ── Cleaning ──────────────────────────────────────────────────────────────────
def _clean_text(value: Any, limit: int = MAX_TEXT) -> Optional[str]:
    text = (str(value).strip() if value is not None else '')
    return text[:limit] or None


def _clean_date(value: Any) -> Optional[str]:
    """An ISO date or nothing. A malformed date is dropped, not rejected: it is
    an optional field on a form a parent fills out once, and failing their whole
    submission over a half-typed year helps nobody."""
    text = (str(value or '').strip())[:10]
    if not text:
        return None
    try:
        datetime.strptime(text, '%Y-%m-%d')
    except ValueError:
        return None
    return text


def _clean_hours(value: Any) -> Optional[float]:
    try:
        hours = float(value)
    except (TypeError, ValueError):
        return None
    if hours <= 0 or hours > 10000:
        return None
    return round(hours, 1)


def clean_awarded_credits(value: Any) -> Dict[str, float]:
    """{school_subject: credits}, dropping anything that isn't a real subject.

    Silently dropping an unknown subject would make a reviewer think they awarded
    credit they didn't, so an unknown key raises instead.
    """
    if not isinstance(value, dict):
        return {}
    cleaned: Dict[str, float] = {}
    for subject, credits in value.items():
        if subject not in SCHOOL_SUBJECTS:
            raise ValueError(f'Unknown subject: {subject}')
        try:
            amount = round(float(credits), 2)
        except (TypeError, ValueError):
            raise ValueError(f'Credits for {subject} must be a number')
        if amount < 0 or amount > MAX_CREDITS_PER_SUBJECT:
            raise ValueError(
                f'Credits for {subject} must be between 0 and {MAX_CREDITS_PER_SUBJECT}')
        if amount:
            cleaned[subject] = amount
    return cleaned


def _record_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """The family-writable half of a record. Status, review and AI columns are
    deliberately absent — a guardian can never set them by posting them."""
    subject_hint = _clean_text(data.get('subject_hint'), 60)
    return {
        'title': _clean_text(data.get('title'), MAX_TITLE),
        'description': _clean_text(data.get('description')),
        'provider': _clean_text(data.get('provider'), MAX_TITLE),
        'subject_hint': subject_hint if subject_hint in SCHOOL_SUBJECTS else None,
        'started_on': _clean_date(data.get('started_on')),
        'ended_on': _clean_date(data.get('ended_on')),
        'hours_estimate': _clean_hours(data.get('hours_estimate')),
    }


# ── Reads ─────────────────────────────────────────────────────────────────────
def _attach_evidence(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """One extra query for the whole page's evidence, not one per record.

    Bounded by the page size the callers use (records are paged, and each record
    caps at MAX_EVIDENCE_PER_RECORD), so this cannot hit the PostgREST row cap.
    """
    ids = [r['id'] for r in records]
    if not ids:
        return records
    rows = (_admin().table('prior_learning_evidence')
            .select('*').in_('record_id', ids)
            .order('sequence_order').execute().data or [])
    # `url` holds the canonical /object/public/quest-evidence/... pointer, and
    # that bucket is PRIVATE — fetching the pointer as-is is what Supabase
    # answers with {"code":"NoSuchBucket","message":"Bucket not found"}, which
    # reads like a misconfigured bucket but is really an unsigned read. Both
    # surfaces render `item.url` directly, so sign in place, once per page.
    # Link and video evidence hold foreign URLs; sign_stored_urls passes
    # anything that isn't ours straight through.
    sign_in_place(rows, ['url'])
    by_record: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        by_record.setdefault(row['record_id'], []).append(row)
    for record in records:
        record['evidence'] = by_record.get(record['id'], [])
    return records


def _attach_names(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Student display names for the staff queue, which lists across families."""
    ids = {r['student_user_id'] for r in records if r.get('student_user_id')}
    if not ids:
        return records
    rows = (_admin().table('users')
            .select('id, first_name, last_name, display_name')
            .in_('id', list(ids)).execute().data or [])
    names = {
        u['id']: (u.get('display_name')
                  or ' '.join(filter(None, [u.get('first_name'), u.get('last_name')])).strip()
                  or 'Student')
        for u in rows
    }
    for record in records:
        record['student_name'] = names.get(record.get('student_user_id'), 'Student')
    return records


def list_for_guardian(org_id: str, guardian_id: str,
                      student_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Every record this guardian filed in this org, newest first.

    Scoped by submitted_by, not by student: a household with two guardians each
    sees what they themselves filed. Widening that to the household is a real
    product question (co-parents in separate homes), not a detail to guess at.
    """
    query = (_admin().table('prior_learning_records').select('*')
             .eq('organization_id', org_id).eq('submitted_by', guardian_id))
    if student_ids is not None:
        if not student_ids:
            return []
        query = query.in_('student_user_id', student_ids)
    records = query.order('created_at', desc=True).limit(200).execute().data or []
    return _attach_evidence(records)


def list_for_org(org_id: str, status: Optional[str] = None,
                 student_id: Optional[str] = None,
                 limit: int = 200) -> List[Dict[str, Any]]:
    """The staff review queue. Drafts are excluded — a family still assembling a
    record has not asked anyone to look at it yet."""
    query = (_admin().table('prior_learning_records').select('*')
             .eq('organization_id', org_id))
    if status:
        query = query.eq('status', status)
    else:
        query = query.neq('status', 'draft')
    if student_id:
        query = query.eq('student_user_id', student_id)
    records = (query.order('created_at', desc=True)
               .limit(min(int(limit or 200), 500)).execute().data or [])
    return _attach_names(_attach_evidence(records))


def queue_counts(org_id: str) -> Dict[str, int]:
    """Per-status counts for the queue header.

    count='exact' per status rather than tallying fetched rows — a school with
    more than 1000 records would otherwise get quietly wrong numbers.
    """
    counts: Dict[str, int] = {}
    for status in ('submitted', 'under_review', 'accepted', 'rejected'):
        counts[status] = (_admin().table('prior_learning_records')
                          .select('id', count='exact')
                          .eq('organization_id', org_id).eq('status', status)
                          .limit(1).execute().count or 0)
    return counts


def get_record(record_id: str, org_id: str) -> Optional[Dict[str, Any]]:
    rows = (_admin().table('prior_learning_records').select('*')
            .eq('id', record_id).eq('organization_id', org_id).limit(1).execute().data or [])
    if not rows:
        return None
    return _attach_evidence(rows)[0]


def get_own_record(record_id: str, org_id: str, guardian_id: str) -> Optional[Dict[str, Any]]:
    record = get_record(record_id, org_id)
    if not record or record.get('submitted_by') != guardian_id:
        return None
    return record


def accepted_for_student(student_id: str) -> List[Dict[str, Any]]:
    """Accepted records for a student's portfolio/transcript view.

    Only accepted ones: a record the office rejected, or is still reading, is not
    something a student should see presented as part of their record.
    """
    records = (_admin().table('prior_learning_records')
               .select('id, title, description, provider, started_on, ended_on, '
                       'awarded_credits, credited_at, organization_id')
               .eq('student_user_id', student_id).eq('status', 'accepted')
               .order('ended_on', desc=True).limit(200).execute().data or [])
    return _attach_evidence(records)


def accepted_credit_totals(student_id: str) -> Dict[str, float]:
    """Credits accepted so far, per subject — what a reviewer needs to see before
    awarding more, and what the transcript step will read when it's built."""
    totals: Dict[str, float] = {}
    for record in accepted_for_student(student_id):
        for subject, credits in (record.get('awarded_credits') or {}).items():
            totals[subject] = round(totals.get(subject, 0) + float(credits), 2)
    return totals


# ── Family writes ─────────────────────────────────────────────────────────────
def create_record(org_id: str, guardian_id: str, student_id: str,
                  data: Dict[str, Any]) -> Dict[str, Any]:
    fields = _record_fields(data)
    if not fields['title']:
        return {'error': 'Give this record a title'}
    row = {
        **fields,
        'organization_id': org_id,
        'student_user_id': student_id,
        'submitted_by': guardian_id,
        'status': 'draft',
    }
    created = _admin().table('prior_learning_records').insert(row).execute().data
    if not created:
        return {'error': 'Could not save this record'}
    return {'record': {**created[0], 'evidence': []}}


def update_record(record_id: str, org_id: str, guardian_id: str,
                  data: Dict[str, Any]) -> Dict[str, Any]:
    record = get_own_record(record_id, org_id, guardian_id)
    if not record:
        return {'error': 'Record not found', 'status': 404}
    if record['status'] not in FAMILY_EDITABLE:
        return {'error': 'The school is reviewing this record, so it can no longer be changed'}
    fields = _record_fields(data)
    if not fields['title']:
        return {'error': 'Give this record a title'}
    updated = (_admin().table('prior_learning_records').update(fields)
               .eq('id', record_id).execute().data)
    if not updated:
        return {'error': 'Could not save this record'}
    return {'record': {**updated[0], 'evidence': record.get('evidence', [])}}


def submit_record(record_id: str, org_id: str, guardian_id: str) -> Dict[str, Any]:
    record = get_own_record(record_id, org_id, guardian_id)
    if not record:
        return {'error': 'Record not found', 'status': 404}
    if record['status'] != 'draft':
        return {'error': 'This record has already been submitted'}
    if not record.get('evidence'):
        return {'error': 'Attach at least one piece of evidence before submitting'}
    updated = (_admin().table('prior_learning_records')
               .update({'status': 'submitted'}).eq('id', record_id).execute().data)
    return {'record': {**(updated[0] if updated else record),
                       'evidence': record.get('evidence', [])}}


def delete_record(record_id: str, org_id: str, guardian_id: str) -> Dict[str, Any]:
    """Withdraw a record the office hasn't picked up yet.

    Evidence rows cascade. The blobs in quest-evidence are left alone, the same
    way deleting task evidence leaves them: they are keyed by a random path, and
    reaping storage on delete is a separate, whole-platform concern.
    """
    record = get_own_record(record_id, org_id, guardian_id)
    if not record:
        return {'error': 'Record not found', 'status': 404}
    if record['status'] not in FAMILY_EDITABLE:
        return {'error': 'The school is reviewing this record, so it can no longer be withdrawn'}
    _admin().table('prior_learning_records').delete().eq('id', record_id).execute()
    return {'deleted': True}


def add_evidence(record_id: str, org_id: str, guardian_id: str,
                 evidence: Dict[str, Any]) -> Dict[str, Any]:
    """Attach one piece of evidence. `evidence` is already-validated shape from
    the route (which owns the file upload); this owns ordering and the caps."""
    record = get_own_record(record_id, org_id, guardian_id)
    if not record:
        return {'error': 'Record not found', 'status': 404}
    if record['status'] not in FAMILY_EDITABLE:
        return {'error': 'The school is reviewing this record, so it can no longer be changed'}
    existing = record.get('evidence', [])
    if len(existing) >= MAX_EVIDENCE_PER_RECORD:
        return {'error': f'A record can hold {MAX_EVIDENCE_PER_RECORD} pieces of evidence'}
    row = {
        'record_id': record_id,
        'evidence_type': evidence['evidence_type'],
        'content': _clean_text(evidence.get('content')),
        'url': _clean_text(evidence.get('url'), 2000),
        'title': _clean_text(evidence.get('title'), MAX_TITLE),
        'file_name': _clean_text(evidence.get('file_name'), MAX_TITLE),
        'file_size': evidence.get('file_size'),
        'content_type': _clean_text(evidence.get('content_type'), 120),
        'sequence_order': len(existing),
        'uploaded_by': guardian_id,
    }
    created = _admin().table('prior_learning_evidence').insert(row).execute().data
    if not created:
        return {'error': 'Could not attach that evidence'}
    # The insert echoes back the stored pointer, which the page would render
    # unsigned — the just-uploaded file would be the one broken thumbnail on an
    # otherwise working list until the next refetch. Sign it like a read.
    out = dict(created[0])
    sign_in_place([out], ['url'])
    return {'evidence': out}


def _delete_evidence_row(evidence_id: str, record_id: str) -> Dict[str, Any]:
    """Drop one piece of evidence, and the file behind it.

    The row and the blob go together: deleting only the row leaves the upload
    sitting in the private bucket forever, still counted against storage and
    still holding a family's document that the school was asked to remove.
    """
    rows = (_admin().table('prior_learning_evidence')
            .select('id, url').eq('id', evidence_id)
            .eq('record_id', record_id).limit(1).execute().data or [])
    if not rows:
        return {'error': 'That evidence is not on this record', 'status': 404}

    # `url` may already be signed in a cached read; parse_object_ref reduces
    # either form to (bucket, path), and returns None for a foreign link.
    ref = parse_object_ref(rows[0].get('url'))
    if ref:
        bucket, path = ref
        try:
            _admin().storage.from_(bucket).remove([path])
        except Exception as e:  # noqa: BLE001
            # The row still goes. An orphaned blob is a storage cost; a row
            # pointing at a file the reviewer thinks they deleted is a lie.
            logger.warning(f'Could not remove prior-learning file {path}: {e}')

    (_admin().table('prior_learning_evidence').delete()
     .eq('id', evidence_id).eq('record_id', record_id).execute())
    return {'deleted': True}


def delete_evidence(evidence_id: str, record_id: str, org_id: str,
                    guardian_id: str) -> Dict[str, Any]:
    record = get_own_record(record_id, org_id, guardian_id)
    if not record:
        return {'error': 'Record not found', 'status': 404}
    if record['status'] not in FAMILY_EDITABLE:
        return {'error': 'The school is reviewing this record, so it can no longer be changed'}
    return _delete_evidence_row(evidence_id, record_id)


def staff_delete_evidence(evidence_id: str, record_id: str,
                          org_id: str) -> Dict[str, Any]:
    """Staff removing a document from a record they are reviewing.

    Not bound by FAMILY_EDITABLE, deliberately: the reason this exists is that a
    family's upload turned out to be something the school should not be holding
    — a file about the wrong child, a duplicate, or in the first real case a
    cloud-hosting invoice attached by mistake — and those are found DURING
    review, exactly when the family's own delete has already locked.
    """
    record = get_record(record_id, org_id)
    if not record:
        return {'error': 'Record not found', 'status': 404}
    return _delete_evidence_row(evidence_id, record_id)


# ── Staff review ──────────────────────────────────────────────────────────────
def review(record_id: str, org_id: str, reviewer_id: str,
           status: str, notes: Optional[str] = None,
           awarded_credits: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Move a record through review, and award credit when accepting.

    Awarding is part of accepting rather than a separate step because the two
    always happen together in the office's head: "yes, and it's worth 1.0 math".
    Accepting with an empty award is allowed (recognized, not credit-bearing) but
    it is an explicit choice the reviewer makes by leaving the boxes empty.
    """
    if status not in REVIEW_STATUSES:
        return {'error': 'Unknown review status'}
    record = get_record(record_id, org_id)
    if not record:
        return {'error': 'Record not found', 'status': 404}
    if record['status'] == 'draft':
        return {'error': 'This family has not submitted this record yet'}

    update: Dict[str, Any] = {
        'status': status,
        'reviewed_by': reviewer_id,
        'reviewed_at': _now(),
    }
    if notes is not None:
        update['review_notes'] = _clean_text(notes)

    if status == 'accepted':
        try:
            credits = clean_awarded_credits(awarded_credits or {})
        except ValueError as e:
            return {'error': str(e)}
        update['awarded_credits'] = credits
        update['credited_at'] = _now() if credits else None
        update['credited_by'] = reviewer_id if credits else None
    elif status == 'rejected':
        # Rejecting after an earlier acceptance must take the credit back with
        # it, or the transcript keeps counting a record the school withdrew.
        update['awarded_credits'] = {}
        update['credited_at'] = None
        update['credited_by'] = None

    updated = (_admin().table('prior_learning_records').update(update)
               .eq('id', record_id).execute().data)
    if not updated:
        return {'error': 'Could not save this review'}
    return {'record': {**updated[0], 'evidence': record.get('evidence', [])}}
