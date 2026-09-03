"""
Transfer credits — the credit/XP arithmetic, in one place.

This logic used to live entirely inside routes/admin/transfer_credits.py. It is
a service now because the SIS console needs the same arithmetic and services may
not import routes (tests/unit/test_import_layers). The LMS admin route still
works and delegates here, so there is exactly one implementation of "what does
1.0 credit do to a student's XP".

The three facts worth knowing before changing anything here:

  XP_PER_CREDIT = 2000. A full-year high-school class is 1.0 credit = 2000 XP;
  a semester is 0.5 = 1000. (Unrelated to the 1000-XP target on an in-app class
  quest, which is a different number that happens to look similar.)

  A save writes XP twice — user_subject_xp (what the diploma counts) and
  user_skill_xp (the pillar totals a student sees), mapped by SUBJECT_TO_PILLAR.
  Both are DELTAS against the previous value, so a correction from 2.0 to 1.0
  removes XP rather than adding more.

  The transcript SUBTRACTS transfer XP from user_subject_xp to work out what a
  student earned at Optio. Credit that lands in user_subject_xp without a
  transfer_credits row is therefore counted as Optio-earned — which is why
  prior learning converts into a row here instead of depositing XP directly.
"""

from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.school_subjects import SCHOOL_SUBJECTS

logger = get_logger(__name__)

# The subjects a transfer credit may name — the school_subject enum.
VALID_SUBJECTS = list(SCHOOL_SUBJECTS)

# Subject -> XP pillar, so a transfer credit moves the pillar totals a student
# sees on their profile as well as the diploma counters.
SUBJECT_TO_PILLAR = {
    'language_arts': 'communication',
    'math': 'stem',
    'science': 'stem',
    'social_studies': 'civics',
    'financial_literacy': 'wellness',
    'health': 'wellness',
    'pe': 'wellness',
    'fine_arts': 'art',
    'cte': 'stem',
    'digital_literacy': 'stem',
    'electives': 'art',
}

XP_PER_CREDIT = 2000

# A year of one subject is 1.0. Ten is already implausible; this is the guard
# against a typed 100 reaching a transcript.
MAX_CREDITS_PER_SUBJECT = 10


def _admin():
    # admin client justified: transfer_credits and the XP tables are
    # service-role only; every caller has already authorized an admin.
    return get_supabase_admin_client()


def credits_to_xp(credits: float) -> int:
    return int(round(float(credits) * XP_PER_CREDIT))


def xp_to_credits(xp: Any) -> float:
    return round((float(xp or 0)) / XP_PER_CREDIT, 2)


def validate_subject_credits(subject_credits: Dict[str, Any]) -> Dict[str, int]:
    """{subject: credits} -> {subject: xp}, or raise ValueError with a message
    fit to show a person. Zero and negative entries are dropped rather than
    refused: an empty box means "no credit here", not a mistake."""
    subject_xp: Dict[str, int] = {}
    for subject, credits in (subject_credits or {}).items():
        if subject not in VALID_SUBJECTS:
            raise ValueError(f'Invalid subject: {subject}')
        try:
            credits = float(credits)
        except (TypeError, ValueError) as _exc:
            raise ValueError(f'Credit value for {subject} must be a number') from _exc
        if credits <= 0:
            continue
        if credits > MAX_CREDITS_PER_SUBJECT:
            raise ValueError(
                f'Credit value for {subject} too high: {credits}. '
                f'Maximum is {MAX_CREDITS_PER_SUBJECT} credits per subject.'
            )
        subject_xp[subject] = credits_to_xp(credits)
    return subject_xp


def sync_xp(user_id: str, subject_xp: Dict[str, int],
            old_subject_xp: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
    """Apply the delta between old and new transfer XP to both XP tables.

    Deltas, not absolutes: a student's user_subject_xp also holds XP they earned
    at Optio, so writing the transfer total over it would erase their own work.
    """
    prev = old_subject_xp or {}
    supabase = _admin()
    pillar_deltas: Dict[str, int] = {}

    try:
        for subject in VALID_SUBJECTS:
            new_xp = int(subject_xp.get(subject, 0) or 0)
            old_xp = int(prev.get(subject, 0) or 0)
            delta = new_xp - old_xp
            if delta == 0:
                continue

            current = (supabase.table('user_subject_xp')
                       .select('id, xp_amount')
                       .eq('user_id', user_id).eq('school_subject', subject)
                       .execute().data)
            if current:
                updated = max(0, (current[0].get('xp_amount') or 0) + delta)
                (supabase.table('user_subject_xp').update({'xp_amount': updated})
                 .eq('id', current[0]['id']).execute())
            elif new_xp > 0:
                (supabase.table('user_subject_xp').insert({
                    'user_id': user_id, 'school_subject': subject,
                    'xp_amount': new_xp,
                }).execute())

            pillar = SUBJECT_TO_PILLAR.get(subject)
            if pillar:
                pillar_deltas[pillar] = pillar_deltas.get(pillar, 0) + delta

        for pillar, delta in pillar_deltas.items():
            if delta == 0:
                continue
            current = (supabase.table('user_skill_xp')
                       .select('id, xp_amount')
                       .eq('user_id', user_id).eq('pillar', pillar)
                       .execute().data)
            if current:
                updated = max(0, (current[0].get('xp_amount') or 0) + delta)
                (supabase.table('user_skill_xp').update({'xp_amount': updated})
                 .eq('id', current[0]['id']).execute())
            elif delta > 0:
                (supabase.table('user_skill_xp').insert({
                    'user_id': user_id, 'pillar': pillar, 'xp_amount': delta,
                }).execute())

        logger.info(f'[TRANSFER CREDITS] Synced XP for {user_id[:8]}: '
                    f'subjects={list(subject_xp.keys())}, pillars={pillar_deltas}')
        return {'success': True}
    except Exception as e:  # noqa: BLE001
        logger.error(f'Transfer credit XP sync failed for {user_id[:8]}: {e}')
        return {'success': False, 'error': str(e)}


def rows_for_student(user_id: str) -> List[Dict[str, Any]]:
    return (_admin().table('transfer_credits').select('*')
            .eq('user_id', user_id).order('created_at', desc=False)
            .execute().data or [])


def row_for_school(user_id: str, school_name: str) -> Optional[Dict[str, Any]]:
    rows = (_admin().table('transfer_credits').select('*')
            .eq('user_id', user_id).eq('school_name', school_name)
            .limit(1).execute().data or [])
    return rows[0] if rows else None


def already_converted(record_id: str) -> Optional[Dict[str, Any]]:
    """The transfer_credits row this prior-learning record already became, if
    any. Converting twice is the mistake that silently doubles a transcript."""
    rows = (_admin().table('transfer_credits')
            .select('id, school_name, subject_xp, prior_learning_record_ids')
            .contains('prior_learning_record_ids', [record_id])
            .limit(1).execute().data or [])
    return rows[0] if rows else None


def conversions_for_records(record_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """{record_id: the transfer_credits row it became}, for a whole queue page.

    One query rather than one per record: the queue renders "already on the
    transcript" per row, and that state must not cost a round trip each.
    """
    if not record_ids:
        return {}
    rows = (_admin().table('transfer_credits')
            .select('id, school_name, subject_xp, prior_learning_record_ids')
            .overlaps('prior_learning_record_ids', record_ids)
            .execute().data or [])
    out: Dict[str, Dict[str, Any]] = {}
    wanted = set(record_ids)
    for row in rows:
        for rid in (row.get('prior_learning_record_ids') or []):
            if rid in wanted:
                out[rid] = row
    return out


def _merge_course_names(existing: Dict[str, Any],
                        incoming: Dict[str, Any]) -> Dict[str, Any]:
    """Append incoming courses to whatever the school's row already lists.

    Courses are the transcript's line items, so merging two records from one
    school has to keep both sets — the alternative silently drops the courses
    from whichever record was converted first.
    """
    merged = {subject: list(courses) for subject, courses in (existing or {}).items()}
    for subject, courses in (incoming or {}).items():
        merged.setdefault(subject, []).extend(courses or [])
    return merged


def clean_course_names(course_names: Dict[str, Any],
                       subject_xp: Dict[str, int]) -> Dict[str, List[Dict[str, Any]]]:
    """Course line items, checked against the credit they are meant to explain.

    The transcript prints these, so a subject whose courses sum to less than the
    subject's credit prints a transcript that does not add up. Enforced at the
    same 0.01 tolerance the existing course-names endpoint uses.
    """
    out: Dict[str, List[Dict[str, Any]]] = {}
    for subject, courses in (course_names or {}).items():
        if subject not in subject_xp:
            raise ValueError(f'Courses given for {subject}, which has no credit')
        if not isinstance(courses, list):
            raise ValueError(f'Courses for {subject} must be a list')
        cleaned = []
        for course in courses:
            name = (str((course or {}).get('name') or '')).strip()[:200]
            if not name:
                continue
            try:
                credits = float((course or {}).get('credits') or 0)
            except (TypeError, ValueError) as _exc:
                raise ValueError(f'Course credit for {subject} must be a number') from _exc
            cleaned.append({'name': name, 'credits': round(credits, 2)})
        if not cleaned:
            continue
        total = round(sum(c['credits'] for c in cleaned), 2)
        subject_credits = xp_to_credits(subject_xp[subject])
        if abs(total - subject_credits) > 0.01:
            raise ValueError(
                f'Course credits for {subject} ({total}) must equal the '
                f'subject total ({subject_credits})'
            )
        out[subject] = cleaned
    return out


def convert_prior_learning(record: Dict[str, Any], award: Dict[str, Any],
                           admin_user_id: str) -> Dict[str, Any]:
    """Turn one accepted prior-learning record into transcript credit.

    `award` is what the reviewer approved on screen — school name, per-subject
    credits, optional per-subject course line items, notes. It is NOT the AI's
    suggestion: the suggestion reaches this function only by way of a human who
    left it unedited.

    Merges into the school's existing row when there is one, so a family who
    files four records from one school produces one transcript entry.
    """
    record_id = record['id']
    student_id = record['student_user_id']

    existing_conversion = already_converted(record_id)
    if existing_conversion:
        return {'error': 'This record has already been added to the transcript',
                'status': 409, 'transfer_credit_id': existing_conversion['id']}

    school_name = (award.get('school_name') or record.get('provider') or '').strip()
    if not school_name:
        return {'error': 'Name the school this credit came from'}

    try:
        subject_xp = validate_subject_credits(award.get('subject_credits') or {})
    except ValueError as e:
        return {'error': str(e)}
    if not subject_xp:
        return {'error': 'Award at least one subject some credit'}

    try:
        course_names = clean_course_names(award.get('course_names') or {}, subject_xp)
    except ValueError as e:
        return {'error': str(e)}

    notes = (award.get('notes') or '').strip() or None
    row = row_for_school(student_id, school_name)

    if row:
        old_subject_xp = row.get('subject_xp') or {}
        combined = dict(old_subject_xp)
        for subject, xp in subject_xp.items():
            combined[subject] = int(combined.get(subject, 0)) + xp
        update = {
            'subject_xp': combined,
            'course_names': _merge_course_names(row.get('course_names') or {}, course_names),
            'prior_learning_record_ids': list(row.get('prior_learning_record_ids') or []) + [record_id],
        }
        if notes:
            update['notes'] = '\n'.join(filter(None, [row.get('notes'), notes]))
        saved = (_admin().table('transfer_credits').update(update)
                 .eq('id', row['id']).execute().data)
        action = 'merged'
    else:
        old_subject_xp = {}
        saved = (_admin().table('transfer_credits').insert({
            'user_id': student_id,
            'school_name': school_name,
            'subject_xp': subject_xp,
            'course_names': course_names,
            'notes': notes,
            'created_by': admin_user_id,
            'prior_learning_record_ids': [record_id],
        }).execute().data)
        combined = subject_xp
        action = 'created'

    if not saved:
        return {'error': 'Could not write the transfer credit'}

    # XP moves by the delta, so a merge adds only the new record's worth.
    sync = sync_xp(student_id, combined, old_subject_xp)

    logger.info(f'[PRIOR LEARNING] {action} transfer credit {saved[0]["id"]} from '
                f'record {record_id} for student {student_id[:8]} by {admin_user_id[:8]}')
    return {'transfer_credit': saved[0], 'action': action,
            'xp_synced': sync.get('success', False)}
