"""
Direct Message Service - Manages direct messaging between users
Handles advisor-student and friend-to-friend messaging
"""

import sys
from datetime import datetime
from typing import Dict, List, Optional, Any
import uuid
from services.base_service import BaseService
from services.notification_service import NotificationService
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


class DirectMessageService(BaseService):
    """Service for direct messaging operations"""

    def __init__(self):
        # Don't store the client - get fresh one for each operation
        pass

    def _get_client(self):
        """Get a fresh Supabase client for each operation"""
        return get_supabase_admin_client()

    # ==================== Permission Checking ====================

    def can_message_user(self, user_id: str, target_id: str) -> bool:
        """
        Check if user has permission to message target user

        Args:
            user_id: UUID of the sender
            target_id: UUID of the recipient

        Returns:
            Boolean indicating if messaging is allowed
        """
        try:
            supabase = self._get_client()
            print(f"[can_message_user] Checking permission: {user_id} -> {target_id}", file=sys.stderr, flush=True)

            # SUPERADMIN: Can message anyone, and anyone can reply to superadmin
            sender = supabase.table('users').select('role').eq('id', user_id).single().execute()
            if sender.data and sender.data.get('role') == 'superadmin':
                print(f"[can_message_user] ALLOWED: Superadmin can message anyone", file=sys.stderr, flush=True)
                return True

            # Check if target is superadmin - anyone can message superadmin
            target = supabase.table('users').select('role').eq('id', target_id).single().execute()
            if target.data and target.data.get('role') == 'superadmin':
                print(f"[can_message_user] ALLOWED: Anyone can message superadmin", file=sys.stderr, flush=True)
                return True

            # Check for advisor-student relationship via advisor_student_assignments table
            # Check if user_id is advisor for target_id
            advisor_assignment1 = supabase.table('advisor_student_assignments').select('id').eq(
                'advisor_id', user_id
            ).eq('student_id', target_id).eq('is_active', True).execute()

            # Check if target_id is advisor for user_id
            advisor_assignment2 = supabase.table('advisor_student_assignments').select('id').eq(
                'advisor_id', target_id
            ).eq('student_id', user_id).eq('is_active', True).execute()

            print(f"[can_message_user] Advisor assignment check: a1={advisor_assignment1.data}, a2={advisor_assignment2.data}", file=sys.stderr, flush=True)

            if (advisor_assignment1.data and len(advisor_assignment1.data) > 0) or \
               (advisor_assignment2.data and len(advisor_assignment2.data) > 0):
                print(f"[can_message_user] ALLOWED: Advisor-student assignment exists", file=sys.stderr, flush=True)
                return True

            # Check if they are friends (accepted status) - check both directions
            friendship1 = supabase.table('friendships').select('status').eq(
                'requester_id', user_id
            ).eq('addressee_id', target_id).execute()

            friendship2 = supabase.table('friendships').select('status').eq(
                'requester_id', target_id
            ).eq('addressee_id', user_id).execute()

            print(f"[can_message_user] Friendship check: f1={friendship1.data}, f2={friendship2.data}", file=sys.stderr, flush=True)

            if (friendship1.data and len(friendship1.data) > 0 and friendship1.data[0]['status'] == 'accepted') or \
               (friendship2.data and len(friendship2.data) > 0 and friendship2.data[0]['status'] == 'accepted'):
                print(f"[can_message_user] ALLOWED: Accepted friendship", file=sys.stderr, flush=True)
                return True

            # Check if they have a parent-student link (bidirectional)
            parent_link1 = supabase.table('parent_student_links').select('id').eq(
                'parent_user_id', user_id
            ).eq('student_user_id', target_id).execute()

            parent_link2 = supabase.table('parent_student_links').select('id').eq(
                'parent_user_id', target_id
            ).eq('student_user_id', user_id).execute()

            print(f"[can_message_user] Parent link check: pl1={parent_link1.data}, pl2={parent_link2.data}", file=sys.stderr, flush=True)

            if (parent_link1.data and len(parent_link1.data) > 0) or \
               (parent_link2.data and len(parent_link2.data) > 0):
                print(f"[can_message_user] ALLOWED: Parent-student link exists", file=sys.stderr, flush=True)
                return True

            # Check for observer-student link (bidirectional)
            observer_link1 = supabase.table('observer_student_links').select('id').eq(
                'observer_id', user_id
            ).eq('student_id', target_id).execute()

            observer_link2 = supabase.table('observer_student_links').select('id').eq(
                'observer_id', target_id
            ).eq('student_id', user_id).execute()

            print(f"[can_message_user] Observer link check: ol1={observer_link1.data}, ol2={observer_link2.data}", file=sys.stderr, flush=True)

            if (observer_link1.data and len(observer_link1.data) > 0) or \
               (observer_link2.data and len(observer_link2.data) > 0):
                print(f"[can_message_user] ALLOWED: Observer-student link exists", file=sys.stderr, flush=True)
                return True

            print(f"[can_message_user] DENIED: No valid relationship found", file=sys.stderr, flush=True)
            return False

        except Exception as e:
            print(f"[can_message_user] ERROR: {str(e)}", file=sys.stderr, flush=True)
            import traceback
            return False

    # ==================== Conversation Management ====================

    def get_or_create_conversation(self, user_id: str, target_id: str) -> Dict[str, Any]:
        """
        Get existing conversation between two users or create a new one

        Args:
            user_id: UUID of first participant
            target_id: UUID of second participant

        Returns:
            Conversation record
        """
        try:
            supabase = self._get_client()

            # Always store IDs in consistent order (smaller UUID first)
            p1_id, p2_id = (user_id, target_id) if user_id < target_id else (target_id, user_id)

            # Try to find existing conversation
            conversation = supabase.table('message_conversations').select('*').eq(
                'participant_1_id', p1_id
            ).eq('participant_2_id', p2_id).execute()

            if conversation.data and len(conversation.data) > 0:
                return conversation.data[0]

            # Create new conversation
            new_conversation = {
                'id': str(uuid.uuid4()),
                'participant_1_id': p1_id,
                'participant_2_id': p2_id,
                'last_message_at': datetime.utcnow().isoformat(),
                'last_message_preview': '',
                'unread_count_p1': 0,
                'unread_count_p2': 0,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }

            result = supabase.table('message_conversations').insert(new_conversation).execute()
            return result.data[0]

        except Exception as e:
            print(f"Error getting or creating conversation: {str(e)}", file=sys.stderr, flush=True)
            raise

    def get_user_conversations(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all conversations for a user with metadata

        Args:
            user_id: UUID of the user

        Returns:
            List of conversation records with participant info
        """
        try:
            supabase = self._get_client()

            # Get conversations where user is participant_1
            convos_p1 = supabase.table('message_conversations').select('''
                id, participant_1_id, participant_2_id, last_message_at,
                last_message_preview, unread_count_p1, unread_count_p2,
                created_at, updated_at
            ''').eq('participant_1_id', user_id).execute()

            # Get conversations where user is participant_2
            convos_p2 = supabase.table('message_conversations').select('''
                id, participant_1_id, participant_2_id, last_message_at,
                last_message_preview, unread_count_p1, unread_count_p2,
                created_at, updated_at
            ''').eq('participant_2_id', user_id).execute()

            # Combine and enrich with participant details
            all_conversations = []

            if convos_p1.data:
                for convo in convos_p1.data:
                    other_user_id = convo['participant_2_id']
                    user_data = self._get_user_info(other_user_id)
                    all_conversations.append({
                        **convo,
                        'other_user': user_data,
                        'unread_count': convo['unread_count_p1']
                    })

            if convos_p2.data:
                for convo in convos_p2.data:
                    other_user_id = convo['participant_1_id']
                    user_data = self._get_user_info(other_user_id)
                    all_conversations.append({
                        **convo,
                        'other_user': user_data,
                        'unread_count': convo['unread_count_p2']
                    })

            # Sort by last_message_at descending
            all_conversations.sort(key=lambda x: x['last_message_at'], reverse=True)

            return all_conversations

        except Exception as e:
            print(f"Error getting user conversations: {str(e)}", file=sys.stderr, flush=True)
            raise

    def _get_user_info(self, user_id: str) -> Dict[str, Any]:
        """Get basic user info for conversation list"""
        try:
            supabase = self._get_client()
            user = supabase.table('users').select(
                'id, display_name, first_name, last_name, avatar_url, role'
            ).eq('id', user_id).single().execute()

            return user.data if user.data else {}
        except:
            return {'id': user_id, 'display_name': 'Unknown User'}

    # ==================== Message Operations ====================

    def send_message(self, sender_id: str, recipient_id: str, content: str) -> Dict[str, Any]:
        """
        Send a message from one user to another

        Args:
            sender_id: UUID of the sender
            recipient_id: UUID of the recipient
            content: Message content

        Returns:
            Created message record
        """
        try:
            # Verify permission
            if not self.can_message_user(sender_id, recipient_id):
                raise ValueError("You don't have permission to message this user")

            # Get or create conversation
            conversation = self.get_or_create_conversation(sender_id, recipient_id)

            supabase = self._get_client()

            # Create message
            message = {
                'id': str(uuid.uuid4()),
                'conversation_id': conversation['id'],
                'sender_id': sender_id,
                'recipient_id': recipient_id,
                'message_content': content,
                'read_at': None,
                'created_at': datetime.utcnow().isoformat()
            }

            result = supabase.table('direct_messages').insert(message).execute()

            # Update conversation metadata
            self._update_conversation_metadata(
                conversation['id'],
                sender_id,
                recipient_id,
                content[:100]
            )

            # Send notification to recipient
            self._notify_recipient(sender_id, recipient_id, content)

            return result.data[0]

        except Exception as e:
            print(f"Error sending message: {str(e)}", file=sys.stderr, flush=True)
            raise

    def _notify_recipient(self, sender_id: str, recipient_id: str, content: str) -> None:
        """
        Send a notification to the message recipient.

        Args:
            sender_id: UUID of the message sender
            recipient_id: UUID of the message recipient
            content: Message content (for preview)
        """
        try:
            # Get sender info for notification
            sender_info = self._get_user_info(sender_id)
            sender_name = (
                sender_info.get('display_name') or
                f"{sender_info.get('first_name', '')} {sender_info.get('last_name', '')}".strip() or
                'Someone'
            )

            # Get recipient's organization for notification
            supabase = self._get_client()
            recipient = supabase.table('users').select('organization_id').eq(
                'id', recipient_id
            ).single().execute()
            organization_id = recipient.data.get('organization_id') if recipient.data else None

            # Create notification
            message_preview = content[:50] + '...' if len(content) > 50 else content
            notification_service = NotificationService()
            notification_service.create_notification(
                user_id=recipient_id,
                notification_type='message_received',
                title=f'New message from {sender_name}',
                message=message_preview,
                link=f'/communication?user={sender_id}',
                metadata={
                    'sender_id': sender_id,
                    'sender_name': sender_name
                },
                organization_id=organization_id
            )

        except Exception as e:
            # Don't fail message send if notification fails
            logger.warning(f"Failed to send message notification: {str(e)}")

    def get_conversation_messages(
        self,
        conversation_id: str,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get messages for a conversation

        Handles both actual conversation IDs and user IDs (for new conversations)

        Args:
            conversation_id: UUID of the conversation OR target user ID
            user_id: UUID of the requesting user (for permission check)
            limit: Number of messages to return
            offset: Offset for pagination

        Returns:
            List of message records
        """
        try:
            supabase = self._get_client()

            # Try to fetch conversation by ID first
            conversation_result = supabase.table('message_conversations').select('*').eq(
                'id', conversation_id
            ).execute()

            # If no conversation found, try to find/create by user IDs
            if not conversation_result.data or len(conversation_result.data) == 0:
                # conversation_id might actually be a target_user_id
                # Try to find existing conversation between these users
                conversation = self.get_or_create_conversation(user_id, conversation_id)
                actual_conversation_id = conversation['id']
            else:
                conversation = conversation_result.data[0]
                actual_conversation_id = conversation_id

                # Verify user is a participant
                if user_id not in [conversation['participant_1_id'], conversation['participant_2_id']]:
                    raise ValueError("You are not a participant in this conversation")

            # Get messages
            messages = supabase.table('direct_messages').select('*').eq(
                'conversation_id', actual_conversation_id
            ).order('created_at', desc=False).range(offset, offset + limit - 1).execute()

            return messages.data if messages.data else []

        except Exception as e:
            print(f"Error getting conversation messages: {str(e)}", file=sys.stderr, flush=True)
            raise

    def mark_as_read(self, message_id: str, user_id: str) -> bool:
        """
        Mark a message as read

        Args:
            message_id: UUID of the message
            user_id: UUID of the user marking as read

        Returns:
            Success boolean
        """
        try:
            supabase = self._get_client()

            # Get message
            message = supabase.table('direct_messages').select('*').eq(
                'id', message_id
            ).single().execute()

            if not message.data:
                raise ValueError("Message not found")

            # Only recipient can mark as read
            if message.data['recipient_id'] != user_id:
                raise ValueError("You can only mark your own messages as read")

            # Update message
            supabase.table('direct_messages').update({
                'read_at': datetime.utcnow().isoformat()
            }).eq('id', message_id).execute()

            # Decrement unread count
            self._decrement_unread_count(
                message.data['conversation_id'],
                message.data['sender_id'],
                message.data['recipient_id']
            )

            return True

        except Exception as e:
            print(f"Error marking message as read: {str(e)}", file=sys.stderr, flush=True)
            raise

    def get_unread_count(self, user_id: str) -> int:
        """
        Get total unread message count for a user

        Args:
            user_id: UUID of the user

        Returns:
            Total unread count
        """
        try:
            supabase = self._get_client()
            total_unread = 0

            # Get unread count where user is participant_1
            convos_p1 = supabase.table('message_conversations').select(
                'unread_count_p1'
            ).eq('participant_1_id', user_id).execute()

            if convos_p1.data:
                total_unread += sum(c['unread_count_p1'] for c in convos_p1.data)

            # Get unread count where user is participant_2
            convos_p2 = supabase.table('message_conversations').select(
                'unread_count_p2'
            ).eq('participant_2_id', user_id).execute()

            if convos_p2.data:
                total_unread += sum(c['unread_count_p2'] for c in convos_p2.data)

            return total_unread

        except Exception as e:
            print(f"Error getting unread count: {str(e)}", file=sys.stderr, flush=True)
            return 0

    # ==================== Helper Methods ====================

    def _update_conversation_metadata(
        self,
        conversation_id: str,
        sender_id: str,
        recipient_id: str,
        preview: str
    ):
        """Update conversation last_message_at, preview, and unread count"""
        try:
            supabase = self._get_client()
            conversation = supabase.table('message_conversations').select('*').eq(
                'id', conversation_id
            ).single().execute()

            if not conversation.data:
                return

            # Determine which participant is which
            is_sender_p1 = conversation.data['participant_1_id'] == sender_id

            # Increment unread count for recipient
            update_data = {
                'last_message_at': datetime.utcnow().isoformat(),
                'last_message_preview': preview,
                'updated_at': datetime.utcnow().isoformat()
            }

            if is_sender_p1:
                update_data['unread_count_p2'] = conversation.data['unread_count_p2'] + 1
            else:
                update_data['unread_count_p1'] = conversation.data['unread_count_p1'] + 1

            supabase.table('message_conversations').update(update_data).eq(
                'id', conversation_id
            ).execute()

        except Exception as e:
            print(f"Error updating conversation metadata: {str(e)}", file=sys.stderr, flush=True)

    def _decrement_unread_count(
        self,
        conversation_id: str,
        sender_id: str,
        recipient_id: str
    ):
        """Decrement unread count when message is marked as read"""
        try:
            supabase = self._get_client()
            conversation = supabase.table('message_conversations').select('*').eq(
                'id', conversation_id
            ).single().execute()

            if not conversation.data:
                return

            # Determine which participant is the recipient
            is_recipient_p1 = conversation.data['participant_1_id'] == recipient_id

            # Decrement unread count (don't go below 0)
            if is_recipient_p1:
                new_count = max(0, conversation.data['unread_count_p1'] - 1)
                supabase.table('message_conversations').update({
                    'unread_count_p1': new_count
                }).eq('id', conversation_id).execute()
            else:
                new_count = max(0, conversation.data['unread_count_p2'] - 1)
                supabase.table('message_conversations').update({
                    'unread_count_p2': new_count
                }).eq('id', conversation_id).execute()

        except Exception as e:
            print(f"Error decrementing unread count: {str(e)}", file=sys.stderr, flush=True)
