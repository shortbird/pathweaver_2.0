"""
Tutor Conversation Service

Handles conversation management, message storage, and context building for the AI tutor.
Extracted from routes/tutor/chat.py for better maintainability.
"""

from datetime import datetime, date
from typing import Dict, List, Optional, Any
import uuid
import logging

from services.ai_tutor_service import TutorContext, ConversationMode
from utils.logger import get_logger
from repositories import QuestRepository

logger = get_logger(__name__)


class TutorConversationService:
    """Service for managing tutor conversations and messages"""

    def __init__(self, client):
        """
        Initialize the service with a Supabase client

        Args:
            client: Supabase client instance (user or admin)
        """
        self.client = client

    def get_conversation(self, conversation_id: str, user_id: str) -> Optional[Dict]:
        """
        Get conversation by ID if user owns it

        Args:
            conversation_id: Conversation UUID
            user_id: User UUID

        Returns:
            Conversation dict or None if not found
        """
        try:
            result = self.client.table('tutor_conversations').select('*').eq(
                'id', conversation_id
            ).eq('user_id', user_id).execute()
            if result.data and len(result.data) > 0:
                return result.data[0]
            return None
        except Exception as e:
            logger.error(f"Error getting conversation {conversation_id}: {e}")
            return None

    def create_conversation(self, user_id: str, mode: str = 'teacher') -> Dict:
        """
        Create new tutor conversation

        Args:
            user_id: User UUID
            mode: Conversation mode (teacher, study_buddy, etc.)

        Returns:
            Created conversation dict
        """
        conversation_data = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'title': f"Chat Session - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            'conversation_mode': mode,
            'created_at': datetime.utcnow().isoformat()
        }

        result = self.client.table('tutor_conversations').insert(conversation_data).execute()
        return result.data[0]

    def store_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        user_id: str,
        metadata: Optional[Dict] = None
    ) -> Dict:
        """
        Store message in database and update conversation metadata

        Args:
            conversation_id: Conversation UUID
            role: Message role (user or assistant)
            content: Message content
            user_id: User UUID
            metadata: Optional metadata (safety_level, suggestions, etc.)

        Returns:
            Created message dict
        """
        message_data = {
            'id': str(uuid.uuid4()),
            'conversation_id': conversation_id,
            'role': role,
            'content': content,
            'created_at': datetime.utcnow().isoformat()
        }

        if metadata:
            message_data.update({
                'safety_level': metadata.get('safety_level', 'safe'),
                'context_data': {
                    'suggestions': metadata.get('suggestions', []),
                    'next_questions': metadata.get('next_questions', []),
                    'xp_bonus_eligible': metadata.get('xp_bonus_eligible', False)
                }
            })

        result = self.client.table('tutor_messages').insert(message_data).execute()

        # Update conversation metadata (message_count and last_message_at)
        self.update_conversation_metadata(conversation_id)

        return result.data[0]

    def update_conversation_metadata(self, conversation_id: str):
        """
        Update conversation's message_count and last_message_at

        Args:
            conversation_id: Conversation UUID
        """
        try:
            # Get message count
            messages = self.client.table('tutor_messages').select('id', count='exact').eq(
                'conversation_id', conversation_id
            ).execute()

            # Update conversation
            self.client.table('tutor_conversations').update({
                'message_count': messages.count if messages.count else 0,
                'last_message_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', conversation_id).execute()
        except Exception as e:
            logger.error(f"Failed to update conversation metadata: {e}")
            # Don't raise - this is not critical enough to fail the message storage

    def build_tutor_context(
        self,
        user_id: str,
        conversation: Optional[Dict] = None,
        conversation_mode: Optional[str] = None
    ) -> TutorContext:
        """
        Build tutor context from user data

        Args:
            user_id: User UUID
            conversation: Optional conversation dict for message history
            conversation_mode: Optional mode to override user settings

        Returns:
            TutorContext object
        """
        context = TutorContext(user_id=user_id)

        try:
            # Get user settings
            settings = self.client.table('tutor_settings').select('*').eq('user_id', user_id).execute()
            if settings.data and len(settings.data) > 0:
                settings_data = settings.data[0]
                context.user_age = settings_data.get('age_verification')
                context.learning_style = settings_data.get('learning_style')
                if settings_data.get('preferred_mode'):
                    context.conversation_mode = ConversationMode(settings_data['preferred_mode'])

            # Override with conversation_mode from request if provided (highest priority)
            if conversation_mode:
                try:
                    context.conversation_mode = ConversationMode(conversation_mode)
                except ValueError:
                    logger.warning(f"Invalid conversation mode '{conversation_mode}', using default")

            # Fetch user's learning vision (bio field) for AI context
            try:
                user_result = self.client.table('users').select('bio').eq('id', user_id).single().execute()
                if user_result.data and user_result.data.get('bio'):
                    context.vision_statement = user_result.data['bio']
            except Exception as e:
                logger.warning(f"Could not fetch user vision statement: {e}")

            # Get recent messages for context
            if conversation:
                messages = self.client.table('tutor_messages').select('role, content').eq(
                    'conversation_id', conversation['id']
                ).order('created_at', desc=True).limit(5).execute()
                context.previous_messages = messages.data

            # Don't automatically fetch quest context - OptioBot is now global
            # Quest context will only be included if explicitly passed from frontend

        except Exception as e:
            # If context building fails, use defaults
            logger.error(f"Warning: Failed to build full context for user {user_id}: {e}")

        return context

    def build_quest_context(self, user_id: str, quest_id: str) -> Optional[Dict]:
        """
        Build rich quest context for AI tutor including tasks and completions.

        Args:
            user_id: User UUID
            quest_id: Quest UUID

        Returns:
            Dict with quest details, tasks, completions, and evidence or None if not found
        """
        try:
            quest_repo = QuestRepository(self.client)

            # Get quest details
            quest_result = self.client.table('quests').select(
                'id, title, description, pillar_primary, quest_topics, big_idea'
            ).eq('id', quest_id).execute()

            if not quest_result.data or len(quest_result.data) == 0:
                logger.warning(f"Quest {quest_id} not found")
                return None

            quest = quest_result.data[0]

            # Get all tasks for this quest and user
            tasks_result = self.client.table('user_quest_tasks').select(
                'id, title, pillar, xp_value, is_completed'
            ).eq('quest_id', quest_id).eq('user_id', user_id).execute()

            tasks = tasks_result.data if tasks_result.data else []

            # Get completed tasks with evidence
            completions_result = self.client.table('quest_task_completions').select(
                'task_id, evidence_text, completed_at'
            ).eq('quest_id', quest_id).eq('user_id', user_id).order(
                'completed_at', desc=True
            ).limit(5).execute()

            completions = completions_result.data if completions_result.data else []

            # Map completions to task titles for evidence context
            task_id_to_title = {t['id']: t['title'] for t in tasks}
            recent_evidence = []
            for completion in completions:
                task_title = task_id_to_title.get(completion['task_id'], 'Unknown Task')
                if completion.get('evidence_text'):
                    recent_evidence.append({
                        'task_title': task_title,
                        'evidence_text': completion['evidence_text'],
                        'completed_at': completion['completed_at']
                    })

            # Build task list with completion status
            completed_task_ids = {c['task_id'] for c in completions}
            tasks_with_status = []
            for task in tasks:
                tasks_with_status.append({
                    'id': task['id'],
                    'title': task['title'],
                    'pillar': task['pillar'],
                    'xp_value': task['xp_value'],
                    'is_completed': task['id'] in completed_task_ids or task.get('is_completed', False)
                })

            completed_count = sum(1 for t in tasks_with_status if t['is_completed'])

            return {
                'quest': {
                    'id': quest['id'],
                    'title': quest['title'],
                    'description': quest.get('description', ''),
                    'big_idea': quest.get('big_idea', ''),
                    'pillar_primary': quest.get('pillar_primary', ''),
                    'topics': quest.get('quest_topics', [])
                },
                'tasks': tasks_with_status,
                'completed_count': completed_count,
                'total_count': len(tasks_with_status),
                'recent_evidence': recent_evidence[:3]  # Limit to 3 most recent
            }

        except Exception as e:
            logger.error(f"Failed to build quest context for quest {quest_id}: {e}")
            return None

    def build_lesson_context(
        self,
        user_id: str,
        lesson_id: str,
        block_index: Optional[int] = None
    ) -> Optional[Dict]:
        """
        Build rich lesson context for AI tutor including current content block and linked tasks.

        Args:
            user_id: User UUID
            lesson_id: Lesson UUID
            block_index: Optional index of the current content block being viewed

        Returns:
            Dict with lesson details, current block, progress, and linked tasks or None if not found
        """
        try:
            # Get lesson details with quest info
            lesson_result = self.client.table('curriculum_lessons').select(
                'id, quest_id, title, description, content, sequence_order, estimated_duration_minutes'
            ).eq('id', lesson_id).execute()

            if not lesson_result.data or len(lesson_result.data) == 0:
                logger.warning(f"Lesson {lesson_id} not found")
                return None

            lesson = lesson_result.data[0]

            # Get quest title for context
            quest_result = self.client.table('quests').select('id, title').eq(
                'id', lesson['quest_id']
            ).execute()
            quest_title = quest_result.data[0]['title'] if quest_result.data else 'Unknown Quest'

            # Parse lesson content blocks
            content_blocks = lesson.get('content', {}).get('blocks', [])

            # Get current block if index provided
            current_block = None
            if block_index is not None and 0 <= block_index < len(content_blocks):
                block = content_blocks[block_index]
                current_block = {
                    'index': block_index,
                    'type': block.get('type', 'text'),
                    'content': block.get('content', '')[:500]  # Limit content length
                }

            # Get lesson progress for this user
            progress_result = self.client.table('curriculum_lesson_progress').select(
                'status, progress_percentage, time_spent_seconds'
            ).eq('lesson_id', lesson_id).eq('user_id', user_id).execute()

            progress = {
                'status': 'not_started',
                'progress_percentage': 0,
                'time_spent_seconds': 0
            }
            if progress_result.data and len(progress_result.data) > 0:
                progress = {
                    'status': progress_result.data[0].get('status', 'not_started'),
                    'progress_percentage': progress_result.data[0].get('progress_percentage', 0),
                    'time_spent_seconds': progress_result.data[0].get('time_spent_seconds', 0)
                }

            # Get tasks linked to this lesson
            linked_tasks_result = self.client.table('curriculum_lesson_tasks').select(
                'task_id, user_quest_tasks!inner(id, title, pillar)'
            ).eq('lesson_id', lesson_id).execute()

            linked_tasks = []
            if linked_tasks_result.data:
                for link in linked_tasks_result.data:
                    task = link.get('user_quest_tasks', {})
                    if task:
                        linked_tasks.append({
                            'id': task.get('id'),
                            'title': task.get('title'),
                            'pillar': task.get('pillar')
                        })

            # Get user's learning style
            settings_result = self.client.table('tutor_settings').select(
                'learning_style'
            ).eq('user_id', user_id).execute()

            learning_style = 'mixed'
            if settings_result.data and len(settings_result.data) > 0:
                learning_style = settings_result.data[0].get('learning_style', 'mixed')

            return {
                'lesson': {
                    'id': lesson['id'],
                    'title': lesson['title'],
                    'description': lesson.get('description', ''),
                    'quest_id': lesson['quest_id'],
                    'quest_title': quest_title,
                    'estimated_duration': lesson.get('estimated_duration_minutes')
                },
                'current_block': current_block,
                'progress': progress,
                'linked_tasks': linked_tasks[:5],  # Limit to 5 tasks
                'learning_style': learning_style
            }

        except Exception as e:
            logger.error(f"Failed to build lesson context for lesson {lesson_id}: {e}")
            return None

    def create_default_settings(self, user_id: str) -> Dict:
        """
        Create default tutor settings for user

        Args:
            user_id: User UUID

        Returns:
            Created settings dict
        """
        default_settings = {
            'user_id': user_id,
            'preferred_mode': 'study_buddy',
            'daily_message_limit': 50,  # Will be updated based on subscription tier
            'messages_used_today': 0,
            'last_reset_date': date.today().isoformat(),
            'parent_monitoring_enabled': True,
            'notification_preferences': {},
            'created_at': datetime.utcnow().isoformat()
        }

        result = self.client.table('tutor_settings').insert(default_settings).execute()
        return result.data[0]

    def award_tutor_xp_bonus(self, user_id: str, message_id: str):
        """
        Award XP bonus for deep engagement with tutor

        Args:
            user_id: User UUID
            message_id: Message UUID
        """
        try:
            # Award 25 XP bonus for thoughtful tutor interaction
            # This would integrate with the existing XP system
            bonus_xp = 25

            # Update message to mark XP as awarded
            self.client.table('tutor_messages').update({
                'xp_bonus_awarded': True
            }).eq('id', message_id).execute()

            # TODO: Integrate with existing XP service
            # from services.xp_service import award_bonus_xp
            # award_bonus_xp(user_id, bonus_xp, 'tutor_engagement')

        except Exception as e:
            logger.error(f"Failed to award tutor XP bonus: {e}")

    def schedule_parent_notification(self, user_id: str, conversation_id: str, message_content: str):
        """
        Schedule notification to parents about concerning content

        Args:
            user_id: User UUID
            conversation_id: Conversation UUID
            message_content: Message content that triggered the notification
        """
        try:
            # This would integrate with the notification system
            # For now, just log the event
            logger.info(f"Parent notification scheduled for user {user_id}, conversation {conversation_id}")

            # TODO: Implement actual parent notification system
            # - Check if parent monitoring is enabled
            # - Get parent contact info
            # - Send appropriate notification

        except Exception as e:
            logger.error(f"Failed to schedule parent notification: {e}")
