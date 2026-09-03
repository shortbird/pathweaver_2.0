"""Optio Academy enrollment, and where a student's records are sent.

Two facts that used to be inferred or retyped, now stored:

**Who is an Optio Academy student.** `utils/accreditation.py` used to read this
off `users.organization_id IS NULL`. That proxy holds for a platform-direct
student and breaks for everyone else, which is precisely the population the
credit partner program creates: a soccer club's participants are org-managed
under the CLUB, so the inference returned 'none' and their transcript dropped
its accreditation statement. `academy_enrollments` records the enrollment
directly, independent of whatever organization the account happens to sit in.

**Where the transcript goes.** The registrar was typed into the Transfer to
School modal at send time, once per send, remembered nowhere. The registration
funnel now asks at enrollment and stores it in `student_records_destination`,
one row per student, so the send is a confirmation rather than a data-entry
task and a roster can be sent in bulk.

Every write is idempotent: a family re-submitting a funnel step, or staff
correcting a school name, must not create a second row.
"""

import re

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.validation import sanitize_input

logger = get_logger(__name__)

PATHWAYS = ('full_time', 'parent_supported', 'partner_credit')
DESTINATION_TYPES = ('school', 'homeschool', 'optio_only')

# Free-text fields on a records destination, with the length we store.
_DESTINATION_TEXT_FIELDS = {
    'school_name': 200,
    'school_city': 100,
    'school_state': 100,
    'school_district': 200,
    'registrar_name': 120,
    'registrar_phone': 40,
    'student_id_at_school': 60,
}

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _admin():
    # admin client justified: enrolling a student and routing their records
    #   writes rows for the STUDENT and their receiving school, not the caller
    return get_supabase_admin_client()


from utils.timestamps import now_iso as _now  # noqa: E402


# ── Optio Academy enrollment ────────────────────────────────────────────────

def get_active_enrollment(user_id, client=None):
    """The student's active Optio Academy enrollment row, or None."""
    if not user_id:
        return None
    try:
        supabase = client or _admin()
        rows = supabase.table('academy_enrollments') \
            .select('id, user_id, pathway, status, partner_org_id, grade_level, enrolled_at') \
            .eq('user_id', user_id).eq('status', 'active').limit(1).execute().data
        return (rows or [None])[0]
    except Exception as e:  # noqa: BLE001
        # Accreditation and transcript rendering call this. A lookup failure must
        # not blank a transcript, so callers treat None as "not enrolled" and we
        # surface the failure in the log rather than raising.
        logger.error(f'academy enrollment lookup failed for {str(user_id)[:8]}: {e}')
        return None


def is_academy_student(user_id, client=None):
    """True when the student holds an active Optio Academy enrollment."""
    return get_active_enrollment(user_id, client=client) is not None


def active_enrolled_ids(user_ids, client=None):
    """The subset of `user_ids` with an active enrollment, as a set.

    One query for a whole roster: the per-student call would be N round trips on
    a transcript batch or a partner roster page.
    """
    ids = [u for u in (user_ids or []) if u]
    if not ids:
        return set()
    try:
        supabase = client or _admin()
        rows = supabase.table('academy_enrollments').select('user_id') \
            .in_('user_id', ids).eq('status', 'active').execute().data or []
        return {r['user_id'] for r in rows}
    except Exception as e:  # noqa: BLE001
        logger.error(f'academy enrollment batch lookup failed ({len(ids)} ids): {e}')
        return set()


def enroll(user_id, pathway, partner_org_id=None, registration_id=None,
           grade_level=None, created_by=None, client=None):
    """Enroll a student in Optio Academy. Idempotent per student.

    A student who already holds an active enrollment keeps it: re-running the
    registration funnel, or enrolling through a second partner, must not create
    a competing row (the partial unique index would reject it anyway). Returns
    the enrollment row, or None if the write failed.
    """
    if not user_id:
        return None
    if pathway not in PATHWAYS:
        raise ValueError(f'Unknown Academy pathway: {pathway}')

    supabase = client or _admin()
    existing = get_active_enrollment(user_id, client=supabase)
    if existing:
        return existing

    row = {
        'user_id': user_id,
        'pathway': pathway,
        'status': 'active',
        'partner_org_id': partner_org_id or None,
        'registration_id': registration_id or None,
        'grade_level': (grade_level or None),
        'created_by': created_by or None,
    }
    try:
        res = supabase.table('academy_enrollments').insert(row).execute()
        created = (res.data or [None])[0]
        if created:
            logger.info(f'academy enrollment created for {str(user_id)[:8]} '
                        f'({pathway}{", partner " + str(partner_org_id)[:8] if partner_org_id else ""})')
        return created
    except Exception as e:  # noqa: BLE001
        # Losing a race against a concurrent enroll() is not an error: the row
        # the other caller wrote is the answer.
        racing = get_active_enrollment(user_id, client=supabase)
        if racing:
            return racing
        logger.error(f'academy enrollment failed for {str(user_id)[:8]}: {e}')
        return None


# ── Records destination ─────────────────────────────────────────────────────

def validate_destination(payload):
    """Clean a records-destination payload. Returns (fields, error_message).

    `fields` is ready to write; `error_message` is family-facing text when the
    payload cannot be stored.
    """
    payload = payload or {}
    dtype = str(payload.get('destination_type') or '').strip()
    if dtype not in DESTINATION_TYPES:
        return None, 'Please choose where this student\'s records should go.'

    fields = {'destination_type': dtype}

    if dtype == 'school':
        for key, limit in _DESTINATION_TEXT_FIELDS.items():
            fields[key] = (sanitize_input(str(payload.get(key) or ''))[:limit]).strip() or None

        if not fields.get('school_name'):
            return None, 'Please tell us the name of the school.'

        email = str(payload.get('registrar_email') or '').strip().lower()
        if email and not _EMAIL_RE.match(email):
            return None, 'That registrar email does not look right.'
        fields['registrar_email'] = email or None

        # Consent to send only means something with somewhere to send it.
        consent = bool(payload.get('auto_send_consent')) and bool(fields['registrar_email'])
        fields['auto_send_consent'] = consent
        fields['consent_captured_at'] = _now() if consent else None
    else:
        # Homeschool / no school: clear any school fields left from an earlier
        # answer so a corrected destination cannot ship stale registrar details.
        for key in _DESTINATION_TEXT_FIELDS:
            fields[key] = None
        fields['registrar_email'] = None
        fields['auto_send_consent'] = False
        fields['consent_captured_at'] = None

    return fields, None


def get_destination(user_id, client=None):
    """The student's records destination row, or None."""
    if not user_id:
        return None
    try:
        supabase = client or _admin()
        rows = supabase.table('student_records_destination').select('*') \
            .eq('user_id', user_id).limit(1).execute().data
        return (rows or [None])[0]
    except Exception as e:  # noqa: BLE001
        logger.error(f'records destination lookup failed for {str(user_id)[:8]}: {e}')
        return None


def set_destination(user_id, payload, updated_by=None, client=None):
    """Create or update the student's records destination.

    Returns (row, error_message). Re-submitting a funnel step updates the one
    row rather than adding another (user_id is unique).
    """
    if not user_id:
        return None, 'Missing student.'

    fields, err = validate_destination(payload)
    if err:
        return None, err

    supabase = client or _admin()
    fields['updated_by'] = updated_by or None
    fields['updated_at'] = _now()
    if fields.get('consent_captured_at'):
        fields['consent_captured_by'] = updated_by or None

    try:
        existing = get_destination(user_id, client=supabase)
        if existing:
            res = supabase.table('student_records_destination') \
                .update(fields).eq('user_id', user_id).execute()
        else:
            res = supabase.table('student_records_destination') \
                .insert({**fields, 'user_id': user_id}).execute()
        row = (res.data or [None])[0]
        logger.info(f'records destination saved for {str(user_id)[:8]} ({fields["destination_type"]})')
        return row, None
    except Exception as e:  # noqa: BLE001
        logger.error(f'records destination save failed for {str(user_id)[:8]}: {e}')
        return None, 'We could not save that. Please try again.'


# ── Registration funnel helpers ─────────────────────────────────────────────

def destinations_for_kids(kids, client=None):
    """Saved records destinations for a registration's kids, keyed by user_id.

    Feeds the funnel's resume payload so a family back-editing the school
    records step sees what they entered rather than an empty form.
    """
    ids = [k.get('user_id') for k in (kids or []) if k.get('user_id')]
    if not ids:
        return {}
    try:
        supabase = client or _admin()
        rows = supabase.table('student_records_destination').select(
            'user_id, destination_type, school_name, school_city, school_state, '
            'school_district, registrar_name, registrar_email, registrar_phone, '
            'student_id_at_school, auto_send_consent'
        ).in_('user_id', ids).execute().data or []
        return {r['user_id']: r for r in rows}
    except Exception as e:  # noqa: BLE001
        logger.warning(f'records destination lookup failed for {len(ids)} kid(s): {e}')
        return {}


def enroll_registration_kids(reg, cfg, client=None):
    """Enroll a finished registration's students in Optio Academy.

    Called at funnel completion rather than at the family step, so a
    half-finished registration never leaves an Academy enrollment behind.
    Idempotent per student: re-entering completion (a retried payment webhook,
    a resumed funnel) adds nothing.

    Best-effort by design. A registration the family already paid for must not
    fail because an enrollment row did not write, so a miss is logged and can be
    fixed from the SIS; raising here would strand the family on the fee step
    with their money taken.

    Returns the number of students enrolled.
    """
    if (cfg or {}).get('academy_enrollment') is not True:
        return 0

    supabase = client or _admin()
    pathway = cfg.get('academy_pathway') or 'partner_credit'
    if pathway not in PATHWAYS:
        logger.error(f'org {str(reg.get("organization_id"))[:8]} has an unknown '
                     f'academy_pathway {pathway!r}; enrolling as partner_credit')
        pathway = 'partner_credit'

    # A per-student "grade_level" question, when the org asks one, answers in
    # the shape {question_key: {kid_user_id: value}}.
    grades = (reg.get('answers') or {}).get('grade_level')
    grades = grades if isinstance(grades, dict) else {}

    enrolled = 0
    for kid in (reg.get('kids') or []):
        kid_id = kid.get('user_id')
        if not kid_id:
            continue
        try:
            if enroll(kid_id, pathway,
                      partner_org_id=reg.get('organization_id'),
                      registration_id=reg.get('id'),
                      grade_level=grades.get(kid_id),
                      created_by=reg.get('parent_user_id'),
                      client=supabase):
                enrolled += 1
        except Exception as e:  # noqa: BLE001
            logger.error(f'academy enrollment failed for kid {str(kid_id)[:8]} '
                         f'on registration {reg.get("id")}: {e}')

    logger.info(f'{enrolled} student(s) enrolled in Optio Academy ({pathway}) '
                f'from registration {reg.get("id")}')
    return enrolled
