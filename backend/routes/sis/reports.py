"""
SIS reporting routes — enrollment / revenue / attendance summaries, plus
"information reports" over iCreate registration data (medications, media
release, and generic answers-to-question-X reports).

NEW, additive (/api/sis/reports), staff-gated, org-scoped. (The roster CSV export
lives in routes/sis/__init__.py.)

Registration-answer shape (see routes/icreate_registration.py submit_details):
icreate_registrations.answers is keyed by question key. A value may be EITHER a
scalar / list (family-level answer) OR an object mapping kid user_id -> value
(per-student answer). Every report here handles both shapes defensively.
"""

import csv
import io

from flask import Blueprint, request, jsonify, Response

from database import get_supabase_admin_client
from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_reports_service as reports

logger = get_logger(__name__)

bp = Blueprint('sis_reports', __name__, url_prefix='/api/sis')

# Admin tier: this whole module is org management, not teacher-facing.
STAFF_ROLES = ('org_admin', 'superadmin')


def _org_or_error(user_id):
    requested = request.args.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


@bp.route('/reports/enrollment', methods=['GET'])
@require_role(*STAFF_ROLES)
def enrollment(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'report': reports.enrollment_report(org_id)})


@bp.route('/reports/revenue', methods=['GET'])
@require_role(*STAFF_ROLES)
def revenue(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'report': reports.revenue_report(org_id)})


@bp.route('/reports/attendance', methods=['GET'])
@require_role(*STAFF_ROLES)
def attendance(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'report': reports.attendance_report(org_id)})


# ── Information reports (registration data) ──────────────────────────────────

def _admin():
    return get_supabase_admin_client()


def _csv_response(filename, header, rows):
    """Same CSV response pattern as roster.csv in routes/sis/__init__.py."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    for r in rows:
        writer.writerow(r)
    return Response(
        buf.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename={filename}'},
    )


def _org_flags(org_id):
    r = (_admin().table('organizations').select('feature_flags')
         .eq('id', org_id).single().execute())
    return (r.data or {}).get('feature_flags') or {}


def _configured_questions(flags):
    """The org's registration questions from feature_flags.icreate_registration."""
    cfg = flags.get('icreate_registration') or {}
    out = []
    for q in (cfg.get('questions') or []):
        if q.get('key') and q.get('label'):
            out.append({
                'key': q['key'], 'label': q['label'],
                'type': q.get('type') or 'select',
                'options': q.get('options') or [],
                'required': bool(q.get('required')),
                'per_student': bool(q.get('per_student')),
            })
    return out


def _latest_registrations(org_id):
    """One registration per parent: their LATEST completed one, or — if the
    parent has never completed — their latest in-progress row (kept so those
    families still show up, flagged via the status column)."""
    rows = (_admin().table('icreate_registrations')
            .select('id, parent_user_id, status, kids, answers, '
                    'emergency_contacts, created_at, updated_at, completed_at')
            .eq('organization_id', org_id)
            .order('updated_at', desc=True)
            .execute()).data or []
    by_parent = {}
    for r in rows:  # newest-first, so the first completed row seen is the latest
        pid = r.get('parent_user_id')
        if not pid:
            continue
        cur = by_parent.get(pid)
        if cur is None:
            by_parent[pid] = r
        elif r.get('status') == 'completed' and cur.get('status') != 'completed':
            by_parent[pid] = r
    return list(by_parent.values())


def _users_by_id(user_ids):
    ids = [u for u in set(user_ids) if u]
    if not ids:
        return {}
    rows = (_admin().table('users')
            .select('id, first_name, last_name, display_name, email, medications, allergies')
            .in_('id', ids).execute()).data or []
    return {u['id']: u for u in rows}


def _user_name(u, fallback=''):
    if not u:
        return fallback
    name = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
    return name or u.get('display_name') or fallback


def _household_by_user(org_id):
    """user_id -> {name, phone} for everyone in an org household."""
    admin = _admin()
    hhs = (admin.table('households').select('id, name, phone')
           .eq('organization_id', org_id).execute()).data or []
    if not hhs:
        return {}
    hh_by_id = {h['id']: h for h in hhs}
    members = (admin.table('household_members').select('household_id, user_id')
               .in_('household_id', list(hh_by_id.keys())).execute()).data or []
    return {m['user_id']: hh_by_id[m['household_id']]
            for m in members if m.get('household_id') in hh_by_id}


def _fmt_answer(val):
    """Render a stored answer value for display; lists join with '; '."""
    if val is None:
        return ''
    if isinstance(val, (list, tuple)):
        return '; '.join(str(v) for v in val if str(v).strip())
    if isinstance(val, dict):
        # A per-student map rendered without a kid context — join its values.
        return '; '.join(_fmt_answer(v) for v in val.values() if _fmt_answer(v))
    return str(val).strip()


def _answer_for_kid(answers, key, kid_user_id):
    """The answer for one kid — unwraps per-student {kid_user_id: value} maps,
    otherwise returns the family-level value (which applies to every kid)."""
    val = (answers or {}).get(key)
    if isinstance(val, dict):
        return _fmt_answer(val.get(kid_user_id))
    return _fmt_answer(val)


def _first_emergency_contact(org_id, kid_ids):
    """kid user_id -> formatted first emergency contact (lowest priority number)."""
    ids = [k for k in set(kid_ids) if k]
    if not ids:
        return {}
    rows = (_admin().table('emergency_contacts')
            .select('student_user_id, name, relationship, phone, priority')
            .in_('student_user_id', ids)
            .order('priority', desc=False)
            .execute()).data or []
    out = {}
    for c in rows:
        sid = c.get('student_user_id')
        if sid in out:
            continue
        parts = [c.get('name') or '']
        if c.get('relationship'):
            parts.append(f"({c['relationship']})")
        if c.get('phone'):
            parts.append(c['phone'])
        out[sid] = ' '.join(p for p in parts if p)
    return out


def _reg_context(org_id):
    """Shared assembly for the information reports: deduped registrations plus
    parent users, kid users, and household lookups."""
    regs = _latest_registrations(org_id)
    parent_ids = [r.get('parent_user_id') for r in regs]
    kid_ids = [k.get('user_id') for r in regs for k in (r.get('kids') or [])]
    users = _users_by_id(parent_ids + kid_ids)
    households = _household_by_user(org_id)
    return regs, users, households


def _kid_name(kid, users):
    return _user_name(users.get(kid.get('user_id')), fallback=(kid.get('name') or ''))


@bp.route('/reports/registration-questions', methods=['GET'])
@require_role(*STAFF_ROLES)
def registration_questions(user_id):
    """The org's configured registration questions, so the UI can offer a
    question picker for the generic answers report."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    questions = _configured_questions(_org_flags(org_id))
    return jsonify({'success': True, 'questions': questions})


# Values that mean "nothing to report" — a report should show only the
# students/families it is actually about, so these are treated as no answer.
_BLANK_VALUES = {'', 'none', 'no', 'n/a', 'na', 'n.a.', 'n.a', 'nope', 'nan',
                 'null', '-', '--', 'none.', 'no.', 'not applicable'}


def _has_value(v) -> bool:
    """True when v is a real, non-empty, non-'none' answer."""
    if v is None:
        return False
    if isinstance(v, (list, tuple, set)):
        return any(_has_value(x) for x in v)
    if isinstance(v, dict):
        return any(_has_value(x) for x in v.values())
    return str(v).strip().lower() not in _BLANK_VALUES


@bp.route('/reports/registration-answers', methods=['GET'])
@require_role(*STAFF_ROLES)
def registration_answers(user_id):
    """Generic report: every family's (or student's) answer to one question."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    question_key = (request.args.get('question_key') or '').strip()
    if not question_key:
        return jsonify({'success': False, 'error': 'question_key is required'}), 400

    questions = _configured_questions(_org_flags(org_id))
    q_cfg = next((q for q in questions if q['key'] == question_key), None)
    label = q_cfg['label'] if q_cfg else question_key

    regs, users, households = _reg_context(org_id)
    rows = []
    for reg in regs:
        answers = reg.get('answers') or {}
        kids = reg.get('kids') or []
        val = answers.get(question_key)
        parent = users.get(reg.get('parent_user_id')) or {}
        parent_name = _user_name(parent)
        parent_email = parent.get('email') or ''
        family = (households.get(reg.get('parent_user_id')) or {}).get('name') or ''
        status = reg.get('status') or ''
        # Per-student when stored as a kid map OR configured per_student.
        if isinstance(val, dict) or (q_cfg and q_cfg['per_student']):
            for kid in kids:
                rows.append({
                    'student': _kid_name(kid, users),
                    'family': family,
                    'parent': parent_name,
                    'parent_email': parent_email,
                    'answer': _answer_for_kid(answers, question_key, kid.get('user_id')),
                    'status': status,
                })
        else:
            rows.append({
                'student': '; '.join(_kid_name(k, users) for k in kids),
                'family': family,
                'parent': parent_name,
                'parent_email': parent_email,
                'answer': _fmt_answer(val),
                'status': status,
            })
    # Only families/students who actually answered — an empty or "none" answer
    # isn't relevant to a per-question report.
    rows = [r for r in rows if _has_value(r['answer'])]
    rows.sort(key=lambda r: (r['student'] or '').lower())

    if request.args.get('format') == 'csv':
        return _csv_response(
            f'registration-answers-{question_key}.csv',
            ['Student', 'Family', 'Parent', 'Parent Email', 'Answer', 'Registration Status'],
            [[r['student'], r['family'], r['parent'], r['parent_email'],
              r['answer'], r['status']] for r in rows])
    return jsonify({'success': True, 'report': {
        'question': {'key': question_key, 'label': label,
                     'per_student': bool(q_cfg and q_cfg['per_student'])},
        'rows': rows,
    }})


@bp.route('/reports/medications', methods=['GET'])
@require_role(*STAFF_ROLES)
def medications(user_id):
    """Canned report: every kid with medications — from the registration kids[]
    entry, the synced users.medications column, or any answer whose question key
    contains 'medication' (per-student or family-level)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    questions = _configured_questions(_org_flags(org_id))
    regs, users, households = _reg_context(org_id)

    # Question keys that look medication-related: configured ones plus any keys
    # present in stored answers (covers questions later removed from config).
    med_keys = {q['key']: q['label'] for q in questions if 'medication' in q['key'].lower()}
    for reg in regs:
        for key in (reg.get('answers') or {}):
            if 'medication' in key.lower() and key not in med_keys:
                med_keys[key] = key

    all_kid_ids = [k.get('user_id') for r in regs for k in (r.get('kids') or [])]
    contact1 = _first_emergency_contact(org_id, all_kid_ids)

    rows, seen_kid_ids = [], set()
    for reg in regs:
        answers = reg.get('answers') or {}
        parent = users.get(reg.get('parent_user_id')) or {}
        parent_name = _user_name(parent)
        household = households.get(reg.get('parent_user_id')) or {}
        reg_contacts = reg.get('emergency_contacts') or []
        reg_contact1 = ''
        if reg_contacts:
            c = reg_contacts[0]
            reg_contact1 = ' '.join(p for p in [
                c.get('name') or '',
                f"({c['relationship']})" if c.get('relationship') else '',
                c.get('phone') or ''] if p)
        for kid in (reg.get('kids') or []):
            kid_id = kid.get('user_id')
            kid_user = users.get(kid_id) or {}
            meds = (kid.get('medications') or kid_user.get('medications') or '').strip()
            if not _has_value(meds):
                meds = ''
            notes = []
            for key, label in med_keys.items():
                v = _answer_for_kid(answers, key, kid_id)
                if _has_value(v):
                    notes.append(f'{label}: {v}')
            if not meds and not notes:
                continue
            if kid_id:
                seen_kid_ids.add(kid_id)
            rows.append({
                'student': _kid_name(kid, users),
                'medications': meds,
                'notes': '; '.join(notes),
                'parent': parent_name,
                'parent_phone': (households.get(kid_id) or household).get('phone') or '',
                'emergency_contact': contact1.get(kid_id) or reg_contact1,
            })

    # Defensive union: org students with staff-entered medications on their
    # user record but no (deduped) registration row covering them.
    try:
        extras = [s for s in sis_service.get_roster(org_id)
                  if s.get('is_student') and s['student_id'] not in seen_kid_ids
                  and _has_value(s.get('medications'))]
        extra_contacts = _first_emergency_contact(org_id, [s['student_id'] for s in extras])
        for s in extras:
            hh = households.get(s['student_id']) or {}
            rows.append({
                'student': s['name'], 'medications': (s.get('medications') or '').strip(),
                'notes': '', 'parent': '', 'parent_phone': hh.get('phone') or '',
                'emergency_contact': extra_contacts.get(s['student_id']) or '',
            })
    except Exception as e:  # noqa: BLE001
        logger.warning(f'medications report: roster union failed: {e}')

    rows.sort(key=lambda r: (r['student'] or '').lower())
    if request.args.get('format') == 'csv':
        return _csv_response(
            'medications.csv',
            ['Student', 'Medications', 'Schedule / Notes', 'Parent',
             'Parent Phone', 'Emergency Contact 1'],
            [[r['student'], r['medications'], r['notes'], r['parent'],
              r['parent_phone'], r['emergency_contact']] for r in rows])
    return jsonify({'success': True, 'report': {'rows': rows}})


@bp.route('/reports/allergies', methods=['GET'])
@require_role(*STAFF_ROLES)
def allergies(user_id):
    """Canned report: every kid with a recorded allergy — from the registration
    kids[] entry, the synced users.allergies column, or any answer whose question
    key contains 'allerg'. Only students who actually have an allergy are listed."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    questions = _configured_questions(_org_flags(org_id))
    regs, users, households = _reg_context(org_id)

    allergy_keys = {q['key']: q['label'] for q in questions if 'allerg' in q['key'].lower()}
    for reg in regs:
        for key in (reg.get('answers') or {}):
            if 'allerg' in key.lower() and key not in allergy_keys:
                allergy_keys[key] = key

    all_kid_ids = [k.get('user_id') for r in regs for k in (r.get('kids') or [])]
    contact1 = _first_emergency_contact(org_id, all_kid_ids)

    rows, seen_kid_ids = [], set()
    for reg in regs:
        answers = reg.get('answers') or {}
        parent = users.get(reg.get('parent_user_id')) or {}
        parent_name = _user_name(parent)
        household = households.get(reg.get('parent_user_id')) or {}
        for kid in (reg.get('kids') or []):
            kid_id = kid.get('user_id')
            kid_user = users.get(kid_id) or {}
            allergy = (kid.get('allergies') or kid_user.get('allergies') or '').strip()
            if not _has_value(allergy):
                allergy = ''
            notes = []
            for key, label in allergy_keys.items():
                v = _answer_for_kid(answers, key, kid_id)
                if _has_value(v):
                    notes.append(f'{label}: {v}')
            if not allergy and not notes:
                continue
            if kid_id:
                seen_kid_ids.add(kid_id)
            rows.append({
                'student': _kid_name(kid, users),
                'allergies': allergy,
                'notes': '; '.join(notes),
                'parent': parent_name,
                'parent_phone': (households.get(kid_id) or household).get('phone') or '',
                'emergency_contact': contact1.get(kid_id) or '',
            })

    # Union: org students with a staff-entered allergy but no registration row.
    try:
        extras = [s for s in sis_service.get_roster(org_id)
                  if s.get('is_student') and s['student_id'] not in seen_kid_ids
                  and _has_value(s.get('allergies'))]
        extra_contacts = _first_emergency_contact(org_id, [s['student_id'] for s in extras])
        for s in extras:
            hh = households.get(s['student_id']) or {}
            rows.append({
                'student': s['name'], 'allergies': (s.get('allergies') or '').strip(),
                'notes': '', 'parent': '', 'parent_phone': hh.get('phone') or '',
                'emergency_contact': extra_contacts.get(s['student_id']) or '',
            })
    except Exception as e:  # noqa: BLE001
        logger.warning(f'allergies report: roster union failed: {e}')

    rows.sort(key=lambda r: (r['student'] or '').lower())
    if request.args.get('format') == 'csv':
        return _csv_response(
            'allergies.csv',
            ['Student', 'Allergies', 'Notes', 'Parent', 'Parent Phone', 'Emergency Contact 1'],
            [[r['student'], r['allergies'], r['notes'], r['parent'],
              r['parent_phone'], r['emergency_contact']] for r in rows])
    return jsonify({'success': True, 'report': {'rows': rows}})


@bp.route('/reports/daily-attendance', methods=['GET'])
@require_role(*STAFF_ROLES)
def daily_attendance(user_id):
    """Who was absent (excused vs unexcused) on one day, across all classes —
    matches guardian-reported absences against what teachers marked so staff can
    see at a glance who is missing and whether it was excused. ?date=YYYY-MM-DD
    (defaults to today)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    from datetime import date
    on_date = request.args.get('date') or date.today().isoformat()
    from services import sis_attendance_service as attendance
    rows = attendance.daily_report(org_id, on_date)
    if request.args.get('format') == 'csv':
        return _csv_response(
            f'daily-attendance-{on_date}.csv',
            ['Student', 'Class', 'Status', 'Excused?', 'Reason'],
            [[r['student'], r['class'], r['status'], r['excused'], r['reason']] for r in rows])
    return jsonify({'success': True, 'report': {'rows': rows, 'date': on_date}})


@bp.route('/reports/media-release', methods=['GET'])
@require_role(*STAFF_ROLES)
def media_release(user_id):
    """Canned report: per student, the answers to media/photo-release questions.
    Matching keys come from feature_flags.sis_settings.report_question_map
    {media_release: [keys]} when set, else any question key containing 'media'
    or 'photo'. Students with no answer show as 'Not answered'."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    flags = _org_flags(org_id)
    questions = _configured_questions(flags)
    labels = {q['key']: q['label'] for q in questions}

    mapped = ((flags.get('sis_settings') or {})
              .get('report_question_map') or {}).get('media_release') or []
    if mapped:
        matched_keys = [k for k in mapped if k]
    else:
        matched_keys = [q['key'] for q in questions
                        if 'media' in q['key'].lower() or 'photo' in q['key'].lower()]

    regs, users, households = _reg_context(org_id)
    if not matched_keys:
        # Last resort: scan stored answers for media/photo keys.
        seen = set()
        for reg in regs:
            for key in (reg.get('answers') or {}):
                if ('media' in key.lower() or 'photo' in key.lower()) and key not in seen:
                    seen.add(key)
        matched_keys = sorted(seen)

    matched = [{'key': k, 'label': labels.get(k, k)} for k in matched_keys]

    # Map each kid to their family's registration.
    reg_by_kid = {}
    for reg in regs:
        for kid in (reg.get('kids') or []):
            if kid.get('user_id'):
                reg_by_kid[kid['user_id']] = reg

    rows = []
    for s in sis_service.get_roster(org_id):
        if not s.get('is_student'):
            continue
        reg = reg_by_kid.get(s['student_id'])
        parent = users.get((reg or {}).get('parent_user_id')) or {}
        answers = {}
        for q in matched:
            v = _answer_for_kid((reg or {}).get('answers'), q['key'], s['student_id']) if reg else ''
            answers[q['key']] = v or 'Not answered'
        rows.append({
            'student': s['name'],
            'family': s.get('household_name') or '',
            'answers': answers,
            'parent': _user_name(parent),
        })
    rows.sort(key=lambda r: (r['student'] or '').lower())

    if request.args.get('format') == 'csv':
        return _csv_response(
            'media-release.csv',
            ['Student', 'Family'] + [q['label'] for q in matched] + ['Parent'],
            [[r['student'], r['family']] + [r['answers'][q['key']] for q in matched]
             + [r['parent']] for r in rows])
    return jsonify({'success': True, 'report': {'questions': matched, 'rows': rows}})
