"""
Badge Service
Handles badge management, progression tracking, and badge-quest relationships.
"""

from typing import List, Dict, Optional
from datetime import datetime
from services.base_service import BaseService
from database import get_supabase_admin_client, get_user_client
from flask import current_app

from utils.logger import get_logger

logger = get_logger(__name__)


class BadgeService(BaseService):
    """Core service for badge management and progression tracking."""

    @staticmethod
    def get_available_badges(user_id: Optional[str] = None, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Get badges available for pursuit.

        Args:
            user_id: Optional user ID for personalized filtering
            filters: Optional filters (pillar, status, complexity, search)

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
            if 'search' in filters and filters['search']:
                # Search in name, identity_statement, and description fields
                search_term = filters['search']
                query = query.or_(f'name.ilike.%{search_term}%,identity_statement.ilike.%{search_term}%,description.ilike.%{search_term}%')

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

            # Calculate XP contributed to badge from this quest
            quest_data['xp_contributed'] = 0
            if user_id:
                # Get user-specific tasks for this quest (personalized quest system)
                user_tasks = supabase.table('user_quest_tasks')\
                    .select('id, xp_value')\
                    .eq('quest_id', quest_data['id'])\
                    .eq('user_id', user_id)\
                    .execute()

                user_task_ids = [t['id'] for t in user_tasks.data]

                if user_task_ids:
                    # Get completed tasks from quest_task_completions
                    completions = supabase.table('quest_task_completions')\
                        .select('user_quest_task_id')\
                        .eq('user_id', user_id)\
                        .in_('user_quest_task_id', user_task_ids)\
                        .execute()

                    completed_task_ids = {c['user_quest_task_id'] for c in completions.data}

                    # Sum XP from completed tasks
                    quest_data['xp_contributed'] = sum(
                        t['xp_value'] for t in user_tasks.data
                        if t['id'] in completed_task_ids
                    )

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
        supabase = get_user_client()  # JWT extracted from request headers

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
        Calculate badge completion progress using NEW pick up/set down logic.

        Supports three badge types:
        1. exploration: Any quests picked up and set down (original system)
        2. onfire_pathway: 3 OnFire courses + 2 custom Optio quests (enrollment driver)
        3. course_completion: XP earned from course quest tasks (course system)

        Args:
            user_id: User ID
            badge_id: Badge ID

        Returns:
            Progress dictionary with percentages, counts, and type-specific breakdowns
        """
        supabase = get_supabase_admin_client()

        # Get badge requirements and type
        badge = supabase.table('badges').select(
            'badge_type, min_quests, min_xp, onfire_course_requirement, optio_quest_requirement, quest_source_filter'
        ).eq('id', badge_id).single().execute()

        if not badge.data:
            raise ValueError(f"Badge {badge_id} not found")

        badge_type = badge.data.get('badge_type', 'exploration')
        min_quests = badge.data['min_quests']
        min_xp = badge.data['min_xp']

        # Get ALL quests associated with this badge
        all_badge_quests = supabase.table('badge_quests')\
            .select('quest_id, is_onfire_course, quest_source')\
            .eq('badge_id', badge_id)\
            .execute()

        badge_quest_ids = [q['quest_id'] for q in all_badge_quests.data]

        # UPDATED: Get user's "set down" quests (not completed_at - we use new status field)
        # A quest counts toward badge when picked up AND set down (implies meaningful engagement)
        if badge_quest_ids:
            set_down_quests = supabase.table('user_quests')\
                .select('quest_id')\
                .eq('user_id', user_id)\
                .in_('quest_id', badge_quest_ids)\
                .eq('status', 'set_down')\
                .execute()

            completed_count = len(set_down_quests.data)
            completed_quest_ids = {q['quest_id'] for q in set_down_quests.data}
        else:
            completed_count = 0
            completed_quest_ids = set()

        # NEW: OnFire pathway badge logic - separate OnFire vs Optio quest tracking
        onfire_count = 0
        optio_count = 0

        if badge_type == 'onfire_pathway':
            # Count OnFire courses (lms source) that are set down
            onfire_quest_ids = [
                q['quest_id'] for q in all_badge_quests.data
                if q.get('is_onfire_course', False)
            ]
            if onfire_quest_ids:
                onfire_set_down = supabase.table('user_quests')\
                    .select('quest_id')\
                    .eq('user_id', user_id)\
                    .in_('quest_id', onfire_quest_ids)\
                    .eq('status', 'set_down')\
                    .execute()
                onfire_count = len(onfire_set_down.data)

            # Count custom Optio quests that are set down
            optio_quest_ids = [
                q['quest_id'] for q in all_badge_quests.data
                if not q.get('is_onfire_course', False)
            ]
            if optio_quest_ids:
                optio_set_down = supabase.table('user_quests')\
                    .select('quest_id')\
                    .eq('user_id', user_id)\
                    .in_('quest_id', optio_quest_ids)\
                    .eq('status', 'set_down')\
                    .execute()
                optio_count = len(optio_set_down.data)

        # Get XP earned from badge-related tasks (still tracks XP for both badge types)
        xp_earned = 0
        if badge_quest_ids:
            # Get all user-specific tasks from badge quests
            user_tasks = supabase.table('user_quest_tasks')\
                .select('id, xp_value')\
                .in_('quest_id', badge_quest_ids)\
                .eq('user_id', user_id)\
                .execute()

            user_task_ids = [t['id'] for t in user_tasks.data]

            if user_task_ids:
                # Get completed tasks from quest_task_completions
                completions = supabase.table('quest_task_completions')\
                    .select('user_quest_task_id')\
                    .eq('user_id', user_id)\
                    .in_('user_quest_task_id', user_task_ids)\
                    .execute()

                completed_task_ids = {c['user_quest_task_id'] for c in completions.data}

                # Sum XP from completed tasks
                xp_earned = sum(
                    t['xp_value'] for t in user_tasks.data
                    if t['id'] in completed_task_ids
                )

        # Check if user has this badge available to claim or already claimed
        user_badge = supabase.table('user_badges')\
            .select('is_active, completed_at, available_to_claim_at, claimed_at, is_displayed')\
            .eq('user_id', user_id)\
            .eq('badge_id', badge_id)\
            .execute()

        is_active = False
        completed_at = None
        available_to_claim_at = None
        claimed_at = None
        is_displayed = False

        if user_badge.data:
            is_active = user_badge.data[0].get('is_active', False)
            completed_at = user_badge.data[0].get('completed_at')
            available_to_claim_at = user_badge.data[0].get('available_to_claim_at')
            claimed_at = user_badge.data[0].get('claimed_at')
            is_displayed = user_badge.data[0].get('is_displayed', False)

        # Calculate progress based on badge type
        if badge_type == 'course_completion':
            # Course completion badge: XP from course quests only
            # Get course associated with this badge
            course_result = supabase.table('courses')\
                .select('id')\
                .eq('badge_id', badge_id)\
                .execute()

            if not course_result.data:
                # No course linked to this badge yet - 0% progress
                return {
                    'badge_id': badge_id,
                    'badge_type': badge_type,
                    'is_active': is_active,
                    'completed_at': completed_at,
                    'available_to_claim_at': available_to_claim_at,
                    'claimed_at': claimed_at,
                    'is_displayed': is_displayed,
                    'percentage': 0,
                    'xp_earned': 0,
                    'xp_required': min_xp,
                    'xp_progress': 0,
                    'is_complete': False,
                    'can_claim': False
                }

            course_id = course_result.data[0]['id']

            # Get all quests in this course
            course_quests_result = supabase.table('course_quests')\
                .select('quest_id')\
                .eq('course_id', course_id)\
                .execute()

            course_quest_ids = [q['quest_id'] for q in course_quests_result.data]

            # Calculate XP earned from course quest tasks
            course_xp_earned = 0
            if course_quest_ids:
                # Get all user tasks from course quests
                user_tasks = supabase.table('user_quest_tasks')\
                    .select('id, xp_value')\
                    .in_('quest_id', course_quest_ids)\
                    .eq('user_id', user_id)\
                    .execute()

                user_task_ids = [t['id'] for t in user_tasks.data]

                if user_task_ids:
                    # Get completed tasks
                    completions = supabase.table('quest_task_completions')\
                        .select('user_quest_task_id')\
                        .eq('user_id', user_id)\
                        .in_('user_quest_task_id', user_task_ids)\
                        .execute()

                    completed_task_ids = {c['user_quest_task_id'] for c in completions.data}

                    # Sum XP from completed course tasks
                    course_xp_earned = sum(
                        t['xp_value'] for t in user_tasks.data
                        if t['id'] in completed_task_ids
                    )

            # Calculate progress based on XP requirement
            xp_progress = (course_xp_earned / max(min_xp, 1)) if min_xp > 0 else 1.0
            is_complete = xp_progress >= 1.0

            return {
                'badge_id': badge_id,
                'badge_type': badge_type,
                'is_active': is_active,
                'completed_at': completed_at,
                'available_to_claim_at': available_to_claim_at,
                'claimed_at': claimed_at,
                'is_displayed': is_displayed,
                'percentage': round(xp_progress * 100, 1),
                'xp_earned': course_xp_earned,
                'xp_required': min_xp,
                'xp_progress': round(xp_progress * 100, 1),
                'is_complete': is_complete,
                'can_claim': available_to_claim_at is not None and claimed_at is None
            }

        elif badge_type == 'onfire_pathway':
            # OnFire pathway: 3 courses + 2 custom quests
            onfire_required = badge.data.get('onfire_course_requirement', 3)
            optio_required = badge.data.get('optio_quest_requirement', 2)

            onfire_progress = (onfire_count / max(onfire_required, 1))
            optio_progress = (optio_count / max(optio_required, 1))

            # Overall progress is average of both requirements
            overall_progress = (onfire_progress + optio_progress) / 2

            # Badge is complete when BOTH requirements are met
            is_complete = onfire_count >= onfire_required and optio_count >= optio_required

            return {
                'badge_id': badge_id,
                'badge_type': badge_type,
                'is_active': is_active,
                'completed_at': completed_at,
                'available_to_claim_at': available_to_claim_at,
                'claimed_at': claimed_at,
                'is_displayed': is_displayed,
                'percentage': round(overall_progress * 100, 1),
                'onfire_courses_completed': onfire_count,
                'onfire_courses_required': onfire_required,
                'onfire_progress': round(onfire_progress * 100, 1),
                'optio_quests_completed': optio_count,
                'optio_quests_required': optio_required,
                'optio_progress': round(optio_progress * 100, 1),
                'xp_earned': xp_earned,
                'is_complete': is_complete,
                'can_claim': available_to_claim_at is not None and claimed_at is None
            }

        else:
            # Exploration badge: original logic with pick up/set down
            quest_progress = (completed_count / max(min_quests, 1)) if min_quests > 0 else 1.0
            xp_progress = (xp_earned / max(min_xp, 1)) if min_xp > 0 else 1.0

            # Overall progress is average of both metrics
            overall_progress = (quest_progress + xp_progress) / 2

            # Badge is complete when both requirements are met
            is_complete = quest_progress >= 1.0 and xp_progress >= 1.0

            return {
                'badge_id': badge_id,
                'badge_type': badge_type,
                'is_active': is_active,
                'completed_at': completed_at,
                'available_to_claim_at': available_to_claim_at,
                'claimed_at': claimed_at,
                'is_displayed': is_displayed,
                'percentage': round(overall_progress * 100, 1),
                'quests_completed': completed_count,
                'quests_required': min_quests,
                'quest_progress': round(quest_progress * 100, 1),
                'xp_earned': xp_earned,
                'xp_required': min_xp,
                'xp_progress': round(xp_progress * 100, 1),
                'is_complete': is_complete,
                'can_claim': available_to_claim_at is not None and claimed_at is None
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
        supabase = get_supabase_admin_client()  # Use admin client for querying by user_id

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
        supabase = get_supabase_admin_client()  # Use admin client for querying by user_id

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
        supabase = get_user_client()  # JWT extracted from request headers

        # Verify badge is actually complete
        progress = BadgeService.calculate_badge_progress(user_id, badge_id)

        if not progress['is_complete']:
            raise ValueError(f"Badge not yet complete. Progress: {progress['percentage']}%")

        # Badge completion bonus removed in Phase 1 refactoring (January 2025)
        # Users now only receive XP from quest completions

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
        supabase = get_user_client()  # JWT extracted from request headers

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
        supabase = get_supabase_admin_client()  # Use admin client for querying by user_id

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
        supabase = get_user_client()  # JWT extracted from request headers
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

    @staticmethod
    def claim_badge(user_id: str, badge_id: str) -> Dict:
        """
        Claim a badge that's available (requirements met).

        NEW: Replaces award_badge() in pick up/set down system.
        Badges must be explicitly claimed by users (not auto-awarded).

        Args:
            user_id: User ID
            badge_id: Badge ID to claim

        Returns:
            Updated user_badge record with claimed status
        """
        supabase = get_user_client()  # JWT extracted from request headers

        # Verify badge is complete and available to claim
        progress = BadgeService.calculate_badge_progress(user_id, badge_id)

        if not progress['is_complete']:
            raise ValueError(f"Badge not yet complete. Progress: {progress['percentage']}%")

        if not progress.get('can_claim', False):
            raise ValueError("Badge is not available to claim")

        # Update user_badge record with claimed timestamp
        updated = supabase.table('user_badges')\
            .update({
                'claimed_at': datetime.utcnow().isoformat(),
                'is_displayed': True,  # Auto-display on diploma
                'progress_percentage': 100,
                'completed_at': datetime.utcnow().isoformat()
            })\
            .eq('user_id', user_id)\
            .eq('badge_id', badge_id)\
            .execute()

        if not updated.data:
            raise ValueError("Failed to claim badge - record not found")

        # Update user's achievements count
        admin_client = get_supabase_admin_client()
        current_achievements = admin_client.table('users')\
            .select('achievements_count')\
            .eq('id', user_id)\
            .single()\
            .execute()

        new_count = (current_achievements.data.get('achievements_count', 0) or 0) + 1

        admin_client.table('users')\
            .update({'achievements_count': new_count})\
            .eq('id', user_id)\
            .execute()

        return updated.data[0]

    @staticmethod
    def get_claimable_badges(user_id: str) -> List[Dict]:
        """
        Get all badges user can claim (requirements met but not yet claimed).
        Used for notification banner display.

        Args:
            user_id: User ID

        Returns:
            List of claimable badges with details
        """
        supabase = get_supabase_admin_client()

        # Get badges that are available to claim but not yet claimed
        result = supabase.table('user_badges')\
            .select('*, badges(*)')\
            .eq('user_id', user_id)\
            .not_.is_('available_to_claim_at', 'null')\
            .is_('claimed_at', 'null')\
            .execute()

        claimable_badges = []
        for ub in result.data:
            badge_data = ub['badges']
            badge_data['user_badge_id'] = ub['id']
            badge_data['available_to_claim_at'] = ub['available_to_claim_at']
            badge_data['claim_notification_sent'] = ub.get('claim_notification_sent', False)

            # Add fresh progress data
            progress = BadgeService.calculate_badge_progress(user_id, badge_data['id'])
            badge_data['progress'] = progress

            claimable_badges.append(badge_data)

        return claimable_badges

    @staticmethod
    def get_claimed_badges(user_id: str) -> List[Dict]:
        """
        Get all badges user has claimed.

        Args:
            user_id: User ID

        Returns:
            List of claimed badges
        """
        supabase = get_supabase_admin_client()

        result = supabase.table('user_badges')\
            .select('*, badges(*)')\
            .eq('user_id', user_id)\
            .not_.is_('claimed_at', 'null')\
            .order('claimed_at', desc=True)\
            .execute()

        claimed_badges = []
        for ub in result.data:
            badge_data = ub['badges']
            badge_data['user_badge_id'] = ub['id']
            badge_data['claimed_at'] = ub['claimed_at']
            badge_data['is_displayed'] = ub.get('is_displayed', True)

            claimed_badges.append(badge_data)

        return claimed_badges

    @staticmethod
    def get_reflection_prompts(category: Optional[str] = None, limit: int = 5) -> List[Dict]:
        """
        Get random reflection prompts for quest "set down" flow.

        Args:
            category: Optional category filter (discovery, growth, challenge, connection, identity)
            limit: Number of prompts to return

        Returns:
            List of reflection prompt dictionaries
        """
        supabase = get_supabase_admin_client()

        query = supabase.table('quest_reflection_prompts')\
            .select('*')\
            .eq('is_active', True)

        if category:
            query = query.eq('category', category)

        # Note: Supabase doesn't have built-in RANDOM() in Python client
        # We'll fetch all and randomly sample in Python
        result = query.execute()

        if not result.data:
            return []

        # Randomly sample from results
        import random
        prompts = result.data
        random.shuffle(prompts)

        return prompts[:limit]

    @staticmethod
    def mark_claim_notification_sent(user_id: str, badge_id: str) -> None:
        """
        Mark that claim notification has been sent to user.

        Args:
            user_id: User ID
            badge_id: Badge ID
        """
        supabase = get_user_client()

        supabase.table('user_badges')\
            .update({'claim_notification_sent': True})\
            .eq('user_id', user_id)\
            .eq('badge_id', badge_id)\
            .execute()
