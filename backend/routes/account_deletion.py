"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- 15+ direct database calls across multiple tables
- GDPR data export requires complex cross-table operations
- Could create UserDataExportRepository with methods:
  - export_all_user_data(user_id)
  - request_account_deletion(user_id, reason)
  - cancel_account_deletion(user_id)
  - get_deletion_status(user_id)
- Complex multi-table operations but still suitable for repository abstraction
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import (
    UserRepository,
    QuestRepository,
    EvidenceRepository,
    ParentRepository,
    TutorRepository,
    AnalyticsRepository
)
from services.account_deletion_service import (
    AccountDeletionError,
    purge_user,
    run_pending_deletion_sweep,
)
from services.data_retention_service import run_tutor_retention_sweep
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError, NotFoundError
from middleware.rate_limiter import rate_limit
from datetime import datetime, timedelta, timezone
import json

from app_config import Config
from utils.logger import get_logger
from utils.storage_urls import default_ttl, sign_in_place, sign_stored_url

logger = get_logger(__name__)

bp = Blueprint('account_deletion', __name__)

@bp.route('/users/delete-account', methods=['POST'])
@require_auth
@rate_limit(max_requests=3, window_seconds=86400)  # 3 requests per day
def request_account_deletion(user_id):
    """
    Request account deletion (soft delete with 30-day grace period)
    GDPR/CCPA Right to Erasure
    """
    try:
        data = request.json or {}
        reason = data.get('reason', '')

        # admin client justified: GDPR delete-request schedules deletion + writes account_deletion_log (audit trail must succeed even if user RLS policies block); @require_auth ensures self-only deletion (user_id from token)
        supabase = get_supabase_admin_client()

        # Explicit columns, not select('*'): the users row also carries phone,
        # postal address, DOB, allergies and medications, and a deletion request
        # has no business loading a student's health data to write a log line.
        user_response = supabase.table('users').select(
            'id, email, first_name, last_name, total_xp, created_at, deletion_status, deletion_scheduled_for'
        ).eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User not found")

        user = user_response.data[0]

        # Check if deletion already requested
        if user.get('deletion_status') == 'pending':
            scheduled_date = user.get('deletion_scheduled_for')
            return jsonify({
                'message': 'Account deletion already scheduled',
                'deletion_scheduled_for': scheduled_date,
                'status': 'pending'
            }), 200

        # Calculate deletion date (30 days from now)
        deletion_date = (datetime.utcnow() + timedelta(days=30)).isoformat()

        # Update user record to mark for deletion
        supabase.table('users').update({
            'deletion_requested_at': datetime.utcnow().isoformat(),
            'deletion_status': 'pending',
            'deletion_scheduled_for': deletion_date
        }).eq('id', user_id).execute()

        # Create snapshot of user data for audit log
        user_data_snapshot = {
            'id': user.get('id'),
            'email': user.get('email'),
            'first_name': user.get('first_name'),
            'last_name': user.get('last_name'),
            'total_xp': user.get('total_xp'),
            'created_at': user.get('created_at'),
            'deletion_requested_reason': reason
        }

        # Log the deletion request
        supabase.table('account_deletion_log').insert({
            'user_id': user_id,
            'email': user.get('email'),
            'first_name': user.get('first_name'),
            'last_name': user.get('last_name'),
            'deletion_requested_at': datetime.utcnow().isoformat(),
            'reason': reason,
            'user_data': json.dumps(user_data_snapshot)
        }).execute()

        return jsonify({
            'message': 'Account deletion scheduled successfully',
            'deletion_scheduled_for': deletion_date,
            'grace_period_days': 30,
            'status': 'pending'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error requesting account deletion: {str(e)}")
        return jsonify({'error': 'Failed to request account deletion'}), 500

# Using repository pattern for database access
@bp.route('/users/cancel-deletion', methods=['POST'])
@require_auth
def cancel_account_deletion(user_id):
    """
    Cancel account deletion during grace period
    """
    try:
        # Previously get_user_client(user_id) passed a UUID where a JWT was
        # expected -> anonymous-client fallback -> users RLS recursion.
        # admin client justified: reads + clears the caller's own deletion fields (self-scoped by .eq('id', user_id) under @require_auth), matching the request-deletion sibling
        supabase = get_supabase_admin_client()

        # Get user data
        user_response = supabase.table('users').select('deletion_status, deletion_scheduled_for').eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User not found")

        user = user_response.data[0]

        if user.get('deletion_status') != 'pending':
            return jsonify({
                'error': 'No pending deletion request found',
                'status': user.get('deletion_status', 'none')
            }), 400

        # Check if still within grace period
        scheduled_date = datetime.fromisoformat(user.get('deletion_scheduled_for').replace('Z', '+00:00'))
        if datetime.utcnow().replace(tzinfo=scheduled_date.tzinfo) > scheduled_date:
            return jsonify({
                'error': 'Grace period has expired, account deletion cannot be cancelled'
            }), 400

        # Cancel deletion. The executor re-reads this status immediately before
        # erasing an account, so a cancellation that lands during a sweep wins.
        # Attempt bookkeeping is cleared too, so a later re-request starts clean.
        supabase.table('users').update({
            'deletion_requested_at': None,
            'deletion_status': 'none',
            'deletion_scheduled_for': None,
            'deletion_attempts': 0,
            'deletion_last_attempt_at': None,
            'deletion_last_error': None
        }).eq('id', user_id).execute()

        return jsonify({
            'message': 'Account deletion cancelled successfully',
            'status': 'active'
        }), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error cancelling account deletion: {str(e)}")
        return jsonify({'error': 'Failed to cancel account deletion'}), 500

@bp.route('/users/deletion-status', methods=['GET'])
@require_auth
def get_deletion_status(user_id):
    """
    Get account deletion status
    """
    try:
        # The previous get_user_client(user_id) call passed a UUID where a JWT
        # was expected -> anonymous-client fallback -> users RLS recursion (42P17) -> 500.
        # admin client justified: reads the caller's own deletion status (self-scoped by .eq('id', user_id) under @require_auth), matching the sibling delete/cancel endpoints
        supabase = get_supabase_admin_client()

        user_response = supabase.table('users').select(
            'deletion_status, deletion_requested_at, deletion_scheduled_for'
        ).eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User not found")

        user = user_response.data[0]

        response_data = {
            'deletion_status': user.get('deletion_status', 'none'),
            'deletion_requested_at': user.get('deletion_requested_at'),
            'deletion_scheduled_for': user.get('deletion_scheduled_for')
        }

        # Calculate days remaining if pending
        if user.get('deletion_status') == 'pending' and user.get('deletion_scheduled_for'):
            scheduled_date = datetime.fromisoformat(user.get('deletion_scheduled_for').replace('Z', '+00:00'))
            now = datetime.utcnow().replace(tzinfo=scheduled_date.tzinfo)
            days_remaining = (scheduled_date - now).days
            response_data['days_remaining'] = max(0, days_remaining)

        return jsonify(response_data), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting deletion status: {str(e)}")
        return jsonify({'error': 'Failed to get deletion status'}), 500

@bp.route('/users/export-data', methods=['GET'])
@require_auth
# @rate_limit(max_requests=5, window_seconds=3600)  # 5 exports per hour - Temporarily disabled for debugging
def export_user_data(user_id):
    """
    Export all user data (GDPR Right to Data Portability)
    Returns comprehensive JSON export of all user data
    """
    try:
        logger.info(f"[EXPORT] Starting data export for user: {user_id}")
        logger.info(f"[EXPORT] User ID: {user_id}")
        # admin client justified: GDPR data export reads ~15 tables for the authenticated user; cross-table self-export would need many overlapping RLS policies (parental_consent_log, observer_audit_log, advisor_student_notes, etc.); user_id from @require_auth scopes every query to self
        supabase = get_supabase_admin_client()
        logger.info(f"[EXPORT] Got supabase client")

        # Lifetime of every download link in this export (see file_references).
        signed_ttl = default_ttl()

        export_data = {
            'export_date': datetime.utcnow().isoformat(),
            'user_id': user_id
        }

        # Get user profile
        try:
            user_response = supabase.table('users').select('*').eq('id', user_id).execute()
            if user_response.data:
                export_data['profile'] = user_response.data[0]
        except Exception as e:
            logger.error(f"Error fetching user profile: {str(e)}")
            export_data['profile'] = None

        # Get diploma/portfolio
        try:
            diploma_response = supabase.table('diplomas').select('*').eq('user_id', user_id).execute()
            if diploma_response.data:
                export_data['diploma'] = diploma_response.data[0]
        except Exception as e:
            logger.error(f"Error fetching diploma: {str(e)}")
            export_data['diploma'] = None

        # Get skill XP
        try:
            skills_response = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
            export_data['skills'] = skills_response.data if skills_response.data else []
        except Exception as e:
            logger.error(f"Error fetching skills: {str(e)}")
            export_data['skills'] = []

        # Get quest enrollments
        try:
            quests_response = supabase.table('user_quests').select('*').eq('user_id', user_id).execute()
            export_data['enrolled_quests'] = quests_response.data if quests_response.data else []
        except Exception as e:
            logger.error(f"Error fetching quest enrollments: {str(e)}")
            export_data['enrolled_quests'] = []

        # Get completed tasks
        try:
            tasks_response = supabase.table('quest_task_completions').select('*').eq('user_id', user_id).execute()
            export_data['completed_tasks'] = tasks_response.data if tasks_response.data else []
        except Exception as e:
            logger.error(f"Error fetching completed tasks: {str(e)}")
            export_data['completed_tasks'] = []

        # Get evidence documents.
        # evidence_document_blocks has NO user_id column — it hangs off
        # user_task_evidence_documents.document_id. The old `.eq('user_id', ...)`
        # here always errored into the empty fallback, so every export silently
        # shipped an empty portfolio.
        try:
            docs_response = supabase.table('user_task_evidence_documents').select('*').eq('user_id', user_id).execute()
            documents = docs_response.data or []
            export_data['evidence_document_records'] = documents
            if documents:
                block_response = supabase.table('evidence_document_blocks').select('*').in_(
                    'document_id', [doc['id'] for doc in documents]
                ).execute()
                export_data['evidence_documents'] = block_response.data or []
            else:
                export_data['evidence_documents'] = []
        except Exception as e:
            logger.error(f"Error fetching evidence documents: {str(e)}")
            export_data['evidence_documents'] = []
            export_data['evidence_document_records'] = []

        # Friendships were dropped in the March 2026 audit; the key is kept
        # empty for export shape stability (same as badges below).
        export_data['friendships'] = []

        # Get tutor conversations (if exists)
        try:
            tutor_response = supabase.table('tutor_conversations').select('*').eq('user_id', user_id).execute()
            if tutor_response.data:
                export_data['tutor_conversations'] = tutor_response.data

                # Get tutor messages for each conversation
                conversation_ids = [conv['id'] for conv in tutor_response.data]
                messages_response = supabase.table('tutor_messages').select('*').in_('conversation_id', conversation_ids).execute()
                export_data['tutor_messages'] = messages_response.data if messages_response.data else []
        except:
            logger.debug("intentional swallow", exc_info=True)  # Table might not exist

        # Quest submissions feature removed - users can create their own quests directly
        export_data['quest_submissions'] = []

        # Quest ratings removed in Phase 1 refactoring (January 2025)
        # Table quest_ratings no longer exists
        export_data['quest_ratings'] = []

        # GDPR Compliance: Add missing tables (Week 3)

        # Get parental consent logs (COPPA compliance)
        try:
            consent_response = supabase.table('parental_consent_log').select('*').eq('user_id', user_id).execute()
            export_data['parental_consent_log'] = consent_response.data if consent_response.data else []
        except Exception as e:
            logger.error(f"Error fetching parental consent log: {str(e)}")
            export_data['parental_consent_log'] = []

        # Get student access logs (FERPA compliance - tracks who accessed user's data)
        try:
            access_logs_response = supabase.table('student_access_logs').select('*').eq('student_id', user_id).execute()
            export_data['student_access_logs'] = access_logs_response.data if access_logs_response.data else []
        except Exception as e:
            logger.error(f"Error fetching student access logs: {str(e)}")
            export_data['student_access_logs'] = []

        # Get observer access logs (if user is a student with observers).
        # Table is observer_access_audit; the old 'observer_audit_log' name does
        # not exist, so this section always fell into the empty fallback.
        try:
            observer_logs_response = supabase.table('observer_access_audit').select('*').eq('student_id', user_id).execute()
            export_data['observer_access_logs'] = observer_logs_response.data if observer_logs_response.data else []
        except Exception as e:
            logger.error(f"Error fetching observer access logs: {str(e)}")
            export_data['observer_access_logs'] = []

        # Get advisor notes (if any). Table is advisor_notes, keyed by
        # subject_id — 'advisor_student_notes' never existed either.
        try:
            advisor_notes_response = supabase.table('advisor_notes').select('*').eq('subject_id', user_id).execute()
            export_data['advisor_notes'] = advisor_notes_response.data if advisor_notes_response.data else []
        except Exception as e:
            logger.error(f"Error fetching advisor notes: {str(e)}")
            export_data['advisor_notes'] = []

        # Get direct messages (sent and received)
        try:
            # Messages sent by user
            sent_messages = supabase.table('direct_messages').select('*').eq('sender_id', user_id).execute()
            # Messages received by user
            received_messages = supabase.table('direct_messages').select('*').eq('recipient_id', user_id).execute()

            all_messages = []
            if sent_messages.data:
                all_messages.extend(sent_messages.data)
            if received_messages.data:
                all_messages.extend(received_messages.data)

            # Remove duplicates (shouldn't happen, but just in case)
            seen_ids = set()
            unique_messages = []
            for msg in all_messages:
                if msg['id'] not in seen_ids:
                    seen_ids.add(msg['id'])
                    unique_messages.append(msg)

            export_data['direct_messages'] = unique_messages
        except Exception as e:
            logger.error(f"Error fetching direct messages: {str(e)}")
            export_data['direct_messages'] = []

        # Badges feature removed (2026-04); export field kept empty for shape stability.
        export_data['user_badges'] = []

        # Get file URLs for evidence and profile images
        # Note: Actual file download would require separate endpoints due to size
        # This provides metadata and URLs for user to download files separately
        #
        # Media buckets are private (utils/storage_urls.PRIVATE_MEDIA_BUCKETS),
        # so the links below are SIGNED and therefore EXPIRING. That is a real
        # tension with an export the user downloads and keeps: an hour later the
        # JSON's links are dead. The alternatives are worse. A permanent public
        # URL is the disclosure this whole change exists to close -- it would be
        # a never-expiring, unauthenticated link to a minor's work sitting in a
        # file the user may forward or back up. And silently emitting the
        # canonical pointer would ship links that 404 with no explanation.
        #
        # So: sign them, say plainly that they expire, say how long, and tell
        # the user to re-export for fresh links. The download works at export
        # time (which is when people actually use it), and nothing durable
        # leaks. `expires_in_seconds` and the note are part of the contract --
        # a client that caches the export can show when the links went stale.
        export_data['file_references'] = {
            'evidence_files': [],
            'profile_image': None,
            'note': (
                'Download links below are temporary and expire '
                f'{signed_ttl} seconds after this export was generated. They point at '
                'private storage, so they cannot be shared or bookmarked. '
                'Re-run the export to get fresh links.'
            ),
            'expires_in_seconds': signed_ttl,
            'generated_at': datetime.now(timezone.utc).isoformat(),
        }

        # Get evidence file URLs from Supabase Storage
        try:
            # Get evidence blocks with file references
            evidence_blocks = export_data.get('evidence_documents', [])
            for block in evidence_blocks:
                if block.get('block_type') in ['image', 'file', 'video']:
                    content_data = block.get('content', {})
                    if isinstance(content_data, dict) and content_data.get('url'):
                        export_data['file_references']['evidence_files'].append({
                            'task_id': block.get('task_id'),
                            'block_id': block.get('id'),
                            'file_type': block.get('block_type'),
                            'url': content_data.get('url'),
                            'uploaded_at': block.get('created_at')
                        })
            # One batch per bucket for the whole export, not one call per file.
            sign_in_place(
                export_data['file_references']['evidence_files'], ['url'],
                expires_in=signed_ttl,
            )
        except Exception as e:
            logger.error(f"Error fetching evidence file references: {str(e)}")

        # Get profile image URL
        try:
            user_profile = export_data.get('profile', {})
            if user_profile and user_profile.get('avatar_url'):
                export_data['file_references']['profile_image'] = {
                    'url': sign_stored_url(
                        user_profile.get('avatar_url'), expires_in=signed_ttl
                    ),
                    'note': ('Download this URL to save your profile image. The '
                             'link expires -- see file_references.note.'),
                }
        except Exception as e:
            logger.error(f"Error fetching profile image reference: {str(e)}")

        return jsonify(export_data), 200

    except Exception as e:
        import traceback
        logger.error(f"Error exporting user data: {str(e)}")
        logger.info(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'error': 'Failed to export user data',
            'details': str(e) if Config.FLASK_ENV == 'development' else None
        }), 500

@bp.route('/users/delete-account-permanent', methods=['DELETE'])
@require_auth
@rate_limit(max_requests=1, window_seconds=3600)  # 1 permanent deletion per hour (safety measure)
def delete_user_account_permanent(user_id):
    """
    Permanently delete user account and all associated data (GDPR Right to Erasure)

    This is an IRREVERSIBLE operation that immediately deletes all user data.
    For a safer option with a grace period, use POST /users/delete-account instead.

    The erasure itself lives in services/account_deletion_service.py so this
    endpoint, the 30-day executor, and parent-initiated dependent deletion all
    delete the SAME things — storage objects and the Supabase auth user
    included, neither of which this route used to touch.

    GDPR Compliance: Article 17 - Right to Erasure
    """
    try:
        # admin client justified: GDPR Article 17 erasure spans every table holding the user's rows plus storage and auth.admin; RLS cannot be used because deleting the users row revokes the caller's own access mid-operation; user_id comes from @require_auth so every delete is scoped to self
        supabase = get_supabase_admin_client()

        # Verify user exists before attempting deletion
        user_response = supabase.table('users').select('id, email').eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User not found")

        logger.info(f"[GDPR_DELETE] Starting permanent deletion for user {user_id}")

        result = purge_user(user_id, admin=supabase,
                            reason='GDPR permanent deletion',
                            deletion_type='permanent')

        return jsonify({
            'message': 'Account and all associated data permanently deleted',
            'user_id': user_id,
            'deletion_summary': result['counts'],
            'gdpr_compliance': 'Article 17 - Right to Erasure'
        }), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except AccountDeletionError as e:
        # Loud, not swallowed: some part of the erasure did not happen, so the
        # account must NOT be reported as deleted. The record is left intact and
        # retryable rather than half-deleted.
        logger.error(f"[GDPR_DELETE] Permanent deletion incomplete for {user_id}: {e.errors}")
        return jsonify({
            'error': 'Account deletion did not complete. No data was reported as deleted; '
                     'please retry or contact support.',
            'failed_steps': e.errors if Config.FLASK_ENV == 'development' else None
        }), 500
    except Exception as e:
        logger.error(f"Error during permanent account deletion: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'error': 'Failed to permanently delete account',
            'details': str(e) if Config.FLASK_ENV == 'development' else None
        }), 500


# ── Internal cron entrypoints ────────────────────────────────────────────────

def _cron_or_superadmin():
    """True when the caller is the cron service or a signed-in superadmin.

    Same shape as the SIS attendance sweep and the OEA compliance sweep, so all
    internal jobs authenticate identically.
    """
    from utils.cron_auth import is_valid_cron_secret
    if is_valid_cron_secret(request.headers.get('X-Cron-Secret')):
        return True
    from utils.session_manager import session_manager
    uid = session_manager.get_effective_user_id()
    if not uid:
        return False
    # admin client justified: cron-endpoint auth fallback — reads users.role to
    # verify the signed-in caller is superadmin (the auth check itself)
    row = get_supabase_admin_client().table('users').select('role') \
        .eq('id', uid).limit(1).execute().data
    return bool(row and row[0].get('role') == 'superadmin')


@bp.route('/users/internal/deletion-sweep', methods=['POST'])
def deletion_sweep():
    """Cron entrypoint: erase accounts whose 30-day grace period has expired.

    This is the executor for `POST /users/delete-account`. Without it the
    scheduled-deletion promise was never kept: `deletion_status='pending'` was
    written and never read again.

    Idempotent — it only picks up accounts still marked pending and past their
    date, re-checks each one immediately before erasing it (so a cancellation
    wins), and leaves failures pending-with-an-error for the next run.
    """
    if not _cron_or_superadmin():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    try:
        return jsonify({'success': True, **run_pending_deletion_sweep()}), 200
    except Exception as e:
        logger.error(f"[DELETION_SWEEP] sweep failed: {e}")
        return jsonify({'success': False, 'error': 'Deletion sweep failed'}), 500


@bp.route('/users/internal/retention-sweep', methods=['POST'])
def retention_sweep():
    """Cron entrypoint: AI tutor conversation retention.

    Disabled by default (`Config.TUTOR_RETENTION_ENABLED`); with it off this
    reports how many conversations WOULD be purged and deletes nothing.
    """
    if not _cron_or_superadmin():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    try:
        return jsonify({'success': True, **run_tutor_retention_sweep()}), 200
    except Exception as e:
        logger.error(f"[RETENTION] sweep failed: {e}")
        return jsonify({'success': False, 'error': 'Retention sweep failed'}), 500
