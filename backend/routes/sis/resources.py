"""
SIS org resources — staff-managed document library (family guidebook, student
contract, links) that org families read back in the learning app.

NEW, additive (/api/sis/resources), staff-gated, org-scoped. Families read via
/api/sis/parent/resources (guardian-authorized in sis_parent_service).
"""

import uuid as _uuid
from datetime import datetime

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_resources', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')

_ORG_DOCS_BUCKET = 'org-documents'
_DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'}
_MAX_DOC_BYTES = 10 * 1024 * 1024


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


def _owned_resource(supabase, org_id, resource_id):
    rows = (supabase.table('org_resources').select('*')
            .eq('id', resource_id).limit(1).execute()).data or []
    if not rows or rows[0].get('organization_id') != org_id:
        return None
    return rows[0]


def _org_paperwork(supabase, org_id):
    """The org's registration-form paperwork items (key/label/doc_url), so the
    Resources UI can offer linking. Empty for orgs without the funnel."""
    row = (supabase.table('organizations').select('feature_flags')
           .eq('id', org_id).limit(1).execute()).data or []
    cfg = ((row[0].get('feature_flags') or {}) if row else {}).get('icreate_registration') or {}
    return [{'key': p.get('key'), 'label': p.get('label'), 'doc_url': p.get('doc_url') or ''}
            for p in (cfg.get('paperwork') or []) if p.get('key') and p.get('label')]


def _claim_paperwork_key(supabase, org_id, paperwork_key, resource_id=None):
    """A paperwork item is backed by at most ONE resource (the funnel serves the
    linked resource's url) — linking here unlinks it anywhere else."""
    q = supabase.table('org_resources').update({'paperwork_key': None}) \
        .eq('organization_id', org_id).eq('paperwork_key', paperwork_key)
    if resource_id:
        q = q.neq('id', resource_id)
    q.execute()


@bp.route('/resources', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_resources(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    rows = (supabase.table('org_resources').select('*')
            .eq('organization_id', org_id)
            .order('sort_order').order('title').execute()).data or []
    return jsonify({'success': True, 'resources': rows,
                    'paperwork': _org_paperwork(supabase, org_id)})


@bp.route('/resources', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_resource(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    title = (data.get('title') or '').strip()
    url = (data.get('url') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'Title is required'}), 400
    if not url:
        return jsonify({'success': False, 'error': 'A link or uploaded file is required'}), 400
    supabase = get_supabase_admin_client()
    paperwork_key = (data.get('paperwork_key') or '').strip() or None
    if paperwork_key:
        if not any(p['key'] == paperwork_key for p in _org_paperwork(supabase, org_id)):
            return jsonify({'success': False, 'error': 'Unknown registration form document'}), 400
        _claim_paperwork_key(supabase, org_id, paperwork_key)
    row = (supabase.table('org_resources').insert({
        'organization_id': org_id,
        'title': title,
        'description': (data.get('description') or '').strip() or None,
        'url': url,
        'category': (data.get('category') or '').strip() or None,
        'sort_order': int(data.get('sort_order') or 0),
        'paperwork_key': paperwork_key,
        'created_by': user_id,
    }).execute()).data
    return jsonify({'success': True, 'resource': row[0] if row else None}), 201


@bp.route('/resources/<resource_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_resource(user_id, resource_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    if not _owned_resource(supabase, org_id, resource_id):
        return jsonify({'success': False, 'error': 'Resource not found'}), 404
    data = request.json or {}
    fields = {}
    for k in ('title', 'description', 'url', 'category'):
        if k in data:
            fields[k] = (data.get(k) or '').strip() or None
    if 'sort_order' in data:
        fields['sort_order'] = int(data.get('sort_order') or 0)
    if 'paperwork_key' in data:
        key = (data.get('paperwork_key') or '').strip() or None
        if key:
            if not any(p['key'] == key for p in _org_paperwork(supabase, org_id)):
                return jsonify({'success': False, 'error': 'Unknown registration form document'}), 400
            _claim_paperwork_key(supabase, org_id, key, resource_id=resource_id)
        fields['paperwork_key'] = key
    if fields.get('title') is None and 'title' in fields:
        return jsonify({'success': False, 'error': 'Title is required'}), 400
    fields['updated_at'] = datetime.utcnow().isoformat()
    row = (supabase.table('org_resources').update(fields).eq('id', resource_id).execute()).data
    return jsonify({'success': True, 'resource': row[0] if row else None})


@bp.route('/resources/<resource_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def delete_resource(user_id, resource_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    if not _owned_resource(supabase, org_id, resource_id):
        return jsonify({'success': False, 'error': 'Resource not found'}), 404
    supabase.table('org_resources').delete().eq('id', resource_id).execute()
    return jsonify({'success': True})


@bp.route('/resources/upload', methods=['POST'])
@require_role(*STAFF_ROLES)
def upload_resource_file(user_id):
    """Upload a document to the org-documents bucket; returns its public URL
    (mirrors the paperwork-doc upload in catalog.py)."""
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
        return jsonify({'success': False, 'error': 'Allowed types: pdf, doc, docx, png, jpg, webp'}), 400
    file.seek(0, 2)
    if file.tell() > _MAX_DOC_BYTES:
        return jsonify({'success': False, 'error': 'File size exceeds 10MB limit'}), 400
    file.seek(0)

    supabase = get_supabase_admin_client()
    try:
        if not supabase.storage.get_bucket(_ORG_DOCS_BUCKET):
            supabase.storage.create_bucket(_ORG_DOCS_BUCKET, options={'public': True})
    except Exception:
        try:
            supabase.storage.create_bucket(_ORG_DOCS_BUCKET, options={'public': True})
        except Exception:
            pass

    path = f"{org_id}/resources/{_uuid.uuid4().hex}.{ext}"
    try:
        supabase.storage.from_(_ORG_DOCS_BUCKET).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or 'application/octet-stream'},
        )
        url = supabase.storage.from_(_ORG_DOCS_BUCKET).get_public_url(path)
    except Exception as e:
        logger.error(f'Resource upload failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to upload file'}), 500
    return jsonify({'success': True, 'url': url})
