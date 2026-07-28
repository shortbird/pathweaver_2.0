"""
SIS secure documents — a private, admin-managed store for sensitive files
(contracts, background checks, custody/medical docs) attached to a staff
member/parent (owner_user_id) OR a student (student_user_id).

NEW, additive (/api/sis), ADMIN-ONLY (org_admin / superadmin). v1 has no
per-person visibility — that's a follow-up. Files live in the PRIVATE
'sis-secure-documents' storage bucket; reads always go through short-lived
signed URLs. Org scoping is enforced on every route via
sis_service.resolve_org_id, mirroring routes/sis/reports.py.
"""

import uuid as _uuid

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_secure_documents', __name__, url_prefix='/api/sis')

# Sensitive-document store is org-management, not teacher-facing.
STAFF_ROLES = ('org_admin', 'superadmin')

_SECURE_DOCS_BUCKET = 'sis-secure-documents'  # PRIVATE bucket
_DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'}
_MAX_DOC_BYTES = 15 * 1024 * 1024


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


def _display_name(u):
    """Best available display name for a user row."""
    if not u:
        return None
    name = (u.get('display_name') or '').strip()
    if name:
        return name
    first = (u.get('first_name') or '').strip()
    last = (u.get('last_name') or '').strip()
    full = f'{first} {last}'.strip()
    return full or u.get('username') or u.get('email')


def _names_for(ids):
    """Map user_id -> display name for the given ids (one query)."""
    ids = [i for i in ids if i]
    if not ids:
        return {}
    rows = (get_supabase_admin_client().table('users')
            .select('id, display_name, first_name, last_name, username, email')
            .in_('id', list(set(ids))).execute()).data or []
    return {r['id']: _display_name(r) for r in rows}


@bp.route('/secure-documents/upload', methods=['POST'])
@require_role(*STAFF_ROLES)
def upload_secure_document(user_id):
    """Upload a sensitive file to the PRIVATE secure-documents bucket and record
    a metadata row. Multipart: `file` plus form/query fields organization_id,
    owner_user_id, student_user_id, category, note."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in _DOC_EXTENSIONS:
        return jsonify({'success': False, 'error': 'Allowed types: pdf, doc, docx, png, jpg, jpeg, webp'}), 400
    file.seek(0, 2)
    size_bytes = file.tell()
    if size_bytes > _MAX_DOC_BYTES:
        return jsonify({'success': False, 'error': 'File size exceeds 15MB limit'}), 400
    file.seek(0)

    supabase = get_supabase_admin_client()
    try:
        supabase.storage.get_bucket(_SECURE_DOCS_BUCKET)
    except Exception:
        try:
            supabase.storage.create_bucket(_SECURE_DOCS_BUCKET, options={'public': False})
        except Exception:
            pass

    path = f"{org_id}/{_uuid.uuid4().hex}.{ext}"
    try:
        supabase.storage.from_(_SECURE_DOCS_BUCKET).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or 'application/octet-stream'},
        )
    except Exception as e:
        logger.error(f'Secure document upload failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to upload document'}), 500

    def _clean(v):
        v = (request.form.get(v) or request.args.get(v) or '').strip()
        return v or None

    row = {
        'organization_id': org_id,
        'owner_user_id': _clean('owner_user_id'),
        'student_user_id': _clean('student_user_id'),
        'uploaded_by': user_id,
        'storage_path': path,
        'filename': file.filename,
        'content_type': file.content_type,
        'size_bytes': size_bytes,
        'category': _clean('category'),
        'note': _clean('note'),
        # Opt-in, and off unless the admin says otherwise. This store holds
        # background checks; a document must never become visible to the person
        # it is about just because it was filed against them.
        'shared_with_owner': (request.form.get('shared_with_owner')
                              or request.args.get('shared_with_owner')
                              or '').strip().lower() in ('1', 'true', 'yes'),
    }
    try:
        inserted = (supabase.table('sis_secure_documents').insert(row).execute()).data
    except Exception as e:
        logger.error(f'Secure document insert failed: {e}')
        # Don't leave an orphan blob if the metadata row failed.
        try:
            supabase.storage.from_(_SECURE_DOCS_BUCKET).remove([path])
        except Exception:
            pass
        return jsonify({'success': False, 'error': 'Failed to save document'}), 500

    return jsonify({'success': True, 'document': (inserted or [row])[0]}), 201


@bp.route('/secure-documents', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_secure_documents(user_id):
    """All secure documents for the org (newest first), hydrated with display
    names. Optional ?owner_user_id / ?student_user_id filters."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err

    q = (get_supabase_admin_client().table('sis_secure_documents').select('*')
         .eq('organization_id', org_id))
    owner_filter = request.args.get('owner_user_id')
    student_filter = request.args.get('student_user_id')
    if owner_filter:
        q = q.eq('owner_user_id', owner_filter)
    if student_filter:
        q = q.eq('student_user_id', student_filter)
    rows = (q.order('created_at', desc=True).execute()).data or []

    ids = []
    for r in rows:
        ids += [r.get('uploaded_by'), r.get('owner_user_id'), r.get('student_user_id')]
    names = _names_for(ids)
    for r in rows:
        r['uploaded_by_name'] = names.get(r.get('uploaded_by'))
        r['owner_name'] = names.get(r.get('owner_user_id'))
        r['student_name'] = names.get(r.get('student_user_id'))

    return jsonify({'success': True, 'documents': rows})


def _doc_or_error(user_id, doc_id):
    """Load a doc and verify it belongs to the caller's org."""
    org_id, err = _org_or_error(user_id)
    if err:
        return None, None, err
    rows = (get_supabase_admin_client().table('sis_secure_documents').select('*')
            .eq('id', doc_id).limit(1).execute()).data or []
    if not rows or rows[0].get('organization_id') != org_id:
        return None, None, (jsonify({'success': False, 'error': 'Document not found'}), 404)
    return rows[0], org_id, None


@bp.route('/secure-documents/<doc_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_secure_document(user_id, doc_id):
    """Change a document's sharing or filing details.

    Sharing is the interesting one: turning `shared_with_owner` on is what makes
    a contract visible to the teacher it belongs to, in their My Documents page.
    Turning it back off hides it again — the file is not deleted.
    """
    doc, _org_id, err = _doc_or_error(user_id, doc_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    fields = {}
    if 'shared_with_owner' in data:
        if not doc.get('owner_user_id') and data.get('shared_with_owner'):
            return jsonify({'success': False,
                            'error': 'Attach this document to a person before sharing it'}), 400
        fields['shared_with_owner'] = bool(data['shared_with_owner'])
    for key in ('category', 'note'):
        if key in data:
            fields[key] = (data.get(key) or '').strip() or None
    if not fields:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    row = (get_supabase_admin_client().table('sis_secure_documents')
           .update(fields).eq('id', doc_id).execute()).data
    return jsonify({'success': True, 'document': (row or [doc])[0]})


@bp.route('/secure-documents/<doc_id>/url', methods=['GET'])
@require_role(*STAFF_ROLES)
def secure_document_url(user_id, doc_id):
    """1-hour signed URL for a secure document's blob."""
    doc, _org_id, err = _doc_or_error(user_id, doc_id)
    if err:
        return err
    try:
        signed = get_supabase_admin_client().storage.from_(_SECURE_DOCS_BUCKET) \
            .create_signed_url(doc['storage_path'], 3600)
        url = signed.get('signedURL') or signed.get('signedUrl')
    except Exception as e:
        logger.error(f"Signed URL failed for {doc.get('storage_path')}: {e}")
        return jsonify({'success': False, 'error': 'Could not open the document'}), 500
    return jsonify({'success': True, 'url': url})


@bp.route('/secure-documents/<doc_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_secure_document(user_id, doc_id):
    """Remove the blob and delete the metadata row."""
    doc, _org_id, err = _doc_or_error(user_id, doc_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    try:
        supabase.storage.from_(_SECURE_DOCS_BUCKET).remove([doc['storage_path']])
    except Exception:
        logger.debug('Secure document blob delete failed (non-fatal)', exc_info=True)
    supabase.table('sis_secure_documents').delete().eq('id', doc_id).execute()
    return jsonify({'success': True})
