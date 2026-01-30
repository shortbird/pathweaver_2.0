"""
Group Messages API routes for group chat functionality
Handles group creation, membership, and messaging
Only advisors, org_admins, and superadmins can create groups
"""

from flask import Blueprint, request, jsonify
from typing import Dict, List, Optional, Any
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

from utils.auth.decorators import require_auth
from services.group_message_service import GroupMessageService
from middleware.error_handler import ValidationError
from utils.validation.validators import validate_required_fields, validate_string_length
from utils.api_response import success_response, error_response

bp = Blueprint('group_messages', __name__, url_prefix='/api/groups')

# Set up logging
logger = logging.getLogger(__name__)

# Initialize service
group_service = GroupMessageService()


@bp.route('', methods=['POST'])
@require_auth
def create_group(user_id: str):
    """
    Create a new group chat
    Only advisors, org_admins, and superadmins can create groups
    """
    try:
        data = request.get_json()

        # Validate required fields
        validate_required_fields(data, ['name'])

        name = data['name'].strip()
        description = data.get('description', '').strip() or None
        member_ids = data.get('member_ids', [])

        # Validate name
        if not name:
            raise ValidationError("Group name cannot be empty")

        validate_string_length(name, 'name', max_length=100)

        if description:
            validate_string_length(description, 'description', max_length=500)

        # Validate member_ids if provided
        if member_ids and not isinstance(member_ids, list):
            raise ValidationError("member_ids must be an array")

        # Create group
        group = group_service.create_group(
            user_id=user_id,
            name=name,
            description=description,
            member_ids=member_ids
        )

        return success_response({
            'group': group,
            'message': 'Group created successfully'
        }, status_code=201)

    except ValidationError as e:
        logger.error(f"Validation error creating group: {str(e)}")
        return error_response(str(e), status_code=400, error_code="validation_error")

    except ValueError as e:
        logger.error(f"Permission error creating group: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error creating group: {str(e)}")
        return error_response(
            f"Failed to create group: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('', methods=['GET'])
@require_auth
def get_groups(user_id: str):
    """
    Get all groups for the current user
    """
    try:
        groups = group_service.get_user_groups(user_id)

        return success_response({
            'groups': groups,
            'total': len(groups)
        })

    except Exception as e:
        logger.error(f"Error getting groups: {str(e)}")
        return error_response(
            f"Failed to get groups: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/<group_id>', methods=['GET'])
@require_auth
def get_group(user_id: str, group_id: str):
    """
    Get group details with member list
    """
    try:
        group = group_service.get_group(user_id, group_id)

        return success_response({
            'group': group
        })

    except ValueError as e:
        logger.error(f"Permission error getting group: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error getting group: {str(e)}")
        return error_response(
            f"Failed to get group: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/<group_id>', methods=['PUT'])
@require_auth
def update_group(user_id: str, group_id: str):
    """
    Update group details (admin only)
    """
    try:
        data = request.get_json()

        name = data.get('name')
        description = data.get('description')

        if name is not None:
            name = name.strip()
            if not name:
                raise ValidationError("Group name cannot be empty")
            validate_string_length(name, 'name', max_length=100)

        if description is not None:
            description = description.strip() or None
            if description:
                validate_string_length(description, 'description', max_length=500)

        group = group_service.update_group(
            user_id=user_id,
            group_id=group_id,
            name=name,
            description=description
        )

        return success_response({
            'group': group,
            'message': 'Group updated successfully'
        })

    except ValidationError as e:
        logger.error(f"Validation error updating group: {str(e)}")
        return error_response(str(e), status_code=400, error_code="validation_error")

    except ValueError as e:
        logger.error(f"Permission error updating group: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error updating group: {str(e)}")
        return error_response(
            f"Failed to update group: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/<group_id>/members', methods=['POST'])
@require_auth
def add_member(user_id: str, group_id: str):
    """
    Add a member to the group (admin only)
    """
    try:
        data = request.get_json()

        validate_required_fields(data, ['user_id'])

        target_user_id = data['user_id']

        membership = group_service.add_member(user_id, group_id, target_user_id)

        return success_response({
            'membership': membership,
            'message': 'Member added successfully'
        }, status_code=201)

    except ValidationError as e:
        logger.error(f"Validation error adding member: {str(e)}")
        return error_response(str(e), status_code=400, error_code="validation_error")

    except ValueError as e:
        logger.error(f"Permission error adding member: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error adding member: {str(e)}")
        return error_response(
            f"Failed to add member: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/<group_id>/members/<target_user_id>', methods=['DELETE'])
@require_auth
def remove_member(user_id: str, group_id: str, target_user_id: str):
    """
    Remove a member from the group (admin only, or member removing themselves)
    """
    try:
        success = group_service.remove_member(user_id, group_id, target_user_id)

        return success_response({
            'success': success,
            'message': 'Member removed successfully'
        })

    except ValueError as e:
        logger.error(f"Permission error removing member: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error removing member: {str(e)}")
        return error_response(
            f"Failed to remove member: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/<group_id>/leave', methods=['POST'])
@require_auth
def leave_group(user_id: str, group_id: str):
    """
    Leave a group
    """
    try:
        success = group_service.leave_group(user_id, group_id)

        return success_response({
            'success': success,
            'message': 'Left group successfully'
        })

    except ValueError as e:
        logger.error(f"Error leaving group: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error leaving group: {str(e)}")
        return error_response(
            f"Failed to leave group: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/<group_id>/messages', methods=['GET'])
@require_auth
def get_messages(user_id: str, group_id: str):
    """
    Get messages for a group
    Supports pagination with limit and offset query params
    """
    try:
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))

        messages = group_service.get_messages(
            user_id=user_id,
            group_id=group_id,
            limit=limit,
            offset=offset
        )

        return success_response({
            'messages': messages,
            'group_id': group_id,
            'count': len(messages),
            'limit': limit,
            'offset': offset
        })

    except ValueError as e:
        logger.error(f"Permission error getting messages: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error getting messages: {str(e)}")
        return error_response(
            f"Failed to get messages: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/<group_id>/messages', methods=['POST'])
@require_auth
def send_message(user_id: str, group_id: str):
    """
    Send a message to a group
    """
    try:
        data = request.get_json()

        validate_required_fields(data, ['content'])

        content = data['content'].strip()

        if not content:
            raise ValidationError("Message content cannot be empty")

        validate_string_length(content, 'content', max_length=2000)

        message = group_service.send_message(
            user_id=user_id,
            group_id=group_id,
            content=content
        )

        return success_response({
            'message': message,
            'group_id': group_id
        }, status_code=201)

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


@bp.route('/<group_id>/read', methods=['POST'])
@require_auth
def mark_as_read(user_id: str, group_id: str):
    """
    Mark all messages in a group as read
    """
    try:
        success = group_service.mark_as_read(user_id, group_id)

        return success_response({
            'success': success,
            'group_id': group_id
        })

    except ValueError as e:
        logger.error(f"Permission error marking as read: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error marking as read: {str(e)}")
        return error_response(
            f"Failed to mark as read: {str(e)}",
            status_code=500,
            error_code="internal_error"
        )


@bp.route('/<group_id>/available-members', methods=['GET'])
@require_auth
def get_available_members(user_id: str, group_id: str):
    """
    Get users that can be added to the group (admin only)
    """
    try:
        members = group_service.get_available_members(user_id, group_id)

        return success_response({
            'available_members': members,
            'total': len(members)
        })

    except ValueError as e:
        logger.error(f"Permission error getting available members: {str(e)}")
        return error_response(str(e), status_code=403, error_code="forbidden")

    except Exception as e:
        logger.error(f"Error getting available members: {str(e)}")
        return error_response(
            f"Failed to get available members: {str(e)}",
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
