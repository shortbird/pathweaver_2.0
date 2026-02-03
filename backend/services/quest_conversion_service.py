"""
Quest Conversion Service
========================

Handles the "graduation" of learning moments into formal Quests,
including XP calculation with retroactive multiplier.

Features:
- Generate Quest preview from moments
- Create Quest with tasks from moments
- Calculate retroactive XP (80% multiplier)
- Track conversion history
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from services.base_service import BaseService
from services.quest_generation_ai_service import QuestGenerationAIService
from database import get_supabase_admin_client, get_user_client

from utils.logger import get_logger

logger = get_logger(__name__)


class QuestConversionService(BaseService):
    """Service for converting learning moments into Quests."""

    # Retroactive XP multiplier (80% of normal)
    RETROACTIVE_XP_MULTIPLIER = 0.80

    @staticmethod
    def generate_quest_preview(
        user_id: str,
        moment_ids: Optional[List[str]] = None,
        track_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a Quest preview from moments or a track.

        Args:
            user_id: The user ID
            moment_ids: Specific moment IDs to convert (optional)
            track_id: Track ID to convert all moments from (optional)

        Returns:
            Dict with quest preview structure
        """
        try:
            supabase = get_supabase_admin_client()
            moments = []

            # Get moments from track or by IDs
            if track_id:
                response = supabase.table('learning_events') \
                    .select('*') \
                    .eq('track_id', track_id) \
                    .eq('user_id', user_id) \
                    .order('created_at') \
                    .execute()
                moments = response.data or []

                # Get track name
                track_response = supabase.table('interest_tracks') \
                    .select('name') \
                    .eq('id', track_id) \
                    .eq('user_id', user_id) \
                    .single() \
                    .execute()
                track_name = track_response.data.get('name') if track_response.data else None

            elif moment_ids:
                response = supabase.table('learning_events') \
                    .select('*') \
                    .in_('id', moment_ids) \
                    .eq('user_id', user_id) \
                    .order('created_at') \
                    .execute()
                moments = response.data or []
                track_name = None
            else:
                return {
                    'success': False,
                    'error': 'Either moment_ids or track_id is required'
                }

            if not moments:
                return {
                    'success': False,
                    'error': 'No moments found'
                }

            # Use AI to generate quest structure
            ai_service = QuestGenerationAIService()
            result = ai_service.generate_quest_structure(
                moments=moments,
                track_name=track_name
            )

            if not result['success']:
                return result

            quest_structure = result['quest_structure']

            # Apply retroactive multiplier to XP
            for task in quest_structure.get('tasks', []):
                original_xp = task.get('xp_value', 50)
                task['original_xp'] = original_xp
                task['xp_value'] = int(original_xp * QuestConversionService.RETROACTIVE_XP_MULTIPLIER)

            total_xp = sum(task.get('xp_value', 0) for task in quest_structure.get('tasks', []))
            original_total = sum(task.get('original_xp', 0) for task in quest_structure.get('tasks', []))

            return {
                'success': True,
                'preview': {
                    **quest_structure,
                    'total_xp': total_xp,
                    'original_total_xp': original_total,
                    'xp_multiplier': QuestConversionService.RETROACTIVE_XP_MULTIPLIER,
                    'moment_count': len(moments),
                    'moment_ids': [m['id'] for m in moments],
                    'track_id': track_id
                }
            }

        except Exception as e:
            logger.error(f"Error generating quest preview: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def create_quest_from_moments(
        user_id: str,
        preview: Dict,
        title: Optional[str] = None,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a Quest from a preview structure.

        Args:
            user_id: The user ID
            preview: The quest preview from generate_quest_preview
            title: Override title (optional)
            description: Override description (optional)

        Returns:
            Dict with created quest and conversion record
        """
        try:
            supabase = get_supabase_admin_client()
            user_client = get_user_client()

            # Use provided title/description or from preview
            quest_title = title or preview.get('title', 'My Learning Quest')
            quest_description = description or preview.get('description', '')
            tasks = preview.get('tasks', [])
            moment_ids = preview.get('moment_ids', [])
            track_id = preview.get('track_id')

            # Create the Quest
            quest_data = {
                'title': quest_title,
                'description': quest_description,
                'quest_type': preview.get('quest_type', 'personal'),
                'is_active': False,  # Completed quests aren't active
                'created_by': user_id,
                'difficulty': 'medium',
                'estimated_time': f"{len(tasks)} activities"
            }

            quest_response = user_client.table('quests').insert(quest_data).execute()

            if not quest_response.data or len(quest_response.data) == 0:
                return {
                    'success': False,
                    'error': 'Failed to create quest'
                }

            quest = quest_response.data[0]
            quest_id = quest['id']

            # Start the quest for the user
            user_quest_data = {
                'user_id': user_id,
                'quest_id': quest_id,
                'started_at': datetime.utcnow().isoformat(),
                'completed_at': datetime.utcnow().isoformat(),  # Already completed
                'status': 'completed'
            }

            user_client.table('user_quests').insert(user_quest_data).execute()

            # Create tasks
            total_xp = 0
            for i, task in enumerate(tasks):
                task_data = {
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'title': task.get('title', f'Task {i+1}'),
                    'description': task.get('description', ''),
                    'pillar': task.get('pillar', 'life_wellness'),
                    'xp_value': task.get('xp_value', 50),
                    'is_completed': True,  # Already completed
                    'completed_at': datetime.utcnow().isoformat()
                }

                task_response = user_client.table('user_quest_tasks').insert(task_data).execute()

                if task_response.data:
                    total_xp += task.get('xp_value', 50)

                    # Record completion for XP
                    task_id = task_response.data[0]['id']
                    completion_data = {
                        'user_id': user_id,
                        'quest_id': quest_id,
                        'task_id': task_id,
                        'xp_awarded': task.get('xp_value', 50),
                        'completed_at': datetime.utcnow().isoformat()
                    }
                    supabase.table('quest_task_completions').insert(completion_data).execute()

            # Update user's total XP
            try:
                supabase.rpc('add_user_xp', {
                    'p_user_id': user_id,
                    'p_xp_amount': total_xp
                }).execute()
            except Exception as xp_error:
                logger.warning(f"Failed to update user XP: {xp_error}")

            # Record the conversion
            conversion_data = {
                'user_id': user_id,
                'track_id': track_id,
                'quest_id': quest_id,
                'learning_event_ids': moment_ids,
                'xp_awarded': total_xp
            }

            conversion_response = supabase.table('quest_conversions').insert(conversion_data).execute()
            conversion = conversion_response.data[0] if conversion_response.data else None

            return {
                'success': True,
                'quest': quest,
                'conversion': conversion,
                'xp_awarded': total_xp,
                'tasks_created': len(tasks)
            }

        except Exception as e:
            logger.error(f"Error creating quest from moments: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def get_user_conversions(user_id: str) -> Dict[str, Any]:
        """Get all quest conversions for a user."""
        try:
            supabase = get_supabase_admin_client()

            response = supabase.table('quest_conversions') \
                .select('*, quests(id, title), interest_tracks(id, name)') \
                .eq('user_id', user_id) \
                .order('converted_at', desc=True) \
                .execute()

            return {
                'success': True,
                'conversions': response.data or []
            }

        except Exception as e:
            logger.error(f"Error fetching user conversions: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def get_conversion_details(
        user_id: str,
        conversion_id: str
    ) -> Dict[str, Any]:
        """Get details of a specific conversion."""
        try:
            supabase = get_supabase_admin_client()

            response = supabase.table('quest_conversions') \
                .select('*, quests(*), interest_tracks(*)') \
                .eq('id', conversion_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not response.data:
                return {
                    'success': False,
                    'error': 'Conversion not found'
                }

            return {
                'success': True,
                'conversion': response.data
            }

        except Exception as e:
            logger.error(f"Error fetching conversion details: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def calculate_retroactive_xp(moments: List[Dict]) -> Dict[str, Any]:
        """
        Calculate what XP would be awarded for moments (informational).

        Args:
            moments: List of learning moments

        Returns:
            Dict with XP breakdown
        """
        if not moments:
            return {
                'success': True,
                'estimated_xp': 0,
                'original_xp': 0,
                'multiplier': QuestConversionService.RETROACTIVE_XP_MULTIPLIER
            }

        # Use AI to estimate XP values
        ai_service = QuestGenerationAIService()
        result = ai_service.generate_quest_structure(moments)

        if not result['success']:
            # Fallback: estimate based on moment count and complexity
            base_xp = len(moments) * 75  # Average XP per moment
            return {
                'success': True,
                'estimated_xp': int(base_xp * QuestConversionService.RETROACTIVE_XP_MULTIPLIER),
                'original_xp': base_xp,
                'multiplier': QuestConversionService.RETROACTIVE_XP_MULTIPLIER
            }

        quest_structure = result['quest_structure']
        original_xp = quest_structure.get('total_xp', 0)
        estimated_xp = int(original_xp * QuestConversionService.RETROACTIVE_XP_MULTIPLIER)

        return {
            'success': True,
            'estimated_xp': estimated_xp,
            'original_xp': original_xp,
            'multiplier': QuestConversionService.RETROACTIVE_XP_MULTIPLIER,
            'task_count': len(quest_structure.get('tasks', []))
        }
