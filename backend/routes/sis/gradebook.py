"""
SIS gradebook-lite routes — assignment/score tracking per student per class.

Replaces microschool Google-Sheets gradebooks (e.g. CLE workbook sequences:
"Workbook 101 - Quiz 1 / Quiz 2 / Corrections / Test" with scheduled/completed
dates, scores, notes, and a running average per student).

Scores are an SIS record-keeping concern only — they never touch the XP/quest
model. NEW, additive (/api/sis/gradebook), staff-gated, org-scoped; advisors
are confined to their own classes via sis_service.class_scope.
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from repositories.sis_class_repository import SisClassRepository
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_gradebook', __name__, url_prefix='/api/sis/gradebook')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')

ASSIGNMENT_FIELDS = ('name', 'sort_order', 'date_scheduled', 'date_completed',
                     'score', 'max_score', 'notes')


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _org_or_error(user_id):
    """Resolve the org for this request or return (None, error_response)."""
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


def _class_in_org(org_id, class_id):
    cls = SisClassRepository(client=_admin()).find_by_id(class_id)
    return bool(cls and cls.get('organization_id') == org_id)


def _class_allowed(user_id, org_id, class_id):
    """True when the class belongs to the org AND the caller may touch it
    (admins: any class in the org; advisors: only their own classes)."""
    if not class_id or not _class_in_org(org_id, class_id):
        return False
    scope = sis_service.class_scope(user_id, org_id)
    return scope is None or class_id in scope


def _clean_items(items):
    """Normalize template items to [{name, sort_order}]. Returns None when invalid."""
    if not isinstance(items, list):
        return None
    out = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            return None
        name = str(item.get('name') or '').strip()
        if not name:
            return None
        try:
            sort_order = int(item.get('sort_order', i))
        except (TypeError, ValueError):
            sort_order = i
        out.append({'name': name, 'sort_order': sort_order})
    return out


def _num_or_none(value, field):
    """Parse an optional numeric field; raises ValueError with a message."""
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f'{field} must be a number')


def _row_percent(row):
    """The value a row contributes to the student's running average.

    Convention: when both score and max_score are present (max_score != 0),
    the row counts as score/max_score*100 (a percentage). When max_score is
    null, the raw score is used as-is (sheets that already track percentages).
    Rows with no score are excluded entirely.
    """
    score = row.get('score')
    if score is None:
        return None
    max_score = row.get('max_score')
    try:
        score = float(score)
        if max_score is not None and float(max_score) != 0:
            return score / float(max_score) * 100
        return score
    except (TypeError, ValueError):
        return None


def _average(rows):
    vals = [v for v in (_row_percent(r) for r in rows) if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def _student_name(u):
    return ((u.get('display_name')
             or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
             or u.get('username') or u.get('email') or 'Unnamed'))


# ── Templates (assignment sequences) ─────────────────────────────────────────
@bp.route('/templates', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_templates(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    class_id = request.args.get('class_id')
    scope = sis_service.class_scope(user_id, org_id)
    if class_id:
        if scope is not None and class_id not in scope:
            return jsonify({'success': False, 'error': 'Class not found'}), 404
        if not _class_in_org(org_id, class_id):
            return jsonify({'success': False, 'error': 'Class not found'}), 404
    query = _admin().table('sis_assignment_templates').select('*').eq('organization_id', org_id)
    rows = (query.order('name').execute()).data or []
    if class_id:
        # Class-specific templates plus org-wide (class_id null) ones.
        rows = [r for r in rows if r.get('class_id') in (class_id, None)]
    elif scope is not None:
        rows = [r for r in rows if r.get('class_id') is None or r.get('class_id') in scope]
    return jsonify({'success': True, 'templates': rows})


@bp.route('/templates', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_template(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    name = str(data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Template name is required'}), 400
    items = _clean_items(data.get('items') or [])
    if items is None:
        return jsonify({'success': False, 'error': 'items must be a list of {name, sort_order}'}), 400
    class_id = data.get('class_id') or None
    scope = sis_service.class_scope(user_id, org_id)
    if class_id:
        if not _class_allowed(user_id, org_id, class_id):
            return jsonify({'success': False, 'error': 'Class not found'}), 404
    elif scope is not None:
        # Advisors must attach templates to one of their classes.
        return jsonify({'success': False, 'error': 'class_id is required'}), 400
    row = (_admin().table('sis_assignment_templates').insert({
        'organization_id': org_id,
        'class_id': class_id,
        'name': name,
        'items': items,
        'created_by': user_id,
    }).execute()).data
    return jsonify({'success': True, 'template': row[0] if row else None}), 201


def _template_or_error(user_id, org_id, template_id):
    rows = (_admin().table('sis_assignment_templates').select('*')
            .eq('id', template_id).limit(1).execute()).data or []
    tpl = rows[0] if rows else None
    if not tpl or tpl.get('organization_id') != org_id:
        return None, (jsonify({'success': False, 'error': 'Template not found'}), 404)
    scope = sis_service.class_scope(user_id, org_id)
    if scope is not None and tpl.get('class_id') is not None and tpl['class_id'] not in scope:
        return None, (jsonify({'success': False, 'error': 'Template not found'}), 404)
    return tpl, None


@bp.route('/templates/<template_id>', methods=['PUT'])
@require_role(*STAFF_ROLES)
def update_template(user_id, template_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    tpl, err = _template_or_error(user_id, org_id, template_id)
    if err:
        return err
    data = request.get_json() or {}
    fields = {'updated_at': _now()}
    if 'name' in data:
        name = str(data.get('name') or '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'Template name is required'}), 400
        fields['name'] = name
    if 'items' in data:
        items = _clean_items(data.get('items'))
        if items is None:
            return jsonify({'success': False, 'error': 'items must be a list of {name, sort_order}'}), 400
        fields['items'] = items
    if 'class_id' in data:
        class_id = data.get('class_id') or None
        if class_id and not _class_allowed(user_id, org_id, class_id):
            return jsonify({'success': False, 'error': 'Class not found'}), 404
        if class_id is None and sis_service.class_scope(user_id, org_id) is not None:
            return jsonify({'success': False, 'error': 'class_id is required'}), 400
        fields['class_id'] = class_id
    updated = (_admin().table('sis_assignment_templates').update(fields)
               .eq('id', template_id).execute()).data
    return jsonify({'success': True, 'template': updated[0] if updated else None})


@bp.route('/templates/<template_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_template(user_id, template_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    _tpl, err = _template_or_error(user_id, org_id, template_id)
    if err:
        return err
    _admin().table('sis_assignment_templates').delete().eq('id', template_id).execute()
    return jsonify({'success': True})


@bp.route('/templates/<template_id>/apply', methods=['POST'])
@require_role(*STAFF_ROLES)
def apply_template(user_id, template_id):
    """Stamp the template's items as sis_student_assignments rows for each
    student in student_ids. Rows where the same (student, class, name) already
    exists are skipped so re-applying is idempotent."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    tpl, err = _template_or_error(user_id, org_id, template_id)
    if err:
        return err
    data = request.get_json() or {}
    student_ids = data.get('student_ids')
    class_id = data.get('class_id') or tpl.get('class_id')
    if not isinstance(student_ids, list) or not student_ids:
        return jsonify({'success': False, 'error': 'student_ids (list) is required'}), 400
    if not class_id or not _class_allowed(user_id, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    items = _clean_items(tpl.get('items') or [])
    if not items:
        return jsonify({'success': False, 'error': 'Template has no items'}), 400

    existing = (_admin().table('sis_student_assignments')
                .select('student_user_id, name')
                .eq('organization_id', org_id).eq('class_id', class_id)
                .in_('student_user_id', student_ids).execute()).data or []
    existing_keys = {(r['student_user_id'], r['name']) for r in existing}

    payload = []
    for sid in student_ids:
        for item in items:
            if (sid, item['name']) in existing_keys:
                continue
            payload.append({
                'organization_id': org_id,
                'class_id': class_id,
                'student_user_id': sid,
                'name': item['name'],
                'sort_order': item['sort_order'],
                'created_by': user_id,
            })
    created = 0
    if payload:
        created = len((_admin().table('sis_student_assignments')
                       .insert(payload).execute()).data or [])
    return jsonify({'success': True, 'created': created,
                    'skipped': len(student_ids) * len(items) - len(payload)})


# ── Class gradebook (rows grouped by student) ────────────────────────────────
@bp.route('/classes/<class_id>', methods=['GET'])
@require_role(*STAFF_ROLES)
def class_gradebook(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not _class_allowed(user_id, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404

    rows = (_admin().table('sis_student_assignments').select('*')
            .eq('organization_id', org_id).eq('class_id', class_id)
            .order('sort_order').order('created_at').execute()).data or []

    # Roster: active enrollments + user profile (name, avatar). Students with
    # gradebook rows but no active enrollment still appear (dropped students
    # keep their record visible).
    enrolled = (_admin().table('class_enrollments').select('student_id')
                .eq('class_id', class_id).eq('status', 'active').execute()).data or []
    student_ids = list(dict.fromkeys(
        [e['student_id'] for e in enrolled] + [r['student_user_id'] for r in rows]))
    users = []
    if student_ids:
        users = (_admin().table('users')
                 .select('id, display_name, first_name, last_name, username, email, avatar_url')
                 .in_('id', student_ids).execute()).data or []
    profile = {u['id']: u for u in users}

    by_student = {sid: [] for sid in student_ids}
    for r in rows:
        by_student.setdefault(r['student_user_id'], []).append(r)

    students = []
    for sid in student_ids:
        u = profile.get(sid, {})
        assignments = by_student.get(sid, [])
        students.append({
            'student_user_id': sid,
            'name': _student_name(u),
            'avatar_url': u.get('avatar_url'),
            'average': _average(assignments),
            'assignments': assignments,
        })
    students.sort(key=lambda s: s['name'].lower())
    return jsonify({'success': True, 'students': students})


# ── Individual assignment rows ───────────────────────────────────────────────
@bp.route('/assignments', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_assignment(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json() or {}
    class_id = data.get('class_id')
    student_id = data.get('student_user_id')
    name = str(data.get('name') or '').strip()
    if not student_id or not name:
        return jsonify({'success': False, 'error': 'student_user_id and name are required'}), 400
    if not class_id or not _class_allowed(user_id, org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    fields = {
        'organization_id': org_id,
        'class_id': class_id,
        'student_user_id': student_id,
        'name': name,
        'created_by': user_id,
    }
    try:
        for k in ('score', 'max_score'):
            if k in data:
                fields[k] = _num_or_none(data.get(k), k)
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    for k in ('sort_order', 'date_scheduled', 'date_completed', 'notes'):
        if data.get(k) is not None:
            fields[k] = data[k]
    row = (_admin().table('sis_student_assignments').insert(fields).execute()).data
    return jsonify({'success': True, 'assignment': row[0] if row else None}), 201


def _assignment_or_error(user_id, org_id, assignment_id):
    rows = (_admin().table('sis_student_assignments').select('*')
            .eq('id', assignment_id).limit(1).execute()).data or []
    row = rows[0] if rows else None
    if not row or row.get('organization_id') != org_id:
        return None, (jsonify({'success': False, 'error': 'Assignment not found'}), 404)
    scope = sis_service.class_scope(user_id, org_id)
    if scope is not None and row.get('class_id') not in scope:
        return None, (jsonify({'success': False, 'error': 'Assignment not found'}), 404)
    return row, None


@bp.route('/assignments/<assignment_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_assignment(user_id, assignment_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    _row, err = _assignment_or_error(user_id, org_id, assignment_id)
    if err:
        return err
    data = request.get_json() or {}
    fields = {'updated_at': _now()}
    try:
        for k in ASSIGNMENT_FIELDS:
            if k not in data:
                continue
            if k == 'name':
                name = str(data.get('name') or '').strip()
                if not name:
                    return jsonify({'success': False, 'error': 'name cannot be empty'}), 400
                fields['name'] = name
            elif k in ('score', 'max_score'):
                fields[k] = _num_or_none(data.get(k), k)
            elif k == 'sort_order':
                fields[k] = int(data[k]) if data.get(k) is not None else None
            else:  # dates + notes: pass through, '' clears to null
                fields[k] = data.get(k) or None
    except (TypeError, ValueError) as e:
        return jsonify({'success': False, 'error': str(e) or 'Invalid value'}), 400
    updated = (_admin().table('sis_student_assignments').update(fields)
               .eq('id', assignment_id).execute()).data
    return jsonify({'success': True, 'assignment': updated[0] if updated else None})


@bp.route('/assignments/<assignment_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_assignment(user_id, assignment_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    _row, err = _assignment_or_error(user_id, org_id, assignment_id)
    if err:
        return err
    _admin().table('sis_student_assignments').delete().eq('id', assignment_id).execute()
    return jsonify({'success': True})
