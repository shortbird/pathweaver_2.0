"""
The family photo across the top of the family dashboard (/family).

GET    /api/parent/family-cover  -> the family's photo, signed, or null
POST   /api/parent/family-cover  -> multipart 'cover'; replaces it
DELETE /api/parent/family-cover  -> removes it

A family that has a household row (every SIS family) has ONE photo:
households.image_url, the same one the office sets on the family record --
two uploads in two buckets for one concept was audit NB4 (M4). A platform
family with no household row keeps it on users.family_cover_url of whichever
parent set it last; the co-parents (every other parent of the caller's
children, per utils.class_membership) read that row, an upload clears
theirs, and a remove clears everyone's. It used to be the caller's own row
only, so a mother saw "Add a family photo" under the picture her husband had
already put up (2026-09-19). Both are stored privately and signed on read.
"""

from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from repositories.household_repository import HouseholdRepository
from repositories.user_repository import UserRepository
from services import sis_billing_service as billing
from utils import class_membership
from utils.auth.decorators import require_auth
from utils.image_utils import store_image_upload
from utils.logger import get_logger
from utils.storage_urls import sign_stored_url
from middleware.error_handler import ValidationError

logger = get_logger(__name__)

bp = Blueprint('parent_family_cover', __name__, url_prefix='/api/parent')

USER_BUCKET = 'user-uploads'
# PRIVATE: family photos are pictures of somebody's children. The bucket the
# SIS family record already uses.
HOUSEHOLD_BUCKET = 'family-images'


def _household_for(user_id):
    """The one household this guardian's photo belongs to, or None for a
    platform family with no row of its own. A guardian of several (a co-parent
    across two schools) gets the first; the office's record is the same row."""
    rows = billing._guardian_household_rows(user_id)
    return rows[0] if rows else None


def _co_parents(user_id):
    """Every other parent of this parent's children -- the rest of a platform
    family, which has no household row to name its members."""
    children = class_membership.children_of_parent(user_id)
    return sorted(class_membership.parents_of_students(children) - {user_id}) if children else []


def _platform_family_cover(users, user_id):
    """The pointer on the caller's own row, else the one a co-parent set."""
    family = [user_id] + _co_parents(user_id)
    pointers = users.family_cover_pointers(family)
    return next((pointers[uid] for uid in family if pointers.get(uid)), None)


def _current(supabase, user_id):
    """(signed url, household row or None)."""
    hh = _household_for(user_id)
    if hh:
        row = HouseholdRepository(client=supabase).find_by_id(hh['id']) or {}
        return sign_stored_url(row.get('image_url'), HOUSEHOLD_BUCKET), hh
    pointer = _platform_family_cover(UserRepository(client=supabase), user_id)
    return sign_stored_url(pointer, USER_BUCKET), None


@bp.route('/family-cover', methods=['GET'])
@require_auth
def get_family_cover(user_id):
    # admin client justified: reads the caller's own household (or users row) under @require_auth; the storage pointer needs the service role to sign
    supabase = get_supabase_admin_client()
    url, _ = _current(supabase, user_id)
    return jsonify({'success': True, 'family_cover_url': url})


@bp.route('/family-cover', methods=['POST'])
@require_auth
def upload_family_cover(user_id):
    if 'cover' not in request.files:
        raise ValidationError('No image provided')
    # admin client justified: writes the caller's own household (or users row) and the private bucket under @require_auth; storage writes need the service role
    supabase = get_supabase_admin_client()
    # A landscape banner is bigger than an avatar; 10MB is a phone photo.
    # The image safety gate (the known-CSAM hash match; the uploader is a
    # parent, so the classifier does not run).
    from services import upload_safety_service as safety
    def _gate(content, content_type, filename):
        verdict = safety.check_image(content, content_type, user_id=None,
                                     purpose='family_photo', filename=filename)
        return None if verdict.allowed else verdict.message
    hh = _household_for(user_id)
    if hh:
        pointer = store_image_upload(supabase, request.files['cover'], f'households/{hh["id"]}',
                                     max_bytes=10 * 1024 * 1024, bucket=HOUSEHOLD_BUCKET, gate=_gate)
        HouseholdRepository(client=supabase).update(hh['id'], {'image_url': pointer})
        logger.info(f"Parent {user_id[:8]} set the family photo on household {hh['id'][:8]}")
        return jsonify({'success': True, 'family_cover_url': sign_stored_url(pointer, HOUSEHOLD_BUCKET)})
    pointer = store_image_upload(supabase, request.files['cover'], f'family-covers/{user_id}',
                                 max_bytes=10 * 1024 * 1024, gate=_gate)
    users = UserRepository(client=supabase)
    users.set_family_cover([user_id], pointer)
    # The photo now lives on this row; a co-parent's older one would otherwise
    # win on their own phone.
    users.set_family_cover(_co_parents(user_id), None)
    logger.info(f"Parent {user_id[:8]} set a family photo")
    return jsonify({'success': True, 'family_cover_url': sign_stored_url(pointer, USER_BUCKET)})


@bp.route('/family-cover', methods=['DELETE'])
@require_auth
def remove_family_cover(user_id):
    # admin client justified: clears the caller's own household (or users row) under @require_auth
    supabase = get_supabase_admin_client()
    hh = _household_for(user_id)
    if hh:
        HouseholdRepository(client=supabase).update(hh['id'], {'image_url': None})
    else:
        UserRepository(client=supabase).set_family_cover([user_id] + _co_parents(user_id), None)
    return jsonify({'success': True, 'family_cover_url': None})
