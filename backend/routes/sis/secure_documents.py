"""
SIS secure documents — a private, admin-managed store for sensitive files
(contracts, background checks, custody/medical docs) attached to a staff
member/parent (owner_user_id) OR a student (student_user_id).

HR-GATED (org_admin / superadmin — NOT campus coordinators): this store holds
contracts, background checks and HR paperwork, which iCreate's coordinator
requirements explicitly withhold from coordinators. v1 has no per-person
visibility — that's a follow-up. Files live in the PRIVATE
'sis-secure-documents' storage bucket; reads always go through short-lived
signed URLs. Org scoping is enforced on every route via
sis_service.resolve_org_id, mirroring routes/sis/reports.py.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_secure_docs_service, sis_service
from routes.sis import signature_request_views
from database import get_supabase_admin_client
from utils.sis_roles import HR_ROLES as STAFF_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_secure_documents', __name__, url_prefix='/api/sis')

# Sensitive-document store is HR paperwork, not campus operations — a campus
# coordinator never reaches it (see utils/sis_roles.HR_ROLES). Ordinary campus
# paperwork a coordinator DOES run is the same store with sensitivity='general',
# reached through the ADMIN_ROLES endpoints in routes/sis/staff_admin.py.

# Storage mechanics (bucket, limits, per-person rows) live in the service so the
# signature sender shares them: services/sis_secure_docs_service.py.
_SECURE_DOCS_BUCKET = sis_secure_docs_service.BUCKET
_MAX_ATTACH_PEOPLE = sis_secure_docs_service.MAX_ATTACH_PEOPLE
_MAX_TITLE_LEN = sis_secure_docs_service.MAX_TITLE_LEN


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    # request.form matters for multipart (uploads): get_json returns nothing
    # there, so a superadmin -- who has no org to fall back to -- could not
    # reach any upload endpoint. See routes/sis/__init__._org_or_error.
    requested = (request.args.get('organization_id')
                 or body.get('organization_id')
                 or request.form.get('organization_id'))
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


def _field(key):
    """A single trimmed form/query value, or None."""
    v = (request.form.get(key) or request.args.get(key) or '').strip()
    return v or None


def _field_list(key):
    """A repeated multipart field as a de-duped, order-preserving list.

    Falls back to the single-value form so the one-person callers that predate
    multi-attach keep working unchanged.
    """
    raw = request.form.getlist(key) or request.args.getlist(key)
    out = []
    for v in raw:
        v = (v or '').strip()
        if v and v not in out:
            out.append(v)
    return out


def _clean_title(value, fallback):
    """A document's display name: trimmed, capped, never empty."""
    return sis_secure_docs_service.clean_title(value, fallback)


def _title_from_form(fallback):
    return _clean_title(request.form.get('title') or request.args.get('title'), fallback)


def _attach_targets():
    """The (owner, student) pairs this upload should be filed against.

    Owners and students are separate columns rather than one person column, so
    the form sends two lists and we flatten them into one row spec per person.
    No people selected is still legal — an unfiled document sitting in the
    org's store, which is what the page did before it could attach at all.
    """
    targets = [{'owner_user_id': o, 'student_user_id': None}
               for o in _field_list('owner_user_id')]
    targets += [{'owner_user_id': None, 'student_user_id': s}
                for s in _field_list('student_user_id')]
    return targets or [{'owner_user_id': None, 'student_user_id': None}]


def _names_for(ids):
    """Map user_id -> display name for the given ids (one query)."""
    ids = [i for i in ids if i]
    if not ids:
        return {}
    # admin client justified: cross-user display-name hydration for org documents; callers are HR_ROLES-gated routes
    rows = (get_supabase_admin_client().table('users')
            .select('id, display_name, first_name, last_name, username, email')
            .in_('id', list(set(ids))).execute()).data or []
    return {r['id']: _display_name(r) for r in rows}


@bp.route('/secure-documents/upload', methods=['POST'])
@require_role(*STAFF_ROLES)
def upload_secure_document(user_id):
    """Upload a sensitive file to the PRIVATE secure-documents bucket and record
    a metadata row per person it is filed against.

    Multipart: `file` plus form/query fields organization_id, category, note,
    title, and `owner_user_id` / `student_user_id` — either of which may repeat
    to file one upload against several people at once.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err

    targets = _attach_targets()
    if len(targets) > _MAX_ATTACH_PEOPLE:
        return jsonify({'success': False,
                        'error': f'Attach to at most {_MAX_ATTACH_PEOPLE} people at a time'}), 400

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    file = request.files['file']
    file.seek(0, 2)
    size_bytes = file.tell()
    file.seek(0)
    ext, problem = sis_secure_docs_service.validate_upload(file.filename, size_bytes)
    if problem:
        return jsonify({'success': False, 'error': problem}), 400

    blob = file.read()
    # From the bytes, not from file.content_type — the uploader's header was
    # stored and served back verbatim by the signed URL, so a .pdf sent as
    # text/html became an executable page on the storage origin.
    content_type, problem = sis_secure_docs_service.resolve_content_type(blob, ext)
    if problem:
        return jsonify({'success': False, 'error': problem}), 400

    result = sis_secure_docs_service.store_document(
        org_id, user_id, blob, file.filename, ext, content_type,
        size_bytes, targets,
        title=_title_from_form(file.filename),
        category=_field('category'), note=_field('note'),
        shared_with_owner=(request.form.get('shared_with_owner')
                           or request.args.get('shared_with_owner')
                           or '').strip().lower() in ('1', 'true', 'yes'),
        # This blueprint is the HR store; the coordinator-reachable endpoints
        # pass 'general' explicitly (routes/sis/staff_admin.py).
        sensitivity=sis_secure_docs_service.clean_sensitivity(_field('sensitivity'), 'hr'),
    )
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 500)

    documents = result['documents']
    # `document` kept alongside `documents` for the single-person callers that
    # predate multi-attach.
    return jsonify({'success': True, 'documents': documents,
                    'document': documents[0]}), 201


@bp.route('/secure-documents/signature-requests', methods=['POST'])
@require_role(*STAFF_ROLES)
def send_hr_signature_request(user_id):
    """Send a document for signature, HR paperwork included (HR_ROLES).

    The coordinator-reachable twin lives at /api/sis/staff-admin/signature-requests
    and differs only in refusing sensitivity='hr'.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return signature_request_views.send_signature_request(user_id, org_id, allow_hr=True)


@bp.route('/secure-documents/signature-requests', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_hr_signature_requests(user_id):
    """Every send in the org, HR paperwork included."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return signature_request_views.list_signature_requests(org_id, include_hr=True)


@bp.route('/secure-documents/signature-requests/<assignment_id>/remind', methods=['POST'])
@require_role(*STAFF_ROLES)
def remind_hr_signature_request(user_id, assignment_id):
    """Chase one person who has not signed, employment paperwork included."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return signature_request_views.remind_signature_request(
        org_id, assignment_id, include_hr=True)


@bp.route('/secure-documents', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_secure_documents(user_id):
    """All secure documents for the org (newest first), hydrated with display
    names. Optional ?owner_user_id / ?student_user_id filters."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err

    # admin client justified: org-wide read of the service-role-only sis_secure_documents store; gated by @require_role(HR_ROLES), filtered to resolved org
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
    # admin client justified: service-role-only sis_secure_documents lookup; doc-belongs-to-org verified below before callers act on it
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
    if 'title' in data:
        # Renaming can't blank a document: clearing the box falls back to the
        # name the file arrived under, so the list always has something to show.
        fields['title'] = _clean_title(data.get('title'), doc.get('filename'))
    for key in ('category', 'note'):
        if key in data:
            fields[key] = (data.get(key) or '').strip() or None
    if not fields:
        return jsonify({'success': False, 'error': 'Nothing to update'}), 400
    # admin client justified: update of service-role-only sis_secure_documents; gated by @require_role(HR_ROLES) + _doc_or_error org check above
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
    url = sis_secure_docs_service.signed_url(doc['storage_path'])
    if not url:
        return jsonify({'success': False, 'error': 'Could not open the document'}), 500
    return jsonify({'success': True, 'url': url})


@bp.route('/secure-documents/<doc_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_secure_document(user_id, doc_id):
    """Remove the blob and delete the metadata row."""
    doc, _org_id, err = _doc_or_error(user_id, doc_id)
    if err:
        return err
    # admin client justified: blob removal + row delete on the service-role-only secure store; gated by @require_role(HR_ROLES) + _doc_or_error org check above
    supabase = get_supabase_admin_client()
    try:
        supabase.storage.from_(_SECURE_DOCS_BUCKET).remove([doc['storage_path']])
    except Exception:
        logger.debug('Secure document blob delete failed (non-fatal)', exc_info=True)
    supabase.table('sis_secure_documents').delete().eq('id', doc_id).execute()
    return jsonify({'success': True})
