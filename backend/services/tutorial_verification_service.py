"""
Tutorial Verification Service

Programmatically verifies completion of tutorial quest tasks by checking database state.
Automatically completes tasks when students perform the required actions.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from database import get_supabase_admin_client
from services.base_service import BaseService

logger = logging.getLogger(__name__)


class TutorialVerificationService(BaseService):
    """Service for verifying and auto-completing tutorial quest tasks"""

    def __init__(self):
        super().__init__()
        self.service_name = "TutorialVerificationService"

    def verify_user_tutorial_progress(self, user_id: str) -> Dict[str, Any]:
        """
        Check all tutorial tasks for a user and auto-complete verified ones

        Args:
            user_id: UUID of the user

        Returns:
            Dictionary with verification results and newly completed tasks
        """
        try:
            supabase = get_supabase_admin_client()

            # Get all tutorial tasks for this user
            tutorial_tasks_response = supabase.table('user_quest_tasks').select(
                'id, quest_id, user_quest_id, title, verification_query, auto_complete'
            ).eq('user_id', user_id).eq('auto_complete', True).execute()

            tutorial_tasks = tutorial_tasks_response.data if tutorial_tasks_response.data else []

            newly_completed = []
            already_completed = []

            for task in tutorial_tasks:
                task_id = task['id']
                verification_query = task.get('verification_query', {})

                # Check if already completed
                completion_check = supabase.table('quest_task_completions').select('id').eq(
                    'user_id', user_id
                ).eq('task_id', task_id).execute()

                if completion_check.data:
                    already_completed.append(task_id)
                    continue

                # Verify if task requirements are met
                is_verified = self._verify_task(user_id, verification_query)

                if is_verified:
                    # Auto-complete the task
                    completion_result = self._auto_complete_task(
                        user_id=user_id,
                        task_id=task_id,
                        quest_id=task['quest_id'],
                        user_quest_id=task['user_quest_id']
                    )

                    if completion_result:
                        newly_completed.append({
                            'task_id': task_id,
                            'title': task['title']
                        })

            # Check if tutorial quest is now complete
            tutorial_complete = self._check_tutorial_completion(user_id)

            return {
                'success': True,
                'newly_completed': newly_completed,
                'already_completed_count': len(already_completed),
                'tutorial_complete': tutorial_complete
            }

        except Exception as e:
            logger.error(f"Error verifying tutorial progress for user {user_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'newly_completed': [],
                'already_completed_count': 0,
                'tutorial_complete': False
            }

    def _verify_task(self, user_id: str, verification_query: Dict[str, Any]) -> bool:
        """
        Verify if a task's requirements are met

        Args:
            user_id: UUID of the user
            verification_query: Dictionary containing verification logic

        Returns:
            True if task requirements are met, False otherwise
        """
        try:
            verification_type = verification_query.get('type')

            if verification_type == 'profile_complete':
                return self._verify_profile_complete(user_id)
            elif verification_type == 'bio_written':
                return self._verify_bio_written(user_id, verification_query.get('min_length', 20))
            elif verification_type == 'portfolio_public':
                return self._verify_portfolio_public(user_id)
            elif verification_type == 'quest_started':
                return self._verify_quest_started(user_id, verification_query.get('min_count', 2))
            elif verification_type == 'task_customized':
                return self._verify_task_customized(user_id)
            elif verification_type == 'task_completed':
                return self._verify_task_completed(user_id, verification_query.get('min_count', 1))
            elif verification_type == 'tutor_used':
                return self._verify_tutor_used(user_id)
            elif verification_type == 'connection_made':
                return self._verify_connection_made(user_id)
            elif verification_type == 'parent_connected':
                return self._verify_parent_connected(user_id)
            elif verification_type == 'observer_added':
                return self._verify_observer_added(user_id)
            elif verification_type == 'badge_started':
                return self._verify_badge_started(user_id)
            elif verification_type == 'quest_completed':
                return self._verify_quest_completed(user_id)
            else:
                logger.warning(f"Unknown verification type: {verification_type}")
                return False

        except Exception as e:
            logger.error(f"Error in _verify_task: {str(e)}")
            return False

    def _verify_profile_complete(self, user_id: str) -> bool:
        """Verify user has first and last name"""
        supabase = get_supabase_admin_client()
        result = supabase.table('users').select('first_name, last_name').eq('id', user_id).execute()
        if result.data:
            user = result.data[0]
            return bool(user.get('first_name')) and bool(user.get('last_name'))
        return False

    def _verify_bio_written(self, user_id: str, min_length: int = 20) -> bool:
        """Verify user has written a bio of minimum length"""
        supabase = get_supabase_admin_client()
        result = supabase.table('users').select('bio').eq('id', user_id).execute()
        if result.data:
            bio = result.data[0].get('bio')
            return bool(bio) and len(bio) >= min_length
        return False

    def _verify_portfolio_public(self, user_id: str) -> bool:
        """Verify user's portfolio is set to public"""
        supabase = get_supabase_admin_client()
        result = supabase.table('diplomas').select('is_public').eq('user_id', user_id).execute()
        if result.data:
            return result.data[0].get('is_public', False)
        return False

    def _verify_quest_started(self, user_id: str, min_count: int = 2) -> bool:
        """Verify user has started at least min_count quests (excluding tutorial)"""
        supabase = get_supabase_admin_client()

        # Get tutorial quest ID
        tutorial_quest = supabase.table('quests').select('id').eq('is_tutorial', True).execute()
        tutorial_quest_ids = [q['id'] for q in tutorial_quest.data] if tutorial_quest.data else []

        # Count non-tutorial quests
        query = supabase.table('user_quests').select('id', count='exact').eq('user_id', user_id)

        if tutorial_quest_ids:
            query = query.not_.in_('quest_id', tutorial_quest_ids)

        result = query.execute()
        return result.count >= min_count

    def _verify_task_customized(self, user_id: str) -> bool:
        """Verify user has customized/added a manual task"""
        supabase = get_supabase_admin_client()
        result = supabase.table('user_quest_tasks').select('id', count='exact').eq(
            'user_id', user_id
        ).eq('is_manual', True).execute()
        return result.count > 0

    def _verify_task_completed(self, user_id: str, min_count: int = 1) -> bool:
        """Verify user has completed at least min_count tasks"""
        supabase = get_supabase_admin_client()
        result = supabase.table('quest_task_completions').select('id', count='exact').eq(
            'user_id', user_id
        ).execute()
        return result.count >= min_count

    def _verify_tutor_used(self, user_id: str) -> bool:
        """Verify user has sent at least one message to AI tutor"""
        supabase = get_supabase_admin_client()
        result = supabase.table('tutor_messages').select('id', count='exact').eq(
            'user_id', user_id
        ).eq('role', 'user').execute()
        return result.count > 0

    def _verify_connection_made(self, user_id: str) -> bool:
        """Verify user has sent or received at least one friend request"""
        supabase = get_supabase_admin_client()

        # Check as requester or addressee
        result1 = supabase.table('friendships').select('id', count='exact').eq(
            'requester_id', user_id
        ).execute()

        result2 = supabase.table('friendships').select('id', count='exact').eq(
            'addressee_id', user_id
        ).execute()

        return (result1.count + result2.count) > 0

    def _verify_parent_connected(self, user_id: str) -> bool:
        """Verify user has an active parent connection"""
        supabase = get_supabase_admin_client()
        result = supabase.table('parent_student_links').select('id', count='exact').eq(
            'student_id', user_id
        ).eq('status', 'active').execute()
        return result.count > 0

    def _verify_observer_added(self, user_id: str) -> bool:
        """Verify user has an observer linked"""
        supabase = get_supabase_admin_client()
        result = supabase.table('observer_student_links').select('id', count='exact').eq(
            'student_id', user_id
        ).execute()
        return result.count > 0

    def _verify_badge_started(self, user_id: str) -> bool:
        """Verify user has started pursuing at least one badge"""
        supabase = get_supabase_admin_client()
        result = supabase.table('user_badges').select('id', count='exact').eq(
            'user_id', user_id
        ).eq('status', 'pursuing').execute()
        return result.count > 0

    def _verify_quest_completed(self, user_id: str) -> bool:
        """Verify user has completed at least one quest (excluding tutorial)"""
        supabase = get_supabase_admin_client()

        # Get tutorial quest ID
        tutorial_quest = supabase.table('quests').select('id').eq('is_tutorial', True).execute()
        tutorial_quest_ids = [q['id'] for q in tutorial_quest.data] if tutorial_quest.data else []

        # Count completed non-tutorial quests
        query = supabase.table('user_quests').select('id', count='exact').eq(
            'user_id', user_id
        ).not_.is_('completed_at', 'null')

        if tutorial_quest_ids:
            query = query.not_.in_('quest_id', tutorial_quest_ids)

        result = query.execute()
        return result.count > 0

    def _auto_complete_task(
        self,
        user_id: str,
        task_id: str,
        quest_id: str,
        user_quest_id: str
    ) -> bool:
        """
        Auto-complete a tutorial task

        Args:
            user_id: UUID of the user
            task_id: UUID of the task
            quest_id: UUID of the quest
            user_quest_id: UUID of the user_quest record

        Returns:
            True if successful, False otherwise
        """
        try:
            supabase = get_supabase_admin_client()

            # Get task XP value
            task_result = supabase.table('user_quest_tasks').select('xp_value, pillar').eq(
                'id', task_id
            ).execute()

            if not task_result.data:
                logger.error(f"Task {task_id} not found")
                return False

            task = task_result.data[0]
            xp_value = task.get('xp_value', 0)
            pillar = task.get('pillar')

            # Create task completion record
            completion_data = {
                'user_id': user_id,
                'quest_id': quest_id,
                'task_id': task_id,
                'evidence_text': 'Auto-verified by tutorial system',
                'completed_at': datetime.utcnow().isoformat(),
                'xp_awarded': xp_value
            }

            supabase.table('quest_task_completions').insert(completion_data).execute()

            # Award XP
            if xp_value > 0 and pillar:
                self._award_xp(user_id, pillar, xp_value)

            # Log verification
            log_data = {
                'user_id': user_id,
                'task_id': task_id,
                'verified_at': datetime.utcnow().isoformat(),
                'verification_data': {'auto_verified': True}
            }

            supabase.table('tutorial_verification_log').insert(log_data).execute()

            # Check if quest is complete
            self._check_and_complete_quest(user_id, quest_id, user_quest_id)

            return True

        except Exception as e:
            logger.error(f"Error auto-completing task {task_id}: {str(e)}")
            return False

    def _award_xp(self, user_id: str, pillar: str, xp_amount: int):
        """Award XP to user for completing task"""
        try:
            supabase = get_supabase_admin_client()

            # Update or insert user_skill_xp
            existing = supabase.table('user_skill_xp').select('xp_amount').eq(
                'user_id', user_id
            ).eq('pillar', pillar).execute()

            if existing.data:
                current_xp = existing.data[0]['xp_amount']
                supabase.table('user_skill_xp').update({
                    'xp_amount': current_xp + xp_amount
                }).eq('user_id', user_id).eq('pillar', pillar).execute()
            else:
                supabase.table('user_skill_xp').insert({
                    'user_id': user_id,
                    'pillar': pillar,
                    'xp_amount': xp_amount
                }).execute()

            # Update total_xp in users table
            user_result = supabase.table('users').select('total_xp').eq('id', user_id).execute()
            if user_result.data:
                current_total = user_result.data[0].get('total_xp', 0)
                supabase.table('users').update({
                    'total_xp': current_total + xp_amount
                }).eq('id', user_id).execute()

        except Exception as e:
            logger.error(f"Error awarding XP: {str(e)}")

    def _check_and_complete_quest(self, user_id: str, quest_id: str, user_quest_id: str):
        """Check if all tasks are complete and mark quest as complete"""
        try:
            supabase = get_supabase_admin_client()

            # Get all tasks for this user quest
            all_tasks = supabase.table('user_quest_tasks').select('id').eq(
                'user_quest_id', user_quest_id
            ).execute()

            if not all_tasks.data:
                return

            task_ids = [t['id'] for t in all_tasks.data]

            # Check completions
            completions = supabase.table('quest_task_completions').select('task_id').eq(
                'user_id', user_id
            ).in_('task_id', task_ids).execute()

            completed_task_ids = [c['task_id'] for c in completions.data] if completions.data else []

            # If all tasks are complete, mark quest as complete
            if len(completed_task_ids) == len(task_ids):
                supabase.table('user_quests').update({
                    'completed_at': datetime.utcnow().isoformat(),
                    'is_active': False
                }).eq('id', user_quest_id).execute()

        except Exception as e:
            logger.error(f"Error checking quest completion: {str(e)}")

    def _check_tutorial_completion(self, user_id: str) -> bool:
        """Check if user has completed the tutorial quest"""
        try:
            supabase = get_supabase_admin_client()

            # Get tutorial quest
            tutorial_quest = supabase.table('quests').select('id').eq('is_tutorial', True).execute()

            if not tutorial_quest.data:
                return False

            tutorial_quest_id = tutorial_quest.data[0]['id']

            # Check if user has completed it
            user_quest = supabase.table('user_quests').select('completed_at').eq(
                'user_id', user_id
            ).eq('quest_id', tutorial_quest_id).execute()

            if user_quest.data and user_quest.data[0].get('completed_at'):
                # Update user's tutorial_completed_at if not already set
                user_result = supabase.table('users').select('tutorial_completed_at').eq(
                    'id', user_id
                ).execute()

                if user_result.data and not user_result.data[0].get('tutorial_completed_at'):
                    supabase.table('users').update({
                        'tutorial_completed_at': datetime.utcnow().isoformat()
                    }).eq('id', user_id).execute()

                return True

            return False

        except Exception as e:
            logger.error(f"Error checking tutorial completion: {str(e)}")
            return False


# Singleton instance
tutorial_verification_service = TutorialVerificationService()
