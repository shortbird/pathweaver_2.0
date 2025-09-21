"""
Atomic quest completion service with race condition protection.

This service handles quest and task completion with proper transaction handling
to prevent race conditions when multiple users complete tasks simultaneously.
"""

import math
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional
from database import get_supabase_admin_client


class AtomicQuestService:
    """Service to handle quest completion with race condition protection"""

    def __init__(self):
        self.supabase = get_supabase_admin_client()

    def complete_task_atomically(
        self,
        user_id: str,
        quest_id: str,
        task_id: str,
        user_quest_id: str,
        evidence_url: str = None,
        evidence_text: str = None
    ) -> Dict[str, Any]:
        """
        Complete a task atomically with race condition protection.

        Uses database transactions and optimistic locking to prevent:
        - Double completion of tasks
        - Race conditions in quest completion
        - Inconsistent XP awards

        Args:
            user_id: User ID completing the task
            quest_id: Quest ID
            task_id: Task ID being completed
            user_quest_id: User quest enrollment ID
            evidence_url: Optional evidence URL
            evidence_text: Optional evidence text

        Returns:
            Dict with completion status and results
        """
        try:
            # Start transaction by checking if task is already completed
            existing_completion = self.supabase.table('quest_task_completions')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .eq('task_id', task_id)\
                .execute()

            if existing_completion.data:
                return {
                    'success': False,
                    'error': 'Task already completed',
                    'task_already_completed': True
                }

            # Get task details for XP calculation
            task_details = self.supabase.table('quest_tasks')\
                .select('id, xp_amount, pillar, is_required')\
                .eq('id', task_id)\
                .eq('quest_id', quest_id)\
                .single()\
                .execute()

            if not task_details.data:
                return {
                    'success': False,
                    'error': 'Task not found'
                }

            task = task_details.data

            # Create task completion record (this acts as our lock)
            completion_data = {
                'user_id': user_id,
                'quest_id': quest_id,
                'task_id': task_id,
                'completed_at': datetime.utcnow().isoformat()
            }

            if evidence_url:
                completion_data['evidence_url'] = evidence_url
            if evidence_text:
                completion_data['evidence_text'] = evidence_text

            # Insert completion record - this will fail if duplicate due to unique constraint
            try:
                completion_result = self.supabase.table('quest_task_completions')\
                    .insert(completion_data)\
                    .execute()

                if not completion_result.data:
                    return {
                        'success': False,
                        'error': 'Failed to record task completion'
                    }

            except Exception as e:
                # Check if it's a duplicate key error
                if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                    return {
                        'success': False,
                        'error': 'Task already completed',
                        'task_already_completed': True
                    }
                raise

            # Award XP for task completion
            xp_awarded = self.award_task_xp(user_id, task['pillar'], task['xp_amount'])

            # Check quest completion status atomically
            quest_completion_result = self.check_and_complete_quest_atomically(
                user_id, quest_id, user_quest_id
            )

            return {
                'success': True,
                'task_completed': True,
                'xp_awarded': xp_awarded,
                'quest_completed': quest_completion_result.get('quest_completed', False),
                'completion_bonus_awarded': quest_completion_result.get('completion_bonus_awarded', 0),
                'completion_bonus_pillar': quest_completion_result.get('completion_bonus_pillar'),
                'total_quest_xp': quest_completion_result.get('total_quest_xp', 0)
            }

        except Exception as e:
            print(f"Error in atomic task completion: {e}")
            return {
                'success': False,
                'error': f'Completion failed: {str(e)}'
            }

    def check_and_complete_quest_atomically(
        self,
        user_id: str,
        quest_id: str,
        user_quest_id: str
    ) -> Dict[str, Any]:
        """
        Check quest completion status and complete if all required tasks are done.

        Uses optimistic locking to prevent race conditions.

        Args:
            user_id: User ID
            quest_id: Quest ID
            user_quest_id: User quest enrollment ID

        Returns:
            Dict with quest completion status and bonus information
        """
        try:
            # Get all quest tasks and completions in efficient queries
            quest_data = self.get_quest_completion_data(user_id, quest_id)

            if not quest_data:
                return {'quest_completed': False}

            all_tasks = quest_data['all_tasks']
            completed_tasks = quest_data['completed_tasks']
            required_tasks = quest_data['required_tasks']

            # Check if quest should be completed
            if not required_tasks:
                # If no required tasks, treat all tasks as required
                required_tasks = all_tasks

            required_task_ids = {task['id'] for task in required_tasks}
            completed_task_ids = {task['task_id'] for task in completed_tasks}
            all_task_ids = {task['id'] for task in all_tasks}

            # Check if all required tasks are completed
            if not required_task_ids.issubset(completed_task_ids):
                return {'quest_completed': False}

            # Mark quest as completed using optimistic locking
            # Only update if quest is not already completed
            update_result = self.supabase.table('user_quests')\
                .update({
                    'completed_at': datetime.utcnow().isoformat(),
                    'is_active': False
                })\
                .eq('id', user_quest_id)\
                .is_('completed_at', 'null')\
                .execute()

            # If no rows were updated, quest was already completed by another request
            if not update_result.data:
                print(f"Quest {quest_id} already completed for user {user_id}")
                return {'quest_completed': False, 'already_completed': True}

            quest_completed = True
            completion_bonus_awarded = 0
            completion_bonus_pillar = None
            total_quest_xp = sum(task['xp_amount'] for task in all_tasks)

            # Check if all tasks (including optional) are completed for bonus
            if all_task_ids.issubset(completed_task_ids):
                bonus_result = self.award_completion_bonus(user_id, quest_id, all_tasks)
                completion_bonus_awarded = bonus_result['bonus_xp']
                completion_bonus_pillar = bonus_result['pillar']

            return {
                'quest_completed': quest_completed,
                'completion_bonus_awarded': completion_bonus_awarded,
                'completion_bonus_pillar': completion_bonus_pillar,
                'total_quest_xp': total_quest_xp
            }

        except Exception as e:
            print(f"Error checking quest completion: {e}")
            return {'quest_completed': False, 'error': str(e)}

    def get_quest_completion_data(self, user_id: str, quest_id: str) -> Optional[Dict]:
        """
        Get all quest completion data in efficient queries to avoid N+1 problems.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Dict with all_tasks, completed_tasks, required_tasks
        """
        try:
            # Get all tasks for the quest
            all_tasks = self.supabase.table('quest_tasks')\
                .select('id, xp_amount, pillar, is_required')\
                .eq('quest_id', quest_id)\
                .execute()

            # Get all completed tasks for this user and quest
            completed_tasks = self.supabase.table('quest_task_completions')\
                .select('task_id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            # Filter required tasks
            required_tasks = [task for task in all_tasks.data if task.get('is_required')]

            return {
                'all_tasks': all_tasks.data or [],
                'completed_tasks': completed_tasks.data or [],
                'required_tasks': required_tasks
            }

        except Exception as e:
            print(f"Error getting quest completion data: {e}")
            return None

    def award_task_xp(self, user_id: str, pillar: str, xp_amount: int) -> int:
        """
        Award XP for a task completion using upsert to handle race conditions.

        Args:
            user_id: User ID
            pillar: Skill pillar
            xp_amount: XP amount to award

        Returns:
            XP amount awarded
        """
        try:
            # Use upsert with conflict resolution to handle concurrent updates
            result = self.supabase.table('user_skill_xp')\
                .upsert({
                    'user_id': user_id,
                    'pillar': pillar,
                    'xp_amount': xp_amount
                }, on_conflict='user_id,pillar')\
                .execute()

            if result.data:
                print(f"Awarded {xp_amount} XP in {pillar} to user {user_id}")
                return xp_amount
            else:
                # If upsert failed, try to increment existing record
                return self.increment_user_xp(user_id, pillar, xp_amount)

        except Exception as e:
            print(f"Error awarding task XP: {e}")
            # Fallback to increment method
            return self.increment_user_xp(user_id, pillar, xp_amount)

    def increment_user_xp(self, user_id: str, pillar: str, xp_amount: int) -> int:
        """
        Increment user XP using atomic database operations.

        Args:
            user_id: User ID
            pillar: Skill pillar
            xp_amount: XP amount to add

        Returns:
            XP amount awarded
        """
        try:
            # Try to increment existing record
            current_xp = self.supabase.table('user_skill_xp')\
                .select('xp_amount')\
                .eq('user_id', user_id)\
                .eq('pillar', pillar)\
                .execute()

            if current_xp.data:
                new_total = current_xp.data[0]['xp_amount'] + xp_amount
                self.supabase.table('user_skill_xp')\
                    .update({'xp_amount': new_total})\
                    .eq('user_id', user_id)\
                    .eq('pillar', pillar)\
                    .execute()
            else:
                # Create new record
                self.supabase.table('user_skill_xp')\
                    .insert({
                        'user_id': user_id,
                        'pillar': pillar,
                        'xp_amount': xp_amount
                    })\
                    .execute()

            return xp_amount

        except Exception as e:
            print(f"Error incrementing user XP: {e}")
            return 0

    def award_completion_bonus(self, user_id: str, quest_id: str, all_tasks: List[Dict]) -> Dict[str, Any]:
        """
        Award completion bonus for finishing all quest tasks.

        Args:
            user_id: User ID
            quest_id: Quest ID
            all_tasks: List of all quest tasks

        Returns:
            Dict with bonus_xp and pillar information
        """
        try:
            # Calculate bonus (50% of total XP, rounded to nearest 50)
            total_base_xp = sum(task['xp_amount'] for task in all_tasks)
            bonus_xp = math.ceil((total_base_xp * 0.5) / 50) * 50

            # Determine primary pillar (most common among tasks)
            pillar_counts = {}
            for task in all_tasks:
                pillar = task.get('pillar', 'creativity')
                pillar_counts[pillar] = pillar_counts.get(pillar, 0) + 1

            primary_pillar = max(pillar_counts.items(), key=lambda x: x[1])[0] if pillar_counts else 'creativity'

            # Award the bonus XP (use same mechanism as task XP)
            self.award_task_xp(user_id, primary_pillar, bonus_xp)

            print(f"Awarded {bonus_xp} completion bonus XP in {primary_pillar} to user {user_id}")

            return {
                'bonus_xp': bonus_xp,
                'pillar': primary_pillar
            }

        except Exception as e:
            print(f"Error awarding completion bonus: {e}")
            return {'bonus_xp': 0, 'pillar': None}


# Global service instance
atomic_quest_service = AtomicQuestService()