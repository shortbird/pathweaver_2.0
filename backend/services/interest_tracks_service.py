"""
Interest Tracks Service
=======================

Handles business logic for Interest Tracks - organizational containers
for grouping related learning moments.

Features:
- CRUD operations for tracks
- Track statistics and analytics
- Moment assignment and management
- AI-powered track suggestions
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from services.base_service import BaseService
from database import get_supabase_admin_client, get_user_client

from utils.logger import get_logger

logger = get_logger(__name__)


class InterestTracksService(BaseService):
    """Service for managing interest tracks and their moments."""

    # Default track colors (Tailwind-inspired)
    DEFAULT_COLORS = [
        '#6366f1',  # indigo
        '#8b5cf6',  # violet
        '#ec4899',  # pink
        '#f43f5e',  # rose
        '#f97316',  # orange
        '#eab308',  # yellow
        '#22c55e',  # green
        '#14b8a6',  # teal
        '#06b6d4',  # cyan
        '#3b82f6',  # blue
    ]

    # Default icons
    DEFAULT_ICONS = [
        'folder', 'star', 'book', 'code', 'paint',
        'music', 'science', 'globe', 'lightbulb', 'heart'
    ]

    @staticmethod
    def create_track(
        user_id: str,
        name: str,
        description: Optional[str] = None,
        color: Optional[str] = None,
        icon: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new interest track.

        Args:
            user_id: The user creating the track
            name: Track name
            description: Optional description
            color: Optional hex color (defaults to random from palette)
            icon: Optional icon name

        Returns:
            Dictionary with success status and track data
        """
        try:
            supabase = get_supabase_admin_client()

            # Default color if not provided
            if not color:
                import random
                color = random.choice(InterestTracksService.DEFAULT_COLORS)

            # Default icon if not provided
            if not icon:
                icon = 'folder'

            track_data = {
                'user_id': user_id,
                'name': name,
                'description': description,
                'color': color,
                'icon': icon,
                'moment_count': 0
            }

            response = supabase.table('interest_tracks').insert(track_data).execute()

            if response.data and len(response.data) > 0:
                return {
                    'success': True,
                    'track': response.data[0]
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to create interest track'
                }

        except Exception as e:
            logger.error(f"Error creating interest track: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def get_user_tracks(
        user_id: str,
        include_moment_count: bool = True
    ) -> Dict[str, Any]:
        """
        Get all interest tracks for a user.

        Args:
            user_id: The user whose tracks to fetch
            include_moment_count: Whether to include moment counts

        Returns:
            Dictionary with success status and tracks list
        """
        try:
            supabase = get_supabase_admin_client()

            response = supabase.table('interest_tracks') \
                .select('*') \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .execute()

            tracks = response.data or []

            return {
                'success': True,
                'tracks': tracks
            }

        except Exception as e:
            logger.error(f"Error fetching interest tracks: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'tracks': []
            }

    @staticmethod
    def get_track_with_moments(
        user_id: str,
        track_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get a specific track with its learning moments.

        Args:
            user_id: The requesting user
            track_id: The track ID
            limit: Maximum moments to return
            offset: Pagination offset

        Returns:
            Dictionary with track data and moments
        """
        try:
            supabase = get_supabase_admin_client()

            # Get track
            track_response = supabase.table('interest_tracks') \
                .select('*') \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not track_response.data:
                return {
                    'success': False,
                    'error': 'Track not found'
                }

            track = track_response.data

            # Get moments in this track
            moments_response = supabase.table('learning_events') \
                .select('*, learning_event_evidence_blocks(*)') \
                .eq('track_id', track_id) \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()

            # Rename learning_event_evidence_blocks to evidence_blocks for frontend
            moments = moments_response.data or []
            for moment in moments:
                if 'learning_event_evidence_blocks' in moment:
                    moment['evidence_blocks'] = moment.pop('learning_event_evidence_blocks')

            track['moments'] = moments

            return {
                'success': True,
                'track': track
            }

        except Exception as e:
            logger.error(f"Error fetching track with moments: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def get_track_stats(user_id: str, track_id: str) -> Dict[str, Any]:
        """
        Get statistics for a track.

        Args:
            user_id: The requesting user
            track_id: The track ID

        Returns:
            Dictionary with track statistics
        """
        try:
            supabase = get_supabase_admin_client()

            # Verify ownership
            track_response = supabase.table('interest_tracks') \
                .select('id, name, moment_count, created_at') \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not track_response.data:
                return {
                    'success': False,
                    'error': 'Track not found'
                }

            # Get pillar distribution
            moments_response = supabase.table('learning_events') \
                .select('pillars, created_at') \
                .eq('track_id', track_id) \
                .eq('user_id', user_id) \
                .execute()

            moments = moments_response.data or []

            # Calculate pillar distribution
            pillar_counts = {}
            date_range = {'earliest': None, 'latest': None}

            for moment in moments:
                pillars = moment.get('pillars', []) or []
                for pillar in pillars:
                    pillar_counts[pillar] = pillar_counts.get(pillar, 0) + 1

                created = moment.get('created_at')
                if created:
                    if not date_range['earliest'] or created < date_range['earliest']:
                        date_range['earliest'] = created
                    if not date_range['latest'] or created > date_range['latest']:
                        date_range['latest'] = created

            return {
                'success': True,
                'stats': {
                    'track_id': track_id,
                    'track_name': track_response.data['name'],
                    'moment_count': track_response.data['moment_count'],
                    'pillar_distribution': pillar_counts,
                    'date_range': date_range,
                    'created_at': track_response.data['created_at']
                }
            }

        except Exception as e:
            logger.error(f"Error fetching track stats: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def update_track(
        user_id: str,
        track_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        color: Optional[str] = None,
        icon: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update an interest track.

        Args:
            user_id: The requesting user
            track_id: The track ID to update
            name: New name
            description: New description
            color: New color
            icon: New icon

        Returns:
            Dictionary with success status and updated track
        """
        try:
            supabase = get_supabase_admin_client()

            update_data = {'updated_at': datetime.utcnow().isoformat()}

            if name is not None:
                update_data['name'] = name
            if description is not None:
                update_data['description'] = description
            if color is not None:
                update_data['color'] = color
            if icon is not None:
                update_data['icon'] = icon

            if len(update_data) == 1:  # Only updated_at
                return {
                    'success': False,
                    'error': 'No fields to update'
                }

            response = supabase.table('interest_tracks') \
                .update(update_data) \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .execute()

            if response.data and len(response.data) > 0:
                return {
                    'success': True,
                    'track': response.data[0]
                }
            else:
                return {
                    'success': False,
                    'error': 'Track not found or update failed'
                }

        except Exception as e:
            logger.error(f"Error updating interest track: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def delete_track(user_id: str, track_id: str) -> Dict[str, Any]:
        """
        Delete an interest track. Moments become unassigned (track_id = null).

        Args:
            user_id: The requesting user
            track_id: The track ID to delete

        Returns:
            Dictionary with success status
        """
        try:
            supabase = get_supabase_admin_client()

            # Delete track (moments will have track_id set to NULL due to ON DELETE SET NULL)
            response = supabase.table('interest_tracks') \
                .delete() \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .execute()

            return {
                'success': True,
                'message': 'Track deleted successfully'
            }

        except Exception as e:
            logger.error(f"Error deleting interest track: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def get_unassigned_moments(
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get learning moments that are not assigned to any track or quest.

        Args:
            user_id: The user whose moments to fetch
            limit: Maximum moments to return
            offset: Pagination offset

        Returns:
            Dictionary with unassigned moments
        """
        try:
            supabase = get_supabase_admin_client()

            # Get moments with no track_id AND no quest_id
            response = supabase.table('learning_events') \
                .select('*, learning_event_evidence_blocks(*)') \
                .eq('user_id', user_id) \
                .is_('track_id', 'null') \
                .is_('quest_id', 'null') \
                .order('created_at', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()

            # Rename learning_event_evidence_blocks to evidence_blocks for frontend
            moments = response.data or []
            for moment in moments:
                if 'learning_event_evidence_blocks' in moment:
                    moment['evidence_blocks'] = moment.pop('learning_event_evidence_blocks')

            return {
                'success': True,
                'moments': moments
            }

        except Exception as e:
            logger.error(f"Error fetching unassigned moments: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'moments': []
            }

    @staticmethod
    def assign_moment_to_track(
        user_id: str,
        moment_id: str,
        track_id: Optional[str]
    ) -> Dict[str, Any]:
        """
        Assign a learning moment to a track (or remove from track if track_id is None).

        Args:
            user_id: The requesting user
            moment_id: The moment to assign
            track_id: The track ID (or None to unassign)

        Returns:
            Dictionary with success status
        """
        try:
            supabase = get_supabase_admin_client()

            # Get current track assignment to update counts
            current_response = supabase.table('learning_events') \
                .select('track_id') \
                .eq('id', moment_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not current_response.data:
                return {
                    'success': False,
                    'error': 'Moment not found'
                }

            old_track_id = current_response.data.get('track_id')

            # Verify new track ownership if assigning
            if track_id:
                track_response = supabase.table('interest_tracks') \
                    .select('id') \
                    .eq('id', track_id) \
                    .eq('user_id', user_id) \
                    .single() \
                    .execute()

                if not track_response.data:
                    return {
                        'success': False,
                        'error': 'Track not found'
                    }

            # Update moment
            response = supabase.table('learning_events') \
                .update({'track_id': track_id}) \
                .eq('id', moment_id) \
                .eq('user_id', user_id) \
                .execute()

            if response.data and len(response.data) > 0:
                # Update track moment counts
                if old_track_id and old_track_id != track_id:
                    supabase.rpc('decrement_track_moment_count', {'track_id': old_track_id}).execute()

                if track_id and track_id != old_track_id:
                    supabase.rpc('increment_track_moment_count', {'track_id': track_id}).execute()

                return {
                    'success': True,
                    'moment': response.data[0]
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to assign moment to track'
                }

        except Exception as e:
            logger.error(f"Error assigning moment to track: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def bulk_assign_moments_to_track(
        user_id: str,
        track_id: str,
        moment_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Bulk assign multiple learning moments to a track.

        Args:
            user_id: The requesting user
            track_id: The track ID to assign moments to
            moment_ids: List of moment IDs to assign

        Returns:
            Dictionary with success status and count of assigned moments
        """
        try:
            if not moment_ids:
                return {
                    'success': True,
                    'assigned_count': 0
                }

            supabase = get_supabase_admin_client()

            # Verify track ownership
            track_response = supabase.table('interest_tracks') \
                .select('id') \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not track_response.data:
                return {
                    'success': False,
                    'error': 'Track not found'
                }

            # Update all moments at once
            logger.info(f"Attempting to assign moments {moment_ids} to track {track_id} for user {user_id}")
            response = supabase.table('learning_events') \
                .update({'track_id': track_id}) \
                .eq('user_id', user_id) \
                .is_('track_id', 'null') \
                .in_('id', moment_ids) \
                .execute()

            logger.info(f"Bulk assign response: {response.data}")
            assigned_count = len(response.data) if response.data else 0

            # Update track moment count
            if assigned_count > 0:
                # Get current count and update
                count_response = supabase.table('interest_tracks') \
                    .select('moment_count') \
                    .eq('id', track_id) \
                    .single() \
                    .execute()

                current_count = count_response.data.get('moment_count', 0) if count_response.data else 0
                supabase.table('interest_tracks') \
                    .update({'moment_count': current_count + assigned_count}) \
                    .eq('id', track_id) \
                    .execute()

            logger.info(f"Bulk assigned {assigned_count} moments to track {track_id}")

            return {
                'success': True,
                'assigned_count': assigned_count
            }

        except Exception as e:
            logger.error(f"Error bulk assigning moments to track: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def preview_evolved_quest(
        user_id: str,
        track_id: str
    ) -> Dict[str, Any]:
        """
        Generate AI-powered preview of quest structure from a track's moments.

        Uses AI to suggest title, description, and intelligently grouped tasks.

        Args:
            user_id: The user requesting the preview
            track_id: The track to preview evolution for

        Returns:
            Dictionary with AI-suggested quest structure
        """
        try:
            from services.quest_generation_ai_service import QuestGenerationAIService

            supabase = get_supabase_admin_client()

            # 1. Verify track ownership
            track_response = supabase.table('interest_tracks') \
                .select('*') \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not track_response.data:
                return {
                    'success': False,
                    'error': 'Track not found'
                }

            track = track_response.data

            # 2. Get moments in this track
            moments_response = supabase.table('learning_events') \
                .select('id, title, description, pillars, ai_generated_title, created_at') \
                .eq('track_id', track_id) \
                .eq('user_id', user_id) \
                .order('created_at', desc=False) \
                .execute()

            moments = moments_response.data or []

            # 3. Verify at least 5 moments
            if len(moments) < 5:
                return {
                    'success': False,
                    'error': f'Track needs at least 5 moments to evolve (currently has {len(moments)})'
                }

            # 4. Use AI to generate quest structure
            ai_service = QuestGenerationAIService()
            ai_result = ai_service.generate_quest_structure(
                moments=moments,
                track_name=track.get('name')
            )

            if not ai_result.get('success'):
                return {
                    'success': False,
                    'error': ai_result.get('error', 'Failed to generate quest structure')
                }

            quest_structure = ai_result['quest_structure']

            return {
                'success': True,
                'preview': {
                    'title': quest_structure.get('title', 'My Learning Quest'),
                    'description': quest_structure.get('description', ''),
                    'tasks': quest_structure.get('tasks', []),
                    'total_xp': quest_structure.get('total_xp', 0),
                    'primary_pillar': quest_structure.get('primary_pillar', 'stem'),
                    'learning_outcomes': quest_structure.get('learning_outcomes', [])
                },
                'moment_count': len(moments),
                'track_name': track.get('name')
            }

        except Exception as e:
            logger.error(f"Error generating quest preview: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def evolve_to_quest(
        user_id: str,
        track_id: str,
        title: str,
        description: Optional[str] = None,
        tasks: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Convert an interest track into a quest using AI-generated or user-edited structure.

        This creates a private quest from the track's learning moments,
        auto-enrolls the user, and creates tasks from the provided structure.

        Args:
            user_id: The user evolving the track
            track_id: The track to evolve
            title: Quest title (from AI or user-edited)
            description: Quest description (from AI or user-edited)
            tasks: List of task definitions (from AI preview, can be user-edited)

        Returns:
            Dictionary with success status, quest data, and task count
        """
        try:
            from services.quest_generation_ai_service import QuestGenerationAIService

            supabase = get_supabase_admin_client()

            # 1. Verify track ownership and get track with moments
            track_response = supabase.table('interest_tracks') \
                .select('*') \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not track_response.data:
                return {
                    'success': False,
                    'error': 'Track not found'
                }

            track = track_response.data

            # 2. Get moments to verify count
            moments_response = supabase.table('learning_events') \
                .select('id, title, description, pillars, ai_generated_title, created_at') \
                .eq('track_id', track_id) \
                .eq('user_id', user_id) \
                .order('created_at', desc=False) \
                .execute()

            moments = moments_response.data or []

            # 3. Verify at least 5 moments
            if len(moments) < 5:
                return {
                    'success': False,
                    'error': f'Track needs at least 5 moments to evolve (currently has {len(moments)})'
                }

            # 4. If no tasks provided, generate them with AI
            if not tasks:
                ai_service = QuestGenerationAIService()
                ai_result = ai_service.generate_quest_structure(
                    moments=moments,
                    track_name=track.get('name')
                )

                if ai_result.get('success'):
                    quest_structure = ai_result['quest_structure']
                    if not title:
                        title = quest_structure.get('title', 'My Learning Quest')
                    if not description:
                        description = quest_structure.get('description', '')
                    tasks = quest_structure.get('tasks', [])
                else:
                    return {
                        'success': False,
                        'error': 'Failed to generate quest structure'
                    }

            # 5. Create the quest (private, owned by user)
            quest_data = {
                'title': title,
                'description': description,
                'big_idea': description,
                'quest_type': 'optio',  # Valid types: 'optio' or 'course'
                'is_active': True,
                'is_public': False,  # Private - only available to this user
                'created_by': user_id,
                'is_v3': True,
                'requires_review': False
            }

            quest_response = supabase.table('quests').insert(quest_data).execute()

            if not quest_response.data or len(quest_response.data) == 0:
                return {
                    'success': False,
                    'error': 'Failed to create quest'
                }

            quest = quest_response.data[0]
            quest_id = quest['id']

            # 6. Auto-enroll user in the quest
            enrollment_data = {
                'user_id': user_id,
                'quest_id': quest_id,
                'started_at': datetime.utcnow().isoformat(),
                'is_active': True,
                'status': 'picked_up',  # Valid: 'available', 'picked_up', 'set_down'
                'times_picked_up': 1,
                'last_picked_up_at': datetime.utcnow().isoformat(),
                'personalization_completed': True  # Skip personalization since tasks are pre-created
            }

            enrollment_response = supabase.table('user_quests').insert(enrollment_data).execute()

            if not enrollment_response.data or len(enrollment_response.data) == 0:
                # Rollback quest creation
                supabase.table('quests').delete().eq('id', quest_id).execute()
                return {
                    'success': False,
                    'error': 'Failed to enroll in quest'
                }

            user_quest_id = enrollment_response.data[0]['id']

            # 7. Create tasks from AI-generated or user-provided structure
            # Also transfer evidence from source moments to tasks
            tasks_created = 0
            evidence_transferred = 0

            for index, task in enumerate(tasks):
                task_data = {
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'user_quest_id': user_quest_id,
                    'title': task.get('title', f'Task {index + 1}'),
                    'description': task.get('description', ''),
                    'pillar': task.get('pillar', 'stem'),
                    'xp_value': task.get('xp_value', 100),
                    'order_index': index,
                    'is_required': False,
                    'is_manual': True,
                    'approval_status': 'approved'  # Auto-approved since AI-generated
                }

                task_response = supabase.table('user_quest_tasks').insert(task_data).execute()
                if task_response.data:
                    tasks_created += 1
                    new_task_id = task_response.data[0]['id']

                    # Transfer evidence from source moments to this task
                    source_moment_ids = task.get('source_moment_ids', [])
                    if source_moment_ids:
                        evidence_count = InterestTracksService._transfer_moment_evidence_to_task(
                            supabase=supabase,
                            user_id=user_id,
                            quest_id=quest_id,
                            task_id=new_task_id,
                            moment_ids=source_moment_ids
                        )
                        evidence_transferred += evidence_count

            # 8. Generate and set quest image
            try:
                from services.image_service import search_quest_image
                image_url = search_quest_image(title, description)
                if image_url:
                    supabase.table('quests') \
                        .update({'image_url': image_url}) \
                        .eq('id', quest_id) \
                        .execute()
                    quest['image_url'] = image_url
                    logger.info(f"Generated image for evolved quest: {image_url}")
            except Exception as img_error:
                logger.warning(f"Failed to generate quest image: {str(img_error)}")

            # 9. Update track to mark as evolved and link to quest
            supabase.table('interest_tracks') \
                .update({
                    'updated_at': datetime.utcnow().isoformat(),
                    'evolved_to_quest_id': quest_id
                }) \
                .eq('id', track_id) \
                .execute()

            logger.info(f"Track {track_id} evolved to quest {quest_id} with {tasks_created} tasks, {evidence_transferred} evidence blocks transferred")

            return {
                'success': True,
                'quest': quest,
                'quest_id': quest_id,
                'tasks_created': tasks_created,
                'evidence_transferred': evidence_transferred,
                'message': f'Topic evolved into quest with {tasks_created} tasks!'
            }

        except Exception as e:
            logger.error(f"Error evolving track to quest: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def _transfer_moment_evidence_to_task(
        supabase,
        user_id: str,
        quest_id: str,
        task_id: str,
        moment_ids: List[str]
    ) -> int:
        """
        Transfer evidence blocks from learning moments to a quest task.

        Creates a user_task_evidence_document for the task and copies
        all evidence blocks from the source moments.

        Args:
            supabase: Supabase client
            user_id: The user ID
            quest_id: The quest ID
            task_id: The new task ID
            moment_ids: List of source learning moment IDs

        Returns:
            Number of evidence blocks transferred
        """
        try:
            if not moment_ids:
                return 0

            # Fetch all evidence blocks from source moments
            evidence_response = supabase.table('learning_event_evidence_blocks') \
                .select('*') \
                .in_('learning_event_id', moment_ids) \
                .order('created_at') \
                .execute()

            evidence_blocks = evidence_response.data or []

            if not evidence_blocks:
                return 0

            # Create the user_task_evidence_document
            doc_data = {
                'user_id': user_id,
                'quest_id': quest_id,
                'task_id': task_id,
                'status': 'draft'
            }

            doc_response = supabase.table('user_task_evidence_documents').insert(doc_data).execute()

            if not doc_response.data:
                logger.warning(f"Failed to create evidence document for task {task_id}")
                return 0

            document_id = doc_response.data[0]['id']

            # Copy evidence blocks to the new document
            blocks_to_insert = []
            for index, block in enumerate(evidence_blocks):
                # Convert learning_event_evidence_blocks format to evidence_document_blocks format
                content = block.get('content', {}) or {}

                # If there's a file_url, include it in the content
                if block.get('file_url'):
                    content['url'] = block['file_url']
                    if block.get('file_name'):
                        content['filename'] = block['file_name']
                    if block.get('file_size'):
                        content['file_size'] = block['file_size']

                block_data = {
                    'document_id': document_id,
                    'block_type': block.get('block_type', 'text'),
                    'content': content,
                    'order_index': index,
                    'is_private': False,
                    'uploaded_by_user_id': user_id,
                    'uploaded_by_role': 'student'
                }
                blocks_to_insert.append(block_data)

            if blocks_to_insert:
                supabase.table('evidence_document_blocks').insert(blocks_to_insert).execute()
                logger.info(f"Transferred {len(blocks_to_insert)} evidence blocks to task {task_id}")

            return len(blocks_to_insert)

        except Exception as e:
            logger.error(f"Error transferring evidence to task {task_id}: {str(e)}")
            return 0

    @staticmethod
    def get_active_quest_topics(user_id: str) -> Dict[str, Any]:
        """
        Get user's active quests as topic options for the learning journal.
        Groups course projects under their parent courses.

        Optimized to use batch queries instead of N+1 queries.

        Args:
            user_id: The user whose active quests to fetch

        Returns:
            Dictionary with success status, standalone quest topics, and course topics
        """
        try:
            supabase = get_supabase_admin_client()

            # Get active quests with enrollment info
            # Active = is_active=true AND status='picked_up'
            response = supabase.table('user_quests') \
                .select('id, quest_id, quests(id, title, image_url, description)') \
                .eq('user_id', user_id) \
                .eq('is_active', True) \
                .eq('status', 'picked_up') \
                .execute()

            # Deduplicate by quest_id (there may be multiple enrollments)
            seen_quest_ids = set()
            quest_data = {}  # quest_id -> {quest info, enrollment id}

            for enrollment in (response.data or []):
                quest = enrollment.get('quests')
                if quest and quest['id'] not in seen_quest_ids:
                    seen_quest_ids.add(quest['id'])
                    quest_data[quest['id']] = {
                        'quest': quest,
                        'user_quest_id': enrollment['id']
                    }

            if not quest_data:
                return {
                    'success': True,
                    'quest_topics': [],
                    'course_topics': []
                }

            quest_ids = list(quest_data.keys())

            # OPTIMIZATION: Batch fetch all moment counts in ONE query
            moment_counts = {}
            moments_response = supabase.table('learning_events') \
                .select('quest_id') \
                .eq('user_id', user_id) \
                .in_('quest_id', quest_ids) \
                .execute()
            for moment in (moments_response.data or []):
                qid = moment.get('quest_id')
                if qid:
                    moment_counts[qid] = moment_counts.get(qid, 0) + 1

            # Also count completed tasks for each quest
            completed_task_counts = {}
            completions_response = supabase.table('quest_task_completions') \
                .select('quest_id') \
                .eq('user_id', user_id) \
                .in_('quest_id', quest_ids) \
                .execute()
            for completion in (completions_response.data or []):
                qid = completion.get('quest_id')
                if qid:
                    completed_task_counts[qid] = completed_task_counts.get(qid, 0) + 1

            # Get course info for these quests (single query)
            course_quests_response = supabase.table('course_quests') \
                .select('quest_id, course_id, sequence_order, courses(id, title, cover_image_url, description)') \
                .in_('quest_id', quest_ids) \
                .execute()

            # Map quest_id -> course info
            quest_to_course = {}
            for cq in (course_quests_response.data or []):
                if cq.get('courses'):
                    quest_to_course[cq['quest_id']] = {
                        'course': cq['courses'],
                        'sequence_order': cq.get('sequence_order', 0)
                    }

            # Group by course vs standalone (no additional queries needed)
            standalone_quests = []
            courses_map = {}  # course_id -> {course info, projects list}

            for quest_id, data in quest_data.items():
                quest = data['quest']
                user_quest_id = data['user_quest_id']
                moment_count = moment_counts.get(quest_id, 0)
                task_count = completed_task_counts.get(quest_id, 0)
                total_items = moment_count + task_count

                if quest_id in quest_to_course:
                    # This quest is a course project
                    course_info = quest_to_course[quest_id]
                    course = course_info['course']
                    course_id = course['id']

                    if course_id not in courses_map:
                        courses_map[course_id] = {
                            'course': course,
                            'projects': [],
                            'total_moment_count': 0,
                            'total_task_count': 0
                        }

                    courses_map[course_id]['projects'].append({
                        'id': quest_id,
                        'type': 'project',
                        'name': quest['title'],
                        'description': quest.get('description', ''),
                        'image_url': quest.get('image_url'),
                        'moment_count': moment_count,
                        'task_count': task_count,
                        'item_count': total_items,
                        'user_quest_id': user_quest_id,
                        'sequence_order': course_info['sequence_order']
                    })
                    courses_map[course_id]['total_moment_count'] += moment_count
                    courses_map[course_id]['total_task_count'] += task_count
                else:
                    # Standalone quest
                    standalone_quests.append({
                        'id': quest_id,
                        'type': 'quest',
                        'name': quest['title'],
                        'description': quest.get('description', ''),
                        'image_url': quest.get('image_url'),
                        'color': 'gradient',
                        'icon': 'flag',
                        'moment_count': moment_count,
                        'task_count': task_count,
                        'item_count': total_items,
                        'user_quest_id': user_quest_id
                    })

            # Format course topics with nested projects
            course_topics = []
            for course_id, data in courses_map.items():
                course = data['course']
                # Sort projects by sequence order
                projects = sorted(data['projects'], key=lambda p: p.get('sequence_order', 0))
                total_items = data['total_moment_count'] + data.get('total_task_count', 0)
                course_topics.append({
                    'id': course_id,
                    'type': 'course',
                    'name': course['title'],
                    'description': course.get('description', ''),
                    'image_url': course.get('cover_image_url'),
                    'color': 'gradient',
                    'icon': 'academic-cap',
                    'moment_count': data['total_moment_count'],
                    'task_count': data.get('total_task_count', 0),
                    'item_count': total_items,
                    'projects': projects
                })

            return {
                'success': True,
                'quest_topics': standalone_quests,
                'course_topics': course_topics
            }

        except Exception as e:
            logger.error(f"Error fetching active quest topics: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'quest_topics': [],
                'course_topics': []
            }

    @staticmethod
    def get_unified_topics(user_id: str) -> Dict[str, Any]:
        """
        Get combined list of interest tracks, active quests, and courses as topics.

        Args:
            user_id: The user whose topics to fetch

        Returns:
            Dictionary with success status and categorized topics
        """
        try:
            supabase = get_supabase_admin_client()

            # Get interest tracks
            tracks_result = InterestTracksService.get_user_tracks(user_id)
            tracks = tracks_result.get('tracks', []) if tracks_result.get('success') else []

            # Get active quest topics (now includes course_topics)
            quests_result = InterestTracksService.get_active_quest_topics(user_id)
            quest_topics = quests_result.get('quest_topics', []) if quests_result.get('success') else []
            course_topics = quests_result.get('course_topics', []) if quests_result.get('success') else []

            # Calculate actual moment counts for tracks from learning_events table
            # This ensures accurate counts even if the denormalized moment_count is stale
            track_ids = [t['id'] for t in tracks]
            track_moment_counts = {}
            if track_ids:
                moments_response = supabase.table('learning_events') \
                    .select('track_id') \
                    .eq('user_id', user_id) \
                    .in_('track_id', track_ids) \
                    .execute()
                for moment in (moments_response.data or []):
                    tid = moment.get('track_id')
                    if tid:
                        track_moment_counts[tid] = track_moment_counts.get(tid, 0) + 1

            # Format tracks as topics with accurate moment counts
            formatted_tracks = []
            for track in tracks:
                formatted_tracks.append({
                    'id': track['id'],
                    'type': 'track',
                    'name': track['name'],
                    'description': track.get('description', ''),
                    'color': track.get('color', '#6366f1'),
                    'icon': track.get('icon', 'folder'),
                    'moment_count': track_moment_counts.get(track['id'], 0)
                })

            # Combine all flat topics (standalone quests + tracks)
            # Course topics are kept separate for nested display
            all_topics = quest_topics + formatted_tracks

            return {
                'success': True,
                'topics': all_topics,
                'course_topics': course_topics,
                'quest_count': len(quest_topics),
                'course_count': len(course_topics),
                'track_count': len(formatted_tracks)
            }

        except Exception as e:
            logger.error(f"Error fetching unified topics: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'topics': [],
                'course_topics': []
            }

    @staticmethod
    def assign_moment_to_topic(
        user_id: str,
        moment_id: str,
        topic_type: str,
        topic_id: Optional[str]
    ) -> Dict[str, Any]:
        """
        Assign a learning moment to a track or quest topic.

        Args:
            user_id: The requesting user
            moment_id: The moment to assign
            topic_type: 'track' or 'quest'
            topic_id: The topic ID (or None to unassign)

        Returns:
            Dictionary with success status
        """
        try:
            supabase = get_supabase_admin_client()

            # Get current moment assignment
            current_response = supabase.table('learning_events') \
                .select('track_id, quest_id') \
                .eq('id', moment_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not current_response.data:
                return {
                    'success': False,
                    'error': 'Moment not found'
                }

            old_track_id = current_response.data.get('track_id')
            old_quest_id = current_response.data.get('quest_id')

            # Prepare update data
            update_data = {
                'track_id': None,
                'quest_id': None
            }

            if topic_id:
                if topic_type == 'track':
                    # Verify track ownership
                    track_response = supabase.table('interest_tracks') \
                        .select('id') \
                        .eq('id', topic_id) \
                        .eq('user_id', user_id) \
                        .single() \
                        .execute()

                    if not track_response.data:
                        return {
                            'success': False,
                            'error': 'Track not found'
                        }
                    update_data['track_id'] = topic_id

                elif topic_type == 'quest':
                    # Verify quest enrollment (is_active=true AND status='picked_up')
                    enrollment_response = supabase.table('user_quests') \
                        .select('id') \
                        .eq('user_id', user_id) \
                        .eq('quest_id', topic_id) \
                        .eq('is_active', True) \
                        .eq('status', 'picked_up') \
                        .single() \
                        .execute()

                    if not enrollment_response.data:
                        return {
                            'success': False,
                            'error': 'Quest not found or not enrolled'
                        }
                    update_data['quest_id'] = topic_id
                else:
                    return {
                        'success': False,
                        'error': 'Invalid topic type'
                    }

            # Update moment
            response = supabase.table('learning_events') \
                .update(update_data) \
                .eq('id', moment_id) \
                .eq('user_id', user_id) \
                .execute()

            if response.data and len(response.data) > 0:
                # Update track moment counts if track assignment changed
                if old_track_id and old_track_id != update_data.get('track_id'):
                    supabase.rpc('decrement_track_moment_count', {'track_id': old_track_id}).execute()

                if update_data.get('track_id') and update_data['track_id'] != old_track_id:
                    supabase.rpc('increment_track_moment_count', {'track_id': update_data['track_id']}).execute()

                return {
                    'success': True,
                    'moment': response.data[0]
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to assign moment'
                }

        except Exception as e:
            logger.error(f"Error assigning moment to topic: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def get_quest_moments(
        user_id: str,
        quest_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get learning moments and completed tasks for a specific quest.

        Args:
            user_id: The requesting user
            quest_id: The quest ID
            limit: Maximum items to return
            offset: Pagination offset

        Returns:
            Dictionary with quest info, moments, and completed tasks
        """
        import re
        doc_id_pattern = re.compile(r'Document ID: ([a-f0-9-]+)')

        try:
            supabase = get_supabase_admin_client()
            logger.info(f"get_quest_moments called for quest_id={quest_id}, user_id={user_id}")

            # Verify user enrollment in quest (use limit 1 instead of single to handle duplicates)
            enrollment_response = supabase.table('user_quests') \
                .select('id, quests(id, title, description, image_url)') \
                .eq('user_id', user_id) \
                .eq('quest_id', quest_id) \
                .limit(1) \
                .execute()

            if not enrollment_response.data or len(enrollment_response.data) == 0:
                return {
                    'success': False,
                    'error': 'Quest not found or not enrolled'
                }

            quest = enrollment_response.data[0].get('quests')
            user_quest_id = enrollment_response.data[0]['id']

            # Get moments assigned to this quest
            moments_response = supabase.table('learning_events') \
                .select('*, learning_event_evidence_blocks(*)') \
                .eq('quest_id', quest_id) \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()

            logger.info(f"Moments query returned {len(moments_response.data or [])} items")

            # Rename evidence blocks for frontend
            moments = moments_response.data or []
            for moment in moments:
                if 'learning_event_evidence_blocks' in moment:
                    moment['evidence_blocks'] = moment.pop('learning_event_evidence_blocks')
                moment['item_type'] = 'moment'

            # Get completed tasks for this quest
            completions_response = supabase.table('quest_task_completions') \
                .select('*, user_quest_tasks(id, title, description, pillar, xp_value, source_moment_id)') \
                .eq('quest_id', quest_id) \
                .eq('user_id', user_id) \
                .order('completed_at', desc=True) \
                .execute()

            logger.info(f"Completions query returned {len(completions_response.data or [])} items")

            # Format completed tasks as moment-like items
            completed_tasks = []
            seen_source_moment_ids = set()

            for completion in (completions_response.data or []):
                task = completion.get('user_quest_tasks')
                if task:
                    # Track source_moment_ids so we can mark them in the moments list
                    if task.get('source_moment_id'):
                        seen_source_moment_ids.add(task['source_moment_id'])

                    # Check if evidence_text contains a document reference
                    evidence_text = completion.get('evidence_text') or ''
                    evidence_blocks = []
                    description = task.get('description') or ''

                    try:
                        if evidence_text and 'Document ID:' in evidence_text:
                            # Extract document ID and fetch actual evidence blocks
                            match = doc_id_pattern.search(evidence_text)
                            if match:
                                doc_id = match.group(1)
                                logger.info(f"Fetching evidence blocks for document {doc_id}")
                                blocks_response = supabase.table('evidence_document_blocks') \
                                    .select('id, block_type, content, order_index') \
                                    .eq('document_id', doc_id) \
                                    .order('order_index') \
                                    .execute()
                                evidence_blocks = blocks_response.data or []
                                logger.info(f"Found {len(evidence_blocks)} evidence blocks")
                                # Use the first text block as description if available
                                for block in evidence_blocks:
                                    if block.get('block_type') == 'text' and block.get('content', {}).get('text'):
                                        description = block['content']['text']
                                        break
                        elif evidence_text:
                            # Plain text evidence
                            description = evidence_text
                    except Exception as ev_error:
                        logger.warning(f"Error fetching evidence blocks: {str(ev_error)}")
                        # Continue with empty evidence_blocks

                    completed_tasks.append({
                        'id': completion['id'],
                        'item_type': 'completed_task',
                        'title': task.get('title', 'Completed Task'),
                        'description': description,
                        'pillar': task.get('pillar'),
                        'pillars': [task.get('pillar')] if task.get('pillar') else [],
                        'xp_value': task.get('xp_value', 0),
                        'evidence_url': completion.get('evidence_url'),
                        'evidence_blocks': evidence_blocks,
                        'completed_at': completion.get('completed_at'),
                        'created_at': completion.get('completed_at'),
                        'task_id': task.get('id'),
                        'source_moment_id': task.get('source_moment_id')
                    })

            # Mark moments that have been converted to tasks
            for moment in moments:
                moment['has_task'] = moment['id'] in seen_source_moment_ids

            # Combine and sort by created_at/completed_at
            all_items = moments + completed_tasks
            all_items.sort(key=lambda x: x.get('created_at') or '', reverse=True)

            logger.info(f"Returning {len(all_items)} total items ({len(moments)} moments, {len(completed_tasks)} completed tasks)")

            return {
                'success': True,
                'quest': quest,
                'user_quest_id': user_quest_id,
                'moments': all_items,
                'moment_count': len(moments),
                'completed_task_count': len(completed_tasks)
            }

        except Exception as e:
            logger.error(f"Error fetching quest moments: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def convert_moment_to_task(
        user_id: str,
        moment_id: str,
        title: Optional[str] = None,
        pillar: str = 'stem',
        xp_value: int = 100
    ) -> Dict[str, Any]:
        """
        Convert a quest-assigned learning moment into a task on that quest.

        Args:
            user_id: The requesting user
            moment_id: The moment to convert
            title: Optional title override (uses moment title/description otherwise)
            pillar: Learning pillar for the task
            xp_value: XP value for the task

        Returns:
            Dictionary with success status and created task
        """
        try:
            supabase = get_supabase_admin_client()

            # Get moment with quest assignment
            moment_response = supabase.table('learning_events') \
                .select('*, learning_event_evidence_blocks(*)') \
                .eq('id', moment_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not moment_response.data:
                return {
                    'success': False,
                    'error': 'Moment not found'
                }

            moment = moment_response.data
            quest_id = moment.get('quest_id')

            if not quest_id:
                return {
                    'success': False,
                    'error': 'Moment is not assigned to a quest'
                }

            # Get user's enrollment for this quest
            enrollment_response = supabase.table('user_quests') \
                .select('id') \
                .eq('user_id', user_id) \
                .eq('quest_id', quest_id) \
                .single() \
                .execute()

            if not enrollment_response.data:
                return {
                    'success': False,
                    'error': 'Not enrolled in this quest'
                }

            user_quest_id = enrollment_response.data['id']

            # Determine task title
            task_title = title
            if not task_title:
                task_title = moment.get('title') or moment.get('ai_generated_title')
            if not task_title:
                # Use first 100 chars of description
                desc = moment.get('description', 'Learning moment task')
                task_title = desc[:100] + ('...' if len(desc) > 100 else '')

            # Create task
            task_data = {
                'user_id': user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': task_title,
                'description': moment.get('description', ''),
                'pillar': pillar,
                'xp_value': xp_value,
                'is_required': False,
                'is_manual': True,
                'approval_status': 'pending',
                'source_moment_id': moment_id  # Link back to source moment
            }

            task_response = supabase.table('user_quest_tasks').insert(task_data).execute()

            if not task_response.data:
                return {
                    'success': False,
                    'error': 'Failed to create task'
                }

            task = task_response.data[0]

            # Transfer evidence from moment to task
            evidence_blocks = moment.get('learning_event_evidence_blocks', [])
            if evidence_blocks:
                evidence_count = InterestTracksService._transfer_moment_evidence_to_task(
                    supabase=supabase,
                    user_id=user_id,
                    quest_id=quest_id,
                    task_id=task['id'],
                    moment_ids=[moment_id]
                )
                logger.info(f"Transferred {evidence_count} evidence blocks to task {task['id']}")

            return {
                'success': True,
                'task': task,
                'message': f'Created task "{task_title}" with {xp_value} XP'
            }

        except Exception as e:
            logger.error(f"Error converting moment to task: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
