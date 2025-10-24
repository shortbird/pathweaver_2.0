"""
Tutor Repository

Handles all database operations related to AI tutor conversations, messages, settings, and safety.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from backend.repositories.base_repository import BaseRepository, NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)


class TutorRepository(BaseRepository):
    """Repository for AI tutor operations."""

    table_name = 'tutor_conversations'

    def find_user_conversations(self, user_id: str, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """
        Get all conversations for a user.

        Args:
            user_id: User ID
            include_inactive: Whether to include inactive conversations

        Returns:
            List of conversations
        """
        try:
            query = self.client.table(self.table_name)\
                .select('*')\
                .eq('user_id', user_id)

            if not include_inactive:
                query = query.eq('is_active', True)

            query = query.order('updated_at', desc=True)

            result = query.execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching conversations for user {user_id}: {e}")
            return []

    def create_conversation(self, user_id: str, mode: str, title: Optional[str] = None, context: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a new tutor conversation.

        Args:
            user_id: User ID
            mode: Tutor mode (study_buddy, teacher, discovery, review, creative)
            title: Optional conversation title
            context: Optional context information

        Returns:
            Created conversation record
        """
        valid_modes = ['study_buddy', 'teacher', 'discovery', 'review', 'creative']
        if mode not in valid_modes:
            raise ValueError(f"Invalid tutor mode. Must be one of: {', '.join(valid_modes)}")

        try:
            data = {
                'user_id': user_id,
                'mode': mode,
                'title': title or f"{mode.replace('_', ' ').title()} Session",
                'context': context,
                'is_active': True,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }

            result = self.client.table(self.table_name)\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create conversation")

            logger.info(f"Created tutor conversation for user {user_id} in mode {mode}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating tutor conversation: {e}")
            raise

    def add_message(self, conversation_id: str, user_id: str, role: str, content: str, tokens_used: int = 0, safety_level: str = 'safe') -> Dict[str, Any]:
        """
        Add a message to a conversation.

        Args:
            conversation_id: Conversation ID
            user_id: User ID
            role: Message role (user/assistant)
            content: Message content
            tokens_used: Number of tokens used
            safety_level: Safety level (safe, warning, blocked, requires_review)

        Returns:
            Created message record
        """
        try:
            data = {
                'conversation_id': conversation_id,
                'user_id': user_id,
                'role': role,
                'content': content,
                'tokens_used': tokens_used,
                'safety_level': safety_level,
                'created_at': datetime.utcnow().isoformat()
            }

            result = self.client.table('tutor_messages')\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create message")

            # Update conversation timestamp
            self.client.table(self.table_name)\
                .update({'updated_at': datetime.utcnow().isoformat()})\
                .eq('id', conversation_id)\
                .execute()

            logger.info(f"Added {role} message to conversation {conversation_id}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error adding message to conversation {conversation_id}: {e}")
            raise

    def get_conversation_messages(self, conversation_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Get all messages in a conversation.

        Args:
            conversation_id: Conversation ID
            limit: Maximum number of messages to return

        Returns:
            List of messages ordered by creation time
        """
        try:
            result = self.client.table('tutor_messages')\
                .select('*')\
                .eq('conversation_id', conversation_id)\
                .order('created_at', desc=False)\
                .limit(limit)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching messages for conversation {conversation_id}: {e}")
            return []

    def get_user_settings(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get tutor settings for a user.

        Args:
            user_id: User ID

        Returns:
            Tutor settings or None if not set
        """
        try:
            result = self.client.table('tutor_settings')\
                .select('*')\
                .eq('user_id', user_id)\
                .single()\
                .execute()

            return result.data if result.data else None
        except Exception as e:
            logger.error(f"Error fetching tutor settings for user {user_id}: {e}")
            return None

    def update_settings(self, user_id: str, settings: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update tutor settings for a user.

        Args:
            user_id: User ID
            settings: Settings to update

        Returns:
            Updated settings record
        """
        try:
            # Upsert settings
            settings['user_id'] = user_id
            settings['updated_at'] = datetime.utcnow().isoformat()

            result = self.client.table('tutor_settings')\
                .upsert(settings, on_conflict='user_id')\
                .execute()

            if not result.data:
                raise ValueError("Failed to update settings")

            logger.info(f"Updated tutor settings for user {user_id}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error updating tutor settings for user {user_id}: {e}")
            raise

    def log_safety_event(self, user_id: str, message_id: str, flagged_content: str, safety_score: float, action_taken: str) -> Dict[str, Any]:
        """
        Log a safety event.

        Args:
            user_id: User ID
            message_id: Message ID that triggered the event
            flagged_content: Content that was flagged
            safety_score: Safety score (0-1)
            action_taken: Action taken (warned, blocked, logged)

        Returns:
            Created safety log record
        """
        try:
            data = {
                'user_id': user_id,
                'message_id': message_id,
                'flagged_content': flagged_content,
                'safety_score': safety_score,
                'action_taken': action_taken,
                'created_at': datetime.utcnow().isoformat()
            }

            result = self.client.table('tutor_safety_logs')\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to log safety event")

            logger.warning(f"Logged safety event for user {user_id}: {action_taken}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error logging safety event: {e}")
            raise

    def get_safety_logs(self, user_id: str, days: int = 30) -> List[Dict[str, Any]]:
        """
        Get safety logs for a user.

        Args:
            user_id: User ID
            days: Number of days to look back

        Returns:
            List of safety logs
        """
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()

            result = self.client.table('tutor_safety_logs')\
                .select('*')\
                .eq('user_id', user_id)\
                .gte('created_at', since)\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching safety logs for user {user_id}: {e}")
            return []

    def deactivate_conversation(self, conversation_id: str) -> bool:
        """
        Deactivate a conversation.

        Args:
            conversation_id: Conversation ID

        Returns:
            True if deactivated successfully
        """
        try:
            result = self.client.table(self.table_name)\
                .update({'is_active': False})\
                .eq('id', conversation_id)\
                .execute()

            logger.info(f"Deactivated conversation {conversation_id}")
            return True
        except Exception as e:
            logger.error(f"Error deactivating conversation {conversation_id}: {e}")
            raise
