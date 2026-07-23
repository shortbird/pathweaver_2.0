"""
SIS student records — structured per-student record + curriculum materials.

Replaces the per-student Google Sheet a microschool keeps today: profile facts
(preferred name, hobbies/interests, notes such as allergies-adjacent info,
social-media permissions, carpools), beginning-of-year vs end-of-year
assessments (e.g. "Math CLE Book"), and a curriculum materials checklist with
Paid/Received checkboxes.

NEW, additive (/api/sis), staff-gated, org-scoped; advisors are confined to
students enrolled in their own classes via sis_service.class_scope. The one
parent endpoint uses @require_auth and authorizes by family relationship
(approved parent_student_links row or users.managed_by_parent_id), mirroring
routes/sis/goals.py — read-only, and it additionally folds in a per-class
scores summary from sis_student_assignments.

Assessment field definitions come from
organizations.feature_flags.sis_settings.assessment_fields = [{key, label}].
assessments jsonb shape: {key: {boy: 'value', eoy: 'value'}}.
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth, require_role
from utils.logger import get_logger
from utils.validation import sanitize_input
from services import sis_service
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_student_records', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')

DEFAULT_ASSESSMENT_FIELDS = [
    {'key': 'math_cle', 'label': 'Math CLE Book'},
    {'key': 'la_cle', 'label': 'LA CLE Book'},
    {'key': 'addition_facts', 'label': 'Addition Facts'},
]

MATERIAL_FIELDS = ('item_name', 'paid', 'received', 'notes', 'sort_order')


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


def _assessment_fields(org_id):
    """Org-configured assessment field definitions, defaulting to the CLE set."""
    row = (_admin().table('organizations').select('feature_flags')
           .eq('id', org_id).limit(1).execute()).data or []
    flags = (row[0].get('feature_flags') or {}) if row else {}
    fields = (flags.get('sis_settings') or {}).get('assessment_fields')
    if not isinstance(fields, list):
        return DEFAULT_ASSESSMENT_FIELDS
    out = []
    for f in fields:
        if isinstance(f, dict) and f.get('key') and f.get('label'):
            out.append({'key': str(f['key']), 'label': str(f['label'])})
    return out or DEFAULT_ASSESSMENT_FIELDS


def _student_in_org(org_id, student_id):
    """The student's user row when they belong to this org, else None."""
    rows = (_admin().table('users')
            .select('id, organization_id, display_name, first_name, last_name, '
                    'username, email, preferred_name, date_of_birth, avatar_url')
            .eq('id', student_id).limit(1).execute()).data or []
    u = rows[0] if rows else None
    return u if u and u.get('organization_id') == org_id else None


def _student_name(u):
    return (u.get('display_name')
            or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
            or u.get('username') or u.get('email') or 'Unnamed')


def _grade_level(org_id, student_id):
    rows = (_admin().table('school_enrollments').select('grade_level')
            .eq('organization_id', org_id).eq('student_user_id', student_id)
            .limit(1).execute()).data or []
    return rows[0].get('grade_level') if rows else None


def _staff_scope_allows(user_id, org_id, student_id):
    """Admins/superadmins: whole org. Advisors: only students enrolled in one
    of their classes (via sis_service.class_scope)."""
    scope = sis_service.class_scope(user_id, org_id)
    if scope is None:
        return True
    if not scope:
        return False
    enrolled = (_admin().table('class_enrollments').select('id')
                .eq('student_id', student_id).in_('class_id', scope)
                .eq('status', 'active').limit(1).execute()).data or []
    return bool(enrolled)


def _get_record_row(org_id, student_id):
    rows = (_admin().table('sis_student_records').select('*')
            .eq('organization_id', org_id).eq('student_user_id', student_id)
            .limit(1).execute()).data or []
    return rows[0] if rows else None


def _list_materials(org_id, student_id):
    return (_admin().table('sis_student_materials').select('*')
            .eq('organization_id', org_id).eq('student_user_id', student_id)
            .order('sort_order').order('created_at').execute()).data or []


def _sanitize_profile(raw):
    """Sanitize a jsonb profile dict: string keys, string values cleaned.
    Non-dict input returns None (invalid). Unknown keys are kept so extra
    columns a school tracks (carpool, social-media permission…) survive."""
    if not isinstance(raw, dict):
        return None
    out = {}
    for k, v in raw.items():
        key = sanitize_input(str(k))[:100]
        if not key:
            continue
        if isinstance(v, str):
            out[key] = sanitize_input(v)
        elif isinstance(v, (int, float, bool)) or v is None:
            out[key] = v
        else:
            out[key] = sanitize_input(str(v))
    return out


def _sanitize_assessments(raw):
    """Sanitize {key: {boy, eoy}}. Non-dict input returns None (invalid)."""
    if not isinstance(raw, dict):
        return None
    out = {}
    for k, v in raw.items():
        key = sanitize_input(str(k))[:100]
        if not key:
            continue
        entry = v if isinstance(v, dict) else {}
        out[key] = {
            'boy': sanitize_input(str(entry.get('boy') or '')),
            'eoy': sanitize_input(str(entry.get('eoy') or '')),
        }
    return out


def _student_payload(org_id, u):
    return {
        'id': u['id'],
        'name': _student_name(u),
        'preferred_name': u.get('preferred_name'),
        'date_of_birth': u.get('date_of_birth'),
        'grade_level': _grade_level(org_id, u['id']),
        'avatar_url': u.get('avatar_url'),
    }


# ── Staff: record read/write ──────────────────────────────────────────────────
@bp.route('/students/<student_id>/record', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_student_record(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    u = _student_in_org(org_id, student_id)
    if not u or not _staff_scope_allows(user_id, org_id, student_id):
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    row = _get_record_row(org_id, student_id) or {}
    return jsonify({
        'success': True,
        'record': {
            'profile': row.get('profile') or {},
            'assessments': row.get('assessments') or {},
        },
        'assessment_fields': _assessment_fields(org_id),
        'materials': _list_materials(org_id, student_id),
        'student': _student_payload(org_id, u),
    })


@bp.route('/students/<student_id>/record', methods=['PUT'])
@require_role(*STAFF_ROLES)
def save_student_record(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    u = _student_in_org(org_id, student_id)
    if not u or not _staff_scope_allows(user_id, org_id, student_id):
        return jsonify({'success': False, 'error': 'Student not found'}), 404

    data = request.get_json() or {}
    fields = {'updated_by': user_id, 'updated_at': _now()}
    if 'profile' in data:
        profile = _sanitize_profile(data.get('profile'))
        if profile is None:
            return jsonify({'success': False, 'error': 'profile must be an object'}), 400
        fields['profile'] = profile
    if 'assessments' in data:
        assessments = _sanitize_assessments(data.get('assessments'))
        if assessments is None:
            return jsonify({'success': False, 'error': 'assessments must be an object'}), 400
        fields['assessments'] = assessments

    existing = _get_record_row(org_id, student_id)
    if existing:
        saved = (_admin().table('sis_student_records').update(fields)
                 .eq('id', existing['id']).execute()).data
    else:
        saved = (_admin().table('sis_student_records').insert({
            'organization_id': org_id,
            'student_user_id': student_id,
            'profile': fields.get('profile', {}),
            'assessments': fields.get('assessments', {}),
            'updated_by': user_id,
        }).execute()).data
    row = saved[0] if saved else {}
    return jsonify({'success': True, 'record': {
        'profile': row.get('profile') or {},
        'assessments': row.get('assessments') or {},
    }})


# ── Staff: curriculum materials checklist ─────────────────────────────────────
@bp.route('/students/<student_id>/materials', methods=['POST'])
@require_role(*STAFF_ROLES)
def add_material(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    u = _student_in_org(org_id, student_id)
    if not u or not _staff_scope_allows(user_id, org_id, student_id):
        return jsonify({'success': False, 'error': 'Student not found'}), 404

    data = request.get_json() or {}
    item_name = sanitize_input(str(data.get('item_name') or '')).strip()
    if not item_name:
        return jsonify({'success': False, 'error': 'item_name is required'}), 400
    existing = _list_materials(org_id, student_id)
    next_order = max([m.get('sort_order') or 0 for m in existing], default=-1) + 1
    row = (_admin().table('sis_student_materials').insert({
        'organization_id': org_id,
        'student_user_id': student_id,
        'item_name': item_name,
        'notes': sanitize_input(str(data.get('notes') or '')) or None,
        'sort_order': next_order,
    }).execute()).data
    return jsonify({'success': True, 'material': row[0] if row else None}), 201


def _material_or_error(user_id, org_id, material_id):
    rows = (_admin().table('sis_student_materials').select('*')
            .eq('id', material_id).limit(1).execute()).data or []
    m = rows[0] if rows else None
    if not m or m.get('organization_id') != org_id \
            or not _staff_scope_allows(user_id, org_id, m['student_user_id']):
        return None, (jsonify({'success': False, 'error': 'Material not found'}), 404)
    return m, None


@bp.route('/materials/<material_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_material(user_id, material_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    _m, err = _material_or_error(user_id, org_id, material_id)
    if err:
        return err
    data = request.get_json() or {}
    fields = {'updated_at': _now()}
    if 'item_name' in data:
        item_name = sanitize_input(str(data.get('item_name') or '')).strip()
        if not item_name:
            return jsonify({'success': False, 'error': 'item_name cannot be empty'}), 400
        fields['item_name'] = item_name
    if 'paid' in data:
        fields['paid'] = bool(data.get('paid'))
    if 'received' in data:
        fields['received'] = bool(data.get('received'))
    if 'notes' in data:
        fields['notes'] = sanitize_input(str(data.get('notes') or '')) or None
    if 'sort_order' in data:
        try:
            fields['sort_order'] = int(data.get('sort_order'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'sort_order must be an integer'}), 400
    updated = (_admin().table('sis_student_materials').update(fields)
               .eq('id', material_id).execute()).data
    return jsonify({'success': True, 'material': updated[0] if updated else None})


@bp.route('/materials/<material_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_material(user_id, material_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    _m, err = _material_or_error(user_id, org_id, material_id)
    if err:
        return err
    _admin().table('sis_student_materials').delete().eq('id', material_id).execute()
    return jsonify({'success': True})


# ── Parent: read-only record + scores summary ─────────────────────────────────
def _is_my_student(parent_id, student_id):
    """Family relationship check, mirroring routes/sis/goals.py: an approved
    parent_student_links row OR users.managed_by_parent_id (dependents)."""
    admin = _admin()
    links = (admin.table('parent_student_links').select('id')
             .eq('parent_user_id', parent_id).eq('student_user_id', student_id)
             .eq('status', 'approved').limit(1).execute()).data or []
    if links:
        return True
    dep = (admin.table('users').select('id')
           .eq('id', student_id).eq('managed_by_parent_id', parent_id)
           .limit(1).execute()).data or []
    return bool(dep)


def _row_percent(row):
    """The value a scores row contributes to the class average: score/max*100
    when both are present (max != 0), else the raw score (sheets that already
    track percentages). Rows with no score are excluded."""
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


def _scores_by_class(org_id, student_id):
    """The student's sis_student_assignments grouped per class with a running
    average, class names resolved from org_classes."""
    admin = _admin()
    rows = (admin.table('sis_student_assignments').select('*')
            .eq('organization_id', org_id).eq('student_user_id', student_id)
            .order('sort_order').order('created_at').execute()).data or []
    if not rows:
        return []
    class_ids = list(dict.fromkeys([r['class_id'] for r in rows if r.get('class_id')]))
    names = {}
    if class_ids:
        classes = (admin.table('org_classes').select('id, name')
                   .in_('id', class_ids).execute()).data or []
        names = {c['id']: c.get('name') for c in classes}
    grouped = {}
    for r in rows:
        grouped.setdefault(r.get('class_id'), []).append(r)
    out = []
    for class_id, assignments in grouped.items():
        vals = [v for v in (_row_percent(a) for a in assignments) if v is not None]
        out.append({
            'class_id': class_id,
            'class_name': names.get(class_id) or 'Class',
            'average': round(sum(vals) / len(vals), 1) if vals else None,
            'assignments': [{
                'id': a['id'],
                'name': a.get('name'),
                'date_scheduled': a.get('date_scheduled'),
                'date_completed': a.get('date_completed'),
                'score': a.get('score'),
                'max_score': a.get('max_score'),
                'notes': a.get('notes'),
            } for a in assignments],
        })
    out.sort(key=lambda c: (c['class_name'] or '').lower())
    return out


@bp.route('/parent/students/<student_id>/record', methods=['GET'])
@require_auth
def parent_student_record(user_id, student_id):
    """Read-only student record for the student's parent/guardian: profile,
    BOY/EOY assessments (+ field labels), materials checklist, and a per-class
    scores summary. Parents cannot write anything here."""
    if not _is_my_student(user_id, student_id):
        return jsonify({'success': False, 'error': 'Not authorized for this student'}), 403
    rows = (_admin().table('users')
            .select('id, organization_id, display_name, first_name, last_name, '
                    'username, email, preferred_name, date_of_birth, avatar_url')
            .eq('id', student_id).limit(1).execute()).data or []
    u = rows[0] if rows else None
    org_id = u.get('organization_id') if u else None
    if not u or not org_id:
        return jsonify({'success': False, 'error': 'Student is not part of a school'}), 404
    row = _get_record_row(org_id, student_id) or {}
    return jsonify({
        'success': True,
        'record': {
            'profile': row.get('profile') or {},
            'assessments': row.get('assessments') or {},
        },
        'assessment_fields': _assessment_fields(org_id),
        'materials': _list_materials(org_id, student_id),
        'student': _student_payload(org_id, u),
        'scores': _scores_by_class(org_id, student_id),
    })
