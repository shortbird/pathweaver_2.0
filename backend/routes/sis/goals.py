"""
SIS goal/direction setting — the post-registration step for goals-mode schools.

Some schools (e.g. Gryffin Learning Center) replace the Schedule Builder with a
goal-setting step: parents set a long-term direction (trade school, college...)
and per-subject year goals for each child, then review them in a meeting with
school staff.

Org config lives in organizations.feature_flags.sis_settings:
- post_registration_flow: 'goals' | 'schedule' (absent = 'schedule')
- goal_subjects: [subject names] (defaults below)
- school_year: 'YYYY-YYYY' (absent = computed from today's date)

NEW, additive (/api/sis/goals). Parent endpoints use @require_auth and authorize
by family relationship (parent_student_links or managed_by_parent_id); staff
endpoints are role-gated and org-scoped via sis_service.resolve_org_id.
"""

from datetime import datetime

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth, require_role
from utils.logger import get_logger
from utils.validation import sanitize_input
from services import sis_service
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_goals', __name__, url_prefix='/api/sis/goals')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')

DEFAULT_SUBJECTS = ['Math', 'Language Arts', 'Science', 'History', 'Life Skills']

# Ordering for the staff review queue: needs-attention first.
_STATUS_ORDER = {'submitted': 0, 'draft': 1, 'reviewed': 2}


def _now_iso():
    return datetime.utcnow().isoformat()


def _default_school_year(today=None):
    """'2026-2027' style. July onward rolls into the new school year."""
    today = today or datetime.utcnow()
    if today.month >= 7:
        return f"{today.year}-{today.year + 1}"
    return f"{today.year - 1}-{today.year}"


def _sis_settings(org_row):
    return ((org_row.get('feature_flags') or {}).get('sis_settings') or {})


def _goals_config(org_row):
    """(enabled, subjects, school_year) for an organization row."""
    settings = _sis_settings(org_row)
    enabled = settings.get('post_registration_flow') == 'goals'
    subjects = settings.get('goal_subjects') or DEFAULT_SUBJECTS
    school_year = settings.get('school_year') or _default_school_year()
    return enabled, subjects, school_year


def _full_name(u):
    name = (u.get('display_name') or
            f"{u.get('first_name') or ''} {u.get('last_name') or ''}").strip()
    return name or (u.get('username') or u.get('email') or 'Unnamed')


def _my_student_ids(admin, parent_id):
    """All students this caller parents: approved links + managed dependents."""
    ids = set()
    links = (admin.table('parent_student_links')
             .select('student_user_id')
             .eq('parent_user_id', parent_id)
             .eq('status', 'approved')
             .execute()).data or []
    ids.update(l['student_user_id'] for l in links)
    deps = (admin.table('users').select('id')
            .eq('managed_by_parent_id', parent_id)
            .eq('is_dependent', True)
            .execute()).data or []
    ids.update(d['id'] for d in deps)
    return list(ids)


def _is_my_student(admin, parent_id, student_id):
    return student_id in _my_student_ids(admin, parent_id)


def _sanitize_subjects(raw):
    """[{subject, year_goal, long_term}] with every string sanitized."""
    out = []
    if not isinstance(raw, list):
        return out
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        subject = sanitize_input(str(entry.get('subject') or ''))
        if not subject:
            continue
        out.append({
            'subject': subject,
            'year_goal': sanitize_input(str(entry.get('year_goal') or '')),
            'long_term': sanitize_input(str(entry.get('long_term') or '')),
        })
    return out


def _notify(user_ids, title, message, organization_id=None):
    """Best-effort in-app notification; never fails the request."""
    try:
        from services.notification_service import NotificationService
        service = NotificationService()
        for uid in user_ids:
            try:
                service.create_notification(
                    user_id=uid,
                    notification_type='announcement',
                    title=title,
                    message=message,
                    organization_id=organization_id,
                )
            except Exception as e:  # noqa: BLE001
                logger.warning(f'goals: notification to {str(uid)[:8]} failed: {e}')
    except Exception as e:  # noqa: BLE001
        logger.warning(f'goals: notification setup failed: {e}')


def _org_admin_ids(admin, org_id):
    rows = (admin.table('users').select('id, org_role, org_roles')
            .eq('organization_id', org_id).execute()).data or []
    return [u['id'] for u in rows
            if u.get('org_role') == 'org_admin'
            or (isinstance(u.get('org_roles'), list) and 'org_admin' in u['org_roles'])]


def _parent_ids_for_student(admin, student_id):
    ids = set()
    links = (admin.table('parent_student_links')
             .select('parent_user_id')
             .eq('student_user_id', student_id)
             .eq('status', 'approved')
             .execute()).data or []
    ids.update(l['parent_user_id'] for l in links)
    row = (admin.table('users').select('managed_by_parent_id')
           .eq('id', student_id).limit(1).execute()).data
    if row and row[0].get('managed_by_parent_id'):
        ids.add(row[0]['managed_by_parent_id'])
    return list(ids)


# ── Parent-facing ─────────────────────────────────────────────────────────────
@bp.route('/mine', methods=['GET'])
@require_auth
def my_goals(user_id):
    """The caller's students at goals-mode schools, each with the current
    school-year goal row (or null) and the org's goal-setting config."""
    admin = get_supabase_admin_client()
    student_ids = _my_student_ids(admin, user_id)
    if not student_ids:
        return jsonify({'success': True, 'students': []})

    students = (admin.table('users')
                .select('id, first_name, last_name, display_name, username, email, '
                        'avatar_url, organization_id')
                .in_('id', student_ids).execute()).data or []
    org_ids = list({s['organization_id'] for s in students if s.get('organization_id')})
    if not org_ids:
        return jsonify({'success': True, 'students': []})

    orgs = (admin.table('organizations')
            .select('id, name, feature_flags')
            .in_('id', org_ids).execute()).data or []
    goals_orgs = {}
    for org in orgs:
        enabled, subjects, school_year = _goals_config(org)
        if enabled:
            goals_orgs[org['id']] = {
                'subjects': subjects,
                'school_year': school_year,
                'organization_name': org.get('name'),
            }

    eligible = [s for s in students if s.get('organization_id') in goals_orgs]
    if not eligible:
        return jsonify({'success': True, 'students': []})

    goal_rows = (admin.table('sis_student_goals').select('*')
                 .in_('student_user_id', [s['id'] for s in eligible])
                 .execute()).data or []
    by_student = {}
    for g in goal_rows:
        cfg = goals_orgs.get(g.get('organization_id'))
        if cfg and g.get('school_year') == cfg['school_year']:
            by_student[g['student_user_id']] = g

    out = []
    for s in eligible:
        cfg = goals_orgs[s['organization_id']]
        out.append({
            'id': s['id'],
            'name': _full_name(s),
            'avatar_url': s.get('avatar_url'),
            'goal': by_student.get(s['id']),
            'config': cfg,
        })
    out.sort(key=lambda s: s['name'])
    return jsonify({'success': True, 'students': out})


@bp.route('/students/<student_id>', methods=['PUT'])
@require_auth
def save_goals(user_id, student_id):
    """Upsert this student's goals for the current school year.
    Body: {direction, direction_notes, subjects: [{subject, year_goal, long_term}],
    submit: bool}. submit=true sets status='submitted'; editing a reviewed row
    returns it to 'submitted' while preserving the review history fields."""
    admin = get_supabase_admin_client()
    if not _is_my_student(admin, user_id, student_id):
        return jsonify({'success': False, 'error': 'Not authorized for this student'}), 403

    student_rows = (admin.table('users')
                    .select('id, first_name, last_name, display_name, username, email, '
                            'organization_id')
                    .eq('id', student_id).limit(1).execute()).data
    if not student_rows or not student_rows[0].get('organization_id'):
        return jsonify({'success': False, 'error': 'Student is not part of a school'}), 400
    student = student_rows[0]
    org_id = student['organization_id']

    org_rows = (admin.table('organizations').select('id, name, feature_flags')
                .eq('id', org_id).limit(1).execute()).data
    if not org_rows:
        return jsonify({'success': False, 'error': 'School not found'}), 404
    enabled, _subjects, school_year = _goals_config(org_rows[0])
    if not enabled:
        return jsonify({'success': False,
                        'error': 'Goal setting is not enabled for this school'}), 400

    data = request.json or {}
    submit = bool(data.get('submit'))
    now = _now_iso()

    existing_rows = (admin.table('sis_student_goals').select('*')
                     .eq('organization_id', org_id)
                     .eq('student_user_id', student_id)
                     .eq('school_year', school_year)
                     .limit(1).execute()).data
    existing = existing_rows[0] if existing_rows else None

    payload = {
        'organization_id': org_id,
        'student_user_id': student_id,
        'school_year': school_year,
        'direction': sanitize_input(str(data.get('direction') or '')),
        'direction_notes': sanitize_input(str(data.get('direction_notes') or '')),
        'subjects': _sanitize_subjects(data.get('subjects')),
        'updated_at': now,
    }
    if submit:
        payload['status'] = 'submitted'
        payload['submitted_at'] = now
    elif existing and existing.get('status') == 'reviewed':
        # An edited reviewed row goes back into the review queue; the previous
        # review (reviewed_by / reviewed_at / review_notes) is kept as history.
        payload['status'] = 'submitted'
        payload['submitted_at'] = now
    elif existing:
        payload['status'] = existing.get('status') or 'draft'
    else:
        payload['status'] = 'draft'
        payload['created_by'] = user_id

    if existing:
        saved = (admin.table('sis_student_goals').update(payload)
                 .eq('id', existing['id']).execute()).data
    else:
        payload['created_by'] = user_id
        saved = (admin.table('sis_student_goals').insert(payload).execute()).data
    goal = saved[0] if saved else payload

    if submit:
        parent_rows = (admin.table('users')
                       .select('id, first_name, last_name, display_name, username, email')
                       .eq('id', user_id).limit(1).execute()).data
        parent_name = _full_name(parent_rows[0]) if parent_rows else 'A parent'
        _notify(
            _org_admin_ids(admin, org_id),
            'Goals submitted',
            f'{parent_name} submitted goals for {_full_name(student)}',
            organization_id=org_id,
        )

    return jsonify({'success': True, 'goal': goal})


# ── Staff-facing ──────────────────────────────────────────────────────────────
@bp.route('', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_goals(user_id):
    """Org goal rows (+ student name/avatar and parent name), submitted first,
    then draft, then reviewed; newest submitted_at first within each group.
    Filters: ?status=&school_year=."""
    requested = request.args.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400

    admin = get_supabase_admin_client()
    query = admin.table('sis_student_goals').select('*').eq('organization_id', org_id)
    status = request.args.get('status')
    if status:
        query = query.eq('status', status)
    school_year = request.args.get('school_year')
    if school_year:
        query = query.eq('school_year', school_year)
    rows = query.execute().data or []

    user_ids = list({r['student_user_id'] for r in rows} |
                    {r['created_by'] for r in rows if r.get('created_by')})
    users_by_id = {}
    if user_ids:
        users = (admin.table('users')
                 .select('id, first_name, last_name, display_name, username, email, avatar_url')
                 .in_('id', user_ids).execute()).data or []
        users_by_id = {u['id']: u for u in users}

    for r in rows:
        student = users_by_id.get(r['student_user_id']) or {}
        parent = users_by_id.get(r.get('created_by')) or {}
        r['student_name'] = _full_name(student) if student else 'Unknown student'
        r['student_avatar_url'] = student.get('avatar_url')
        r['parent_name'] = _full_name(parent) if parent else None

    # Newest first within each status group (stable sort keeps the date order).
    rows.sort(key=lambda r: (r.get('submitted_at') or r.get('updated_at') or ''), reverse=True)
    rows.sort(key=lambda r: _STATUS_ORDER.get(r.get('status'), 3))

    org_rows = (admin.table('organizations').select('id, name, feature_flags')
                .eq('id', org_id).limit(1).execute()).data
    _enabled, subjects, current_year = (_goals_config(org_rows[0])
                                        if org_rows else (False, DEFAULT_SUBJECTS,
                                                          _default_school_year()))
    school_years = sorted({r['school_year'] for r in rows if r.get('school_year')} |
                          {current_year}, reverse=True)
    return jsonify({
        'success': True,
        'goals': rows,
        'config': {'subjects': subjects, 'school_year': current_year,
                   'school_years': school_years},
    })


@bp.route('/<goal_id>/review', methods=['POST'])
@require_role(*STAFF_ROLES)
def review_goal(user_id, goal_id):
    """Mark a goal row reviewed (after the parent meeting), with optional notes."""
    requested = request.args.get('organization_id') or \
        (request.get_json(silent=True) or {}).get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400

    admin = get_supabase_admin_client()
    rows = (admin.table('sis_student_goals').select('*')
            .eq('id', goal_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return jsonify({'success': False, 'error': 'Goal record not found'}), 404
    goal = rows[0]

    data = request.json or {}
    now = _now_iso()
    saved = (admin.table('sis_student_goals').update({
        'status': 'reviewed',
        'reviewed_by': user_id,
        'reviewed_at': now,
        'review_notes': sanitize_input(str(data.get('review_notes') or '')),
        'updated_at': now,
    }).eq('id', goal_id).execute()).data

    student_rows = (admin.table('users')
                    .select('id, first_name, last_name, display_name, username, email')
                    .eq('id', goal['student_user_id']).limit(1).execute()).data
    student_name = _full_name(student_rows[0]) if student_rows else 'your student'
    _notify(
        _parent_ids_for_student(admin, goal['student_user_id']),
        'Goals reviewed',
        f"The school reviewed the goals you set for {student_name}.",
        organization_id=org_id,
    )
    return jsonify({'success': True, 'goal': saved[0] if saved else goal})
