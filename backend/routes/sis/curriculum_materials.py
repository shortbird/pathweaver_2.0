"""
Curriculum resources: what a teacher saves on a curriculum and can show students.

iCreate/Horizon, 2026-09-02 -- "teachers want to be able to deliver documents to
students via the classes. it makes most sense to be able to do this through
curriculum", then: "youtube links, documents, all the same. it's things that are
saved in curriculum that teachers have the option to have appear in the student
class view so they can access some kind of resource."

So: one list per curriculum. A pasted link and an uploaded file are the same kind
of row, told apart only by `kind`, because to a student they are both just
something to open. Each row carries visible_to_students, and that flag is the
whole feature -- a curriculum is also where answer keys and teacher's guides
live, so nothing here reaches a student until somebody ticks the box.

Why the curriculum and not the class: class_materials
(routes/sis/class_materials.py) already delivers to students, but it hangs off
ONE section. The same handout gets re-uploaded onto every section teaching the
subject, and again next year. A curriculum outlives the timetable and already
backs several sections at once, which is the reuse being asked for. A resource
added here reaches every class on the curriculum, and fixing it fixes all of
them -- the same live-link reasoning courses already use, and the opposite of
quests, which are copied because they carry per-section dates.

Who may manage them: an org admin of the curriculum's org, OR a teacher of any
class the curriculum is attached to. Teachers write here deliberately -- they are
the ones with the handouts, and the precedent is already set by class quests,
which teachers add and which auto-attach to the class's curriculum. What stays
admin-only is the curriculum's own definition (title, subject, notes, drive_url);
see routes/sis/curriculum.py.

Deletion follows class_materials: a teacher removes only what they added, an
admin removes anything.

All DB access uses the service-role admin client (sis_curriculum_materials is
RLS-deny-all); authorization runs in Python above every read and write.
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

bp = Blueprint('sis_curriculum_materials', __name__, url_prefix='/api/sis')

# Same bucket, extensions and cap as class materials: these are the same kind of
# file, and a teacher should not discover a different limit depending on which
# screen they uploaded from.
_MATERIALS_BUCKET = 'org-documents'
_DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
                   'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'csv'}
_MAX_DOC_BYTES = 25 * 1024 * 1024
_MAX_TITLE_LEN = 300
_MAX_URL_LEN = 2000

_FORBIDDEN = ('Curriculum resources are managed by the school\'s administrators '
              'and the teachers of its classes.')


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _admin():
    # admin client justified: the SIS console acts for the whole school — this
    #   reads/writes rows belonging to every family in the org, which no single
    #   caller can see under RLS; the route's role+org gate is the authorization
    return get_supabase_admin_client()


def _bad_uuid(*values):
    for v in values:
        ok, _ = validate_uuid(v)
        if not ok:
            return True
    return False


def _load_curriculum(admin, curriculum_id):
    rows = (admin.table('sis_curriculum').select('id, organization_id, title')
            .eq('id', curriculum_id).limit(1).execute()).data or []
    return rows[0] if rows else None


def _teaches_a_class_on(admin, user_id, curriculum_id):
    """Is this user a teacher of any class this curriculum is attached to?

    Teacher means the same three sources every other class gate uses: the
    primary instructor, a named assistant, and an active class_advisors row.
    """
    links = (admin.table('sis_curriculum_classes').select('class_id')
             .eq('curriculum_id', curriculum_id).execute()).data or []
    class_ids = [l['class_id'] for l in links if l.get('class_id')]
    if not class_ids:
        return False

    classes = (admin.table('org_classes')
               .select('id, primary_instructor_id, assistant_instructor_ids')
               .in_('id', class_ids).execute()).data or []
    for c in classes:
        if c.get('primary_instructor_id') == user_id:
            return True
        if user_id in (c.get('assistant_instructor_ids') or []):
            return True

    co_teaching = (admin.table('class_advisors').select('class_id')
                   .in_('class_id', class_ids).eq('advisor_id', user_id)
                   .eq('is_active', True).limit(1).execute()).data
    return bool(co_teaching)


def _authorize(user_id, curriculum_id):
    """(curriculum, is_admin, None) for someone who may manage this curriculum's
    resources, else (None, False, err_tuple)."""
    if _bad_uuid(curriculum_id):
        return None, False, (jsonify({'success': False, 'error': 'Invalid curriculum id'}), 400)
    # admin client justified: sis_curriculum* are RLS-deny-all; this loads the curriculum and runs the admin/teacher gate below before anything is read or written
    admin = _admin()
    curriculum = _load_curriculum(admin, curriculum_id)
    if not curriculum:
        return None, False, (jsonify({'success': False, 'error': 'Curriculum not found'}), 404)

    org_id = curriculum.get('organization_id')
    if sis_service.caller_is_admin(user_id):
        if sis_service.resolve_org_id(user_id, org_id) == org_id:
            return curriculum, True, None
        return None, False, (jsonify({'success': False, 'error': 'Curriculum not found'}), 404)

    if _teaches_a_class_on(admin, user_id, curriculum_id):
        return curriculum, False, None
    return None, False, (jsonify({'success': False, 'error': _FORBIDDEN}), 403)


def serialize(m, is_admin=False, user_id=None):
    """One resource row as the staff screens read it.

    can_delete mirrors class_materials: a teacher removes what they added, an
    admin removes anything. Students never reach this serializer -- their copy
    comes from services/sis_curriculum_sync.curriculum_materials_for_class, which
    drops the flag and the ownership fields entirely.
    """
    return {
        'id': m['id'],
        'kind': m.get('kind'),
        'title': m.get('title'),
        'url': m.get('url'),
        'visible_to_students': bool(m.get('visible_to_students')),
        'created_at': m.get('created_at'),
        'can_delete': bool(is_admin) or m.get('created_by') == user_id,
    }


def _serialize_many(rows, is_admin=False, user_id=None):
    """Serialize and sign every uploaded file's URL in ONE batched call --
    signing per row would be an HTTP round trip each. Plain links pass through
    the signer untouched."""
    out = [serialize(m, is_admin, user_id) for m in rows]
    sign_in_place(out, ['url'])
    return out


def _list(admin, curriculum_id):
    return (admin.table('sis_curriculum_materials')
            .select('id, kind, title, url, visible_to_students, created_at, created_by')
            .eq('curriculum_id', curriculum_id)
            .order('created_at', desc=True).execute()).data or []


@bp.route('/curriculum/<curriculum_id>/materials', methods=['GET'])
@require_auth
def list_materials(user_id, curriculum_id):
    """Everything on this curriculum, shown or not. Staff-side read."""
    curriculum, is_admin, err = _authorize(user_id, curriculum_id)
    if err:
        return err
    rows = _list(_admin(), curriculum_id)
    return jsonify({'success': True, 'can_manage': True, 'is_admin': is_admin,
                    'materials': _serialize_many(rows, is_admin, user_id)})


@bp.route('/curriculum/<curriculum_id>/materials', methods=['POST'])
@require_auth
def add_link(user_id, curriculum_id):
    """Save a link. A YouTube video and a Drive doc are the same row here."""
    curriculum, is_admin, err = _authorize(user_id, curriculum_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    url = (data.get('url') or '').strip()
    if not title or not url:
        return jsonify({'success': False, 'error': 'A title and link are required.'}), 400
    if len(title) > _MAX_TITLE_LEN:
        return jsonify({'success': False, 'error': 'Title is too long.'}), 400
    # http(s) only: these render as links a student clicks, so a javascript: or
    # data: URL would be stored XSS.
    if not (url.startswith('http://') or url.startswith('https://')):
        return jsonify({'success': False,
                        'error': 'Links must start with http:// or https://'}), 400
    if len(url) > _MAX_URL_LEN:
        return jsonify({'success': False, 'error': 'That link is too long.'}), 400

    row = (_admin().table('sis_curriculum_materials').insert({
        'organization_id': curriculum['organization_id'],
        'curriculum_id': curriculum_id,
        'kind': 'link',
        'title': title,
        'url': url,
        'visible_to_students': bool(data.get('visible_to_students', True)),
        'created_by': user_id,
        'created_at': _now_iso(),
    }).execute()).data
    if not row:
        return jsonify({'success': False, 'error': 'Could not save the link.'}), 500
    return jsonify({'success': True, 'material': serialize(row[0], is_admin, user_id)})


@bp.route('/curriculum/<curriculum_id>/materials/upload', methods=['POST'])
@require_auth
def upload(user_id, curriculum_id):
    """Upload a document and create its row in one call."""
    curriculum, is_admin, err = _authorize(user_id, curriculum_id)
    if err:
        return err

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
    title = title[:_MAX_TITLE_LEN]
    # Multipart, so the flag arrives as a form field, not JSON.
    visible = (request.form.get('visible_to_students') or 'true').lower() not in ('false', '0', 'no')

    supabase = _admin()
    # The bucket is shared with class materials and the staff resource library,
    # so in practice it already exists. Both failures below are expected noise --
    # get_bucket raises when it's missing, create_bucket raises when it isn't --
    # and the upload that follows is the real test of whether it's usable.
    try:
        if not supabase.storage.get_bucket(_MATERIALS_BUCKET):
            supabase.storage.create_bucket(_MATERIALS_BUCKET)
    except Exception as e:  # noqa: BLE001
        logger.debug(f'Bucket check for {_MATERIALS_BUCKET} failed, creating: {e}')
        try:
            supabase.storage.create_bucket(_MATERIALS_BUCKET)
        except Exception as create_err:  # noqa: BLE001
            logger.debug(f'Bucket {_MATERIALS_BUCKET} already exists: {create_err}')

    path = (f"{curriculum['organization_id']}/curriculum-materials/"
            f"{curriculum_id}/{_uuid.uuid4().hex}.{ext}")
    try:
        supabase.storage.from_(_MATERIALS_BUCKET).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or 'application/octet-stream'},
        )
        url = public_object_url(_MATERIALS_BUCKET, path)
    except Exception as e:
        logger.error(f'Curriculum material upload failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to upload file'}), 500

    row = (supabase.table('sis_curriculum_materials').insert({
        'organization_id': curriculum['organization_id'],
        'curriculum_id': curriculum_id,
        'kind': 'file',
        'title': title,
        'url': url,
        'file_path': path,
        'visible_to_students': visible,
        'created_by': user_id,
        'created_at': _now_iso(),
    }).execute()).data
    if not row:
        return jsonify({'success': False,
                        'error': 'Uploaded, but could not save the resource.'}), 500
    material = serialize(row[0], is_admin, user_id)
    # The stored url is the canonical pointer; the client needs the signed twin
    # to render what was just uploaded.
    material['url'] = sign_stored_url(material.get('url'), _MATERIALS_BUCKET)
    return jsonify({'success': True, 'material': material})


@bp.route('/curriculum/<curriculum_id>/materials/<material_id>', methods=['PATCH'])
@require_auth
def set_visibility(user_id, curriculum_id, material_id):
    """Show this resource to students, or stop showing it.

    The only editable field. A resource is a title and a pointer; changing what
    it points at is a delete and a re-add, which keeps the audit trail honest.
    """
    curriculum, is_admin, err = _authorize(user_id, curriculum_id)
    if err:
        return err
    if _bad_uuid(material_id):
        return jsonify({'success': False, 'error': 'Invalid resource id'}), 400
    data = request.get_json(silent=True) or {}
    if 'visible_to_students' not in data:
        return jsonify({'success': False, 'error': 'Nothing to change.'}), 400

    admin = _admin()
    existing = (admin.table('sis_curriculum_materials')
                .select('id, curriculum_id')
                .eq('id', material_id).limit(1).execute()).data or []
    # Scoped to THIS curriculum: the id alone would let a teacher flip a resource
    # on a curriculum they have no class on.
    if not existing or existing[0].get('curriculum_id') != curriculum_id:
        return jsonify({'success': False, 'error': 'Resource not found'}), 404

    row = (admin.table('sis_curriculum_materials')
           .update({'visible_to_students': bool(data['visible_to_students'])})
           .eq('id', material_id).execute()).data
    if not row:
        return jsonify({'success': False, 'error': 'Could not update the resource.'}), 500
    return jsonify({'success': True, 'material': serialize(row[0], is_admin, user_id)})


@bp.route('/curriculum/<curriculum_id>/materials/<material_id>', methods=['DELETE'])
@require_auth
def delete_material(user_id, curriculum_id, material_id):
    curriculum, is_admin, err = _authorize(user_id, curriculum_id)
    if err:
        return err
    if _bad_uuid(material_id):
        return jsonify({'success': False, 'error': 'Invalid resource id'}), 400

    admin = _admin()
    existing = (admin.table('sis_curriculum_materials')
                .select('id, curriculum_id, created_by, file_path')
                .eq('id', material_id).limit(1).execute()).data or []
    if not existing or existing[0].get('curriculum_id') != curriculum_id:
        return jsonify({'success': False, 'error': 'Resource not found'}), 404
    row = existing[0]
    if not is_admin and row.get('created_by') != user_id:
        return jsonify({'success': False,
                        'error': 'You can only remove resources you added.'}), 403

    # Storage first, then the row: an orphaned object is invisible, an orphaned
    # row renders as a broken link on every class using the curriculum.
    if row.get('file_path'):
        try:
            admin.storage.from_(_MATERIALS_BUCKET).remove([row['file_path']])
        except Exception as e:  # noqa: BLE001
            logger.warning(f'Could not remove stored file {row["file_path"]}: {e}')

    admin.table('sis_curriculum_materials').delete().eq('id', material_id).execute()
    return jsonify({'success': True})
