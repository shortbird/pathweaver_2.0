"""
Per-class curriculum materials (2026-07-27) — documents and links a teacher
shares with a single SIS class (an org_classes row).

Additive, prefix /api/sis. Unlike the rest of the staff-only SIS console,
these endpoints are open to any authenticated user,
because a class's materials are read by its enrolled STUDENTS as well as its
teacher(s). Authorization is a per-class participant gate enforced here in
Python, NOT a role check:

  READ  (list): org_admin/superadmin of the class's org, the class's teacher(s)
                (primary_instructor_id or an active class_advisors row), OR an
                actively enrolled student (class_enrollments status='active').
  WRITE (add/upload/delete): the class's teacher(s) or an org_admin/superadmin
                (the "moderators"); students never write.

class_id == org_classes.id. The /by-quest/<quest_id> read variant resolves the
owning class from a quest id, for the student-facing learning-app quest page.

All DB access uses the service-role admin client (class_materials is
RLS-deny-all); authorization is done above every read/write.
"""

import uuid as _uuid
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.logger import get_logger
from utils.validation import validate_uuid
from services import sis_service
from database import get_supabase_admin_client
from utils.storage_urls import public_object_url, sign_in_place, sign_stored_url

logger = get_logger(__name__)

bp = Blueprint('sis_class_materials', __name__, url_prefix='/api/sis')

# Private bucket, shared with the staff resource library. Uploaded materials are
# org-owned curriculum: the row stores the canonical pointer and every read signs
# it for the requester. See utils/storage_urls.py.
_MATERIALS_BUCKET = 'org-documents'
_DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
                   'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'csv'}
_MAX_DOC_BYTES = 25 * 1024 * 1024
_MAX_TITLE_LEN = 300


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _bad_uuid(*values):
    for v in values:
        ok, _ = validate_uuid(v)
        if not ok:
            return True
    return False


def _load_org_class(admin, class_id):
    rows = (
        admin.table('org_classes')
        .select('id, organization_id, name, primary_instructor_id, status')
        .eq('id', class_id).limit(1).execute()
    ).data or []
    return rows[0] if rows else None


def _access(user_id, class_row, admin):
    """(allowed, is_moderator) for this user against this class:
    teachers/admins moderate, enrolled students read."""
    org_id = class_row.get('organization_id')

    if sis_service.caller_is_admin(user_id):
        if sis_service.resolve_org_id(user_id, org_id) == org_id:
            return True, True
        return False, False

    if class_row.get('primary_instructor_id') == user_id:
        return True, True
    co_teacher = (
        admin.table('class_advisors').select('id')
        .eq('class_id', class_row['id']).eq('advisor_id', user_id)
        .eq('is_active', True).limit(1).execute()
    ).data
    if co_teacher:
        return True, True

    enrolled = (
        admin.table('class_enrollments').select('id')
        .eq('class_id', class_row['id']).eq('student_id', user_id)
        .eq('status', 'active').limit(1).execute()
    ).data
    if enrolled:
        return True, False

    return False, False


_FORBIDDEN = 'Class materials are available to the class teacher and enrolled students.'


def _authorize_class(user_id, class_id):
    """(class_row, is_moderator, None) on success, or (None, False, err_tuple)."""
    if _bad_uuid(class_id):
        return None, False, (jsonify({'success': False, 'error': 'Invalid class id'}), 400)
    # admin client justified: class_materials tables are RLS-deny-all; this loads the class and runs the _access participant gate (teacher/admin/enrolled student) before anything is returned
    admin = get_supabase_admin_client()
    class_row = _load_org_class(admin, class_id)
    if not class_row:
        return None, False, (jsonify({'success': False, 'error': 'Class not found'}), 404)
    allowed, is_moderator = _access(user_id, class_row, admin)
    if not allowed:
        return None, False, (jsonify({'success': False, 'error': _FORBIDDEN}), 403)
    return class_row, is_moderator, None


def _resolve_class_for_quest(user_id, quest_id):
    """Resolve the owning SIS class for a quest the caller participates in."""
    if _bad_uuid(quest_id):
        return None, False, (jsonify({'success': False, 'error': 'Invalid quest id'}), 400)
    # admin client justified: resolves quest -> owning class across class_quests/org_classes (deny-all RLS), then applies the _access participant gate per class
    admin = get_supabase_admin_client()
    links = (
        admin.table('class_quests').select('class_id')
        .eq('quest_id', quest_id).execute()
    ).data or []
    class_ids = list(dict.fromkeys(l['class_id'] for l in links if l.get('class_id')))
    if not class_ids:
        return None, False, (jsonify({'success': False, 'error': 'No class materials for this quest'}), 404)
    classes = (
        admin.table('org_classes')
        .select('id, organization_id, name, primary_instructor_id, status')
        .in_('id', class_ids).execute()
    ).data or []
    for class_row in classes:
        allowed, is_moderator = _access(user_id, class_row, admin)
        if allowed:
            return class_row, is_moderator, None
    return None, False, (jsonify({'success': False, 'error': _FORBIDDEN}), 403)


def _serialize(m, can_manage, is_admin=False, user_id=None):
    # A teacher may remove only the materials THEY added; anything an admin put on
    # the class stays put for teachers (admins can remove anything). Students never
    # get a delete control (can_manage is False for them).
    can_delete = bool(can_manage) and (bool(is_admin) or m.get('created_by') == user_id)
    return {
        'id': m['id'],
        'kind': m.get('kind'),
        'title': m.get('title'),
        'url': m.get('url'),
        'created_at': m.get('created_at'),
        'can_delete': can_delete,
    }


def _list_materials(admin, class_id):
    return (
        admin.table('class_materials')
        .select('id, kind, title, url, created_at, created_by')
        .eq('class_id', class_id)
        .order('created_at', desc=True)
        .execute()
    ).data or []


def _serialize_many(rows, can_manage, is_admin=False, user_id=None):
    """Serialize a material list and sign every uploaded file's URL in ONE
    batched call. A class can carry dozens of handouts; signing per row would be
    one HTTP round trip each. Plain links are left alone by the signer."""
    out = [_serialize(m, can_manage, is_admin, user_id) for m in rows]
    # No bucket hint: stored values are full URLs, so the bucket is read out of
    # each one and an external link can never be mistaken for an object path.
    sign_in_place(out, ['url'])
    return out


# ── class-id endpoints (teacher portal) ───────────────────────────────────────

@bp.route('/classes/<class_id>/materials', methods=['GET'])
@require_auth
def list_materials(user_id, class_id):
    class_row, is_moderator, err = _authorize_class(user_id, class_id)
    if err:
        return err
    # admin client justified: RLS-deny-all class_materials read; per-class participant gate already passed in _authorize_class
    admin = get_supabase_admin_client()
    rows = _list_materials(admin, class_row['id'])
    is_admin = is_moderator and sis_service.caller_is_admin(user_id)
    return jsonify({'success': True,
                    'can_manage': is_moderator,
                    'materials': _serialize_many(rows, is_moderator, is_admin, user_id)})


@bp.route('/classes/<class_id>/materials', methods=['POST'])
@require_auth
def add_link_material(user_id, class_id):
    """Add a link. File uploads go through the /upload endpoint below."""
    class_row, is_moderator, err = _authorize_class(user_id, class_id)
    if err:
        return err
    if not is_moderator:
        return jsonify({'success': False, 'error': 'Only the class teacher can add materials.'}), 403
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    url = (data.get('url') or '').strip()
    if not title or not url:
        return jsonify({'success': False, 'error': 'A title and link are required.'}), 400
    if len(title) > _MAX_TITLE_LEN:
        return jsonify({'success': False, 'error': 'Title is too long.'}), 400
    if not (url.startswith('http://') or url.startswith('https://')):
        return jsonify({'success': False, 'error': 'Links must start with http:// or https://'}), 400
    # admin client justified: RLS-deny-all class_materials insert; moderator (teacher/admin) gate checked above
    admin = get_supabase_admin_client()
    row = admin.table('class_materials').insert({
        'organization_id': class_row['organization_id'],
        'class_id': class_row['id'],
        'kind': 'link',
        'title': title,
        'url': url,
        'created_by': user_id,
        'created_at': _now_iso(),
    }).execute().data
    if not row:
        return jsonify({'success': False, 'error': 'Could not add the link.'}), 500
    return jsonify({'success': True, 'material': _serialize(row[0], True, user_id=user_id)})


@bp.route('/classes/<class_id>/materials/upload', methods=['POST'])
@require_auth
def upload_material(user_id, class_id):
    """Upload a document and create its material row in one call."""
    class_row, is_moderator, err = _authorize_class(user_id, class_id)
    if err:
        return err
    if not is_moderator:
        return jsonify({'success': False, 'error': 'Only the class teacher can add materials.'}), 403

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in _DOC_EXTENSIONS:
        return jsonify({'success': False,
                        'error': 'Allowed types: pdf, doc(x), ppt(x), xls(x), images, txt, csv'}), 400
    file.seek(0, 2)
    if file.tell() > _MAX_DOC_BYTES:
        return jsonify({'success': False, 'error': 'File size exceeds 25MB limit'}), 400
    file.seek(0)

    title = (request.form.get('title') or '').strip() or file.filename
    if len(title) > _MAX_TITLE_LEN:
        title = title[:_MAX_TITLE_LEN]

    # admin client justified: storage bucket create/upload + RLS-deny-all class_materials insert; moderator (teacher/admin) gate checked above
    supabase = get_supabase_admin_client()
    try:
        if not supabase.storage.get_bucket(_MATERIALS_BUCKET):
            supabase.storage.create_bucket(_MATERIALS_BUCKET)
    except Exception:
        try:
            supabase.storage.create_bucket(_MATERIALS_BUCKET)
        except Exception:
            pass

    path = f"{class_row['organization_id']}/class-materials/{class_row['id']}/{_uuid.uuid4().hex}.{ext}"
    try:
        supabase.storage.from_(_MATERIALS_BUCKET).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or 'application/octet-stream'},
        )
        url = public_object_url(_MATERIALS_BUCKET, path)
    except Exception as e:
        logger.error(f'Class material upload failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to upload file'}), 500

    row = supabase.table('class_materials').insert({
        'organization_id': class_row['organization_id'],
        'class_id': class_row['id'],
        'kind': 'file',
        'title': title,
        'url': url,
        'file_path': path,
        'created_by': user_id,
        'created_at': _now_iso(),
    }).execute().data
    if not row:
        return jsonify({'success': False, 'error': 'Uploaded, but could not save the material.'}), 500
    material = _serialize(row[0], True, user_id=user_id)
    # The stored `url` is the canonical pointer; the client needs the signed twin
    # to render the just-uploaded file.
    material['url'] = sign_stored_url(material.get('url'), _MATERIALS_BUCKET)
    return jsonify({'success': True, 'material': material})


@bp.route('/classes/<class_id>/materials/<material_id>', methods=['DELETE'])
@require_auth
def delete_material(user_id, class_id, material_id):
    class_row, is_moderator, err = _authorize_class(user_id, class_id)
    if err:
        return err
    if not is_moderator:
        return jsonify({'success': False, 'error': 'Only the class teacher can remove materials.'}), 403
    if _bad_uuid(material_id):
        return jsonify({'success': False, 'error': 'Invalid material id'}), 400
    # admin client justified: RLS-deny-all class_materials delete + storage cleanup; moderator gate above plus own-material/admin check below
    admin = get_supabase_admin_client()
    rows = (admin.table('class_materials').select('id, class_id, file_path, created_by')
            .eq('id', material_id).limit(1).execute()).data
    material = rows[0] if rows else None
    if not material or material.get('class_id') != class_row['id']:
        return jsonify({'success': False, 'error': 'Material not found'}), 404
    # A teacher can remove only what they added; admin-provided materials are
    # theirs to remove. Admins may remove anything on their org's class.
    if not sis_service.caller_is_admin(user_id) and material.get('created_by') != user_id:
        return jsonify({'success': False,
                        'error': 'Only an admin can remove a material the school added.'}), 403
    # Best-effort storage cleanup for uploaded files.
    if material.get('file_path'):
        try:
            admin.storage.from_(_MATERIALS_BUCKET).remove([material['file_path']])
        except Exception as e:
            logger.warning(f'Could not remove class-material file {material["file_path"]}: {e}')
    admin.table('class_materials').delete().eq('id', material_id).execute()
    return jsonify({'success': True})


# ── by-quest read variant (student-facing learning-app quest page) ─────────────

@bp.route('/classes/by-quest/<quest_id>/materials', methods=['GET'])
@require_auth
def list_materials_by_quest(user_id, quest_id):
    class_row, is_moderator, err = _resolve_class_for_quest(user_id, quest_id)
    if err:
        return err
    # admin client justified: RLS-deny-all class_materials read; participant gate already passed in _resolve_class_for_quest
    admin = get_supabase_admin_client()
    rows = _list_materials(admin, class_row['id'])
    is_admin = is_moderator and sis_service.caller_is_admin(user_id)
    return jsonify({'success': True,
                    'can_manage': is_moderator,
                    'materials': _serialize_many(rows, is_moderator, is_admin, user_id)})
