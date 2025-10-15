"""
Direct Message Service - Manages direct messaging between users
Handles advisor-student and friend-to-friend messaging
"""

import sys
from datetime import datetime
from typing import Dict, List, Optional, Any
import uuid
from database import get_supabase_admin_client


class DirectMessageService:
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

            # Check if target is user's advisor
            user = supabase.table('users').select('advisor_id').eq('id', user_id).single().execute()
            if user.data and user.data.get('advisor_id') == target_id:
                return True

            # Check if user is target's advisor
            target = supabase.table('users').select('advisor_id').eq('id', target_id).single().execute()
            if target.data and target.data.get('advisor_id') == user_id:
                return True

            # Check if they are friends (accepted status)
            friendship = supabase.table('friendships').select('status').or_(
                f'and(requester_id.eq.{user_id},addressee_id.eq.{target_id})',
                f'and(requester_id.eq.{target_id},addressee_id.eq.{user_id})'
            ).execute()

            if friendship.data and len(friendship.data) > 0:
                if friendship.data[0]['status'] == 'accepted':
                    return True

            return False

        except Exception as e:
            print(f"Error checking message permission: {str(e)}", file=sys.stderr, flush=True)
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

            return result.data[0]

        except Exception as e:
            print(f"Error sending message: {str(e)}", file=sys.stderr, flush=True)
            raise

    def get_conversation_messages(
        self,
        conversation_id: str,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get messages for a conversation

        Args:
            conversation_id: UUID of the conversation
            user_id: UUID of the requesting user (for permission check)
            limit: Number of messages to return
            offset: Offset for pagination

        Returns:
            List of message records
        """
        try:
            supabase = self._get_client()

            # Verify user is a participant
            conversation = supabase.table('message_conversations').select('*').eq(
                'id', conversation_id
            ).single().execute()

            if not conversation.data:
                raise ValueError("Conversation not found")

            if user_id not in [conversation.data['participant_1_id'], conversation.data['participant_2_id']]:
                raise ValueError("You are not a participant in this conversation")

            # Get messages
            messages = supabase.table('direct_messages').select('*').eq(
                'conversation_id', conversation_id
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
