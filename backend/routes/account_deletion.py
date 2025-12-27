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
from database import get_supabase_admin_client, get_user_client
from repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError, NotFoundError
from middleware.rate_limiter import rate_limit
from datetime import datetime, timedelta
import json
import os

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('account_deletion', __name__)

@bp.route('/users/delete-account', methods=['POST'])
@require_auth
@rate_limit(max_requests=3, window_seconds=86400)  # 3 requests per day
def request_account_deletion(current_user):
    """
    Request account deletion (soft delete with 30-day grace period)
    GDPR/CCPA Right to Erasure
    """
    try:
        data = request.json or{}
        reason = data.get('reason', '')
        user_id = current_user['id']

        # Admin client: Admin operations for cross-table cleanup (ADR-002, Rule 2)
        supabase = get_supabase_admin_client()

        # Get user data for logging
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()

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
def cancel_account_deletion(current_user):
    """
    Cancel account deletion during grace period
    """
    try:
        user_id = current_user['id']
        # Use user client for RLS enforcement
        supabase = get_user_client(user_id)

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

        # Cancel deletion
        supabase.table('users').update({
            'deletion_requested_at': None,
            'deletion_status': 'none',
            'deletion_scheduled_for': None
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
def get_deletion_status(current_user):
    """
    Get account deletion status
    """
    try:
        user_id = current_user['id']
        # Use user client for RLS enforcement
        supabase = get_user_client(user_id)

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
def export_user_data(current_user):
    """
    Export all user data (GDPR Right to Data Portability)
    Returns comprehensive JSON export of all user data
    """
    try:
        logger.info(f"[EXPORT] Starting data export for user: {current_user}")
        user_id = current_user['id']
        logger.info(f"[EXPORT] User ID: {user_id}")
        # Admin client: Admin operations for GDPR export (ADR-002, Rule 2)
        supabase = get_supabase_admin_client()
        logger.info(f"[EXPORT] Got supabase client")

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

        # Get evidence documents
        try:
            evidence_response = supabase.table('evidence_document_blocks').select('*').eq('user_id', user_id).execute()
            export_data['evidence_documents'] = evidence_response.data if evidence_response.data else []
        except Exception as e:
            logger.error(f"Error fetching evidence documents: {str(e)}")
            export_data['evidence_documents'] = []

        # Get friendships
        try:
            friendships_response = supabase.table('friendships').select('*').or_(
                f'requester_id.eq.{user_id},addressee_id.eq.{user_id}'
            ).execute()
            export_data['friendships'] = friendships_response.data if friendships_response.data else []
        except Exception as e:
            logger.error(f"Error fetching friendships: {str(e)}")
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
            pass  # Table might not exist

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

        # Get observer access logs (if user is a student with observers)
        try:
            observer_logs_response = supabase.table('observer_audit_log').select('*').eq('student_id', user_id).execute()
            export_data['observer_access_logs'] = observer_logs_response.data if observer_logs_response.data else []
        except Exception as e:
            logger.error(f"Error fetching observer access logs: {str(e)}")
            export_data['observer_access_logs'] = []

        # Get advisor notes (if any)
        try:
            advisor_notes_response = supabase.table('advisor_student_notes').select('*').eq('student_id', user_id).execute()
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

        # Get user badges
        try:
            badges_response = supabase.table('user_badges').select('*').eq('user_id', user_id).execute()
            export_data['user_badges'] = badges_response.data if badges_response.data else []
        except Exception as e:
            logger.error(f"Error fetching user badges: {str(e)}")
            export_data['user_badges'] = []

        # Get file URLs for evidence and profile images
        # Note: Actual file download would require separate endpoints due to size
        # This provides metadata and URLs for user to download files separately
        export_data['file_references'] = {
            'evidence_files': [],
            'profile_image': None
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
        except Exception as e:
            logger.error(f"Error fetching evidence file references: {str(e)}")

        # Get profile image URL
        try:
            user_profile = export_data.get('profile', {})
            if user_profile and user_profile.get('avatar_url'):
                export_data['file_references']['profile_image'] = {
                    'url': user_profile.get('avatar_url'),
                    'note': 'Download this URL to save your profile image'
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
            'details': str(e) if os.getenv('FLASK_ENV') == 'development' else None
        }), 500

@bp.route('/users/delete-account-permanent', methods=['DELETE'])
@require_auth
@rate_limit(max_requests=1, window_seconds=3600)  # 1 permanent deletion per hour (safety measure)
def delete_user_account_permanent(current_user):
    """
    Permanently delete user account and all associated data (GDPR Right to Erasure)

    This is an IRREVERSIBLE operation that immediately deletes all user data.
    For a safer option with a grace period, use POST /users/delete-account instead.

    GDPR Compliance: Article 17 - Right to Erasure
    """
    try:
        user_id = current_user['id']

        # Admin client: Admin operations for cross-table deletion (ADR-002, Rule 2)
        supabase = get_supabase_admin_client()

        # Verify user exists before attempting deletion
        user_response = supabase.table('users').select('id, email, first_name, last_name').eq('id', user_id).execute()

        if not user_response.data:
            raise NotFoundError("User not found")

        user = user_response.data[0]
        logger.info(f"[GDPR_DELETE] Starting permanent deletion for user {user_id}")

        # Log deletion for compliance audit trail (before deleting user data)
        try:
            supabase.table('account_deletion_log').insert({
                'user_id': user_id,
                'email': user.get('email'),
                'first_name': user.get('first_name'),
                'last_name': user.get('last_name'),
                'deletion_requested_at': datetime.utcnow().isoformat(),
                'deletion_completed_at': datetime.utcnow().isoformat(),
                'reason': 'GDPR permanent deletion',
                'user_data': json.dumps({'deletion_type': 'permanent', 'gdpr_request': True})
            }).execute()
        except Exception as log_error:
            logger.error(f"Failed to log deletion (continuing anyway): {str(log_error)}")

        # Delete in reverse dependency order to avoid foreign key violations
        deletion_tables = [
            # Evidence and task completion data
            'evidence_document_blocks',
            'quest_task_completions',
            'user_quest_tasks',
            'user_quests',

            # Social features
            ('friendships', 'or_(f"requester_id.eq.{user_id},addressee_id.eq.{user_id}")'),
            'direct_messages',  # Both sent and received

            # Skills and achievements
            'user_skill_xp',
            'user_badges',

            # AI Tutor data
            'tutor_messages',  # Delete messages before conversations
            'tutor_conversations',

            # Compliance and access logs
            'parental_consent_log',
            'student_access_logs',
            'observer_audit_log',
            'advisor_student_notes',

            # Observer relationships
            'observer_student_links',

            # Diploma/Portfolio
            'diplomas',

            # User profile (must be last)
            'users'
        ]

        deleted_counts = {}

        for table in deletion_tables:
            try:
                # Handle special case for friendships (needs OR query)
                if isinstance(table, tuple):
                    table_name, query_filter = table
                    # Delete friendships where user is either requester or addressee
                    result = supabase.table(table_name).delete().or_(
                        f'requester_id.eq.{user_id},addressee_id.eq.{user_id}'
                    ).execute()
                    deleted_counts[table_name] = len(result.data) if result.data else 0
                    logger.info(f"[GDPR_DELETE] Deleted {deleted_counts[table_name]} rows from {table_name}")

                # Handle direct_messages (user can be sender or recipient)
                elif table == 'direct_messages':
                    # Delete messages sent by user
                    sent_result = supabase.table(table).delete().eq('sender_id', user_id).execute()
                    sent_count = len(sent_result.data) if sent_result.data else 0

                    # Delete messages received by user
                    received_result = supabase.table(table).delete().eq('recipient_id', user_id).execute()
                    received_count = len(received_result.data) if received_result.data else 0

                    deleted_counts[table] = sent_count + received_count
                    logger.info(f"[GDPR_DELETE] Deleted {deleted_counts[table]} rows from {table}")

                # Handle tutor_messages (must join through conversations)
                elif table == 'tutor_messages':
                    # First get conversation IDs for this user
                    conversations = supabase.table('tutor_conversations').select('id').eq('user_id', user_id).execute()
                    if conversations.data:
                        conversation_ids = [conv['id'] for conv in conversations.data]
                        result = supabase.table(table).delete().in_('conversation_id', conversation_ids).execute()
                        deleted_counts[table] = len(result.data) if result.data else 0
                    else:
                        deleted_counts[table] = 0
                    logger.info(f"[GDPR_DELETE] Deleted {deleted_counts[table]} rows from {table}")

                # Handle advisor notes (user is student)
                elif table == 'advisor_student_notes':
                    result = supabase.table(table).delete().eq('student_id', user_id).execute()
                    deleted_counts[table] = len(result.data) if result.data else 0
                    logger.info(f"[GDPR_DELETE] Deleted {deleted_counts[table]} rows from {table}")

                # Handle student access logs
                elif table == 'student_access_logs':
                    result = supabase.table(table).delete().eq('student_id', user_id).execute()
                    deleted_counts[table] = len(result.data) if result.data else 0
                    logger.info(f"[GDPR_DELETE] Deleted {deleted_counts[table]} rows from {table}")

                # Handle observer audit log
                elif table == 'observer_audit_log':
                    result = supabase.table(table).delete().eq('student_id', user_id).execute()
                    deleted_counts[table] = len(result.data) if result.data else 0
                    logger.info(f"[GDPR_DELETE] Deleted {deleted_counts[table]} rows from {table}")

                # Handle observer relationships (user could be observer or student)
                elif table == 'observer_student_links':
                    # Delete where user is observer
                    observer_result = supabase.table(table).delete().eq('observer_id', user_id).execute()
                    observer_count = len(observer_result.data) if observer_result.data else 0

                    # Delete where user is student
                    student_result = supabase.table(table).delete().eq('student_id', user_id).execute()
                    student_count = len(student_result.data) if student_result.data else 0

                    deleted_counts[table] = observer_count + student_count
                    logger.info(f"[GDPR_DELETE] Deleted {deleted_counts[table]} rows from {table}")

                # Standard deletion for all other tables
                else:
                    result = supabase.table(table).delete().eq('user_id', user_id).execute()
                    deleted_counts[table] = len(result.data) if result.data else 0
                    logger.info(f"[GDPR_DELETE] Deleted {deleted_counts[table]} rows from {table}")

            except Exception as table_error:
                error_str = str(table_error).lower()
                table_name = table if isinstance(table, str) else table[0]

                # Log error but continue (table might not exist or have no data)
                if 'does not exist' in error_str or 'relation' in error_str:
                    logger.warning(f"[GDPR_DELETE] Table {table_name} does not exist, skipping")
                    deleted_counts[table_name] = 0
                elif 'no rows' in error_str or 'not found' in error_str:
                    logger.info(f"[GDPR_DELETE] No data found in {table_name}")
                    deleted_counts[table_name] = 0
                else:
                    logger.error(f"[GDPR_DELETE] Error deleting from {table_name}: {str(table_error)}")
                    # Don't fail the entire operation if one table fails
                    deleted_counts[table_name] = 'error'

        logger.info(f"[GDPR_DELETE] Deletion completed for user {user_id}")

        return jsonify({
            'message': 'Account and all associated data permanently deleted',
            'user_id': user_id,
            'deletion_summary': deleted_counts,
            'gdpr_compliance': 'Article 17 - Right to Erasure'
        }), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error during permanent account deletion: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'error': 'Failed to permanently delete account',
            'details': str(e) if os.getenv('FLASK_ENV') == 'development' else None
        }), 500