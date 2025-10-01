"""
Badge Service
Handles badge management, progression tracking, and badge-quest relationships.
"""

from typing import List, Dict, Optional
from datetime import datetime
from database import get_supabase_admin_client, get_user_client
from flask import current_app


class BadgeService:
    """Core service for badge management and progression tracking."""

    @staticmethod
    def get_available_badges(user_id: Optional[str] = None, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Get badges available for pursuit.

        Args:
            user_id: Optional user ID for personalized filtering
            filters: Optional filters (pillar, status, complexity)

        Returns:
            List of badge dictionaries with metadata
        """
        supabase = get_supabase_admin_client()

        # Base query - only active and beta badges
        query = supabase.table('badges').select('*').in_('status', ['active', 'beta'])

        # Apply filters if provided
        if filters:
            if 'pillar' in filters:
                query = query.eq('pillar_primary', filters['pillar'])
            if 'status' in filters:
                query = query.eq('status', filters['status'])

        # Order by created date (newest first)
        query = query.order('created_at', desc=True)

        result = query.execute()
        badges = result.data

        # If user_id provided, enrich with user's progress
        if user_id and badges:
            user_progress = BadgeService._get_user_badge_progress(user_id)

            for badge in badges:
                badge_id = badge['id']
                if badge_id in user_progress:
                    badge['user_progress'] = user_progress[badge_id]
                else:
                    badge['user_progress'] = None

        return badges

    @staticmethod
    def get_badge_detail(badge_id: str, user_id: Optional[str] = None) -> Dict:
        """
        Get detailed badge information including requirements and quests.

        Args:
            badge_id: Badge ID
            user_id: Optional user ID for progress information

        Returns:
            Badge details with quest list and user progress
        """
        supabase = get_supabase_admin_client()

        # Get badge details
        badge_result = supabase.table('badges').select('*').eq('id', badge_id).single().execute()
        badge = badge_result.data

        if not badge:
            raise ValueError(f"Badge {badge_id} not found")

        # Get associated quests through badge_quests junction table
        quests_result = supabase.table('badge_quests')\
            .select('quest_id, is_required, order_index, quests(*)')\
            .eq('badge_id', badge_id)\
            .order('order_index')\
            .execute()

        # Separate required and optional quests
        required_quests = []
        optional_quests = []

        # If user_id provided, get their quest completion status
        user_completed_quest_ids = set()
        if user_id:
            completed_result = supabase.table('user_quests')\
                .select('quest_id')\
                .eq('user_id', user_id)\
                .not_.is_('completed_at', 'null')\
                .execute()
            user_completed_quest_ids = {q['quest_id'] for q in completed_result.data}

        for bq in quests_result.data:
            quest_data = bq['quests']
            quest_data['is_required'] = bq['is_required']
            quest_data['order_index'] = bq['order_index']

            # Mark if user has completed this quest
            quest_data['is_completed'] = quest_data['id'] in user_completed_quest_ids

            if bq['is_required']:
                required_quests.append(quest_data)
            else:
                optional_quests.append(quest_data)

        badge['required_quests'] = required_quests
        badge['optional_quests'] = optional_quests
        badge['total_quests'] = len(required_quests) + len(optional_quests)

        # Add user progress if user_id provided
        if user_id:
            progress = BadgeService.calculate_badge_progress(user_id, badge_id)
            badge['user_progress'] = progress

        return badge

    @staticmethod
    def select_badge(user_id: str, badge_id: str) -> Dict:
        """
        Start pursuing a badge.

        Args:
            user_id: User ID
            badge_id: Badge ID to pursue

        Returns:
            Created user_badge record
        """
        supabase = get_user_client(user_id)

        # Check if badge exists
        badge_check = supabase.table('badges').select('id, name').eq('id', badge_id).single().execute()
        if not badge_check.data:
            raise ValueError(f"Badge {badge_id} not found")

        # Check if user already has this badge active
        existing = supabase.table('user_badges')\
            .select('id, is_active, completed_at')\
            .eq('user_id', user_id)\
            .eq('badge_id', badge_id)\
            .execute()

        if existing.data:
            record = existing.data[0]
            # If completed, don't allow reselection
            if record.get('completed_at'):
                raise ValueError("Badge already completed")
            # If already active, just return it
            if record.get('is_active'):
                return record
            # If inactive, reactivate it
            updated = supabase.table('user_badges')\
                .update({'is_active': True, 'started_at': datetime.utcnow().isoformat()})\
                .eq('id', record['id'])\
                .execute()
            return updated.data[0]

        # Create new user_badge record
        # Note: badge_type is a required legacy column - use 'custom' as default
        new_badge = {
            'user_id': user_id,
            'badge_id': badge_id,
            'badge_type': 'custom',  # Required NOT NULL column
            'is_active': True,
            'progress_percentage': 0,
            'started_at': datetime.utcnow().isoformat(),
            'quests_completed': 0,
            'xp_earned': 0
        }

        try:
            result = supabase.table('user_badges').insert(new_badge).execute()
            if not result.data:
                raise ValueError("Failed to create user badge record")
            return result.data[0]
        except Exception as e:
            current_app.logger.error(f"Error creating user badge: {str(e)}")
            raise ValueError(f"Failed to select badge: {str(e)}")

    @staticmethod
    def calculate_badge_progress(user_id: str, badge_id: str) -> Dict:
        """
        Calculate badge completion progress.

        Args:
            user_id: User ID
            badge_id: Badge ID

        Returns:
            Progress dictionary with percentages and counts
        """
        supabase = get_supabase_admin_client()

        # Get badge requirements
        badge = supabase.table('badges').select('min_quests, min_xp').eq('id', badge_id).single().execute()
        if not badge.data:
            raise ValueError(f"Badge {badge_id} not found")

        min_quests = badge.data['min_quests']
        min_xp = badge.data['min_xp']

        # Get ALL quests associated with this badge (not just required)
        # We want users to complete ANY min_quests number of linked quests
        all_badge_quests = supabase.table('badge_quests')\
            .select('quest_id')\
            .eq('badge_id', badge_id)\
            .execute()

        badge_quest_ids = [q['quest_id'] for q in all_badge_quests.data]

        # Get user's completed quests from this badge (including retroactive completions)
        if badge_quest_ids:
            completed_quests = supabase.table('user_quests')\
                .select('quest_id')\
                .eq('user_id', user_id)\
                .in_('quest_id', badge_quest_ids)\
                .not_.is_('completed_at', 'null')\
                .execute()

            completed_count = len(completed_quests.data)
        else:
            completed_count = 0

        # Get XP earned from badge-related tasks
        # We need to sum XP from tasks that belong to quests associated with this badge
        xp_earned = 0
        if badge_quest_ids:
            # Get all tasks from badge quests
            tasks = supabase.table('quest_tasks')\
                .select('id')\
                .in_('quest_id', badge_quest_ids)\
                .execute()

            task_ids = [t['id'] for t in tasks.data]

            if task_ids:
                # Get completed tasks with their XP values from quest_tasks
                # Note: xp_awarded doesn't exist in completions table, XP is stored in quest_tasks.xp_amount
                completions = supabase.table('quest_task_completions')\
                    .select('task_id')\
                    .eq('user_id', user_id)\
                    .in_('task_id', task_ids)\
                    .execute()

                completed_task_ids = [c['task_id'] for c in completions.data]

                if completed_task_ids:
                    # Get XP amounts for completed tasks
                    task_xp = supabase.table('quest_tasks')\
                        .select('xp_amount')\
                        .in_('id', completed_task_ids)\
                        .execute()

                    xp_earned = sum(t.get('xp_amount', 0) for t in task_xp.data)
                else:
                    xp_earned = 0

        # Check if user has this badge active
        user_badge = supabase.table('user_badges')\
            .select('is_active, completed_at')\
            .eq('user_id', user_id)\
            .eq('badge_id', badge_id)\
            .execute()

        is_active = False
        completed_at = None
        if user_badge.data:
            is_active = user_badge.data[0].get('is_active', False)
            completed_at = user_badge.data[0].get('completed_at')

        # Calculate progress percentages
        quest_progress = (completed_count / max(min_quests, 1)) if min_quests > 0 else 1.0
        xp_progress = (xp_earned / max(min_xp, 1)) if min_xp > 0 else 1.0

        # Overall progress is average of both metrics
        overall_progress = (quest_progress + xp_progress) / 2

        # Badge is complete when both requirements are met
        is_complete = quest_progress >= 1.0 and xp_progress >= 1.0

        return {
            'badge_id': badge_id,
            'is_active': is_active,
            'completed_at': completed_at,
            'percentage': round(overall_progress * 100, 1),
            'quests_completed': completed_count,
            'quests_required': min_quests,
            'quest_progress': round(quest_progress * 100, 1),
            'xp_earned': xp_earned,
            'xp_required': min_xp,
            'xp_progress': round(xp_progress * 100, 1),
            'is_complete': is_complete
        }

    @staticmethod
    def get_user_active_badges(user_id: str) -> List[Dict]:
        """
        Get all badges user is currently pursuing.

        Args:
            user_id: User ID

        Returns:
            List of active badges with progress
        """
        supabase = get_user_client(user_id)

        # Get active user badges
        result = supabase.table('user_badges')\
            .select('*, badges(*)')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .is_('completed_at', None)\
            .execute()

        active_badges = []
        for ub in result.data:
            badge_data = ub['badges']
            badge_data['user_badge_id'] = ub['id']
            badge_data['started_at'] = ub['started_at']
            badge_data['progress_percentage'] = ub['progress_percentage']
            badge_data['quests_completed'] = ub['quests_completed']
            badge_data['xp_earned'] = ub['xp_earned']

            # Calculate fresh progress
            progress = BadgeService.calculate_badge_progress(user_id, badge_data['id'])
            badge_data['current_progress'] = progress

            active_badges.append(badge_data)

        return active_badges

    @staticmethod
    def get_user_completed_badges(user_id: str) -> List[Dict]:
        """
        Get all badges user has completed.

        Args:
            user_id: User ID

        Returns:
            List of completed badges
        """
        supabase = get_user_client(user_id)

        result = supabase.table('user_badges')\
            .select('*, badges(*)')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .execute()

        completed_badges = []
        for ub in result.data:
            badge_data = ub['badges']
            badge_data['user_badge_id'] = ub['id']
            badge_data['started_at'] = ub['started_at']
            badge_data['completed_at'] = ub['completed_at']
            badge_data['quests_completed'] = ub['quests_completed']
            badge_data['xp_earned'] = ub['xp_earned']

            completed_badges.append(badge_data)

        return completed_badges

    @staticmethod
    def award_badge(user_id: str, badge_id: str) -> Dict:
        """
        Grant completed badge and celebrate.

        Args:
            user_id: User ID
            badge_id: Badge ID

        Returns:
            Updated user_badge record
        """
        supabase = get_user_client(user_id)

        # Verify badge is actually complete
        progress = BadgeService.calculate_badge_progress(user_id, badge_id)

        if not progress['is_complete']:
            raise ValueError(f"Badge not yet complete. Progress: {progress['percentage']}%")

        # Update user_badge record
        updated = supabase.table('user_badges')\
            .update({
                'is_active': False,
                'completed_at': datetime.utcnow().isoformat(),
                'progress_percentage': 100,
                'quests_completed': progress['quests_completed'],
                'xp_earned': progress['xp_earned']
            })\
            .eq('user_id', user_id)\
            .eq('badge_id', badge_id)\
            .execute()

        # Update user's achievements count
        user_update = supabase.table('users')\
            .update({'achievements_count': supabase.table('users').select('achievements_count').eq('id', user_id).single().execute().data['achievements_count'] + 1})\
            .eq('id', user_id)\
            .execute()

        return updated.data[0] if updated.data else {}

    @staticmethod
    def pause_badge(user_id: str, badge_id: str) -> Dict:
        """
        Pause pursuit of a badge (set inactive but don't abandon progress).

        Args:
            user_id: User ID
            badge_id: Badge ID

        Returns:
            Updated user_badge record
        """
        supabase = get_user_client(user_id)

        updated = supabase.table('user_badges')\
            .update({'is_active': False})\
            .eq('user_id', user_id)\
            .eq('badge_id', badge_id)\
            .is_('completed_at', None)\
            .execute()

        return updated.data[0] if updated.data else {}

    @staticmethod
    def get_badge_quests(badge_id: str, user_id: Optional[str] = None) -> Dict:
        """
        Get all quests that count toward this badge.

        Args:
            badge_id: Badge ID
            user_id: Optional user ID for completion status

        Returns:
            Dictionary with required and optional quests
        """
        supabase = get_supabase_admin_client()

        # Get badge-quest relationships
        result = supabase.table('badge_quests')\
            .select('*, quests(*)')\
            .eq('badge_id', badge_id)\
            .order('order_index')\
            .execute()

        required_quests = []
        optional_quests = []

        for bq in result.data:
            quest = bq['quests']
            quest['order_index'] = bq['order_index']

            # Add user completion status if user_id provided
            if user_id:
                completion = supabase.table('user_quests')\
                    .select('completed_at')\
                    .eq('user_id', user_id)\
                    .eq('quest_id', quest['id'])\
                    .execute()

                quest['is_completed'] = bool(completion.data and completion.data[0].get('completed_at'))

            if bq['is_required']:
                required_quests.append(quest)
            else:
                optional_quests.append(quest)

        return {
            'required': required_quests,
            'optional': optional_quests,
            'total': len(required_quests) + len(optional_quests)
        }

    @staticmethod
    def _get_user_badge_progress(user_id: str) -> Dict[str, Dict]:
        """
        Internal helper to get all user's badge progress.

        Args:
            user_id: User ID

        Returns:
            Dictionary mapping badge_id to progress data
        """
        supabase = get_user_client(user_id)

        result = supabase.table('user_badges')\
            .select('badge_id, progress_percentage, quests_completed, xp_earned, is_active, completed_at')\
            .eq('user_id', user_id)\
            .execute()

        progress_map = {}
        for ub in result.data:
            progress_map[ub['badge_id']] = {
                'progress_percentage': ub['progress_percentage'],
                'quests_completed': ub['quests_completed'],
                'xp_earned': ub['xp_earned'],
                'is_active': ub['is_active'],
                'completed_at': ub['completed_at']
            }

        return progress_map

    @staticmethod
    def update_badge_progress(user_id: str, badge_id: str) -> Dict:
        """
        Recalculate and update badge progress (called after quest completion).

        Args:
            user_id: User ID
            badge_id: Badge ID

        Returns:
            Updated progress data
        """
        # Calculate fresh progress
        progress = BadgeService.calculate_badge_progress(user_id, badge_id)

        # Update user_badges table
        supabase = get_user_client(user_id)
        supabase.table('user_badges')\
            .update({
                'progress_percentage': int(progress['percentage']),
                'quests_completed': progress['quests_completed'],
                'xp_earned': progress['xp_earned']
            })\
            .eq('user_id', user_id)\
            .eq('badge_id', badge_id)\
            .execute()

        # If badge is now complete, award it
        if progress['is_complete']:
            try:
                BadgeService.award_badge(user_id, badge_id)
            except ValueError:
                # Already awarded, ignore
                pass

        return progress
