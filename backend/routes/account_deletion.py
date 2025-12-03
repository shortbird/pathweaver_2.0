from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client, get_user_client
from backend.repositories import (
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

        # ADMIN CLIENT JUSTIFIED: Account deletion requires cross-table cleanup and audit logging
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
        # ADMIN CLIENT JUSTIFIED: GDPR data export requires cross-table reads from all user data
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

        # Quest collaborations removed in Phase 1 refactoring (January 2025)
        # Table quest_collaborations no longer exists
        export_data['collaborations'] = []

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

        return jsonify(export_data), 200

    except Exception as e:
        import traceback
        logger.error(f"Error exporting user data: {str(e)}")
        logger.info(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'error': 'Failed to export user data',
            'details': str(e) if os.getenv('FLASK_ENV') == 'development' else None
        }), 500