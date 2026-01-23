"""
Transfer Credits Management Routes

Admin-only endpoints for managing transfer credits from external transcripts.
Transfer credits count toward diploma requirements via the user_subject_xp table.

Endpoints:
- GET  /api/admin/transfer-credits/<user_id> - Get transfer credits for a student
- POST /api/admin/transfer-credits/<user_id> - Save transfer credits (create/update)
- POST /api/admin/transfer-credits/<user_id>/transcript - Upload transcript file
- DELETE /api/admin/transfer-credits/<user_id> - Remove all transfer credits
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_school_admin
from utils.api_response import success_response, error_response
from utils.logger import get_logger
from werkzeug.utils import secure_filename
import uuid
import magic
import mimetypes

logger = get_logger(__name__)

bp = Blueprint('admin_transfer_credits', __name__, url_prefix='/api/admin/transfer-credits')

# Valid school subjects (must match the school_subject enum in database)
VALID_SUBJECTS = [
    'language_arts', 'math', 'science', 'social_studies',
    'financial_literacy', 'health', 'pe', 'fine_arts',
    'cte', 'digital_literacy', 'electives'
]

# Subject to Pillar mapping (for updating pillar XP alongside subject XP)
# Pillars: art, stem, communication, civics, wellness
SUBJECT_TO_PILLAR = {
    'language_arts': 'communication',    # English, Literature
    'math': 'stem',                      # Mathematics
    'science': 'stem',                   # Biology, Chemistry, Physics
    'social_studies': 'civics',          # History, Geography, Social Studies
    'financial_literacy': 'wellness',    # Personal Finance
    'health': 'wellness',                # Health & Nutrition
    'pe': 'wellness',                    # Physical Education
    'fine_arts': 'art',                  # Visual Arts, Music
    'cte': 'stem',                       # Career & Technical Ed (practical STEM)
    'digital_literacy': 'stem',          # Computer Science
    'electives': 'art'                   # Default to Art for general electives
}

# XP per credit (matches existing constant)
XP_PER_CREDIT = 2000

# Maximum file size for transcript uploads (25MB)
MAX_TRANSCRIPT_SIZE = 25 * 1024 * 1024

# Allowed MIME types for transcripts
ALLOWED_TRANSCRIPT_TYPES = {
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
}


@bp.route('/<user_id>', methods=['GET'])
@require_school_admin
def get_transfer_credits(admin_user_id, user_id):
    """
    Get all transfer credits for a student (supports multiple source institutions).

    Returns:
        List of transfer credit records with subject_xp breakdown, total_xp, and transcript info
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify the target user exists
        user_result = supabase.table('users').select('id, first_name, last_name, email').eq('id', user_id).execute()
        if not user_result.data:
            return error_response('User not found', status_code=404, error_code='user_not_found')

        # Get ALL transfer credits for this user (multiple institutions)
        result = supabase.table('transfer_credits').select('*').eq('user_id', user_id).order('created_at', desc=False).execute()

        if not result.data:
            # No transfer credits yet - return empty list
            return success_response({
                'transfer_credits': [],
                'user': user_result.data[0]
            })

        # Process each transfer credit record
        transfer_credits_list = []
        for tc in result.data:
            subject_credits = {}
            total_credits = 0
            subject_xp = tc.get('subject_xp', {})

            for subject, xp in subject_xp.items():
                credits = xp / XP_PER_CREDIT
                subject_credits[subject] = credits
                total_credits += credits

            transfer_credits_list.append({
                **tc,
                'subject_credits': subject_credits,
                'total_credits': total_credits
            })

        return success_response({
            'transfer_credits': transfer_credits_list,
            'user': user_result.data[0]
        })

    except Exception as e:
        logger.error(f"Error getting transfer credits for user {user_id}: {str(e)}")
        return error_response(f'Failed to get transfer credits: {str(e)}', status_code=500, error_code='internal_error')


@bp.route('/<user_id>', methods=['POST'])
@require_school_admin
def save_transfer_credits(admin_user_id, user_id):
    """
    Save transfer credits for a student (create or update).

    Request body:
        subject_credits: dict - Credits per subject (e.g., {"math": 2.0, "science": 1.5})
        school_name: str - Source institution name
        notes: str (optional) - Additional notes

    Note: subject_credits are converted to XP (credits * 2000) and stored in subject_xp.
    The total_xp is auto-calculated by database trigger.
    """
    try:
        supabase = get_supabase_admin_client()
        data = request.json or {}

        # Validate required fields (handle None values from frontend)
        subject_credits = data.get('subject_credits') or {}
        school_name = (data.get('school_name') or '').strip()
        notes = (data.get('notes') or '').strip() or None
        transcript_url = data.get('transcript_url') or None

        if not school_name:
            return error_response('School name is required', status_code=400, error_code='validation_error')

        # Validate and convert credits to XP
        subject_xp = {}
        total_credits = 0

        for subject, credits in subject_credits.items():
            # Validate subject is in allowed list
            if subject not in VALID_SUBJECTS:
                return error_response(
                    f'Invalid subject: {subject}. Valid subjects are: {", ".join(VALID_SUBJECTS)}',
                    status_code=400,
                    error_code='validation_error'
                )

            # Validate credits is a number
            try:
                credits = float(credits)
            except (ValueError, TypeError):
                return error_response(
                    f'Invalid credit value for {subject}: must be a number',
                    status_code=400,
                    error_code='validation_error'
                )

            # Skip zero or negative credits
            if credits <= 0:
                continue

            # Validate credits range (0-4.0 per subject is typical)
            if credits > 10:
                return error_response(
                    f'Credit value for {subject} too high: {credits}. Maximum is 10 credits per subject.',
                    status_code=400,
                    error_code='validation_error'
                )

            # Convert credits to XP
            xp = int(credits * XP_PER_CREDIT)
            subject_xp[subject] = xp
            total_credits += credits

        if not subject_xp:
            return error_response(
                'At least one subject with positive credits is required',
                status_code=400,
                error_code='validation_error'
            )

        # Check for optional transfer_credit_id to update a specific record
        transfer_credit_id = data.get('id')

        # IMPORTANT: Capture old subject_xp BEFORE updating for sync delta calculation
        if transfer_credit_id:
            # Update specific record by ID (id is unique, no need for user_id filter)
            existing = supabase.table('transfer_credits').select('id, transcript_url, subject_xp, user_id').eq('id', transfer_credit_id).execute()
            # Verify record belongs to the specified user
            if existing.data and existing.data[0].get('user_id') != user_id:
                return error_response('Transfer credit record does not belong to this user', status_code=403, error_code='forbidden')
        else:
            # Check if record exists for this school (upsert by school name)
            existing = supabase.table('transfer_credits').select('id, transcript_url, subject_xp').eq('user_id', user_id).eq('school_name', school_name).execute()

        old_subject_xp = existing.data[0].get('subject_xp', {}) if existing.data else {}

        if existing.data:
            # Update existing record
            update_data = {
                'subject_xp': subject_xp,
                'school_name': school_name,
                'notes': notes,
                'transcript_url': transcript_url  # Can be null to clear it
            }

            result = supabase.table('transfer_credits').update(update_data).eq('id', existing.data[0]['id']).execute()
            action = 'updated'
        else:
            # Create new record
            insert_data = {
                'user_id': user_id,
                'subject_xp': subject_xp,
                'school_name': school_name,
                'notes': notes,
                'created_by': admin_user_id
            }
            # Include transcript_url if provided
            if transcript_url:
                insert_data['transcript_url'] = transcript_url

            result = supabase.table('transfer_credits').insert(insert_data).execute()
            action = 'created'

        if not result.data:
            return error_response('Failed to save transfer credits', status_code=500, error_code='save_failed')

        # Sync transfer credits to user_subject_xp table (pass old values for delta calculation)
        sync_result = _sync_transfer_credits_to_user_subject_xp(supabase, user_id, subject_xp, old_subject_xp)
        if not sync_result['success']:
            logger.warning(f"Failed to sync transfer credits to user_subject_xp: {sync_result['error']}")

        logger.info(f"[TRANSFER CREDITS] {action.capitalize()} transfer credits for user {user_id} by admin {admin_user_id}: {total_credits} total credits")

        return success_response({
            'message': f'Transfer credits {action} successfully',
            'transfer_credits': result.data[0],
            'total_credits': total_credits,
            'xp_synced': sync_result['success']
        })

    except Exception as e:
        logger.error(f"Error saving transfer credits for user {user_id}: {str(e)}")
        return error_response(f'Failed to save transfer credits: {str(e)}', status_code=500, error_code='internal_error')


@bp.route('/<user_id>/transcript', methods=['POST'])
@require_school_admin
def upload_transcript(admin_user_id, user_id):
    """
    Upload transcript file for a student's transfer credits.

    Expects multipart form data with 'file' field and optional 'transfer_credit_id'.
    If transfer_credit_id is provided, updates that specific record.
    If not provided, stores the URL for the frontend to use when saving.

    Supported formats: PDF, JPEG, PNG, GIF, WEBP
    Max size: 25MB
    """
    try:
        supabase = get_supabase_admin_client()

        # Check if file was provided
        if 'file' not in request.files:
            return error_response('No file provided', status_code=400, error_code='no_file')

        file = request.files['file']
        transfer_credit_id = request.form.get('transfer_credit_id')

        if file.filename == '':
            return error_response('No file selected', status_code=400, error_code='no_file')

        # Read file content
        file_content = file.read()

        # Validate file size
        if len(file_content) > MAX_TRANSCRIPT_SIZE:
            return error_response(
                f'File size must be less than {MAX_TRANSCRIPT_SIZE // (1024*1024)}MB',
                status_code=400,
                error_code='file_too_large'
            )

        # Validate file type using magic bytes
        try:
            mime_type = magic.from_buffer(file_content[:2048], mime=True)
        except Exception as e:
            logger.warning(f"Magic detection failed, falling back to mimetypes: {e}")
            mime_type = file.content_type or mimetypes.guess_type(file.filename)[0]

        if mime_type not in ALLOWED_TRANSCRIPT_TYPES:
            return error_response(
                f'Invalid file type: {mime_type}. Allowed types: PDF, JPEG, PNG, GIF, WEBP',
                status_code=400,
                error_code='invalid_file_type'
            )

        # Sanitize filename
        safe_filename = secure_filename(file.filename)
        if not safe_filename or '..' in safe_filename:
            safe_filename = 'transcript'

        # Determine file extension
        ext_map = {
            'application/pdf': 'pdf',
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp'
        }
        file_extension = ext_map.get(mime_type, 'pdf')

        # Generate unique filename
        unique_filename = f"transcripts/{user_id}/{uuid.uuid4()}.{file_extension}"

        # If updating a specific record, verify it exists and belongs to user, delete old transcript if exists
        if transfer_credit_id:
            existing = supabase.table('transfer_credits').select('id, transcript_url, user_id').eq('id', transfer_credit_id).execute()
            if not existing.data:
                return error_response('Transfer credit record not found', status_code=404, error_code='not_found')
            if existing.data[0].get('user_id') != user_id:
                return error_response('Transfer credit record does not belong to this user', status_code=403, error_code='forbidden')

            if existing.data[0].get('transcript_url'):
                old_url = existing.data[0]['transcript_url']
                if '/storage/v1/object/public/quest-evidence/' in old_url:
                    old_path = old_url.split('/storage/v1/object/public/quest-evidence/')[1]
                    try:
                        supabase.storage.from_('quest-evidence').remove([old_path])
                        logger.info(f"Deleted old transcript: {old_path}")
                    except Exception as del_err:
                        logger.warning(f"Could not delete old transcript: {del_err}")

        # Upload new transcript
        supabase.storage.from_('quest-evidence').upload(
            path=unique_filename,
            file=file_content,
            file_options={"content-type": mime_type}
        )

        # Get public URL
        transcript_url = supabase.storage.from_('quest-evidence').get_public_url(unique_filename)

        # NOTE: We no longer update the database here. The transcript URL will be included
        # when the user saves the transfer credits form, which provides a more reliable flow
        # and avoids potential issues with the PostgREST query builder.
        logger.info(f"[TRANSFER CREDITS] Uploaded transcript for user {user_id} by admin {admin_user_id}")

        return success_response({
            'message': 'Transcript uploaded successfully',
            'transcript_url': transcript_url
        })

    except Exception as e:
        logger.error(f"Error uploading transcript for user {user_id}: {str(e)}")
        return error_response(f'Failed to upload transcript: {str(e)}', status_code=500, error_code='internal_error')


@bp.route('/<user_id>/<transfer_credit_id>', methods=['DELETE'])
@require_school_admin
def delete_single_transfer_credit(admin_user_id, user_id, transfer_credit_id):
    """
    Delete a specific transfer credit record by ID.
    Also removes the associated XP from user_subject_xp and user_skill_xp.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get the specific transfer credit record (id is unique, no need for user_id filter)
        existing = supabase.table('transfer_credits').select('*').eq('id', transfer_credit_id).execute()

        if not existing.data:
            return error_response('Transfer credit record not found', status_code=404, error_code='not_found')

        # Verify record belongs to the specified user
        if existing.data[0].get('user_id') != user_id:
            return error_response('Transfer credit record does not belong to this user', status_code=403, error_code='forbidden')

        return _delete_transfer_credit_record(supabase, existing.data[0], user_id, admin_user_id)

    except Exception as e:
        logger.error(f"Error deleting transfer credit {transfer_credit_id} for user {user_id}: {str(e)}")
        return error_response(f'Failed to delete transfer credit: {str(e)}', status_code=500, error_code='internal_error')


@bp.route('/<user_id>', methods=['DELETE'])
@require_school_admin
def delete_all_transfer_credits(admin_user_id, user_id):
    """
    Delete ALL transfer credits for a student.
    Also removes the XP from user_subject_xp and user_skill_xp.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get all transfer credits for this user
        existing = supabase.table('transfer_credits').select('*').eq('user_id', user_id).execute()

        if not existing.data:
            return error_response('No transfer credits found', status_code=404, error_code='not_found')

        # Delete each record
        for transfer_record in existing.data:
            _delete_transfer_credit_record(supabase, transfer_record, user_id, admin_user_id, log_individually=False)

        logger.info(f"[TRANSFER CREDITS] Deleted all {len(existing.data)} transfer credits for user {user_id} by admin {admin_user_id}")

        return success_response({
            'message': f'Deleted {len(existing.data)} transfer credit record(s) successfully'
        })

    except Exception as e:
        logger.error(f"Error deleting all transfer credits for user {user_id}: {str(e)}")
        return error_response(f'Failed to delete transfer credits: {str(e)}', status_code=500, error_code='internal_error')


def _delete_transfer_credit_record(supabase, transfer_record, user_id, admin_user_id, log_individually=True):
    """
    Helper function to delete a single transfer credit record and its associated XP.
    """
    subject_xp = transfer_record.get('subject_xp', {})
    record_id = transfer_record.get('id')

    # Delete transcript file if exists
    transcript_url = transfer_record.get('transcript_url')
    if transcript_url and '/storage/v1/object/public/quest-evidence/' in transcript_url:
        old_path = transcript_url.split('/storage/v1/object/public/quest-evidence/')[1]
        try:
            supabase.storage.from_('quest-evidence').remove([old_path])
            logger.info(f"Deleted transcript file: {old_path}")
        except Exception as del_err:
            logger.warning(f"Could not delete transcript file: {del_err}")

    # Remove transfer credit XP from user_subject_xp AND user_skill_xp (pillar XP)
    pillar_xp_to_remove = {}

    for subject, xp in subject_xp.items():
        try:
            # Remove from user_subject_xp
            current = supabase.table('user_subject_xp').select('xp_amount').eq('user_id', user_id).eq('school_subject', subject).execute()
            if current.data:
                current_xp = current.data[0].get('xp_amount', 0)
                new_xp = max(0, current_xp - xp)
                supabase.table('user_subject_xp').update({
                    'xp_amount': new_xp
                }).eq('user_id', user_id).eq('school_subject', subject).execute()

            # Track pillar XP to remove
            pillar = SUBJECT_TO_PILLAR.get(subject)
            if pillar:
                pillar_xp_to_remove[pillar] = pillar_xp_to_remove.get(pillar, 0) + xp
        except Exception as xp_err:
            logger.warning(f"Could not remove XP for subject {subject}: {xp_err}")

    # Remove pillar XP from user_skill_xp
    for pillar, xp in pillar_xp_to_remove.items():
        try:
            current_pillar = supabase.table('user_skill_xp').select('id, xp_amount').eq('user_id', user_id).eq('pillar', pillar).execute()
            if current_pillar.data:
                current_xp = current_pillar.data[0].get('xp_amount', 0)
                new_xp = max(0, current_xp - xp)
                supabase.table('user_skill_xp').update({
                    'xp_amount': new_xp
                }).eq('id', current_pillar.data[0]['id']).execute()
        except Exception as pillar_err:
            logger.warning(f"Could not remove pillar XP for {pillar}: {pillar_err}")

    # Delete the transfer credits record
    supabase.table('transfer_credits').delete().eq('id', record_id).execute()

    if log_individually:
        logger.info(f"[TRANSFER CREDITS] Deleted transfer credit {record_id} for user {user_id} by admin {admin_user_id}")

    return success_response({
        'message': 'Transfer credit deleted successfully'
    })


def _sync_transfer_credits_to_user_subject_xp(supabase, user_id: str, subject_xp: dict, old_subject_xp: dict = None) -> dict:
    """
    Sync transfer credit XP to both user_subject_xp and user_skill_xp tables.

    This adds the transfer credit XP to:
    1. user_subject_xp - for diploma credit requirements
    2. user_skill_xp - for pillar XP (using subject-to-pillar mapping)

    When transfer credits are updated, we handle the delta (difference).

    Args:
        supabase: Supabase admin client
        user_id: UUID of the student
        subject_xp: Dict of subject -> XP amount from NEW transfer credits
        old_subject_xp: Dict of subject -> XP amount from PREVIOUS transfer credits (before update)

    Returns:
        Dict with 'success' boolean and optional 'error' message
    """
    try:
        # Use provided old values (captured before the save) or default to empty
        prev_subject_xp = old_subject_xp or {}

        # Track pillar deltas for batch update
        pillar_deltas = {}

        # Process each subject
        for subject in VALID_SUBJECTS:
            new_xp = subject_xp.get(subject, 0)
            old_xp = prev_subject_xp.get(subject, 0)
            delta = new_xp - old_xp

            if delta == 0:
                continue

            # --- Update user_subject_xp (diploma credits) ---
            current = supabase.table('user_subject_xp').select('id, xp_amount').eq('user_id', user_id).eq('school_subject', subject).execute()

            if current.data:
                current_xp = current.data[0].get('xp_amount', 0)
                updated_xp = max(0, current_xp + delta)
                supabase.table('user_subject_xp').update({
                    'xp_amount': updated_xp
                }).eq('id', current.data[0]['id']).execute()
            elif new_xp > 0:
                supabase.table('user_subject_xp').insert({
                    'user_id': user_id,
                    'school_subject': subject,
                    'xp_amount': new_xp
                }).execute()

            # --- Track pillar delta ---
            pillar = SUBJECT_TO_PILLAR.get(subject)
            if pillar:
                pillar_deltas[pillar] = pillar_deltas.get(pillar, 0) + delta

        # --- Update user_skill_xp (pillar XP) ---
        for pillar, delta in pillar_deltas.items():
            if delta == 0:
                continue

            current_pillar = supabase.table('user_skill_xp').select('id, xp_amount').eq('user_id', user_id).eq('pillar', pillar).execute()

            if current_pillar.data:
                current_xp = current_pillar.data[0].get('xp_amount', 0)
                updated_xp = max(0, current_xp + delta)
                supabase.table('user_skill_xp').update({
                    'xp_amount': updated_xp
                }).eq('id', current_pillar.data[0]['id']).execute()
            elif delta > 0:
                supabase.table('user_skill_xp').insert({
                    'user_id': user_id,
                    'pillar': pillar,
                    'xp_amount': delta
                }).execute()

        logger.info(f"[TRANSFER CREDITS] Synced XP for user {user_id}: subjects={list(subject_xp.keys())}, pillar_deltas={pillar_deltas}")
        return {'success': True}

    except Exception as e:
        logger.error(f"Error syncing transfer credits to user_subject_xp/user_skill_xp: {str(e)}")
        return {'success': False, 'error': str(e)}
