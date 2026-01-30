"""
Group Message Service - Manages group chat functionality
Handles group creation, membership, and messaging for advisors, org admins, and superadmins
"""

import sys
from datetime import datetime
from typing import Dict, List, Optional, Any
import uuid
from services.base_service import BaseService
from database import get_supabase_admin_client
from services.notification_service import NotificationService

from utils.logger import get_logger

logger = get_logger(__name__)


class GroupMessageService(BaseService):
    """Service for group messaging operations"""

    def __init__(self):
        pass

    def _get_client(self):
        """Get a fresh Supabase client for each operation"""
        return get_supabase_admin_client()

    # ==================== Permission Checking ====================

    def can_create_group(self, user_id: str) -> bool:
        """
        Check if user has permission to create groups
        Only advisors, org_admins, and superadmins can create groups

        Args:
            user_id: UUID of the user

        Returns:
            Boolean indicating if user can create groups
        """
        try:
            supabase = self._get_client()
            user = supabase.table('users').select('role, org_role').eq('id', user_id).single().execute()

            if not user.data:
                return False

            # Check both platform role and org role
            role = user.data.get('role')
            org_role = user.data.get('org_role')

            # Platform users
            if role in ['advisor', 'superadmin']:
                return True

            # Org-managed users - check org_role
            if role == 'org_managed' and org_role in ['advisor', 'org_admin']:
                return True

            return False

        except Exception as e:
            logger.error(f"Error checking create group permission: {str(e)}")
            return False

    def is_group_member(self, user_id: str, group_id: str) -> bool:
        """Check if user is a member of the group"""
        try:
            supabase = self._get_client()
            member = supabase.table('group_members').select('id').eq(
                'group_id', group_id
            ).eq('user_id', user_id).execute()

            return bool(member.data and len(member.data) > 0)

        except Exception as e:
            logger.error(f"Error checking group membership: {str(e)}")
            return False

    def is_group_admin(self, user_id: str, group_id: str) -> bool:
        """Check if user is an admin of the group"""
        try:
            supabase = self._get_client()
            member = supabase.table('group_members').select('role').eq(
                'group_id', group_id
            ).eq('user_id', user_id).single().execute()

            return member.data and member.data.get('role') == 'admin'

        except Exception as e:
            logger.error(f"Error checking group admin status: {str(e)}")
            return False

    def can_add_member(self, user_id: str, group_id: str, target_user_id: str) -> bool:
        """
        Check if user can add target user to group
        Enforces organization isolation

        Args:
            user_id: UUID of the user trying to add
            group_id: UUID of the group
            target_user_id: UUID of the user being added

        Returns:
            Boolean indicating if add is allowed
        """
        try:
            supabase = self._get_client()

            # User must be group admin
            if not self.is_group_admin(user_id, group_id):
                return False

            # Get group info
            group = supabase.table('group_conversations').select('organization_id').eq(
                'id', group_id
            ).single().execute()

            if not group.data:
                return False

            group_org_id = group.data.get('organization_id')

            # Get target user's organization
            target_user = supabase.table('users').select('organization_id').eq(
                'id', target_user_id
            ).single().execute()

            if not target_user.data:
                return False

            target_org_id = target_user.data.get('organization_id')

            # Organization isolation check
            # If group has org_id, target must be in same org
            if group_org_id is not None and target_org_id != group_org_id:
                logger.warning(
                    f"Organization isolation: Cannot add user {target_user_id} "
                    f"(org: {target_org_id}) to group in org {group_org_id}"
                )
                return False

            return True

        except Exception as e:
            logger.error(f"Error checking add member permission: {str(e)}")
            return False

    # ==================== Group Management ====================

    def create_group(
        self,
        user_id: str,
        name: str,
        description: Optional[str] = None,
        member_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create a new group chat

        Args:
            user_id: UUID of the creator
            name: Group name
            description: Optional group description
            member_ids: Optional list of member UUIDs to add

        Returns:
            Created group record
        """
        try:
            if not self.can_create_group(user_id):
                raise ValueError("You don't have permission to create groups")

            supabase = self._get_client()

            # Get creator's organization
            creator = supabase.table('users').select('organization_id').eq(
                'id', user_id
            ).single().execute()

            organization_id = creator.data.get('organization_id') if creator.data else None

            # Create group
            group_id = str(uuid.uuid4())
            group = {
                'id': group_id,
                'name': name,
                'description': description,
                'created_by': user_id,
                'organization_id': organization_id,
                'is_active': True,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }

            result = supabase.table('group_conversations').insert(group).execute()

            if not result.data:
                raise Exception("Failed to create group")

            # Add creator as admin
            creator_member = {
                'id': str(uuid.uuid4()),
                'group_id': group_id,
                'user_id': user_id,
                'role': 'admin',
                'joined_at': datetime.utcnow().isoformat(),
                'added_by': user_id
            }
            supabase.table('group_members').insert(creator_member).execute()

            # Add initial members if provided
            if member_ids:
                for member_id in member_ids:
                    if member_id != user_id:  # Don't duplicate creator
                        try:
                            self.add_member(user_id, group_id, member_id)
                        except Exception as e:
                            logger.warning(f"Failed to add initial member {member_id}: {str(e)}")

            return result.data[0]

        except Exception as e:
            logger.error(f"Error creating group: {str(e)}")
            raise

    def get_group(self, user_id: str, group_id: str) -> Dict[str, Any]:
        """
        Get group details with member info

        Args:
            user_id: UUID of the requesting user
            group_id: UUID of the group

        Returns:
            Group record with members
        """
        try:
            if not self.is_group_member(user_id, group_id):
                raise ValueError("You are not a member of this group")

            supabase = self._get_client()

            # Get group info
            group = supabase.table('group_conversations').select('*').eq(
                'id', group_id
            ).single().execute()

            if not group.data:
                raise ValueError("Group not found")

            # Get members with user info
            members = supabase.table('group_members').select(
                'id, user_id, role, joined_at, added_by'
            ).eq('group_id', group_id).execute()

            member_list = []
            if members.data:
                for member in members.data:
                    user_info = self._get_user_info(member['user_id'])
                    member_list.append({
                        **member,
                        'user': user_info
                    })

            return {
                **group.data,
                'members': member_list,
                'member_count': len(member_list)
            }

        except Exception as e:
            logger.error(f"Error getting group: {str(e)}")
            raise

    def get_user_groups(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all groups for a user

        Args:
            user_id: UUID of the user

        Returns:
            List of group records
        """
        try:
            supabase = self._get_client()

            # Get all group memberships
            memberships = supabase.table('group_members').select('group_id').eq(
                'user_id', user_id
            ).execute()

            if not memberships.data:
                return []

            group_ids = [m['group_id'] for m in memberships.data]

            # Get group details
            groups = supabase.table('group_conversations').select('*').in_(
                'id', group_ids
            ).eq('is_active', True).order('last_message_at', desc=True).execute()

            # Enrich with member count and unread status
            result = []
            for group in (groups.data or []):
                member_count = supabase.table('group_members').select(
                    'id', count='exact'
                ).eq('group_id', group['id']).execute()

                # Get user's last read time
                membership = supabase.table('group_members').select('last_read_at').eq(
                    'group_id', group['id']
                ).eq('user_id', user_id).single().execute()

                last_read_at = membership.data.get('last_read_at') if membership.data else None

                # Count unread messages
                unread_count = 0
                if last_read_at:
                    unread = supabase.table('group_messages').select(
                        'id', count='exact'
                    ).eq('group_id', group['id']).gt(
                        'created_at', last_read_at
                    ).neq('sender_id', user_id).eq('is_deleted', False).execute()
                    unread_count = unread.count or 0
                else:
                    # Count all messages not from user
                    unread = supabase.table('group_messages').select(
                        'id', count='exact'
                    ).eq('group_id', group['id']).neq(
                        'sender_id', user_id
                    ).eq('is_deleted', False).execute()
                    unread_count = unread.count or 0

                result.append({
                    **group,
                    'member_count': member_count.count or 0,
                    'unread_count': unread_count
                })

            return result

        except Exception as e:
            logger.error(f"Error getting user groups: {str(e)}")
            raise

    def update_group(
        self,
        user_id: str,
        group_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update group details (admin only)

        Args:
            user_id: UUID of the user
            group_id: UUID of the group
            name: New group name (optional)
            description: New description (optional)

        Returns:
            Updated group record
        """
        try:
            if not self.is_group_admin(user_id, group_id):
                raise ValueError("Only group admins can update the group")

            supabase = self._get_client()

            update_data = {'updated_at': datetime.utcnow().isoformat()}
            if name is not None:
                update_data['name'] = name
            if description is not None:
                update_data['description'] = description

            result = supabase.table('group_conversations').update(update_data).eq(
                'id', group_id
            ).execute()

            return result.data[0] if result.data else {}

        except Exception as e:
            logger.error(f"Error updating group: {str(e)}")
            raise

    # ==================== Member Management ====================

    def add_member(self, user_id: str, group_id: str, target_user_id: str) -> Dict[str, Any]:
        """
        Add a member to the group

        Args:
            user_id: UUID of the admin adding the member
            group_id: UUID of the group
            target_user_id: UUID of the user to add

        Returns:
            New membership record
        """
        try:
            if not self.can_add_member(user_id, group_id, target_user_id):
                raise ValueError("Cannot add this user to the group")

            # Check if already a member
            if self.is_group_member(target_user_id, group_id):
                raise ValueError("User is already a member of this group")

            supabase = self._get_client()

            membership = {
                'id': str(uuid.uuid4()),
                'group_id': group_id,
                'user_id': target_user_id,
                'role': 'member',
                'joined_at': datetime.utcnow().isoformat(),
                'added_by': user_id
            }

            result = supabase.table('group_members').insert(membership).execute()

            return result.data[0] if result.data else {}

        except Exception as e:
            logger.error(f"Error adding member: {str(e)}")
            raise

    def remove_member(self, user_id: str, group_id: str, target_user_id: str) -> bool:
        """
        Remove a member from the group

        Args:
            user_id: UUID of the admin removing the member
            group_id: UUID of the group
            target_user_id: UUID of the user to remove

        Returns:
            Success boolean
        """
        try:
            # User can remove themselves, or admin can remove others
            if user_id != target_user_id and not self.is_group_admin(user_id, group_id):
                raise ValueError("Only group admins can remove other members")

            supabase = self._get_client()

            # Check if target is the last admin
            if user_id == target_user_id:
                admins = supabase.table('group_members').select('id').eq(
                    'group_id', group_id
                ).eq('role', 'admin').execute()

                if len(admins.data or []) <= 1:
                    raise ValueError("Cannot leave group - you are the only admin")

            supabase.table('group_members').delete().eq(
                'group_id', group_id
            ).eq('user_id', target_user_id).execute()

            return True

        except Exception as e:
            logger.error(f"Error removing member: {str(e)}")
            raise

    def leave_group(self, user_id: str, group_id: str) -> bool:
        """
        Leave a group

        Args:
            user_id: UUID of the user leaving
            group_id: UUID of the group

        Returns:
            Success boolean
        """
        return self.remove_member(user_id, group_id, user_id)

    # ==================== Message Operations ====================

    def send_message(self, user_id: str, group_id: str, content: str) -> Dict[str, Any]:
        """
        Send a message to a group

        Args:
            user_id: UUID of the sender
            group_id: UUID of the group
            content: Message content

        Returns:
            Created message record
        """
        try:
            if not self.is_group_member(user_id, group_id):
                raise ValueError("You are not a member of this group")

            supabase = self._get_client()

            message = {
                'id': str(uuid.uuid4()),
                'group_id': group_id,
                'sender_id': user_id,
                'message_content': content,
                'created_at': datetime.utcnow().isoformat(),
                'is_deleted': False
            }

            result = supabase.table('group_messages').insert(message).execute()

            # Update last_read_at for sender
            supabase.table('group_members').update({
                'last_read_at': datetime.utcnow().isoformat()
            }).eq('group_id', group_id).eq('user_id', user_id).execute()

            # Notify other group members
            self._notify_group_members(user_id, group_id, content)

            return result.data[0] if result.data else {}

        except Exception as e:
            logger.error(f"Error sending group message: {str(e)}")
            raise

    def get_messages(
        self,
        user_id: str,
        group_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get messages for a group

        Args:
            user_id: UUID of the requesting user
            group_id: UUID of the group
            limit: Number of messages to return
            offset: Offset for pagination

        Returns:
            List of message records
        """
        try:
            if not self.is_group_member(user_id, group_id):
                raise ValueError("You are not a member of this group")

            supabase = self._get_client()

            messages = supabase.table('group_messages').select('*').eq(
                'group_id', group_id
            ).eq('is_deleted', False).order(
                'created_at', desc=False
            ).range(offset, offset + limit - 1).execute()

            # Enrich with sender info
            result = []
            for msg in (messages.data or []):
                sender_info = self._get_user_info(msg['sender_id'])
                result.append({
                    **msg,
                    'sender': sender_info
                })

            # Update last_read_at for user
            supabase.table('group_members').update({
                'last_read_at': datetime.utcnow().isoformat()
            }).eq('group_id', group_id).eq('user_id', user_id).execute()

            return result

        except Exception as e:
            logger.error(f"Error getting group messages: {str(e)}")
            raise

    def mark_as_read(self, user_id: str, group_id: str) -> bool:
        """
        Mark all messages in a group as read

        Args:
            user_id: UUID of the user
            group_id: UUID of the group

        Returns:
            Success boolean
        """
        try:
            if not self.is_group_member(user_id, group_id):
                raise ValueError("You are not a member of this group")

            supabase = self._get_client()

            supabase.table('group_members').update({
                'last_read_at': datetime.utcnow().isoformat()
            }).eq('group_id', group_id).eq('user_id', user_id).execute()

            return True

        except Exception as e:
            logger.error(f"Error marking group as read: {str(e)}")
            return False

    # ==================== Helper Methods ====================

    def _get_user_info(self, user_id: str) -> Dict[str, Any]:
        """Get basic user info for display"""
        try:
            supabase = self._get_client()
            user = supabase.table('users').select(
                'id, display_name, first_name, last_name, avatar_url, role'
            ).eq('id', user_id).single().execute()

            return user.data if user.data else {'id': user_id, 'display_name': 'Unknown User'}
        except:
            return {'id': user_id, 'display_name': 'Unknown User'}

    def _notify_group_members(self, sender_id: str, group_id: str, content: str) -> None:
        """
        Send notifications to all group members except the sender.

        Args:
            sender_id: UUID of the message sender
            group_id: UUID of the group
            content: Message content (for preview)
        """
        try:
            supabase = self._get_client()

            # Get group info
            group = supabase.table('group_conversations').select(
                'name, organization_id'
            ).eq('id', group_id).single().execute()

            if not group.data:
                return

            group_name = group.data.get('name', 'Group')
            organization_id = group.data.get('organization_id')

            # Get sender info
            sender = self._get_user_info(sender_id)
            sender_name = sender.get('display_name') or sender.get('first_name') or 'Someone'

            # Get all group members except sender
            members = supabase.table('group_members').select('user_id').eq(
                'group_id', group_id
            ).neq('user_id', sender_id).execute()

            if not members.data:
                return

            # Create notification for each member
            notification_service = NotificationService()
            message_preview = content[:50] + '...' if len(content) > 50 else content

            for member in members.data:
                try:
                    notification_service.create_notification(
                        user_id=member['user_id'],
                        notification_type='message_received',
                        title=f'New message in {group_name}',
                        message=f'{sender_name}: {message_preview}',
                        link=f'/communication?group={group_id}',
                        metadata={
                            'group_id': group_id,
                            'sender_id': sender_id,
                            'sender_name': sender_name
                        },
                        organization_id=organization_id
                    )
                except Exception as e:
                    logger.warning(f"Failed to notify user {member['user_id']}: {str(e)}")
                    continue

        except Exception as e:
            # Don't fail the message send if notifications fail
            logger.warning(f"Failed to send group message notifications: {str(e)}")

    def get_available_members(self, user_id: str, group_id: str) -> List[Dict[str, Any]]:
        """
        Get users that can be added to the group
        Respects organization isolation

        Args:
            user_id: UUID of the requesting user (must be admin)
            group_id: UUID of the group

        Returns:
            List of user records that can be added
        """
        try:
            if not self.is_group_admin(user_id, group_id):
                raise ValueError("Only group admins can view available members")

            supabase = self._get_client()

            # Get group org
            group = supabase.table('group_conversations').select('organization_id').eq(
                'id', group_id
            ).single().execute()

            if not group.data:
                raise ValueError("Group not found")

            org_id = group.data.get('organization_id')

            # Get current members
            current_members = supabase.table('group_members').select('user_id').eq(
                'group_id', group_id
            ).execute()

            current_member_ids = [m['user_id'] for m in (current_members.data or [])]

            # Get available users from same org
            query = supabase.table('users').select(
                'id, display_name, first_name, last_name, avatar_url, role'
            )

            if org_id is not None:
                query = query.eq('organization_id', org_id)

            users = query.execute()

            # Filter out current members
            available = [
                u for u in (users.data or [])
                if u['id'] not in current_member_ids
            ]

            return available

        except Exception as e:
            logger.error(f"Error getting available members: {str(e)}")
            raise
