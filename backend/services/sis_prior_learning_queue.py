"""
The prior-learning review queue, organised by student (2026-10-13).

sis_prior_learning_service owns a record: filing, evidence, the review states.
This module owns the reviewer's desk around it:

  student_queue   one row per student with something to look at, oldest wait
                  first, so the question "who has waited longest" is the list's
                  order instead of something a reviewer works out across tabs.
  workspace       everything about one student in one place: every record and
                  its evidence, the history and internal notes, the transfer
                  credit already on the transcript, diploma progress, and the
                  overlaps worth checking before approving more.
  approve         accept AND transcribe in one step. They were two forms, and
                  the gap between them is where credit sat "accepted" for weeks
                  without reaching the transcript. A person still presses the
                  button with the numbers on screen; the AI only fills them in.
  request_info    send a record back to the family with a note (needs_info).
  analysis        the analyzer runs when a record is submitted, so the
                  suggestion is waiting when the reviewer opens it.
  digest          a morning email to the superadmins while anything waits.

Who reviews which record is still sis_prior_learning_service's rule
(annotate_reviewer / may_review); nothing here re-derives it.
"""

import re
import threading
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

from generated.credits import DIPLOMA_CREDIT_REQUIREMENTS, XP_PER_CREDIT
from repositories.prior_learning_repository import PriorLearningRepository
from services import sis_prior_learning_service as prior
from utils.logger import get_logger
from utils.timestamps import utcnow as _now
from utils.school_subjects import get_display_name

logger = get_logger(__name__)

# Waiting on the office. needs_info waits on the family, so it is not here.
WAITING = ('submitted', 'under_review')

SIS_PRIOR_LEARNING_URL = 'https://sis.optioeducation.com/prior-learning'

MAX_NOTE = 4000

# A worker that died mid-analysis leaves the record at 'running'. Longer than
# any real analysis (the model call times out well before this).
STUCK_AFTER = timedelta(minutes=15)


def _repo() -> PriorLearningRepository:
    # admin client justified: prior_learning_* are service-role only; every
    # caller is role-gated (staff) or relationship-gated (family) first.
    from utils.admin_client import admin_client
    return PriorLearningRepository(client=admin_client())


def queue_org_ids(org_id: str) -> List[str]:
    """The schools whose records this office lists: its own, and for Optio
    Academy also every extension school's (prior._scope_to_queue's rule)."""
    if org_id != prior.academy_org_id():
        return [org_id]
    return [org_id, *prior._extension_org_ids()]


def sis_link(student_id: Optional[str] = None) -> str:
    """The console page, opened on Optio Academy and (optionally) one student.
    A superadmin has no org of their own, so the link names it."""
    url = f'{SIS_PRIOR_LEARNING_URL}?organization_id={prior.academy_org_id()}'
    return f'{url}&student={student_id}' if student_id else url


# ── History ───────────────────────────────────────────────────────────────────
def log_event(record_id: str, kind: str, actor_id: Optional[str] = None,
              body: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None) -> None:
    """Append one line to a record's history. Best-effort: a missing history
    line must never fail the action it describes."""
    try:
        _repo().insert_event({
            'record_id': record_id, 'kind': kind, 'actor_id': actor_id,
            'body': (body or None) and str(body)[:MAX_NOTE],
            'metadata': metadata or {},
        })
    except Exception as e:  # noqa: BLE001
        logger.warning(f'prior learning: could not log {kind} on {record_id}: {e}')


# ── The queue ─────────────────────────────────────────────────────────────────
def _parse(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
    except ValueError:
        return None


def _names(user_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
    rows = _repo().users(user_ids, 'id, first_name, last_name, display_name')
    out = {}
    for u in rows:
        name = (' '.join(filter(None, [u.get('first_name'), u.get('last_name')])).strip()
                or u.get('display_name') or 'Student')
        out[u['id']] = {'name': name}
    return out


def student_queue(org_id: str) -> Dict[str, Any]:
    """One row per student who has a listed record.

    Order: students with something for the office to do first, longest wait
    at the top; then everyone else, most recent activity first.
    """
    from repositories.organization_repository import OrganizationRepository
    from services import transfer_credit_service as credit

    rows = _repo().queue_rows(queue_org_ids(org_id))
    accepted = [r['id'] for r in rows
                if r['status'] == 'accepted' and (r.get('awarded_credits') or {})]
    converted = credit.conversions_for_records(accepted)

    students: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        s = students.setdefault(r['student_user_id'], {
            'student_id': r['student_user_id'], 'organization_ids': set(),
            'counts': {}, 'waiting': 0, 'needs_info': 0, 'not_transcribed': 0,
            'ai_ready': 0, 'oldest_waiting_at': None, 'last_activity_at': None,
        })
        s['organization_ids'].add(r['organization_id'])
        s['counts'][r['status']] = s['counts'].get(r['status'], 0) + 1
        if r['status'] in WAITING:
            s['waiting'] += 1
            if r.get('ai_status') == 'complete':
                s['ai_ready'] += 1
            if not s['oldest_waiting_at'] or r['created_at'] < s['oldest_waiting_at']:
                s['oldest_waiting_at'] = r['created_at']
        if r['status'] == 'needs_info':
            s['needs_info'] += 1
        if r['id'] in accepted and r['id'] not in converted:
            s['not_transcribed'] += 1
        last = r.get('updated_at') or r['created_at']
        if not s['last_activity_at'] or last > s['last_activity_at']:
            s['last_activity_at'] = last

    names = _names(students.keys())
    orgs = OrganizationRepository(client=_repo().client).names_for(
        o for s in students.values() for o in s['organization_ids'])
    out = []
    for sid, s in students.items():
        org_ids = sorted(s.pop('organization_ids'))
        s['name'] = names.get(sid, {}).get('name', 'Student')
        s['schools'] = [orgs.get(o) or 'School' for o in org_ids]
        s['needs_action'] = bool(s['waiting'] or s['not_transcribed'])
        out.append(s)

    out.sort(key=lambda s: s['last_activity_at'] or '', reverse=True)
    out.sort(key=lambda s: (not s['needs_action'], s['oldest_waiting_at'] or '9999'))
    totals = {
        'waiting': sum(s['waiting'] for s in out),
        'needs_info': sum(s['needs_info'] for s in out),
        'not_transcribed': sum(s['not_transcribed'] for s in out),
        'students_needing_action': sum(1 for s in out if s['needs_action']),
    }
    return {'students': out, 'totals': totals}


# ── One student's workspace ───────────────────────────────────────────────────
def _norm_course(name: Any) -> str:
    """"Algebra I" and "algebra 1" are the same course on two transcripts."""
    text = re.sub(r'[^a-z0-9 ]+', ' ', str(name or '').lower())
    romans = {'i': '1', 'ii': '2', 'iii': '3', 'iv': '4'}
    return ' '.join(romans.get(t, t) for t in text.split())


def _norm_school(name: Any) -> str:
    return re.sub(r'[^a-z0-9]+', '', str(name or '').lower())


def _suggested_courses(record: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for s in ((record.get('ai_suggestion') or {}).get('subjects') or []):
        for c in (s.get('courses') or []):
            if c.get('name'):
                out.append({'name': c['name'], 'subject': s.get('subject')})
    return out


def _credits(xp: Any) -> float:
    try:
        return round(float(xp) / XP_PER_CREDIT, 2)
    except (TypeError, ValueError):
        return 0.0


def diploma_progress(student_id: str, records: List[Dict[str, Any]],
                     transfer_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Credit per diploma subject against the requirement.

    earned     what the diploma counts now (user_subject_xp)
    transfer   the part of `earned` that came from other schools
    pending    awarded on an accepted record that is not on the transcript yet
    suggested  the analyzer's reading of records still waiting on the office
    """
    earned: Dict[str, float] = {}
    for row in _repo().subject_xp(student_id):
        subject = str(row.get('school_subject') or '')
        earned[subject] = round(earned.get(subject, 0) + _credits(row.get('xp_amount')), 2)
    transfer: Dict[str, float] = {}
    for row in transfer_rows:
        for subject, xp in (row.get('subject_xp') or {}).items():
            transfer[subject] = round(transfer.get(subject, 0) + _credits(xp), 2)
    pending: Dict[str, float] = {}
    suggested: Dict[str, float] = {}
    for r in records:
        if r['status'] == 'accepted' and not r.get('transfer_credit'):
            for subject, c in (r.get('awarded_credits') or {}).items():
                pending[subject] = round(pending.get(subject, 0) + float(c), 2)
        elif r['status'] in WAITING:
            for s in ((r.get('ai_suggestion') or {}).get('subjects') or []):
                try:
                    c = float(s.get('credits') or 0)
                except (TypeError, ValueError):
                    continue
                if c > 0 and s.get('subject'):
                    suggested[s['subject']] = round(suggested.get(s['subject'], 0) + c, 2)

    subjects = []
    for subject, required in DIPLOMA_CREDIT_REQUIREMENTS.items():
        e = earned.get(subject, 0.0)
        t = min(transfer.get(subject, 0.0), e)
        subjects.append({
            'subject': subject, 'name': get_display_name(subject), 'required': required,
            'earned': e, 'transfer': t, 'optio': round(e - t, 2),
            'pending': pending.get(subject, 0.0), 'suggested': suggested.get(subject, 0.0),
            'remaining': round(max(0.0, required - e - pending.get(subject, 0.0)), 2),
        })
    capped = sum(min(s['earned'], s['required']) for s in subjects)
    return {
        'subjects': subjects,
        'total_required': round(sum(DIPLOMA_CREDIT_REQUIREMENTS.values()), 2),
        'total_counted': round(capped, 2),
    }


def overlaps_for(record: Dict[str, Any], records: List[Dict[str, Any]],
                 transfer_rows: List[Dict[str, Any]],
                 progress: Dict[str, Any]) -> List[Dict[str, str]]:
    """What a reviewer should check before approving this record: the same
    course already credited, the same school already on the transcript, and
    subjects that are already full. Rules, not a model: each warning says
    exactly what matched, so a reviewer can dismiss it in a glance."""
    if record.get('transfer_credit') or record['status'] in ('rejected',):
        return []
    found: List[Dict[str, str]] = []
    mine = _suggested_courses(record)

    on_transcript: Dict[str, Any] = {}
    for row in transfer_rows:
        for subject_courses in (row.get('course_names') or {}).values():
            for c in (subject_courses or []):
                on_transcript.setdefault(_norm_course(c.get('name')), row.get('school_name'))
    elsewhere: Dict[str, str] = {}
    for other in records:
        if other['id'] == record['id'] or other['status'] == 'rejected':
            continue
        for c in _suggested_courses(other):
            elsewhere.setdefault(_norm_course(c['name']), other.get('title') or 'another record')

    seen = set()
    for c in mine:
        key = _norm_course(c['name'])
        if not key or key in seen:
            continue
        seen.add(key)
        if key in on_transcript:
            found.append({'kind': 'course_on_transcript',
                          'message': f"“{c['name']}” is already on the transcript "
                                     f"from {on_transcript[key] or 'another school'}."})
        elif key in elsewhere:
            found.append({'kind': 'course_in_other_record',
                          'message': f"“{c['name']}” also appears in “{elsewhere[key]}”."})

    school = _norm_school((record.get('ai_suggestion') or {}).get('school_name'))
    if school:
        for row in transfer_rows:
            if _norm_school(row.get('school_name')) == school:
                found.append({'kind': 'school_on_transcript',
                              'message': f"{row['school_name']} already has credit on the "
                                         'transcript. Approving merges into it, so check '
                                         'these are different courses.'})
                break

    full = {s['subject']: s for s in progress.get('subjects', [])}
    for s in ((record.get('ai_suggestion') or {}).get('subjects') or []):
        p = full.get(s.get('subject'))
        if not p or s.get('subject') == 'electives':
            continue
        if p['earned'] + p['pending'] >= p['required']:
            found.append({'kind': 'subject_full',
                          'message': f"{p['name']} already meets its {p['required']} credit "
                                     'requirement. More credit here does not move the diploma.'})
    return found


def workspace(org_id: str, student_id: str) -> Optional[Dict[str, Any]]:
    """Everything about one student's prior learning, for one screen. None
    when this office has no records for the student (the route's 404)."""
    from services import transfer_credit_service as credit

    repo = _repo()
    records = repo.records_for_student(student_id, queue_org_ids(org_id))
    if not records:
        return None
    records = prior.annotate_reviewer(prior._attach_names(prior._attach_evidence(records)))
    converted = credit.conversions_for_records([r['id'] for r in records])
    events = repo.events_for([r['id'] for r in records])
    actors = _names(str(e['actor_id']) for e in events if e.get('actor_id'))
    by_record: Dict[str, List[Dict[str, Any]]] = {}
    for e in events:
        e['actor_name'] = actors.get(e.get('actor_id') or '', {}).get('name')
        by_record.setdefault(e['record_id'], []).append(e)

    price_list = price_list_for(records[0])
    for r in records:
        r['transfer_credit'] = converted.get(r['id'])
        r['can_review'] = prior.may_review(r, org_id)
        r['events'] = by_record.get(r['id'], [])
        if not r['can_review']:
            for key in ('ai_suggestion', 'ai_status', 'ai_model', 'ai_analyzed_at', 'ai_error'):
                r.pop(key, None)
            r['events'] = [e for e in r['events'] if e['kind'] != 'note']

    transfer_rows = repo.transfer_credits(student_id)
    progress = diploma_progress(student_id, records, transfer_rows)
    for r in records:
        r['overlaps'] = overlaps_for(r, records, transfer_rows, progress) if r['can_review'] else []

    person = _names([student_id]).get(student_id, {})
    transfers = [{
        'id': t['id'], 'school_name': t.get('school_name'),
        'credits': {s: _credits(x) for s, x in (t.get('subject_xp') or {}).items()},
        'course_names': t.get('course_names') or {},
        'accredited': bool(t.get('accredited')),
        'from_prior_learning': bool(t.get('prior_learning_record_ids')),
        'prior_learning_record_ids': t.get('prior_learning_record_ids') or [],
    } for t in transfer_rows]
    return {
        'student': {
            'student_id': student_id,
            'name': person.get('name') or records[0].get('student_name') or 'Student',
            'schools': sorted({r.get('organization_name') or '' for r in records} - {''}),
        },
        'records': records,
        'transfer_credits': transfers,
        'transfer_cost': transfer_cost(transfers, records, price_list),
        'progress': progress,
        # What awarded prior learning costs this student, per credit, so the
        # Approve panel can show the fee before the reviewer approves.
        'pricing': {'price_list': price_list, 'credit_cents': credit_price_cents(price_list)},
    }


# ── What transferred credit costs ────────────────────────────────────────────
# One price rule: price_list_for / fee_for below. Credit that came through a
# prior-learning record carries the fee stored on that record when it was
# approved, so a later price change does not rewrite what the family was told.
# A row the office typed in by hand has no record, so its fee is worked out
# from the row's own accredited mark.

def transfer_cost(transfers: List[Dict[str, Any]], records: List[Dict[str, Any]],
                  price_list: str) -> Dict[str, Any]:
    """Per-school lines and a total, all in integer cents. None at all for an
    OpenEd family: they buy through OpenEd, which pays Optio, and are never
    shown a price (Tanner, 2026-10-13) -- no lines, so the workspace and the
    report print no cost."""
    if price_list == 'opened':
        return {'price_list': price_list, 'unaccredited_rate_cents': 0, 'lines': [], 'total_cents': 0}
    by_id = {r['id']: r for r in records}
    rate = credit_price_cents(price_list)
    lines = []
    for t in transfers:
        credits = round(sum(float(c or 0) for c in (t.get('credits') or {}).values()), 2)
        recs = [by_id[rid] for rid in t.get('prior_learning_record_ids') or [] if rid in by_id]
        if recs:
            # A record approved before fees were recorded has none stored.
            cost = sum(r['fee_cents'] if r.get('fee_cents') is not None
                       else fee_for(price_list, r.get('awarded_credits') or {}, bool(r.get('source_accredited')))
                       for r in recs)
            marks = {bool(r.get('source_accredited')) for r in recs}
            accredited: Optional[bool] = marks.pop() if len(marks) == 1 else None
        else:
            accredited = bool(t.get('accredited'))
            cost = fee_for(price_list, credits, accredited)
        lines.append({'transfer_credit_id': t['id'], 'school_name': t.get('school_name'),
                      'accredited': accredited, 'credits': credits,
                      'rate_cents': None if accredited is None else (0 if accredited else rate),
                      'cost_cents': int(cost),
                      'from_records': bool(recs)})
    return {
        'price_list': price_list,
        'unaccredited_rate_cents': rate,
        'lines': lines,
        'total_cents': sum(line['cost_cents'] for line in lines),
    }


def set_transfer_accredited(org_id: str, transfer_credit_id: str, accredited: bool) -> Dict[str, Any]:
    """The reviewer says whether a hand-entered school's credit came on an
    accredited transcript. Only an office that reviews this student's records
    may. Credit from a record keeps the record's own accredited call."""
    repo = _repo()
    row = repo.transfer_credit(transfer_credit_id)
    if not row:
        return {'error': 'Transfer credit not found', 'status': 404}
    if row.get('prior_learning_record_ids'):
        return {'error': 'This credit came through prior learning; its fee was set when it was approved'}
    records = prior.annotate_reviewer(repo.records_for_student(row['user_id'], queue_org_ids(org_id)))
    if not any(prior.may_review(r, org_id) for r in records):
        return {'error': 'Transfer credit not found', 'status': 404}
    saved = repo.set_transfer_accredited(transfer_credit_id, bool(accredited))
    if not saved:
        return {'error': 'Could not save'}
    return {'transfer_credit': saved}


# ── Reviewer actions ──────────────────────────────────────────────────────────
def _reviewable(record_id: str, org_id: str):
    record = prior.get_record(record_id, org_id)
    if not record:
        return None, {'error': 'Record not found', 'status': 404}
    if not prior.may_review(record, org_id):
        return None, {'error': 'Optio Academy reviews this record', 'status': 403}
    return record, None


# ── Fees ──────────────────────────────────────────────────────────────────────
# What awarded prior learning costs, from shared/data/pricing.json (Tanner,
# 2026-10-13): credit from an accredited school's official transcript is free;
# anything else costs the student's credit price -- the private price for an
# Optio Academy student, half that for a student whose microschool holds an
# Optio license (any school other than Optio Academy).
#
# OpenEd families get their own list, 'opened', which has no price at all
# (Tanner, 2026-10-13): they buy from OpenEd's marketplace and OpenEd pays
# Optio, so the platform never shows them a price and records no fee.


def price_list_for(record: Dict[str, Any]) -> str:
    """'licensed', 'opened' or 'private' for the student this record is about."""
    if record.get('organization_id') and record['organization_id'] != prior.academy_org_id():
        return 'licensed'
    try:
        sources = _repo().funding_sources(record['student_user_id'], record['organization_id'])
    except Exception as e:  # noqa: BLE001 — the reviewer still sees the record; the fee may read private
        logger.warning(f"prior learning: funding lookup failed for {record.get('id')}: {e}")
        sources = []
    return 'opened' if 'opened' in sources else 'private'


def credit_price_cents(price_list: str) -> int:
    """What one credit of awarded prior learning costs on this list; 0 for
    OpenEd, whose families pay OpenEd."""
    from generated.pricing import PRICING
    if price_list == 'opened':
        return 0
    return int(PRICING['licensed' if price_list == 'licensed' else 'academy']['creditCents'])


def fee_for(price_list: str, credits: Any, accredited: bool) -> int:
    """The fee in cents for awarding `credits` (a {subject: credits} dict or a
    number) on this price list."""
    if accredited:
        from generated.pricing import PRICING
        return int(PRICING['transfer']['accreditedCreditCents'])
    total = (sum(float(c or 0) for c in credits.values()) if isinstance(credits, dict)
             else float(credits or 0))
    return int(round(total * credit_price_cents(price_list)))


def record_fee(record: Dict[str, Any], credits: Any, source_accredited: Any) -> Dict[str, Any]:
    """Store what this record's awarded credit costs, as the reviewer saw it:
    the price list is the student's, the accredited call is the reviewer's.
    Stored rather than derived, so a later price change does not rewrite what
    a family was told. Used by Approve and by the separate transcript step."""
    accredited = bool(source_accredited)
    price_list = price_list_for(record)
    fee = {'source_accredited': accredited, 'fee_price_list': price_list,
           'fee_cents': fee_for(price_list, credits, accredited)}
    _repo().update_record(record['id'], fee)
    return fee


def approve(record_id: str, org_id: str, reviewer_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Accept the record with this award and put it on the transcript.

    Everything is validated BEFORE the record changes, so a typo in a course
    total cannot leave a record accepted but not transcribed -- the exact
    half-state this step exists to remove.
    """
    from services import transfer_credit_service as credit

    record, err = _reviewable(record_id, org_id)
    if err:
        return err
    if record['status'] == 'draft':
        return {'error': 'This family has not submitted this record yet'}
    if credit.already_converted(record_id):
        return {'error': 'This credit is already on the transcript', 'status': 409}

    school_name = (body.get('school_name') or '').strip()
    if not school_name:
        return {'error': 'Name the school this credit came from'}
    subject_credits = body.get('subject_credits') or {}
    try:
        subject_xp = credit.validate_subject_credits(subject_credits)
        prior.clean_awarded_credits(subject_credits)
        credit.clean_course_names(body.get('course_names') or {}, subject_xp)
    except ValueError as e:
        return {'error': str(e)}
    if not subject_xp:
        return {'error': 'Award at least one subject some credit, or use "Accept without credit"'}

    reviewed = prior.review(record_id, org_id, reviewer_id, 'accepted',
                            notes=body.get('review_notes'), awarded_credits=subject_credits)
    if reviewed.get('error'):
        return reviewed
    fee = record_fee(record, subject_credits, body.get('source_accredited'))
    reviewed['record'] = {**reviewed['record'], **fee}
    result = credit.convert_prior_learning(reviewed['record'], {
        'school_name': school_name,
        'subject_credits': subject_credits,
        'course_names': body.get('course_names') or {},
        'notes': body.get('transcript_notes'),
    }, reviewer_id)
    if result.get('error'):
        # Accepted, not transcribed. Say so: the transcript step is still on
        # the record, and the reviewer can finish it there.
        return {'error': f"Accepted, but not added to the transcript: {result['error']}",
                'status': result.get('status', 400), 'record': reviewed['record']}
    log_event(record_id, 'transcribed', reviewer_id,
              metadata={'school_name': school_name, 'action': result.get('action'),
                        'subject_credits': subject_credits, **fee})
    return {'record': {**reviewed['record'], 'transfer_credit': result['transfer_credit']},
            'action': result.get('action')}


def request_info(record_id: str, org_id: str, reviewer_id: str, message: str) -> Dict[str, Any]:
    """Send a record back to the family with a note. Their copy unlocks; when
    they send it again it returns to the queue as 'submitted'."""
    record, err = _reviewable(record_id, org_id)
    if err:
        return err
    message = (message or '').strip()[:MAX_NOTE]
    if not message:
        return {'error': 'Tell the family what you need'}
    if record['status'] not in WAITING:
        return {'error': 'Only a record waiting for review can be sent back'}
    if record.get('source') != prior.SOURCE_FAMILY:
        return {'error': 'The office filed this record, so there is no family to send it back to'}
    updated = _repo().update_record(record_id, {
        'status': 'needs_info', 'review_notes': message,
        'reviewed_by': reviewer_id, 'reviewed_at': _now().isoformat(),
    })
    if not updated:
        return {'error': 'Could not send this back'}
    log_event(record_id, 'info_requested', reviewer_id, body=message)
    _notify_family_info_request({**record, **updated})
    return {'record': {**record, **updated}}


def add_note(record_id: str, org_id: str, author_id: str, body: str) -> Dict[str, Any]:
    """A private note on a record. The family never sees these."""
    _record, err = _reviewable(record_id, org_id)
    if err:
        return err
    body = (body or '').strip()[:MAX_NOTE]
    if not body:
        return {'error': 'Write a note first'}
    log_event(record_id, 'note', author_id, body=body)
    return {'noted': True}


def _notify_family_info_request(record: Dict[str, Any]) -> None:
    """Bell and email to whoever filed the record: they have to act."""
    try:
        from app_config import Config
        from services.email_service import email_service
        from services.notification_service import NotificationService
        NotificationService().create_notification(
            user_id=record['submitted_by'],
            notification_type='school_notice',
            title='Prior learning: the school needs more from you',
            message=(record.get('review_notes') or '')[:300],
            link='/family/prior-learning',
            metadata={'prior_learning_record_id': record['id']},
            organization_id=record.get('organization_id'),
        )
        person = (_repo().users([record['submitted_by']], 'id, email, first_name') or [{}])[0]
        if person.get('email'):
            email_service.send_templated_email(
                to_email=person['email'],
                subject='The school needs more for your prior learning record',
                template_name='prior_learning_needs_info',
                context={
                    'first_name': person.get('first_name') or 'there',
                    'record_title': record.get('title') or 'your record',
                    'message': record.get('review_notes') or '',
                    'record_url': f'{Config.FRONTEND_URL}/family/prior-learning',
                },
                contains_student_records=True,
            )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"prior learning: info-request notice failed for {record.get('id')}: {e}")


# ── Analysis ──────────────────────────────────────────────────────────────────
def queue_analysis(record_id: str, start: bool = False) -> None:
    """Mark a record for the analyzer. `start` also runs it now on a thread
    (the family just pressed Send); otherwise the cron sweep picks it up
    within ten minutes. Best-effort, never raises."""
    try:
        if not _repo().set_ai_status(record_id, 'queued',
                                     only_from=('not_run', 'complete', 'failed')):
            return
        if start:
            threading.Thread(target=_analyze_claimed, args=(record_id,), daemon=True).start()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'prior learning: could not queue analysis for {record_id}: {e}')


def _load(record_id: str) -> Optional[Dict[str, Any]]:
    """The record with its evidence, read from its own school."""
    org_id = _repo().org_of(record_id)
    return prior.get_record(record_id, org_id) if org_id else None


def run_analysis(record: Dict[str, Any], passwords: Optional[List[str]] = None,
                 actor_id: Optional[str] = None) -> Dict[str, Any]:
    """Run the analyzer on one record and write its history line."""
    from services.sis_prior_learning_analyzer import analyze_record
    result = analyze_record(record, record['organization_id'], passwords)
    if result.get('error'):
        log_event(record['id'], 'analysis_failed', actor_id, body=result['error'])
    else:
        subjects = (result.get('suggestion') or {}).get('subjects') or []
        total = round(sum(float(s.get('credits') or 0) for s in subjects), 2)
        log_event(record['id'], 'analyzed', actor_id,
                  body=f'Suggested {total} credit(s) across {len(subjects)} subject(s)')
    return result


def _analyze_claimed(record_id: str) -> None:
    """Claim a queued record (queued -> running) and analyze it. The claim is
    what keeps a thread and a cron tick from reading the same record twice."""
    try:
        if not _repo().set_ai_status(record_id, 'running', only_from=('queued',)):
            return
        record = _load(record_id)
        if not record or not record.get('evidence'):
            _repo().set_ai_status(record_id, 'not_run')
            return
        run_analysis(record)
    except Exception as e:  # noqa: BLE001
        logger.error(f'prior learning: background analysis failed for {record_id}: {e}')
        _repo().set_ai_status(record_id, 'failed')


def analyze_sweep(limit: int = 3) -> Dict[str, Any]:
    """Cron: analyze queued records, and requeue any a dead worker left at
    'running'. Returns before any model call; the work runs on a thread."""
    repo = _repo()
    stuck = repo.stuck_running((_now() - STUCK_AFTER).isoformat(), limit)
    for row in stuck:
        repo.set_ai_status(row['id'], 'queued', only_from=('running',))
    queued = [r['id'] for r in repo.queued_for_analysis(limit)]

    def _work():
        for record_id in queued:
            _analyze_claimed(record_id)

    if queued:
        threading.Thread(target=_work, daemon=True).start()
    return {'queued': len(queued), 'requeued': len(stuck)}


# ── Alerts ────────────────────────────────────────────────────────────────────
def superadmin_ids() -> List[str]:
    return [u['id'] for u in _repo().superadmins()]


def daily_digest(now: Optional[datetime] = None) -> Dict[str, Any]:
    """Once a day, email the superadmins what waits in the queue. Sends
    nothing when nothing waits -- an empty digest teaches people to ignore it."""
    from services import transfer_credit_service as credit
    from services.email_service import email_service

    now = now or _now()
    repo = _repo()
    waiting = repo.count_by_status(WAITING)
    needs_info = repo.count_by_status(('needs_info',))
    new_24h = repo.count_created_since((now - timedelta(days=1)).isoformat())
    accepted = [r['id'] for r in repo.accepted_with_credit() if r.get('awarded_credits')]
    not_transcribed = len(accepted) - len(credit.conversions_for_records(accepted))
    oldest = repo.oldest_waiting(WAITING)
    oldest_at = _parse(oldest['created_at']) if oldest else None
    oldest_days = max(0, (now - oldest_at).days) if oldest_at else 0

    summary = {'waiting': waiting, 'needs_info': needs_info, 'new_24h': new_24h,
               'not_transcribed': not_transcribed, 'oldest_days': oldest_days, 'sent': 0}
    if not waiting and not not_transcribed:
        return summary

    for admin in repo.superadmins():
        if not admin.get('email'):
            continue
        try:
            ok = email_service.send_templated_email(
                to_email=admin['email'],
                subject=f'Prior learning: {waiting} waiting for review',
                template_name='prior_learning_daily_digest',
                context={
                    'admin_name': admin.get('first_name') or admin.get('display_name') or 'there',
                    'waiting': waiting, 'new_24h': new_24h, 'needs_info': needs_info,
                    'not_transcribed': not_transcribed, 'oldest_days': oldest_days,
                    'queue_url': sis_link(),
                },
            )
            summary['sent'] += 1 if ok else 0
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[prior-learning-digest] email to {admin['email']} failed: {e}")
    logger.info(f'[prior-learning-digest] {summary}')
    return summary


# ── Portfolio ─────────────────────────────────────────────────────────────────
# Accepted prior learning belongs in the student's portfolio next to their own
# work, documents included (Tanner, 2026-10-13). A family hides any one
# document with the private switch on their Prior Learning page; a private
# document never reaches a portfolio view, the same rule as a private task
# evidence block.

def portfolio_entries(student_id: str) -> List[Dict[str, Any]]:
    """Accepted records with their non-private documents, signed for display.
    Best-effort: a failure here must not take the rest of a portfolio down."""
    try:
        from utils.storage_urls import sign_in_place
        repo = _repo()
        records = repo.accepted_for_portfolio(student_id)
        docs = repo.public_evidence([r['id'] for r in records])
        sign_in_place(docs, ['url'])
        by_record: Dict[str, List[Dict[str, Any]]] = {}
        for d in docs:
            by_record.setdefault(d.pop('record_id'), []).append(d)
        return [{**r, 'total_credits': round(sum(float(c) for c in (r.get('awarded_credits') or {}).values()), 2),
                 'evidence': by_record.get(r['id'], [])} for r in records]
    except Exception as e:  # noqa: BLE001
        logger.warning(f'prior learning: portfolio read failed for {student_id}: {e}')
        return []


def set_evidence_privacy(record: Dict[str, Any], evidence_id: str, is_private: bool) -> Dict[str, Any]:
    """Hide or show one document in the portfolio. The caller has already
    established the record is the family's (get_own_record). Allowed at any
    status: privacy is the family's choice even after the school decided."""
    if not _repo().set_evidence_private(record['id'], evidence_id, bool(is_private)):
        return {'error': 'That document is not on this record', 'status': 404}
    return {'is_private': bool(is_private)}
