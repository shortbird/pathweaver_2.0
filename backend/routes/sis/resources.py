"""
SIS org resources — staff-managed document library (family guidebook, student
contract, links) that org families read back in the web platform.

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
from utils.sis_roles import STAFF_ROLES, ADMIN_ROLES, clean_visible_roles
from utils.registration_config import get_registration_config, with_registration_config
from utils.storage_url import fix_storage_url
from utils.storage_urls import (
    parse_object_ref,
    public_object_url,
    sign_in_place,
    sign_stored_url,
)

logger = get_logger(__name__)


def _stored_resource_url(value):
    """Reduce a submitted resource URL to what we persist.

    `org-documents` is private, so the client only ever holds a SIGNED link to
    an uploaded document; saving the row would otherwise write that expiring
    capability into the column. External links (a Google Doc, a video) fall
    through to the existing branded-domain normalization untouched.
    """
    text = (value or '').strip()
    if not text:
        return None
    ref = parse_object_ref(text)
    return public_object_url(*ref) if ref else fix_storage_url(text)

bp = Blueprint('sis_resources', __name__, url_prefix='/api/sis')


_ORG_DOCS_BUCKET = 'org-documents'
_DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'}
_MAX_DOC_BYTES = 10 * 1024 * 1024


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
    cfg = get_registration_config(row[0].get('feature_flags') if row else None)
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
    inline doc_url snapshot in the registration flag's paperwork so the
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
    cfg = get_registration_config(flags)
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
    flags = with_registration_config(flags, cfg)
    supabase.table('organizations').update({'feature_flags': flags}).eq('id', org_id).execute()


@bp.route('/resources', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_resources(user_id):
    """Resource library. Admins see everything (and manage it); advisors see the
    staff knowledge base (audience staff/all) plus their own ack status."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # admin client justified: org-wide org_resources + sis_resource_acks read gated by @require_role(STAFF_ROLES); audience/role visibility filtered in code below
    supabase = get_supabase_admin_client()
    rows = (supabase.table('org_resources').select('*')
            .eq('organization_id', org_id)
            .order('sort_order').order('title').execute()).data or []
    is_admin = sis_service.caller_is_admin(user_id)
    if not is_admin:
        rows = [r for r in rows if (r.get('audience') or 'families') in ('staff', 'all')]
        # A row narrowed to roles the caller does not hold is not theirs to see
        # (iCreate 2026-08-09: coordinator procedures are not teacher reading).
        rows = sis_service.filter_role_visible(user_id, rows)
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
    # Uploaded documents live in the private `org-documents` bucket: sign the
    # whole library in one batched call. External links pass through untouched.
    # No bucket hint: every stored value is a full URL, and the bucket is read
    # out of it, so a plain external link can never be mistaken for a path.
    sign_in_place(rows, ['url'])
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
    # admin client justified: reads organizations.feature_flags + creates org_resources rows for the org; gated by @require_role(ADMIN_ROLES)
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
    # admin client justified: self-scoped sis_resource_acks upsert (user_id from @require_role) after resource-belongs-to-org check below
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
    # admin client justified: cross-user read of all staff acknowledgments for a completion report; gated by @require_role(ADMIN_ROLES) + resource org check below
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
    # A role-narrowed resource reports against its targeted staff only —
    # "3 of 3 coordinators", not "3 of 19 staff, 16 of whom were never asked".
    for s in _targeted_staff(org_id, resource.get('visible_to_roles')):
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
    # Store the canonical pointer for an uploaded doc; the branded domain for a link.
    url = _stored_resource_url(data.get('url'))
    if not title:
        return jsonify({'success': False, 'error': 'Title is required'}), 400
    if not url:
        return jsonify({'success': False, 'error': 'A link or uploaded file is required'}), 400
    # admin client justified: org_resources create + organizations.feature_flags paperwork bookkeeping; gated by @require_role(ADMIN_ROLES), row pinned to resolved org
    supabase = get_supabase_admin_client()
    paperwork_key = (data.get('paperwork_key') or '').strip() or None
    if paperwork_key:
        if not any(p['key'] == paperwork_key for p in _org_paperwork(supabase, org_id)):
            return jsonify({'success': False, 'error': 'Unknown registration form document'}), 400
        _claim_paperwork_key(supabase, org_id, paperwork_key)
    audience = data.get('audience') or 'families'
    if audience not in ('families', 'staff', 'all'):
        return jsonify({'success': False, 'error': 'Invalid audience'}), 400
    visible_to_roles, roles_err = clean_visible_roles(data.get('visible_to_roles'))
    if roles_err:
        return jsonify({'success': False, 'error': roles_err}), 400
    # Named people, alongside (not instead of) roles — see filter_role_visible.
    visible_to_user_ids, people_err = _clean_visible_people(
        data.get('visible_to_user_ids'), org_id, supabase)
    if people_err:
        return jsonify({'success': False, 'error': people_err}), 400
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
        'visible_to_roles': visible_to_roles,
        'visible_to_user_ids': visible_to_user_ids,
        'pinned': bool(data.get('pinned')),
        'requires_ack': requires_ack,
        'version_date': datetime.utcnow().isoformat() if requires_ack else None,
        'created_by': user_id,
    }).execute()).data
    resource = row[0] if row else None
    if requires_ack and audience in ('staff', 'all') and resource:
        _notify_staff_required_read(org_id, title, visible_to_roles=visible_to_roles)
    return jsonify({'success': True, 'resource': resource}), 201


def _clean_visible_people(value, org_id, supabase):
    """Normalise a visible_to_user_ids payload.

    Returns (ids, error): None for "nobody in particular" (null/empty), else a
    de-duped list of people who are actually in this school — a resource pinned
    to a stranger's id would be invisible to everyone and look like a bug.
    """
    if not value:
        return None, None
    if not isinstance(value, (list, tuple)):
        return None, 'visible_to_user_ids must be a list of people'
    wanted = [str(v) for v in value if v]
    if not wanted:
        return None, None
    rows = (supabase.table('users').select('id')
            .eq('organization_id', org_id).in_('id', wanted).execute()).data or []
    known = {r['id'] for r in rows}
    missing = [w for w in wanted if w not in known]
    if missing:
        return None, 'Those people are not in this school'
    return sorted(known), None


def _targeted_staff(org_id, visible_to_roles=None):
    """The staff a role-narrowed resource is for — everyone when untargeted."""
    staff = sis_service.list_org_staff(org_id)
    if not visible_to_roles:
        return staff
    wanted = set(visible_to_roles)
    return [s for s in staff if wanted & set(s.get('roles') or [])]


def _notify_staff_required_read(org_id, title, visible_to_roles=None):
    from services import sis_notifications
    for s in _targeted_staff(org_id, visible_to_roles):
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
    # admin client justified: org_resources update + feature_flags paperwork bookkeeping; gated by @require_role(ADMIN_ROLES) + resource-belongs-to-org check below
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
    if fields.get('url'):
        fields['url'] = _stored_resource_url(fields['url'])
    if 'sort_order' in data:
        fields['sort_order'] = int(data.get('sort_order') or 0)
    if 'audience' in data:
        if data['audience'] not in ('families', 'staff', 'all'):
            return jsonify({'success': False, 'error': 'Invalid audience'}), 400
        fields['audience'] = data['audience']
    if 'visible_to_roles' in data:
        visible_to_roles, roles_err = clean_visible_roles(data.get('visible_to_roles'))
        if roles_err:
            return jsonify({'success': False, 'error': roles_err}), 400
        fields['visible_to_roles'] = visible_to_roles
    if 'visible_to_user_ids' in data:
        people, people_err = _clean_visible_people(
            data.get('visible_to_user_ids'), org_id, supabase)
        if people_err:
            return jsonify({'success': False, 'error': people_err}), 400
        fields['visible_to_user_ids'] = people
    if 'requires_ack' in data:
        fields['requires_ack'] = bool(data.get('requires_ack'))
    if 'pinned' in data:
        fields['pinned'] = bool(data.get('pinned'))
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
        _notify_staff_required_read(org_id, updated.get('title') or 'A policy update',
                                    visible_to_roles=updated.get('visible_to_roles'))
    return jsonify({'success': True, 'resource': updated})


@bp.route('/resources/<resource_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_resource(user_id, resource_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # admin client justified: org_resources delete + feature_flags cleanup; gated by @require_role(ADMIN_ROLES) + resource-belongs-to-org check below
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
    """Upload a document to the PRIVATE org-documents bucket. Returns the
    canonical pointer to persist (`url`) and a short-lived signed twin for the
    preview (`display_url`). Mirrors the paperwork-doc upload in catalog.py."""
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

    # admin client justified: storage bucket create/upload to org-documents (service-role-only storage ops); gated by @require_role(ADMIN_ROLES), path pinned to resolved org
    supabase = get_supabase_admin_client()
    try:
        if not supabase.storage.get_bucket(_ORG_DOCS_BUCKET):
            supabase.storage.create_bucket(_ORG_DOCS_BUCKET)
    except Exception:
        try:
            supabase.storage.create_bucket(_ORG_DOCS_BUCKET)
        except Exception:
            # create-if-missing: the error means it already exists
            ...

    path = f"{org_id}/resources/{_uuid.uuid4().hex}.{ext}"
    try:
        supabase.storage.from_(_ORG_DOCS_BUCKET).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or 'application/octet-stream'},
        )
        url = public_object_url(_ORG_DOCS_BUCKET, path)
    except Exception as e:
        logger.error(f'Resource upload failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to upload file'}), 500
    return jsonify({
        'success': True,
        'url': url,
        'display_url': sign_stored_url(url, _ORG_DOCS_BUCKET),
    })
