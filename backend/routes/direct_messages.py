"""
Direct Messages API routes for user-to-user communication
Handles advisor-student and friend-to-friend messaging

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Primarily uses DirectMessageService (service layer pattern)
- One direct database call for user role check (simple query, acceptable)
- Service layer is the preferred pattern over direct repository usage
"""

from flask import Blueprint, request, jsonify
from typing import Dict, List, Optional, Any
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

from utils.auth.decorators import require_auth
from services.direct_message_service import DirectMessageService
from middleware.error_handler import ValidationError
from utils.validation.validators import validate_required_fields, validate_string_length
from utils.api_response import success_response, error_response

bp = Blueprint('direct_messages', __name__, url_prefix='/api/messages')

# Set up logging
logger = logging.getLogger(__name__)

# Initialize service
message_service = DirectMessageService()


@bp.route('/conversations', methods=['GET'])
@require_auth
def get_conversations(user_id: str):
    """
    Get all conversations for the current user
    Includes advisor, friends, and conversation metadata
    """
    try:
        conversations = message_service.get_user_conversations(user_id)

        return success_response({
            'conversations': conversations,
            'total': len(conversations)
        })

    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        return error_response(
            f"Failed to get conversations: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/conversations/<conversation_id>', methods=['GET'])
@require_auth
def get_conversation_messages(user_id: str, conversation_id: str):
    """
    Get messages for a specific conversation
    Supports pagination with limit and offset query params
    """
    try:
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))

        messages = message_service.get_conversation_messages(
            conversation_id,
            user_id,
            limit=limit,
            offset=offset
        )

        return success_response({
            'messages': messages,
            'conversation_id': conversation_id,
            'count': len(messages),
            'limit': limit,
            'offset': offset
        })

    except ValueError as e:
        logger.error(f"Validation error getting conversation messages: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error getting conversation messages: {str(e)}")
        return error_response(
            f"Failed to get messages: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/conversations/<target_user_id>/send', methods=['POST'])
@require_auth
def send_message(user_id: str, target_user_id: str):
    """
    Send a message to a user (advisor, friend)
    Creates conversation if it doesn't exist
    """
    try:
        data = request.get_json()

        # Validate required fields
        validate_required_fields(data, ['content'])

        content = data['content'].strip()

        # Validate content
        if not content:
            raise ValidationError("Message content cannot be empty")

        validate_string_length(content, 'content', max_length=2000)

        # Send message
        message = message_service.send_message(user_id, target_user_id, content)

        return success_response({
            'message': message,
            'conversation_id': message['conversation_id']
        })

    except ValidationError as e:
        logger.error(f"Validation error sending message: {str(e)}")
        return error_response(str(e), status_code=400, error_code="validation_error")

    except ValueError as e:
        logger.error(f"Permission error sending message: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error sending message: {str(e)}")
        return error_response(
            f"Failed to send message: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/<message_id>/read', methods=['PUT'])
@require_auth
def mark_message_as_read(user_id: str, message_id: str):
    """
    Mark a message as read
    Only the recipient can mark their messages as read
    """
    try:
        success = message_service.mark_as_read(message_id, user_id)

        return success_response({
            'success': success,
            'message_id': message_id
        })

    except ValueError as e:
        logger.error(f"Permission error marking message as read: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error marking message as read: {str(e)}")
        return error_response(
            f"Failed to mark message as read: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/unread-count', methods=['GET'])
@require_auth
def get_unread_count(user_id: str):
    """
    Get total unread message count for badge display
    """
    try:
        unread_count = message_service.get_unread_count(user_id)

        return success_response({
            'unread_count': unread_count
        })

    except Exception as e:
        logger.error(f"Error getting unread count: {str(e)}")
        return error_response(
            f"Failed to get unread count: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/can-message/<target_user_id>', methods=['GET'])
@require_auth
def check_can_message(user_id: str, target_user_id: str):
    """
    Check if user can message another user
    Useful for frontend permission checks
    """
    try:
        can_message = message_service.can_message_user(user_id, target_user_id)

        return success_response({
            'can_message': can_message,
            'target_user_id': target_user_id
        })

    except Exception as e:
        logger.error(f"Error checking message permission: {str(e)}")
        return error_response(
            f"Failed to check permission: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/contacts', methods=['GET'])
@require_auth
def get_contacts(user_id: str):
    """
    Get all messaging contacts for the user (advisors, students, etc.)
    Organization isolation is enforced.
    This includes:
    - For students: their advisor(s) in the same organization
    - For advisors/admins: their assigned students in the same organization
    """
    try:
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        # Get user role and organization
        user = supabase.table('users').select('role, organization_id').eq('id', user_id).single().execute()
        if not user.data:
            return error_response('User not found', status_code=404, error_code='not_found')

        contacts = []
        user_role = user.data.get('role')
        user_org_id = user.data.get('organization_id')

        # For students: add their advisor(s) as contacts
        if user_role == 'student':
            # Get advisor assignments for this student
            assignments = supabase.table('advisor_student_assignments').select(
                'advisor_id'
            ).eq('student_id', user_id).eq('is_active', True).execute()

            if assignments.data:
                advisor_ids = [a['advisor_id'] for a in assignments.data]
                # Fetch advisor details with organization filter
                advisors = supabase.table('users').select(
                    'id, display_name, first_name, last_name, avatar_url, role, organization_id'
                ).in_('id', advisor_ids).execute()

                if advisors.data:
                    for advisor in advisors.data:
                        # ORGANIZATION ISOLATION: Only include advisors from same org
                        if user_org_id is not None and advisor.get('organization_id') != user_org_id:
                            continue
                        # Remove org_id from response
                        advisor.pop('organization_id', None)
                        contacts.append({
                            **advisor,
                            'relationship': 'advisor'
                        })

        # For advisors/admins: add all their assigned students
        if user_role in ['advisor', 'admin', 'superadmin']:
            # Get student assignments for this advisor
            assignments = supabase.table('advisor_student_assignments').select(
                'student_id'
            ).eq('advisor_id', user_id).eq('is_active', True).execute()

            if assignments.data:
                student_ids = [a['student_id'] for a in assignments.data]
                # Fetch student details with organization filter
                students = supabase.table('users').select(
                    'id, display_name, first_name, last_name, avatar_url, role, organization_id'
                ).in_('id', student_ids).execute()

                if students.data:
                    for student in students.data:
                        # ORGANIZATION ISOLATION: Only include students from same org
                        if user_org_id is not None and student.get('organization_id') != user_org_id:
                            logger.warning(
                                f"Organization isolation: Filtered out student {student.get('id')} "
                                f"from contacts for user {user_id}"
                            )
                            continue
                        # Remove org_id from response
                        student.pop('organization_id', None)
                        contacts.append({
                            **student,
                            'relationship': 'student'
                        })

        return success_response({
            'contacts': contacts,
            'total': len(contacts)
        })

    except Exception as e:
        logger.error(f"Error getting contacts: {str(e)}")
        return error_response(
            f"Failed to get contacts: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


# Error handlers
@bp.errorhandler(ValidationError)
def handle_validation_error(error):
    return error_response(str(error), "validation_error", status_code=400)


@bp.errorhandler(ValueError)
def handle_value_error(error):
    return error_response(str(error), "forbidden", status_code=403)
