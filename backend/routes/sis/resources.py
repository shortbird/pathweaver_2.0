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
ADMIN_ROLES = ('org_admin', 'superadmin')

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


def _clear_inline_paperwork_doc(supabase, org_id, paperwork_key):
    """When the resource backing a paperwork item is deleted or unlinked, drop the
    inline doc_url snapshot in feature_flags.icreate_registration.paperwork so the
    funnel doesn't silently fall back to a stale file. The paperwork item itself
    (key/label/body) is preserved — the form just shows no document until a new
    resource is linked. No-op when nothing is linked or nothing changes."""
    if not paperwork_key:
        return
    row = (supabase.table('organizations').select('feature_flags')
           .eq('id', org_id).limit(1).execute()).data or []
    if not row:
        return
    flags = row[0].get('feature_flags') or {}
    cfg = flags.get('icreate_registration')
    if not cfg:
        return
    items = cfg.get('paperwork') or []
    changed = False
    for it in items:
        if it.get('key') == paperwork_key and it.get('doc_url'):
            it['doc_url'] = ''
            changed = True
    if not changed:
        return
    cfg['paperwork'] = items
    flags['icreate_registration'] = cfg
    supabase.table('organizations').update({'feature_flags': flags}).eq('id', org_id).execute()


@bp.route('/resources', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_resources(user_id):
    """Resource library. Admins see everything (and manage it); advisors see the
    staff knowledge base (audience staff/all) plus their own ack status."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    rows = (supabase.table('org_resources').select('*')
            .eq('organization_id', org_id)
            .order('sort_order').order('title').execute()).data or []
    is_admin = sis_service.caller_is_admin(user_id)
    if not is_admin:
        rows = [r for r in rows if (r.get('audience') or 'families') in ('staff', 'all')]
    # Caller's own acknowledgments (stale when the resource was re-versioned since).
    acks = {}
    if rows:
        ack_rows = (supabase.table('sis_resource_acks')
                    .select('resource_id, version_date, acknowledged_at')
                    .eq('user_id', user_id)
                    .in_('resource_id', [r['id'] for r in rows]).execute()).data or []
        acks = {a['resource_id']: a for a in ack_rows}
    for r in rows:
        mine = acks.get(r['id'])
        current = bool(mine) and ((r.get('version_date') or '') <= (mine.get('version_date') or ''))
        r['my_ack'] = {'acknowledged_at': mine.get('acknowledged_at'), 'current': current} if mine else None
    payload = {'success': True, 'resources': rows}
    if is_admin:
        payload['paperwork'] = _org_paperwork(supabase, org_id)
    return jsonify(payload)


@bp.route('/resources/reconcile-paperwork', methods=['POST'])
@require_role(*ADMIN_ROLES)
def reconcile_paperwork_resources(user_id):
    """Ensure every registration paperwork item that has an uploaded document is
    backed by a linked org_resources row, so the Resources library is the single
    source of truth for that document (the funnel serves the resource's url).

    Called right after the registration config is saved (keys are assigned then).
    Create-only: an item that already has a linked resource is left untouched —
    its document is edited/replaced/deleted in the Resources tab, not here — so a
    later save never clobbers a Resources-tab edit. Returns how many were created.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    paperwork = _org_paperwork(supabase, org_id)  # [{key, label, doc_url}]
    existing = (supabase.table('org_resources').select('paperwork_key')
                .eq('organization_id', org_id).execute()).data or []
    linked_keys = {r['paperwork_key'] for r in existing if r.get('paperwork_key')}
    created = 0
    for p in paperwork:
        key, label, doc_url = p.get('key'), p.get('label'), (p.get('doc_url') or '').strip()
        if not key or not doc_url or key in linked_keys:
            continue
        # Guard against a stray prior link to this key without a doc.
        _claim_paperwork_key(supabase, org_id, key)
        supabase.table('org_resources').insert({
            'organization_id': org_id,
            'title': label or 'Registration form',
            'url': doc_url,
            'category': 'Registration',
            'paperwork_key': key,
            'created_by': user_id,
        }).execute()
        linked_keys.add(key)
        created += 1
    return jsonify({'success': True, 'created': created})


@bp.route('/resources/<resource_id>/ack', methods=['POST'])
@require_role(*STAFF_ROLES)
def acknowledge_resource(user_id, resource_id):
    """Staff member confirms they have read/watched a required resource."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    resource = _owned_resource(supabase, org_id, resource_id)
    if not resource or (resource.get('audience') or 'families') == 'families':
        return jsonify({'success': False, 'error': 'Resource not found'}), 404
    row = (supabase.table('sis_resource_acks').upsert({
        'resource_id': resource_id, 'user_id': user_id,
        'version_date': resource.get('version_date'),
        'acknowledged_at': datetime.utcnow().isoformat(),
    }, on_conflict='resource_id,user_id').execute()).data
    return jsonify({'success': True, 'ack': row[0] if row else None})


@bp.route('/resources/<resource_id>/acks', methods=['GET'])
@require_role(*ADMIN_ROLES)
def resource_acks(user_id, resource_id):
    """Completion report: which staff members have acknowledged this resource
    (and whether their ack predates the current version)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    resource = _owned_resource(supabase, org_id, resource_id)
    if not resource:
        return jsonify({'success': False, 'error': 'Resource not found'}), 404
    acks = {a['user_id']: a for a in (
        supabase.table('sis_resource_acks')
        .select('user_id, version_date, acknowledged_at')
        .eq('resource_id', resource_id).execute()
    ).data or []}
    out = []
    for s in sis_service.list_org_staff(org_id):
        a = acks.get(s['id'])
        current = bool(a) and ((resource.get('version_date') or '') <= (a.get('version_date') or ''))
        out.append({'user_id': s['id'], 'name': s['name'], 'roles': s['roles'],
                    'acknowledged_at': a.get('acknowledged_at') if a else None,
                    'current': current})
    return jsonify({'success': True, 'staff': out})


@bp.route('/resources', methods=['POST'])
@require_role(*ADMIN_ROLES)
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
    audience = data.get('audience') or 'families'
    if audience not in ('families', 'staff', 'all'):
        return jsonify({'success': False, 'error': 'Invalid audience'}), 400
    requires_ack = bool(data.get('requires_ack'))
    row = (supabase.table('org_resources').insert({
        'organization_id': org_id,
        'title': title,
        'description': (data.get('description') or '').strip() or None,
        'url': url,
        'category': (data.get('category') or '').strip() or None,
        'sort_order': int(data.get('sort_order') or 0),
        'paperwork_key': paperwork_key,
        'audience': audience,
        'requires_ack': requires_ack,
        'version_date': datetime.utcnow().isoformat() if requires_ack else None,
        'created_by': user_id,
    }).execute()).data
    resource = row[0] if row else None
    if requires_ack and audience in ('staff', 'all') and resource:
        _notify_staff_required_read(org_id, title)
    return jsonify({'success': True, 'resource': resource}), 201


def _notify_staff_required_read(org_id, title):
    from services import sis_notifications
    for s in sis_service.list_org_staff(org_id):
        sis_notifications.notify(
            s['id'], 'Required reading',
            f'Please review and acknowledge: {title}',
            link='/resources', organization_id=org_id)


@bp.route('/resources/<resource_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_resource(user_id, resource_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    existing = _owned_resource(supabase, org_id, resource_id)
    if not existing:
        return jsonify({'success': False, 'error': 'Resource not found'}), 404
    old_paperwork_key = existing.get('paperwork_key')
    data = request.json or {}
    fields = {}
    for k in ('title', 'description', 'url', 'category'):
        if k in data:
            fields[k] = (data.get(k) or '').strip() or None
    if 'sort_order' in data:
        fields['sort_order'] = int(data.get('sort_order') or 0)
    if 'audience' in data:
        if data['audience'] not in ('families', 'staff', 'all'):
            return jsonify({'success': False, 'error': 'Invalid audience'}), 400
        fields['audience'] = data['audience']
    if 'requires_ack' in data:
        fields['requires_ack'] = bool(data.get('requires_ack'))
    # "Everyone must re-read this" — bump the version so prior acks go stale.
    if data.get('reack'):
        fields['version_date'] = datetime.utcnow().isoformat()
    if 'paperwork_key' in data:
        key = (data.get('paperwork_key') or '').strip() or None
        if key:
            if not any(p['key'] == key for p in _org_paperwork(supabase, org_id)):
                return jsonify({'success': False, 'error': 'Unknown registration form document'}), 400
            _claim_paperwork_key(supabase, org_id, key, resource_id=resource_id)
        fields['paperwork_key'] = key
        # Unlinking this resource (or moving it to a different paperwork item)
        # leaves the old item with no backing resource — drop its stale inline
        # doc_url so the funnel doesn't fall back to a frozen snapshot.
        if old_paperwork_key and old_paperwork_key != key:
            _clear_inline_paperwork_doc(supabase, org_id, old_paperwork_key)
    if fields.get('title') is None and 'title' in fields:
        return jsonify({'success': False, 'error': 'Title is required'}), 400
    fields['updated_at'] = datetime.utcnow().isoformat()
    row = (supabase.table('org_resources').update(fields).eq('id', resource_id).execute()).data
    updated = row[0] if row else None
    if data.get('reack') and updated and updated.get('requires_ack') \
            and (updated.get('audience') or 'families') in ('staff', 'all'):
        _notify_staff_required_read(org_id, updated.get('title') or 'A policy update')
    return jsonify({'success': True, 'resource': updated})


@bp.route('/resources/<resource_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_resource(user_id, resource_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    supabase = get_supabase_admin_client()
    existing = _owned_resource(supabase, org_id, resource_id)
    if not existing:
        return jsonify({'success': False, 'error': 'Resource not found'}), 404
    supabase.table('org_resources').delete().eq('id', resource_id).execute()
    # If this resource backed a registration paperwork item, remove the form's
    # document too — the resource was the single source of truth, so deleting it
    # deletes the doc from the form (no stale inline snapshot left behind).
    _clear_inline_paperwork_doc(supabase, org_id, existing.get('paperwork_key'))
    return jsonify({'success': True})


@bp.route('/resources/upload', methods=['POST'])
@require_role(*ADMIN_ROLES)
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
