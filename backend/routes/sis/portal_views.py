"""
The bodies of the two portals, mounted twice.

A teacher's portal (routes/sis/staff_portal.py) and a family's
(routes/sis/parent.py) each listed their checklists, ticked an item, uploaded a
document for one, opened it back, opened a document the office sent for
signature and listed their tasks -- the same six bodies twice, differing by
the bucket, the audience and whether an admin may open anybody's file
(docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, F5; M9 in
docs/sis/CONSOLIDATION_PLAN.md). Each body lives here once, taking the org
and the person as arguments; the two route modules keep their rules, their
owners and their gates (STAFF_ROLES + a module on one side, @require_auth +
a module on the other -- docs/sis/ROLE_CAPABILITIES.md) and call in. The
pattern is signature_request_views.py's.

Nothing here decides who the caller is or whether they may be here; the
routes decided before calling.
"""

import uuid

from flask import request, jsonify

from database import get_supabase_admin_client
from services import sis_forms_service as forms
from services import sis_onboarding_service as onboarding
from services import sis_secure_docs_service
from services import sis_tasks_service
from utils.logger import get_logger

logger = get_logger(__name__)

STAFF_DOCS_BUCKET = 'staff-documents'      # PRIVATE (a teacher's onboarding uploads)
FAMILY_DOCS_BUCKET = 'family-documents'    # PRIVATE (a family's checklist uploads)
DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'}
MAX_DOC_BYTES = 10 * 1024 * 1024


# ── Checklists ─────────────────────────────────────────────────────────────────

def list_onboarding(org_id, target_user_id, audience):
    """The checklists assigned to one person, for one audience: a guardian who
    is also on staff sees their family paperwork on the family side and their
    teacher onboarding in the console, never both in either place (2026-08-05)."""
    return jsonify({'success': True,
                    'assignments': onboarding.list_assignments(
                        org_id, user_id=target_user_id, audience=audience)})


def update_onboarding_item(org_id, user_id, assignment_id, item_key, *, is_admin):
    """Tick, sign or attach a document to one checklist item. The signing
    address is corroboration for a typed signature, so it comes from the
    request rather than from anything the client can set. A guardian can mark
    their own items done, never approve (is_admin=False)."""
    fields = {**(request.get_json() or {}), 'signature_ip': request.remote_addr}
    result = onboarding.update_item(org_id, assignment_id, item_key, fields,
                                    actor_id=user_id, is_admin=is_admin)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


# ── Uploaded documents ─────────────────────────────────────────────────────────

def _ensure_bucket(supabase, bucket):
    try:
        if not supabase.storage.get_bucket(bucket):
            supabase.storage.create_bucket(bucket, options={'public': False})
    except Exception:  # noqa: BLE001 -- bucket likely already exists
        try:
            supabase.storage.create_bucket(bucket, options={'public': False})
        except Exception:  # noqa: BLE001
            # create-if-missing: the error means it already exists
            ...


def upload_doc(org_id, user_id, bucket):
    """Put one document for a checklist item in the caller's own folder of a
    PRIVATE bucket ({org}/{user}/{uuid}.{ext}); reads go through doc_url."""
    f = request.files.get('file')
    if not f or not f.filename:
        return jsonify({'success': False, 'error': 'A file is required'}), 400
    ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
    if ext not in DOC_EXTENSIONS:
        return jsonify({'success': False, 'error': 'Allowed types: pdf, doc, docx, png, jpg, webp'}), 400
    blob = f.read()
    if len(blob) > MAX_DOC_BYTES:
        return jsonify({'success': False, 'error': 'File is too large (max 10MB)'}), 400
    # admin client justified: upload to a PRIVATE bucket (service-role-only storage); the path is pinned to the org and the authenticated caller
    supabase = get_supabase_admin_client()
    _ensure_bucket(supabase, bucket)
    path = f'{org_id}/{user_id}/{uuid.uuid4().hex}.{ext}'
    try:
        supabase.storage.from_(bucket).upload(
            path=path, file=blob,
            file_options={'content-type': f.mimetype or 'application/octet-stream'})
    except Exception as e:  # noqa: BLE001
        logger.error(f'portal upload failed ({bucket}): {e}')
        return jsonify({'success': False, 'error': 'Upload failed'}), 500
    return jsonify({'success': True, 'path': path})


def doc_url(org_id, user_id, bucket, *, any_in_org=False):
    """A short-lived signed URL for an uploaded document. The path scheme is
    {org}/{user}/{file}: a person may open their own; an admin (`any_in_org`)
    may open any file in their org."""
    path = request.args.get('path') or ''
    if not org_id or not path:
        return jsonify({'success': False, 'error': 'organization_id and path are required'}), 400
    parts = path.split('/')
    if len(parts) < 3 or parts[0] != org_id or (not any_in_org and parts[1] != user_id):
        return jsonify({'success': False, 'error': 'Not authorized for this file'}), 403
    try:
        # admin client justified: signed URL on a private bucket; the path prefix was verified above
        signed = (get_supabase_admin_client().storage.from_(bucket)
                  .create_signed_url(path, 3600))
        url = signed.get('signedURL') or signed.get('signedUrl')
    except Exception as e:  # noqa: BLE001
        logger.error(f'portal doc-url failed ({bucket}): {e}')
        url = None
    if not url:
        return jsonify({'success': False, 'error': 'Could not open the document'}), 404
    return jsonify({'success': True, 'url': url})


# ── Documents the office sent ─────────────────────────────────────────────────

def office_document_url(org_id, owner_user_id, doc_id):
    """Open a document the office put in this person's portal (a contract, a
    form to sign). Only when it is filed against them, shared with them, and
    belongs to the org in context -- re-checked here, never trusted from the
    list call."""
    # admin client justified: sis_secure_documents is service-role-only; ownership + sharing + org are all verified below before any URL is signed
    rows = (get_supabase_admin_client().table('sis_secure_documents')
            .select('id, organization_id, owner_user_id, shared_with_owner, storage_path')
            .eq('id', doc_id).limit(1).execute()).data or []
    doc = rows[0] if rows else None
    if (not doc or doc.get('organization_id') != org_id
            or doc.get('owner_user_id') != owner_user_id
            or not doc.get('shared_with_owner')):
        return jsonify({'success': False, 'error': 'Document not found'}), 404
    url = sis_secure_docs_service.signed_url(doc['storage_path'])
    if not url:
        return jsonify({'success': False, 'error': 'Could not open the document'}), 500
    return jsonify({'success': True, 'url': url})


# ── Tasks and forms ────────────────────────────────────────────────────────────

def list_tasks(org_id, user_id, audience, *, include_done=False):
    """One person's side of the unified inbox: their checklists and any
    document sent to them to sign, for one audience."""
    result = sis_tasks_service.list_my_tasks(org_id, user_id, audience=audience,
                                             include_done=include_done)
    return jsonify({'success': True, **result})


def list_assigned_tasks(org_id, target_user_id):
    """Open requests assigned to a staff member."""
    return jsonify({'success': True, 'tasks': forms.list_assigned(org_id, target_user_id)})


def list_my_forms(org_id, target_user_id, roles):
    """A staff member's own submissions, the built-in form types and the
    school's own forms with the questions each one asks."""
    from services import sis_form_template_service as form_templates
    return jsonify({'success': True,
                    'submissions': forms.list_mine(org_id, target_user_id),
                    'form_types': forms.FORM_TYPES,
                    'forms': form_templates.submittable_forms(org_id, 'staff', roles=roles)})


def submit_form(org_id, user_id):
    result = forms.submit(org_id, user_id, request.get_json() or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201
