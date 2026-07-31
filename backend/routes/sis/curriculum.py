"""
SIS curriculum library — the org's curriculum, held separately from classes.

Why this is not just class materials: a school's curriculum outlives its
timetable. iCreate keeps curriculum for subjects they aren't teaching this
semester, and one curriculum (Reading Workshop) backs four different class
sections. So a curriculum entry exists on its own, carries the Google Drive
folder it lives in, and is ATTACHED to zero or more classes.

The other difference is audience. class_materials (routes/sis/class_materials.py)
are shown to enrolled STUDENTS. Curriculum is staff-only — teachers see the
curriculum for the classes they teach, students never see it at all. Keep that
line: it is the reason this is a separate table rather than a flag.

NEW, additive (/api/sis/curriculum). Admin writes; teachers get a read scoped
to their own classes. Org scoping via sis_service.resolve_org_id on every route.
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role, require_auth
from utils.logger import get_logger
from utils.validation import validate_uuid
from services import sis_service
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_curriculum', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')
ADMIN_ROLES = ('org_admin', 'superadmin')

_MAX_TITLE = 200
_MAX_URL = 2000


def _admin():
    return get_supabase_admin_client()


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


def _bad_uuid(*values):
    for v in values:
        ok, _ = validate_uuid(v)
        if not ok:
            return True
    return False


def _normalize_url(raw):
    """Accept a pasted Drive link with or without a scheme; reject anything else.

    Curriculum links are staff-entered and open in a new tab, so a javascript:
    or data: URL would be a stored-XSS vector — only http(s) gets through.
    """
    url = (raw or '').strip()
    if not url:
        return None
    if not url.lower().startswith(('http://', 'https://')):
        if '://' in url:  # some other scheme — refuse rather than rewrite it
            return None
        url = f'https://{url}'
    return url[:_MAX_URL]


def _owned(org_id, curriculum_id):
    rows = (_admin().table('sis_curriculum').select('*')
            .eq('id', curriculum_id).limit(1).execute()).data or []
    row = rows[0] if rows else None
    return row if row and row.get('organization_id') == org_id else None


def _attachments(curriculum_ids):
    """{curriculum_id: [{class_id, name, min_age, max_age}]} for the given curricula.

    The ages come along because the library list is sorted and scanned by age
    range — a curriculum has no age of its own, it inherits the span of the
    classes that teach it.
    """
    if not curriculum_ids:
        return {}
    links = (_admin().table('sis_curriculum_classes')
             .select('curriculum_id, class_id')
             .in_('curriculum_id', curriculum_ids).execute()).data or []
    class_ids = list({l['class_id'] for l in links})
    classes = {}
    if class_ids:
        rows = (_admin().table('org_classes').select('id, name, min_age, max_age')
                .in_('id', class_ids).execute()).data or []
        classes = {r['id']: r for r in rows}
    out = {}
    for l in links:
        c = classes.get(l['class_id']) or {}
        out.setdefault(l['curriculum_id'], []).append({
            'class_id': l['class_id'], 'name': c.get('name') or 'Untitled class',
            'min_age': c.get('min_age'), 'max_age': c.get('max_age'),
        })
    for entries in out.values():
        entries.sort(key=lambda c: (c['name'] or '').lower())
    return out


# ── Admin: the library ────────────────────────────────────────────────────────

@bp.route('/curriculum', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_curriculum(user_id):
    """The org's curriculum library, each entry with the classes it is attached to."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    q = (_admin().table('sis_curriculum').select('*')
         .eq('organization_id', org_id).order('title'))
    if request.args.get('include_inactive') not in ('1', 'true', 'yes'):
        q = q.eq('is_active', True)
    rows = q.execute().data or []
    attached = _attachments([r['id'] for r in rows])
    for r in rows:
        r['classes'] = attached.get(r['id'], [])
    return jsonify({'success': True, 'curriculum': rows})


@bp.route('/curriculum', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_curriculum(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()[:_MAX_TITLE]
    if not title:
        return jsonify({'success': False, 'error': 'A title is required'}), 400
    if data.get('drive_url') and not _normalize_url(data.get('drive_url')):
        return jsonify({'success': False, 'error': 'The link must be a web address (http or https)'}), 400
    row = (_admin().table('sis_curriculum').insert({
        'organization_id': org_id,
        'title': title,
        'subject': (data.get('subject') or '').strip()[:_MAX_TITLE] or None,
        'description': (data.get('description') or '').strip() or None,
        'drive_url': _normalize_url(data.get('drive_url')),
        'notes': (data.get('notes') or '').strip() or None,
        'created_by': user_id,
    }).execute()).data
    return jsonify({'success': True, 'curriculum': row[0] if row else None}), 201


@bp.route('/curriculum/<curriculum_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_curriculum(user_id, curriculum_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    data = request.get_json(silent=True) or {}
    fields = {}
    if 'title' in data:
        title = (data.get('title') or '').strip()[:_MAX_TITLE]
        if not title:
            return jsonify({'success': False, 'error': 'A title is required'}), 400
        fields['title'] = title
    for key in ('subject', 'description', 'notes'):
        if key in data:
            value = (data.get(key) or '').strip()
            fields[key] = value[:_MAX_TITLE] if key == 'subject' else (value or None)
    if 'drive_url' in data:
        raw = (data.get('drive_url') or '').strip()
        if raw and not _normalize_url(raw):
            return jsonify({'success': False, 'error': 'The link must be a web address (http or https)'}), 400
        fields['drive_url'] = _normalize_url(raw)
    if 'is_active' in data:
        fields['is_active'] = bool(data.get('is_active'))
    if not fields:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    fields['updated_at'] = datetime.now(timezone.utc).isoformat()
    row = (_admin().table('sis_curriculum').update(fields)
           .eq('id', curriculum_id).execute()).data
    return jsonify({'success': True, 'curriculum': row[0] if row else None})


@bp.route('/curriculum/<curriculum_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_curriculum(user_id, curriculum_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    # Attachments cascade; the Drive folder itself is untouched (we only ever
    # stored a link to it).
    _admin().table('sis_curriculum').delete().eq('id', curriculum_id).execute()
    return jsonify({'success': True})


# ── Admin: attaching to classes ───────────────────────────────────────────────

@bp.route('/curriculum/<curriculum_id>/classes', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def set_curriculum_classes(user_id, curriculum_id):
    """Replace the set of classes this curriculum is attached to.

    Sent as the whole list rather than add/remove calls so the UI's multi-select
    is the source of truth and two admins editing at once can't interleave into
    a half-applied state.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if _bad_uuid(curriculum_id) or not _owned(org_id, curriculum_id):
        return jsonify({'success': False, 'error': 'Curriculum not found'}), 404
    data = request.get_json(silent=True) or {}
    requested = [c for c in (data.get('class_ids') or []) if c]
    if any(_bad_uuid(c) for c in requested):
        return jsonify({'success': False, 'error': 'Invalid class id'}), 400

    # Only this org's classes — never let an id from another school through.
    valid = set()
    if requested:
        rows = (_admin().table('org_classes').select('id')
                .eq('organization_id', org_id).in_('id', requested).execute()).data or []
        valid = {r['id'] for r in rows}
    rejected = [c for c in requested if c not in valid]

    _admin().table('sis_curriculum_classes').delete().eq('curriculum_id', curriculum_id).execute()
    if valid:
        _admin().table('sis_curriculum_classes').insert(
            [{'curriculum_id': curriculum_id, 'class_id': c} for c in valid]
        ).execute()
    return jsonify({'success': True, 'attached': len(valid), 'rejected': len(rejected)})


# ── Teacher: the curriculum for a class they teach ────────────────────────────

@bp.route('/classes/<class_id>/curriculum', methods=['GET'])
@require_auth
def class_curriculum(user_id, class_id):
    """Curriculum attached to one class. Staff only — a student enrolled in the
    class must not see it (that's what the class Curriculum/materials tab is for).
    """
    if _bad_uuid(class_id):
        return jsonify({'success': False, 'error': 'Invalid class id'}), 400
    admin = _admin()
    rows = (admin.table('org_classes')
            .select('id, organization_id, primary_instructor_id')
            .eq('id', class_id).limit(1).execute()).data or []
    if not rows:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    class_row = rows[0]
    org_id = class_row['organization_id']

    is_admin = (sis_service.caller_is_admin(user_id)
                and sis_service.resolve_org_id(user_id, org_id) == org_id)
    is_teacher = class_row.get('primary_instructor_id') == user_id
    if not is_teacher and not is_admin:
        co_teacher = (admin.table('class_advisors').select('id')
                      .eq('class_id', class_id).eq('advisor_id', user_id)
                      .eq('is_active', True).limit(1).execute()).data
        is_teacher = bool(co_teacher)
    if not (is_teacher or is_admin):
        return jsonify({'success': False, 'error': 'Not available'}), 403

    links = (admin.table('sis_curriculum_classes').select('curriculum_id')
             .eq('class_id', class_id).execute()).data or []
    ids = [l['curriculum_id'] for l in links]
    if not ids:
        return jsonify({'success': True, 'curriculum': []})
    entries = (admin.table('sis_curriculum')
               .select('id, title, subject, description, drive_url, notes, is_active')
               .in_('id', ids).eq('organization_id', org_id)
               .eq('is_active', True).order('title').execute()).data or []
    return jsonify({'success': True, 'curriculum': entries})
