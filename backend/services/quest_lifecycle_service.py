"""
Quest Lifecycle Service for managing quest pickup/setdown workflow.

Handles:
- Quest pickup (starting/resuming a quest)
- Quest setdown (consciously moving on from a quest)
- Pickup history and reflections
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
import logging

from database import get_user_client, get_supabase_admin_client
from middleware.error_handler import NotFoundError

logger = logging.getLogger(__name__)


class QuestLifecycleService:
    """
    Service for quest lifecycle operations.
    Uses user client for RLS-enforced operations.
    """

    def __init__(self, user_client=None, admin_client=None):
        self.user_client = user_client or get_user_client()
        # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
        self.admin_client = admin_client or get_supabase_admin_client()

    # =========================================================================
    # QUEST LOOKUP
    # =========================================================================

    def get_quest(self, quest_id: str) -> Optional[Dict[str, Any]]:
        """Get quest by ID."""
        result = self.user_client.table('quests')\
            .select('id, title, quest_type')\
            .eq('id', quest_id)\
            .single()\
            .execute()
        return result.data if result.data else None

    def get_user_quest(self, user_id: str, quest_id: str) -> Optional[Dict[str, Any]]:
        """Get user's enrollment record for a quest."""
        result = self.user_client.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()
        return result.data[0] if result.data else None

    # =========================================================================
    # QUEST PICKUP
    # =========================================================================

    def pickup_quest(self, user_id: str, quest_id: str) -> Dict[str, Any]:
        """
        Pick up a quest (start engaging with it).

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Dict with user_quest record, metadata (is_returning, times_picked_up, etc.)
        """
        # Check if quest exists
        quest = self.get_quest(quest_id)
        if not quest:
            return {'error': 'Quest not found', 'status': 404}

        quest_type = quest.get('quest_type', 'optio')

        # Check if user already has this quest
        existing = self.get_user_quest(user_id, quest_id)

        if existing:
            return self._pickup_existing_quest(existing, quest_type)
        else:
            return self._pickup_new_quest(user_id, quest_id, quest_type)

    def _pickup_existing_quest(
        self, user_quest: Dict, quest_type: str
    ) -> Dict[str, Any]:
        """Handle picking up an existing quest enrollment."""
        # Increment times_picked_up if previously set down
        was_set_down = user_quest.get('status') == 'set_down'
        times_picked_up = (user_quest.get('times_picked_up', 0) + 1) if was_set_down else user_quest.get('times_picked_up', 1)

        updated = self.user_client.table('user_quests')\
            .update({
                'status': 'picked_up',
                'is_active': True,
                'completed_at': None,
                'last_picked_up_at': datetime.utcnow().isoformat(),
                'times_picked_up': times_picked_up
            })\
            .eq('id', user_quest['id'])\
            .execute()

        skip_wizard = False

        # Handle course quest personalization
        if quest_type == 'course' and not user_quest.get('personalization_completed'):
            skip_wizard = self._mark_personalization_complete(user_quest['id'])

        return {
            'message': 'Quest picked up again',
            'user_quest': updated.data[0] if updated.data else user_quest,
            'is_returning': times_picked_up > 1,
            'times_picked_up': times_picked_up,
            'skip_wizard': skip_wizard,
            'quest_type': quest_type,
            'status': 200
        }

    def _pickup_new_quest(
        self, user_id: str, quest_id: str, quest_type: str
    ) -> Dict[str, Any]:
        """Handle picking up a quest for the first time."""
        new_user_quest = {
            'user_id': user_id,
            'quest_id': quest_id,
            'status': 'picked_up',
            'is_active': True,
            'times_picked_up': 1,
            'last_picked_up_at': datetime.utcnow().isoformat(),
            'started_at': datetime.utcnow().isoformat()
        }

        result = self.user_client.table('user_quests')\
            .insert(new_user_quest)\
            .execute()

        if not result.data:
            return {'error': 'Failed to pick up quest', 'status': 500}

        enrollment = result.data[0]
        skip_wizard = False

        # Handle course quest personalization
        if quest_type == 'course':
            logger.info(f"[PICKUP_COURSE] Course quest for user {user_id[:8]}, quest {quest_id[:8]}")
            skip_wizard = self._mark_personalization_complete(enrollment['id'])

        return {
            'message': 'Quest picked up successfully',
            'user_quest': enrollment,
            'is_returning': False,
            'times_picked_up': 1,
            'skip_wizard': skip_wizard,
            'quest_type': quest_type,
            'status': 201
        }

    def _mark_personalization_complete(self, user_quest_id: str) -> bool:
        """Mark personalization as complete for course quests."""
        try:
            self.admin_client.table('user_quests')\
                .update({'personalization_completed': True})\
                .eq('id', user_quest_id)\
                .execute()
            return True
        except Exception as e:
            logger.error(f"Error marking personalization complete: {e}")
            return False

    # =========================================================================
    # QUEST SETDOWN
    # =========================================================================

    def set_down_quest(
        self,
        user_id: str,
        quest_id: str,
        reflection_note: Optional[str] = None,
        prompt_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Set down a quest (consciously move on).

        Args:
            user_id: User ID
            quest_id: Quest ID
            reflection_note: Optional reflection note
            prompt_id: Optional reflection prompt ID

        Returns:
            Dict with updated user_quest record
        """
        # Get user's quest record
        user_quest = self.get_user_quest(user_id, quest_id)

        if not user_quest:
            return {'error': 'Quest not found for this user', 'status': 404}

        # Prepare update
        update_data = {
            'status': 'set_down',
            'is_active': False,
            'last_set_down_at': datetime.utcnow().isoformat()
        }

        # Add reflection note if provided
        if reflection_note:
            existing_reflections = user_quest.get('reflection_notes', [])
            if not isinstance(existing_reflections, list):
                existing_reflections = []

            new_reflection = {
                'note': reflection_note,
                'prompt_id': prompt_id,
                'created_at': datetime.utcnow().isoformat()
            }
            existing_reflections.append(new_reflection)
            update_data['reflection_notes'] = existing_reflections

        # Update user_quest
        updated = self.user_client.table('user_quests')\
            .update(update_data)\
            .eq('id', user_quest['id'])\
            .execute()

        if not updated.data:
            return {'error': 'Failed to set down quest', 'status': 500}

        return {
            'message': 'Quest set down successfully',
            'user_quest': updated.data[0],
            'reflection_saved': bool(reflection_note),
            'status': 200
        }

    # =========================================================================
    # PICKUP HISTORY
    # =========================================================================

    def get_pickup_history(self, user_id: str, quest_id: str) -> Dict[str, Any]:
        """
        Get quest pickup history for a user.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Dict with pickup history including reflections
        """
        user_quest = self.get_user_quest(user_id, quest_id)

        if not user_quest:
            return {'error': 'Quest not found for this user', 'status': 404}

        return {
            'quest_id': quest_id,
            'status': user_quest.get('status'),
            'times_picked_up': user_quest.get('times_picked_up', 0),
            'last_picked_up_at': user_quest.get('last_picked_up_at'),
            'last_set_down_at': user_quest.get('last_set_down_at'),
            'started_at': user_quest.get('started_at'),
            'reflections': user_quest.get('reflection_notes', [])
        }

    # =========================================================================
    # ENROLLMENT DELETION
    # =========================================================================

    def delete_enrollment(self, user_id: str, quest_id: str) -> Dict[str, Any]:
        """
        Permanently delete a quest enrollment and reverse all XP.

        Removes user_quests rows (FK cascades handle tasks, completions,
        evidence, comments, etc.) and reverses pillar/subject/total XP.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Dict with deletion stats (tasks_deleted, xp_reversed, quest_title)

        Raises:
            NotFoundError: If no enrollment found
        """
        # Get quest title for response
        quest = self.admin_client.table('quests')\
            .select('id, title')\
            .eq('id', quest_id)\
            .single()\
            .execute()
        quest_title = quest.data.get('title', 'Unknown') if quest.data else 'Unknown'

        # Find ALL user_quests records for this user+quest (handle multiple enrollments)
        enrollments = self.admin_client.table('user_quests')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not enrollments.data:
            raise NotFoundError('Enrollment', quest_id)

        enrollment_ids = [e['id'] for e in enrollments.data]

        # Get all task IDs from these enrollments
        tasks_result = self.admin_client.table('user_quest_tasks')\
            .select('id, pillar, xp_value, subject_xp_distribution')\
            .in_('user_quest_id', enrollment_ids)\
            .execute()

        all_tasks = tasks_result.data or []
        task_ids = [t['id'] for t in all_tasks]

        # Find which tasks have completions (only completed tasks had XP awarded)
        completed_task_ids = []
        if task_ids:
            completions = self.admin_client.table('quest_task_completions')\
                .select('user_quest_task_id')\
                .in_('user_quest_task_id', task_ids)\
                .execute()
            completed_task_ids = [c['user_quest_task_id'] for c in (completions.data or [])]

        # Build XP to reverse from completed tasks only
        completed_tasks = [t for t in all_tasks if t['id'] in completed_task_ids]
        pillar_xp_to_remove = {}
        subject_xp_to_remove = {}

        for task in completed_tasks:
            pillar = task.get('pillar')
            xp = task.get('xp_value', 0)
            if pillar and xp > 0:
                pillar_xp_to_remove[pillar] = pillar_xp_to_remove.get(pillar, 0) + xp

            # Collect subject XP to reverse
            subject_dist = task.get('subject_xp_distribution') or {}
            for subject, sxp in subject_dist.items():
                if sxp and sxp > 0:
                    subject_xp_to_remove[subject] = subject_xp_to_remove.get(subject, 0) + sxp

        total_xp_reversed = sum(pillar_xp_to_remove.values())

        # Reverse pillar XP in user_skill_xp
        for pillar, xp in pillar_xp_to_remove.items():
            try:
                current = self.admin_client.table('user_skill_xp')\
                    .select('id, xp_amount')\
                    .eq('user_id', user_id)\
                    .eq('pillar', pillar)\
                    .execute()
                if current.data:
                    new_xp = max(0, current.data[0].get('xp_amount', 0) - xp)
                    self.admin_client.table('user_skill_xp')\
                        .update({'xp_amount': new_xp})\
                        .eq('id', current.data[0]['id'])\
                        .execute()
            except Exception as e:
                logger.warning(f"Could not reverse pillar XP for {pillar}: {e}")

        # Reverse subject XP in user_subject_xp
        for subject, xp in subject_xp_to_remove.items():
            try:
                current = self.admin_client.table('user_subject_xp')\
                    .select('xp_amount')\
                    .eq('user_id', user_id)\
                    .eq('school_subject', subject)\
                    .execute()
                if current.data:
                    new_xp = max(0, current.data[0].get('xp_amount', 0) - xp)
                    self.admin_client.table('user_subject_xp')\
                        .update({'xp_amount': new_xp})\
                        .eq('user_id', user_id)\
                        .eq('school_subject', subject)\
                        .execute()
            except Exception as e:
                logger.warning(f"Could not reverse subject XP for {subject}: {e}")

        # Delete user_quests rows (FK cascades handle everything else)
        for enrollment_id in enrollment_ids:
            self.admin_client.table('user_quests')\
                .delete()\
                .eq('id', enrollment_id)\
                .execute()

        # Recalculate total_xp from remaining user_skill_xp
        xp_records = self.admin_client.table('user_skill_xp')\
            .select('xp_amount')\
            .eq('user_id', user_id)\
            .execute()
        new_total = sum(r.get('xp_amount', 0) for r in (xp_records.data or []))
        self.admin_client.table('users')\
            .update({'total_xp': new_total})\
            .eq('id', user_id)\
            .execute()

        # Update mastery
        try:
            from services.xp_service import XPService
            XPService().update_user_mastery(user_id)
        except Exception as e:
            logger.warning(f"Could not update mastery after enrollment deletion: {e}")

        logger.info(
            f"Deleted enrollment for user {user_id[:8]} quest {quest_id[:8]}: "
            f"{len(all_tasks)} tasks, {total_xp_reversed} XP reversed"
        )

        return {
            'tasks_deleted': len(all_tasks),
            'xp_reversed': total_xp_reversed,
            'quest_title': quest_title
        }
