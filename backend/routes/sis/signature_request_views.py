"""
Send-a-document-for-signature, as two view bodies shared by two blueprints.

The same action is reachable from two places with different rules: the front
office (ADMIN_ROLES, routes/sis/staff_admin.py) sends ordinary campus paperwork,
and HR (HR_ROLES, routes/sis/secure_documents.py) may also send employment
paperwork. Rather than two handlers that drift apart, both call these with the
one flag that differs — `allow_hr` — so the difference between the two surfaces
stays a single argument instead of a diff.

This module registers no routes of its own. Flask silently dispatches duplicate
rules to whichever blueprint registered first (see CLAUDE.md, "One route, one
owner"), so a shared *view body* is the safe way to share a handler; a shared
*blueprint* is not.
"""

from flask import request, jsonify

from services import sis_onboarding_service, sis_secure_docs_service
from utils.logger import get_logger

logger = get_logger(__name__)

_MAX_MESSAGE_LEN = 1000


def _recipients_from_request():
    """[{'id', 'audience'}] from repeated multipart fields.

    Two fields rather than one with an audience column because the caller
    already knows which list a person came from — the picker has a Staff tab and
    a Families tab — and audience decides which portal their notification points
    at. Order is preserved and ids are de-duped downstream.
    """
    out = []
    for key, audience in (('staff_user_id', 'staff'), ('family_user_id', 'family')):
        for raw in (request.form.getlist(key) or request.args.getlist(key)):
            uid = (raw or '').strip()
            if uid:
                out.append({'id': uid, 'audience': audience})
    return out


def _field(key):
    v = (request.form.get(key) or request.args.get(key) or '').strip()
    return v or None


def send_signature_request(user_id, org_id, allow_hr: bool):
    """Upload (or re-send) a document and assign each recipient a task to sign it.

    Multipart: `file` OR `document_id` (re-send something already in the store),
    plus repeated `staff_user_id` / `family_user_id`, and optional title,
    message, due_date, sensitivity.
    """
    recipients = _recipients_from_request()
    if not recipients:
        return jsonify({'success': False,
                        'error': 'Select at least one person to send this to'}), 400
    if len(recipients) > sis_secure_docs_service.MAX_ATTACH_PEOPLE:
        return jsonify({
            'success': False,
            'error': f'Send to at most {sis_secure_docs_service.MAX_ATTACH_PEOPLE} people at a time',
        }), 400

    sensitivity = sis_secure_docs_service.clean_sensitivity(_field('sensitivity'), 'general')
    if sensitivity == 'hr' and not allow_hr:
        # The coordinator restriction is about the contents of the document, so
        # it is enforced here rather than by withholding the endpoint.
        return jsonify({'success': False,
                        'error': 'Only an administrator can send HR paperwork'}), 403

    source_id = _field('document_id')
    if source_id:
        source = sis_secure_docs_service.get_document(org_id, source_id)
        if not source:
            return jsonify({'success': False, 'error': 'Document not found'}), 404
        if source.get('sensitivity') == 'hr' and not allow_hr:
            return jsonify({'success': False, 'error': 'Document not found'}), 404
        blob = sis_secure_docs_service.load_blob(source['storage_path'])
        if blob is None:
            return jsonify({'success': False, 'error': 'Could not read that document'}), 500
        filename = source.get('filename') or 'document.pdf'
        ext, problem = sis_secure_docs_service.validate_upload(filename, len(blob))
        if problem:
            return jsonify({'success': False, 'error': problem}), 400
        content_type = source.get('content_type')
        size_bytes = source.get('size_bytes') or len(blob)
        title = _field('title') or source.get('title') or filename
        # Re-sending an HR document keeps it HR: sensitivity travels with the
        # document, and cannot be downgraded by the send that copies it.
        sensitivity = source.get('sensitivity') or sensitivity
    else:
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
        filename = file.filename
        # Deliberately NOT file.content_type: that is the uploader's claim, and
        # it used to be stored and served back verbatim by the signed URL.
        content_type, problem = sis_secure_docs_service.resolve_content_type(blob, ext)
        if problem:
            return jsonify({'success': False, 'error': problem}), 400
        title = _field('title') or filename

    message = (_field('message') or '')[:_MAX_MESSAGE_LEN] or None
    result = sis_onboarding_service.send_for_signature(
        org_id, user_id, blob, filename, ext, content_type, size_bytes,
        recipients, title=title, message=message,
        due_date=_field('due_date'), sensitivity=sensitivity,
    )
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result}), 201


def list_signature_requests(org_id, include_hr: bool):
    """Sends, newest first, with per-recipient signing progress."""
    batches = sis_onboarding_service.list_signature_batches(org_id, include_hr=include_hr)
    return jsonify({'success': True, 'batches': batches})


def remind_signature_request(org_id, assignment_id, include_hr: bool):
    """Re-notify one recipient who has not signed yet."""
    result = sis_onboarding_service.remind_signature_recipient(
        org_id, assignment_id, include_hr=include_hr)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, **result})
