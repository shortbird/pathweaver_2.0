"""
SIS Community Hub — org community section (Announcements, Lost & Found, Recognition)
plus a read-only Highlights feed and thin surfaces for the existing Events/Resources.

NEW, additive (/api/sis/community/*), staff-gated, org-scoped. Reads are staff-
readable (STAFF_ROLES); writes are admin/staff per module. Recognition can be posted
by any staff member (v1); announcements and lost&found are managed by admins. The
three backing tables are deny-all RLS — everything goes through the service-role
admin client in sis_community_service; this route enforces role + org scoping.
"""

import uuid as _uuid

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from database import get_supabase_admin_client
from services import sis_community_service as community
from routes.sis import _org_or_error, STAFF_ROLES, ADMIN_ROLES
from utils.storage_urls import public_object_url, sign_stored_url

logger = get_logger(__name__)

bp = Blueprint('sis_community', __name__, url_prefix='/api/sis/community')

# Lost & Found photos reuse the family-images upload pattern. The bucket is
# private (utils.storage_urls.PRIVATE_MEDIA_BUCKETS): store the canonical
# pointer, serve a signed URL.
_IMAGE_BUCKET = 'community-images'
_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024


# ── Highlights (read-only aggregation) ────────────────────────────────────────
@bp.route('/highlights', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_highlights(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'highlights': community.highlights(org_id)})


# ── Announcements ─────────────────────────────────────────────────────────────
@bp.route('/announcements', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_announcements(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, 'announcements': community.list_announcements(org_id)})


@bp.route('/announcements', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_announcement(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = community.create_announcement(org_id, user_id, request.get_json() or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/announcements/<announcement_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_announcement(user_id, announcement_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = community.update_announcement(org_id, announcement_id, request.get_json() or {})
    if result is None:
        return jsonify({'success': False, 'error': 'Announcement not found'}), 404
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/announcements/<announcement_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_announcement(user_id, announcement_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    # Not delete_row: taking the post down has to pull the send it spawned too.
    if not community.delete_announcement(org_id, announcement_id):
        return jsonify({'success': False, 'error': 'Announcement not found'}), 404
    return jsonify({'success': True})


# ── Lost & Found ──────────────────────────────────────────────────────────────
@bp.route('/lost-found', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_lost_found(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    status = request.args.get('status')
    return jsonify({'success': True, 'items': community.list_lost_found(org_id, status=status)})


@bp.route('/lost-found', methods=['POST'])
@require_role(*ADMIN_ROLES)
def create_lost_found(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = community.create_lost_found(org_id, user_id, request.get_json() or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/lost-found/<item_id>', methods=['PATCH'])
@require_role(*ADMIN_ROLES)
def update_lost_found(user_id, item_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = community.update_lost_found(org_id, item_id, request.get_json() or {})
    if result is None:
        return jsonify({'success': False, 'error': 'Item not found'}), 404
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/lost-found/<item_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_lost_found(user_id, item_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not community.delete_row(org_id, 'sis_lost_found', item_id):
        return jsonify({'success': False, 'error': 'Item not found'}), 404
    return jsonify({'success': True})


@bp.route('/lost-found/mark-expired', methods=['POST'])
@require_role(*ADMIN_ROLES)
def mark_lost_found_expired(user_id):
    """Flag every unclaimed item past its 14-day donation deadline as donated."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, **community.mark_expired_for_donation(org_id)})


@bp.route('/lost-found/upload', methods=['POST'])
@require_role(*ADMIN_ROLES)
def upload_lost_found_image(user_id):
    """Upload a Lost & Found photo; returns a short-lived signed URL for the
    preview and the canonical pointer to persist. Mirrors the household image
    upload pattern in routes/sis/__init__.py.

    The bucket is PRIVATE: these are photographs taken inside a school and
    routinely have children in them. See utils/storage_urls.py."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in _IMAGE_EXTENSIONS:
        return jsonify({'success': False, 'error': 'Invalid file type'}), 400
    file.seek(0, 2)
    if file.tell() > _MAX_IMAGE_BYTES:
        return jsonify({'success': False, 'error': 'File size exceeds 5MB limit'}), 400
    file.seek(0)

    # admin client justified: storage bucket create/upload for Lost & Found photos (service-role-only storage ops); staff-gated route, path pinned to resolved org
    supabase = get_supabase_admin_client()
    try:
        if not supabase.storage.get_bucket(_IMAGE_BUCKET):
            supabase.storage.create_bucket(_IMAGE_BUCKET)
    except Exception:
        try:
            supabase.storage.create_bucket(_IMAGE_BUCKET)
        except Exception:
            pass
    path = f"{org_id}/lost-found/{_uuid.uuid4().hex}.{ext}"
    try:
        supabase.storage.from_(_IMAGE_BUCKET).upload(
            path=path, file=file.read(),
            file_options={'content-type': file.content_type or f'image/{ext}'},
        )
        url = public_object_url(_IMAGE_BUCKET, path)
    except Exception as e:  # noqa: BLE001
        logger.error(f'Lost & Found image upload failed: {e}')
        return jsonify({'success': False, 'error': 'Failed to upload image'}), 500
    # `url` is the durable pointer the client posts back to be stored;
    # `display_url` is the fetchable twin for the optimistic preview.
    return jsonify({
        'success': True,
        'url': url,
        'display_url': sign_stored_url(url, _IMAGE_BUCKET),
    })


# ── Recognition ───────────────────────────────────────────────────────────────
@bp.route('/recognition', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_recognition(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    rec_type = request.args.get('type')
    return jsonify({'success': True, 'recognition': community.list_recognition(org_id, rec_type=rec_type)})


@bp.route('/recognition', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_recognition(user_id):
    """Any staff member can post a shout-out (v1)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = community.create_recognition(org_id, user_id, request.get_json() or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result}), 201


@bp.route('/recognition/<recognition_id>', methods=['DELETE'])
@require_role(*ADMIN_ROLES)
def delete_recognition(user_id, recognition_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not community.delete_row(org_id, 'sis_recognition', recognition_id):
        return jsonify({'success': False, 'error': 'Recognition not found'}), 404
    return jsonify({'success': True})


# ── Members (recipient picker for Recognition) ────────────────────────────────
# ── The family-facing feed ────────────────────────────────────────────────────
def _caller_effective_role(user_id):
    from utils.roles import get_effective_role
    try:
        # admin client justified: self-read of the caller's own role columns to pick the feed audience
        row = (get_supabase_admin_client().table('users')
               .select('role, org_role, org_roles').eq('id', user_id)
               .limit(1).execute()).data
        return get_effective_role(row[0]) if row else None
    except Exception as e:  # noqa: BLE001
        logger.warning(f'community feed: role lookup failed for {user_id[:8]}: {e}')
        return None


def _feed_org_for(user_id, requested_org):
    """Which org's board to serve. Members get their own school; a superadmin
    may name any org (?organization_id — the school-page preview). Anyone else
    naming an org that is not theirs is refused, mirroring the announcements
    archive's contract. Returns (org_id, error, preview): error is 'forbidden'
    or None; preview is True only on the superadmin path.
    """
    from services import sis_service
    member_org = sis_service.member_org_id(user_id)
    if not requested_org or requested_org == member_org:
        return member_org, None, False
    if _caller_effective_role(user_id) == 'superadmin':
        return requested_org, None, True
    return None, 'forbidden', False


def _feed_affordances(user_id, preview, view_as):
    """Carpool affordances on the feed: adults post, admins moderate. A
    superadmin preview models a member of the chosen role instead — students
    read without posting, family members don't moderate, admins do both."""
    from services import sis_service
    if preview:
        return {'can_post_carpool': view_as != 'student',
                'can_moderate': view_as == 'admin'}
    return {'can_post_carpool': not _is_student(user_id),
            'can_moderate': sis_service.caller_is_admin(user_id)}


@bp.route('/feed', methods=['GET'])
@require_role('student', 'parent', 'observer', 'advisor', 'org_admin', 'campus_coordinator', 'superadmin')
def family_feed(user_id):
    """The Community Hub as families and students see it.

    Separate from the staff endpoints above on purpose: this one resolves the
    org through membership (a platform parent has no organization_id of their
    own — they are a member through their child), and the service projects each
    module onto a family-safe field list rather than returning the row.
    Superadmins may name an org instead (_feed_org_for) to preview its board.
    """
    org_id, err, preview = _feed_org_for(user_id, request.args.get('organization_id'))
    if err:
        return jsonify({'success': False, 'error': 'Access denied'}), 403
    if not org_id:
        # Not in a school — an empty board, not an error.
        return jsonify({'success': True, 'feed': {'announcements': [], 'lost_found': [],
                                                  'recognition': [], 'events': [],
                                                  'carpool': []},
                        'organization_name': None})
    return jsonify({'success': True, 'feed': community.family_feed(org_id, viewer_id=user_id),
                    'organization_name': _org_name(org_id),
                    **_feed_affordances(user_id, preview, request.args.get('view_as'))})


def _is_student(user_id):
    """Students read the board; they don't arrange carpools on it."""
    from utils.roles import get_effective_role
    try:
        # admin client justified: self-read of the caller's own role columns (fails closed) to keep students off the carpool board
        row = (get_supabase_admin_client().table('users')
               .select('role, org_role, org_roles').eq('id', user_id)
               .limit(1).execute()).data
        return bool(row) and get_effective_role(row[0]) == 'student'
    except Exception as e:  # noqa: BLE001
        logger.warning(f'carpool: role lookup failed for {user_id[:8]}: {e}')
        return True  # fail closed: no posting if we can't tell


# ── Carpool board (family-authored — iCreate, 2026-08-06) ─────────────────────
@bp.route('/feed/carpool', methods=['POST'])
@require_role('parent', 'advisor', 'org_admin', 'campus_coordinator', 'superadmin')
def create_carpool(user_id):
    """A family (or staff member) posts a ride offer or need."""
    from services import sis_service
    org_id = sis_service.member_org_id(user_id)
    if not org_id:
        return jsonify({'success': False, 'error': 'Not in a school'}), 403
    if _is_student(user_id):
        return jsonify({'success': False, 'error': 'Not available for students'}), 403
    result = community.create_carpool_post(org_id, user_id, request.json or {})
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, 'post': result['post']}), 201


@bp.route('/feed/carpool/<post_id>', methods=['DELETE'])
@require_role('parent', 'advisor', 'org_admin', 'campus_coordinator', 'superadmin')
def delete_carpool(user_id, post_id):
    """The author takes their post down, or an admin moderates it away."""
    from services import sis_service
    org_id = sis_service.member_org_id(user_id)
    if not org_id:
        return jsonify({'success': False, 'error': 'Not in a school'}), 403
    ok = community.delete_carpool_post(
        org_id, user_id, post_id, is_moderator=sis_service.caller_is_admin(user_id))
    if not ok:
        return jsonify({'success': False, 'error': 'Not your post to remove'}), 403
    return jsonify({'success': True})


def _org_name(org_id):
    try:
        # admin client justified: organizations.name lookup for the caller's already-authorized feed org
        row = (get_supabase_admin_client().table('organizations').select('name')
               .eq('id', org_id).limit(1).execute()).data
        return (row[0].get('name') if row else None)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'community feed: org name lookup failed: {e}')
        return None


@bp.route('/members', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_members(user_id):
    """Org members for the Recognition recipient picker (id + name)."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    from services import sis_service
    return jsonify({'success': True, 'members': sis_service.list_org_members(org_id)})
