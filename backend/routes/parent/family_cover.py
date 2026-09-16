"""
The family photo across the top of the family dashboard (/family).

GET    /api/parent/family-cover  -> the parent's photo, signed, or null
POST   /api/parent/family-cover  -> multipart 'cover'; replaces it
DELETE /api/parent/family-cover  -> removes it

The photo is the PARENT's (users.family_cover_url, migration
20260915140000): a platform family has no row of its own, so a co-parent
sets their own. Stored in the private user-uploads bucket like avatars and
signed on read.
"""

from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.image_utils import store_image_upload
from utils.logger import get_logger
from utils.storage_urls import sign_stored_url
from middleware.error_handler import ValidationError

logger = get_logger(__name__)

bp = Blueprint('parent_family_cover', __name__, url_prefix='/api/parent')

BUCKET = 'user-uploads'


@bp.route('/family-cover', methods=['GET'])
@require_auth
def get_family_cover(user_id):
    # admin client justified: reads the caller's own users row (family_cover_url) under @require_auth; the storage pointer needs the service role to sign
    supabase = get_supabase_admin_client()
    row = supabase.table('users').select('family_cover_url').eq('id', user_id).single().execute().data or {}
    return jsonify({'success': True, 'family_cover_url': sign_stored_url(row.get('family_cover_url'), BUCKET)})


@bp.route('/family-cover', methods=['POST'])
@require_auth
def upload_family_cover(user_id):
    if 'cover' not in request.files:
        raise ValidationError('No image provided')
    # admin client justified: writes the caller's own users row (family_cover_url) and the private bucket under @require_auth; storage writes need the service role
    supabase = get_supabase_admin_client()
    # A landscape banner is bigger than an avatar; 10MB is a phone photo.
    # The image safety gate (the known-CSAM hash match; the uploader is a
    # parent, so the classifier does not run).
    from services import upload_safety_service as safety
    def _gate(content, content_type, filename):
        verdict = safety.check_image(content, content_type, user_id=None,
                                     purpose='family_photo', filename=filename)
        return None if verdict.allowed else verdict.message
    pointer = store_image_upload(supabase, request.files['cover'], f'family-covers/{user_id}', max_bytes=10 * 1024 * 1024, gate=_gate)
    supabase.table('users').update({'family_cover_url': pointer}).eq('id', user_id).execute()
    logger.info(f"Parent {user_id[:8]} set a family photo")
    return jsonify({'success': True, 'family_cover_url': sign_stored_url(pointer, BUCKET)})


@bp.route('/family-cover', methods=['DELETE'])
@require_auth
def remove_family_cover(user_id):
    # admin client justified: clears the caller's own users row (family_cover_url) under @require_auth
    supabase = get_supabase_admin_client()
    supabase.table('users').update({'family_cover_url': None}).eq('id', user_id).execute()
    return jsonify({'success': True, 'family_cover_url': None})
