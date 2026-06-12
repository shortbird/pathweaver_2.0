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
from utils.quest_status import is_class_credit_awarded

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
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
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
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
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
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
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

            # Get moments in this track via junction table RPC
            moments_response = supabase.rpc('get_moments_for_topic', {
                'p_user_id': user_id,
                'p_topic_type': 'topic',
                'p_topic_id': track_id,
                'p_limit': limit,
                'p_offset': offset
            }).execute()

            moments = moments_response.data or []

            # Fetch evidence blocks for each moment
            if moments:
                moment_ids = [m['id'] for m in moments]
                blocks_response = supabase.table('learning_event_evidence_blocks') \
                    .select('*') \
                    .in_('learning_event_id', moment_ids) \
                    .order('order_index') \
                    .execute()
                # Group blocks by event
                blocks_map = {}
                for block in (blocks_response.data or []):
                    eid = block['learning_event_id']
                    if eid not in blocks_map:
                        blocks_map[eid] = []
                    blocks_map[eid].append(block)
                for moment in moments:
                    moment['evidence_blocks'] = blocks_map.get(moment['id'], [])

                from services.learning_events_service import LearningEventsService
                LearningEventsService._enrich_events_with_topics(supabase, moments)
                LearningEventsService._enrich_events_with_promoted_task(supabase, moments)

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
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
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

            # Get pillar distribution via junction table
            moments_response = supabase.rpc('get_moments_for_topic', {
                'p_user_id': user_id,
                'p_topic_type': 'topic',
                'p_topic_id': track_id,
                'p_limit': 1000,
                'p_offset': 0
            }).execute()

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
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
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
        Delete an interest track. Junction rows for this topic are deleted.
        Moments that had other topics remain assigned to those topics.
        """
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

            supabase.table('learning_event_topics') \
                .delete() \
                .eq('topic_type', 'topic') \
                .eq('topic_id', track_id) \
                .execute()

            supabase.table('interest_tracks') \
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
        Get learning moments that are not assigned to any topic or quest
        (no rows in junction table).

        Args:
            user_id: The user whose moments to fetch
            limit: Maximum moments to return
            offset: Pagination offset

        Returns:
            Dictionary with unassigned moments
        """
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

            # Use RPC that checks junction table for unassigned moments
            response = supabase.rpc('get_unassigned_moments', {
                'p_user_id': user_id,
                'p_limit': limit,
                'p_offset': offset
            }).execute()

            moments = response.data or []

            # Fetch evidence blocks for these moments
            if moments:
                moment_ids = [m['id'] for m in moments]
                blocks_response = supabase.table('learning_event_evidence_blocks') \
                    .select('*') \
                    .in_('learning_event_id', moment_ids) \
                    .order('order_index') \
                    .execute()
                blocks_map = {}
                for block in (blocks_response.data or []):
                    eid = block['learning_event_id']
                    if eid not in blocks_map:
                        blocks_map[eid] = []
                    blocks_map[eid].append(block)
                for moment in moments:
                    moment['evidence_blocks'] = blocks_map.get(moment['id'], [])
                    moment['topics'] = []  # Unassigned = no topics
                from services.learning_events_service import LearningEventsService
                LearningEventsService._enrich_events_with_promoted_task(supabase, moments)

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
    def bulk_assign_moments_to_track(
        user_id: str,
        track_id: str,
        moment_ids: List[str]
    ) -> Dict[str, Any]:
        """Bulk assign multiple learning moments to a track via junction table."""
        try:
            if not moment_ids:
                return {
                    'success': True,
                    'assigned_count': 0
                }

            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

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

            moments_response = supabase.table('learning_events') \
                .select('id') \
                .eq('user_id', user_id) \
                .in_('id', moment_ids) \
                .execute()
            valid_ids = [m['id'] for m in (moments_response.data or [])]

            if not valid_ids:
                return {
                    'success': True,
                    'assigned_count': 0
                }

            assigned_count = 0
            for mid in valid_ids:
                try:
                    supabase.table('learning_event_topics').insert({
                        'learning_event_id': mid,
                        'topic_type': 'topic',
                        'topic_id': track_id
                    }).execute()
                    assigned_count += 1
                except Exception:
                    # Already-exists (unique constraint) is the expected
                    # collision when a moment is re-assigned to the same track.
                    logger.debug("junction insert collision", exc_info=True)

            if assigned_count > 0:
                from services.learning_events_service import LearningEventsService
                LearningEventsService._recalculate_track_moment_count(supabase, track_id)

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

            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
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

            # 2. Get moments in this track via junction table
            moments_response = supabase.rpc('get_moments_for_topic', {
                'p_user_id': user_id,
                'p_topic_type': 'topic',
                'p_topic_id': track_id,
                'p_limit': 1000,
                'p_offset': 0
            }).execute()

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

            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
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

            # 2. Get moments to verify count via junction table
            moments_response = supabase.rpc('get_moments_for_topic', {
                'p_user_id': user_id,
                'p_topic_type': 'topic',
                'p_topic_id': track_id,
                'p_limit': 1000,
                'p_offset': 0
            }).execute()

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
    def _seed_task_evidence_from_moment(
        supabase,
        user_id: str,
        quest_id: str,
        task_id: str,
        moment_description: Optional[str],
        evidence_blocks: List[Dict]
    ) -> int:
        """Seed a brand-new task's evidence document with the source moment's
        narrative + attached media.

        The moment's free-text description becomes the first text block; any
        existing learning_event_evidence_blocks follow in their original
        order. If the moment has no description and no blocks, no document
        is created.

        Returns the number of evidence blocks written.
        """
        try:
            normalized_description = (moment_description or '').strip()
            if not normalized_description and not evidence_blocks:
                return 0

            doc_response = supabase.table('user_task_evidence_documents').insert({
                'user_id': user_id,
                'quest_id': quest_id,
                'task_id': task_id,
                'status': 'draft'
            }).execute()

            if not doc_response.data:
                logger.warning(f"Failed to create evidence document for task {task_id}")
                return 0

            document_id = doc_response.data[0]['id']

            blocks_to_insert: List[Dict] = []
            order = 0

            if normalized_description:
                blocks_to_insert.append({
                    'document_id': document_id,
                    'block_type': 'text',
                    'content': {'text': normalized_description},
                    'order_index': order,
                    'is_private': False,
                    'uploaded_by_user_id': user_id,
                    'uploaded_by_role': 'student',
                })
                order += 1

            for block in evidence_blocks:
                content = dict(block.get('content') or {})
                if block.get('file_url'):
                    content['url'] = block['file_url']
                    if block.get('file_name'):
                        content['filename'] = block['file_name']
                    if block.get('file_size'):
                        content['file_size'] = block['file_size']

                blocks_to_insert.append({
                    'document_id': document_id,
                    'block_type': block.get('block_type', 'text'),
                    'content': content,
                    'order_index': order,
                    'is_private': False,
                    'uploaded_by_user_id': user_id,
                    'uploaded_by_role': 'student',
                })
                order += 1

            if blocks_to_insert:
                supabase.table('evidence_document_blocks').insert(blocks_to_insert).execute()

            return len(blocks_to_insert)

        except Exception as e:
            logger.error(f"Error seeding task evidence from moment for task {task_id}: {str(e)}")
            return 0

    @staticmethod
    def sync_promoted_task_evidence(moment_id: str) -> int:
        """Copy a moment's file evidence onto any quest task it was promoted to.

        Promotion seeds a task's evidence once, but media (scans/photos/video)
        often finishes uploading to the moment a few SECONDS after the task is
        created, so the file never reaches the task. Call this after evidence is
        added to a moment: it idempotently copies any of the moment's
        file-bearing blocks the task's evidence document doesn't already have
        (matched by URL). Safe to call repeatedly. Returns blocks copied.
        """
        try:
            supabase = get_supabase_admin_client()
            tasks = supabase.table('user_quest_tasks') \
                .select('id, user_id, quest_id') \
                .eq('source_moment_id', moment_id) \
                .execute()
            if not tasks.data:
                return 0

            moment_blocks = supabase.table('learning_event_evidence_blocks') \
                .select('block_type, content, file_url, file_name, file_size, order_index') \
                .eq('learning_event_id', moment_id) \
                .order('order_index') \
                .execute()
            file_blocks = [
                b for b in (moment_blocks.data or [])
                if b.get('block_type') in ('image', 'video', 'document', 'audio', 'link')
                and ((b.get('content') or {}).get('url') or b.get('file_url'))
            ]
            if not file_blocks:
                return 0

            copied = 0
            for task in tasks.data:
                # Get or create the task's evidence document.
                doc = supabase.table('user_task_evidence_documents') \
                    .select('id') \
                    .eq('task_id', task['id']) \
                    .limit(1) \
                    .execute()
                if doc.data:
                    doc_id = doc.data[0]['id']
                else:
                    created = supabase.table('user_task_evidence_documents').insert({
                        'user_id': task['user_id'],
                        'quest_id': task['quest_id'],
                        'task_id': task['id'],
                        'status': 'draft',
                    }).execute()
                    if not created.data:
                        continue
                    doc_id = created.data[0]['id']

                existing = supabase.table('evidence_document_blocks') \
                    .select('content, order_index') \
                    .eq('document_id', doc_id) \
                    .execute()
                existing_urls = {(e.get('content') or {}).get('url') for e in (existing.data or [])}
                next_order = max([e.get('order_index', -1) for e in (existing.data or [])], default=-1) + 1

                to_insert = []
                for b in file_blocks:
                    content = dict(b.get('content') or {})
                    url = content.get('url') or b.get('file_url')
                    if not url or url in existing_urls:
                        continue
                    content['url'] = url
                    if b.get('file_name'):
                        content.setdefault('filename', b['file_name'])
                    if b.get('file_size'):
                        content.setdefault('file_size', b['file_size'])
                    to_insert.append({
                        'document_id': doc_id,
                        'block_type': b.get('block_type', 'document'),
                        'content': content,
                        'order_index': next_order,
                        'is_private': False,
                        'uploaded_by_user_id': task['user_id'],
                        'uploaded_by_role': 'student',
                    })
                    existing_urls.add(url)
                    next_order += 1

                if to_insert:
                    supabase.table('evidence_document_blocks').insert(to_insert).execute()
                    copied += len(to_insert)

            return copied
        except Exception as e:
            # Real data-sync failure (a promoted task silently misses its
            # evidence) — surface it to Sentry, not just the logs.
            from utils.error_reporting import report_error
            report_error(e, "sync_promoted_task_evidence failed", moment_id=moment_id)
            return 0

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
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

            # Get active quests with enrollment info
            # Active = is_active=true AND status='picked_up'
            response = supabase.table('user_quests') \
                .select('id, quest_id, quests(id, title, image_url, description, quest_type, transcript_subject, class_review_status)') \
                .eq('user_id', user_id) \
                .eq('is_active', True) \
                .eq('status', 'picked_up') \
                .execute()

            # Deduplicate by quest_id (there may be multiple enrollments)
            seen_quest_ids = set()
            quest_data = {}  # quest_id -> {quest info, enrollment id}

            for enrollment in (response.data or []):
                quest = enrollment.get('quests')
                # A credit-awarded class is complete (utils/quest_status) even
                # though its enrollment stays is_active=true; don't surface it as
                # an active journal topic. Matches the dashboard's active list.
                if is_class_credit_awarded(quest):
                    continue
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

            moment_counts = {}
            try:
                counts_response = supabase.rpc('count_moments_by_topic', {
                    'p_user_id': user_id,
                    'p_topic_type': 'quest'
                }).execute()
                for row in (counts_response.data or []):
                    if row['topic_id'] in quest_data:
                        moment_counts[row['topic_id']] = row['moment_count']
            except Exception as e:
                logger.warning(f"count_moments_by_topic RPC failed for quests: {e}")

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
                        'user_quest_id': user_quest_id,
                        # Needed so the journal can lock the diploma credit to a
                        # class's subject when adding a moment to it.
                        'quest_type': quest.get('quest_type'),
                        'transcript_subject': quest.get('transcript_subject')
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
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

            # Get interest tracks
            tracks_result = InterestTracksService.get_user_tracks(user_id)
            tracks = tracks_result.get('tracks', []) if tracks_result.get('success') else []

            # Get active quest topics (now includes course_topics)
            quests_result = InterestTracksService.get_active_quest_topics(user_id)
            quest_topics = quests_result.get('quest_topics', []) if quests_result.get('success') else []
            course_topics = quests_result.get('course_topics', []) if quests_result.get('success') else []

            track_moment_counts = {}
            if tracks:
                try:
                    counts_response = supabase.rpc('count_moments_by_topic', {
                        'p_user_id': user_id,
                        'p_topic_type': 'topic'
                    }).execute()
                    for row in (counts_response.data or []):
                        track_moment_counts[row['topic_id']] = row['moment_count']
                except Exception as e:
                    logger.warning(f"count_moments_by_topic RPC failed for tracks: {e}")

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
        topic_id: Optional[str],
        action: str = 'add'
    ) -> Dict[str, Any]:
        """
        Add or remove a topic assignment for a learning moment.

        Args:
            user_id: The requesting user
            moment_id: The moment to assign
            topic_type: 'track' or 'quest'
            topic_id: The topic ID (or None to unassign all of this type)
            action: 'add' to add topic, 'remove' to remove topic

        Returns:
            Dictionary with success status
        """
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

            # Verify moment ownership
            current_response = supabase.table('learning_events') \
                .select('id') \
                .eq('id', moment_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not current_response.data:
                return {
                    'success': False,
                    'error': 'Moment not found'
                }

            # Map topic_type to junction table type
            junction_type = 'topic' if topic_type == 'track' else 'quest'

            is_removal = (not topic_id) or (action == 'remove')

            if is_removal:
                # Adding a moment to a quest creates a task, so removing it from
                # the quest removes that task too. Block when the task was
                # already completed, so earned XP/credit isn't silently dropped.
                if junction_type == 'quest':
                    if topic_id:
                        quest_ids_to_clear = [topic_id]
                    else:
                        existing_links = supabase.table('learning_event_topics') \
                            .select('topic_id') \
                            .eq('learning_event_id', moment_id) \
                            .eq('topic_type', 'quest') \
                            .execute()
                        quest_ids_to_clear = [r['topic_id'] for r in (existing_links.data or [])]

                    cleared, err = InterestTracksService._remove_moment_quest_tasks(
                        supabase, user_id, moment_id, quest_ids_to_clear
                    )
                    if not cleared:
                        return {'success': False, 'error': err}

                delete_q = supabase.table('learning_event_topics') \
                    .delete() \
                    .eq('learning_event_id', moment_id) \
                    .eq('topic_type', junction_type)
                if topic_id:
                    delete_q = delete_q.eq('topic_id', topic_id)
                delete_q.execute()

            else:
                if topic_type == 'track':
                    track_response = supabase.table('interest_tracks') \
                        .select('id') \
                        .eq('id', topic_id) \
                        .eq('user_id', user_id) \
                        .single() \
                        .execute()
                    if not track_response.data:
                        return {'success': False, 'error': 'Track not found'}
                elif topic_type == 'quest':
                    enrollment_response = supabase.table('user_quests') \
                        .select('id') \
                        .eq('user_id', user_id) \
                        .eq('quest_id', topic_id) \
                        .eq('is_active', True) \
                        .eq('status', 'picked_up') \
                        .limit(1) \
                        .execute()
                    if not enrollment_response.data:
                        return {'success': False, 'error': 'Quest not found or not enrolled'}
                else:
                    return {'success': False, 'error': 'Invalid topic type'}

                try:
                    supabase.table('learning_event_topics').insert({
                        'learning_event_id': moment_id,
                        'topic_type': junction_type,
                        'topic_id': topic_id
                    }).execute()
                except Exception:
                    # Already-exists (unique constraint) is the expected
                    # collision when re-assigning to the same topic.
                    logger.debug("junction insert collision", exc_info=True)

            if junction_type == 'topic' and topic_id:
                from services.learning_events_service import LearningEventsService
                LearningEventsService._recalculate_track_moment_count(supabase, topic_id)

            # Return updated moment
            moment_response = supabase.table('learning_events') \
                .select('*') \
                .eq('id', moment_id) \
                .single() \
                .execute()

            return {
                'success': True,
                'moment': moment_response.data if moment_response.data else {}
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
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()
            logger.info(f"get_quest_moments called for quest_id={quest_id}, user_id={user_id}")

            # Verify user enrollment in quest (use limit 1 instead of single to handle duplicates)
            enrollment_response = supabase.table('user_quests') \
                .select('id, quests(id, title, description, image_url, quest_type, transcript_subject)') \
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

            # Get moments assigned to this quest via junction table RPC
            moments_response = supabase.rpc('get_moments_for_topic', {
                'p_user_id': user_id,
                'p_topic_type': 'quest',
                'p_topic_id': quest_id,
                'p_limit': limit,
                'p_offset': offset
            }).execute()

            logger.info(f"Moments query returned {len(moments_response.data or [])} items")

            moments = moments_response.data or []

            # Fetch evidence blocks for moments
            if moments:
                moment_ids = [m['id'] for m in moments]
                blocks_response = supabase.table('learning_event_evidence_blocks') \
                    .select('*') \
                    .in_('learning_event_id', moment_ids) \
                    .order('order_index') \
                    .execute()
                blocks_map = {}
                for block in (blocks_response.data or []):
                    eid = block['learning_event_id']
                    if eid not in blocks_map:
                        blocks_map[eid] = []
                    blocks_map[eid].append(block)
                for moment in moments:
                    moment['evidence_blocks'] = blocks_map.get(moment['id'], [])

                from services.learning_events_service import LearningEventsService
                LearningEventsService._enrich_events_with_topics(supabase, moments)
                LearningEventsService._enrich_events_with_promoted_task(supabase, moments)

            for moment in moments:
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

    DEFAULT_PROMOTED_TASK_XP = 50

    @staticmethod
    def _remove_moment_quest_tasks(supabase, user_id, moment_id, quest_ids):
        """Delete the tasks a moment created on the given quests.

        Returns (True, None) on success. Returns (False, message) if any such
        task has already been completed — the caller should abort the unassign
        so the student doesn't silently lose earned XP/credit.
        """
        if not quest_ids:
            return True, None

        tasks_resp = supabase.table('user_quest_tasks') \
            .select('id') \
            .eq('user_id', user_id) \
            .eq('source_moment_id', moment_id) \
            .in_('quest_id', quest_ids) \
            .execute()
        task_ids = [t['id'] for t in (tasks_resp.data or [])]
        if not task_ids:
            return True, None

        completed = supabase.table('quest_task_completions') \
            .select('user_quest_task_id') \
            .in_('user_quest_task_id', task_ids) \
            .limit(1) \
            .execute()
        if completed.data:
            return False, ("This moment's task is already completed. Remove the "
                           "completed task from the quest first, then unassign.")

        supabase.table('user_quest_tasks').delete().in_('id', task_ids).execute()
        return True, None

    @staticmethod
    def convert_moment_to_task(
        user_id: str,
        moment_id: str,
        quest_id: Optional[str] = None,
        title: Optional[str] = None,
        pillar: str = 'stem',
        xp_value: int = DEFAULT_PROMOTED_TASK_XP,
        diploma_subject: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Add a learning moment to a quest as a task (the single "Add to quest"
        action — there is no separate promote step).

        Creates the moment->quest journal link if missing, then an approved,
        incomplete task (50 XP default) with the moment's evidence pre-seeded.

        Args:
            user_id: The requesting user
            moment_id: The moment to add
            quest_id: Which quest to add it to. If omitted and the moment is
                already assigned to exactly one quest, that quest is used.
            title: Optional title override (uses moment title/description otherwise)
            pillar: Learning pillar for the task
            xp_value: XP value for the new task. Defaults to
                ``DEFAULT_PROMOTED_TASK_XP`` (50). Editable via
                ``PUT /api/tasks/<task_id>``.
            diploma_subject: Optional school-subject key (e.g. 'social_studies')
                the task's XP counts toward (100%). IGNORED and forced to the
                class's subject when the quest is a class. None = no diploma
                credit mapping (counts toward no subject until edited).
        """
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

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

            # Resolve the target quest. The "Add to quest" flow passes quest_id
            # explicitly; fall back to a sole existing assignment for callers
            # that pre-assigned. We no longer require the moment to be
            # pre-assigned — adding it to a quest creates that link below.
            if quest_id:
                resolved_quest_id = quest_id
            else:
                assigned_quests_resp = supabase.table('learning_event_topics') \
                    .select('topic_id') \
                    .eq('learning_event_id', moment_id) \
                    .eq('topic_type', 'quest') \
                    .execute()
                assigned_quest_ids = [r['topic_id'] for r in (assigned_quests_resp.data or [])]
                if len(assigned_quest_ids) == 1:
                    resolved_quest_id = assigned_quest_ids[0]
                elif len(assigned_quest_ids) == 0:
                    return {'success': False, 'error': 'No quest specified'}
                else:
                    return {'success': False, 'error': 'Specify which quest to add this to'}

            # `limit(1)` rather than `.single()` — a user can have more than
            # one enrollment row for the same quest, and `.single()` raises
            # PGRST116 in that case.
            enrollment_response = supabase.table('user_quests') \
                .select('id') \
                .eq('user_id', user_id) \
                .eq('quest_id', resolved_quest_id) \
                .limit(1) \
                .execute()

            if not enrollment_response.data:
                return {
                    'success': False,
                    'error': 'Not enrolled in this quest'
                }

            user_quest_id = enrollment_response.data[0]['id']

            # One task per moment+quest — don't create duplicates if the moment
            # was already added to this quest.
            existing_task = supabase.table('user_quest_tasks') \
                .select('id') \
                .eq('user_id', user_id) \
                .eq('quest_id', resolved_quest_id) \
                .eq('source_moment_id', moment_id) \
                .limit(1) \
                .execute()
            if existing_task.data:
                return {
                    'success': False,
                    'error': 'This moment is already on that quest'
                }

            # Resolve the diploma credit. A class quest forces its own subject
            # (100% of the task's XP), matching how all class tasks behave; a
            # regular quest uses the student's optional pick (may be None).
            quest_row = supabase.table('quests') \
                .select('quest_type, transcript_subject') \
                .eq('id', resolved_quest_id) \
                .single() \
                .execute()
            is_class = bool(quest_row.data and quest_row.data.get('quest_type') == 'class')
            if is_class:
                resolved_subject = quest_row.data.get('transcript_subject')
            else:
                resolved_subject = diploma_subject or None

            task_title = title
            if not task_title:
                task_title = moment.get('title') or moment.get('ai_generated_title')
            if not task_title:
                desc = moment.get('description', 'Learning moment task')
                task_title = desc[:100] + ('...' if len(desc) > 100 else '')

            # The moment's description and any attached evidence flow through
            # to the new task as evidence document content (NOT into the task's
            # description field). This way the student's original captured
            # content shows up where the advisor expects to see evidence.
            task_data = {
                'user_id': user_id,
                'quest_id': resolved_quest_id,
                'user_quest_id': user_quest_id,
                'title': task_title,
                'description': '',
                'pillar': pillar,
                'xp_value': xp_value,
                'is_required': False,
                'is_manual': True,
                # Auto-approved like directly-created manual tasks
                # (add_manual_tasks_batch): the student controls their own quest,
                # so the promoted task must be visible/completable immediately.
                # The quest detail endpoint only returns approval_status='approved'
                # tasks, so 'pending' here left promoted moments invisible.
                # The task lands incomplete with the moment's evidence pre-seeded;
                # the student completes it to earn XP. Credit review still happens
                # at credit-request time.
                'approval_status': 'approved',
                'source_moment_id': moment_id
            }

            # 100% of the task's XP counts toward the resolved diploma subject
            # (class subject when it's a class; the student's pick otherwise).
            # Left unset when no subject was resolved.
            if resolved_subject:
                task_data['subject_xp_distribution'] = {resolved_subject: xp_value}
                task_data['diploma_subjects'] = {resolved_subject: xp_value}

            task_response = supabase.table('user_quest_tasks').insert(task_data).execute()

            if not task_response.data:
                return {
                    'success': False,
                    'error': 'Failed to create task'
                }

            task = task_response.data[0]

            # Ensure the moment shows under this quest in the journal (and that
            # "View in quest" resolves). Insert the link if it isn't there yet;
            # a unique-constraint collision just means it already existed.
            try:
                supabase.table('learning_event_topics').insert({
                    'learning_event_id': moment_id,
                    'topic_type': 'quest',
                    'topic_id': resolved_quest_id
                }).execute()
            except Exception:
                logger.debug("quest junction link already present", exc_info=True)

            evidence_blocks = moment.get('learning_event_evidence_blocks', [])
            seeded = InterestTracksService._seed_task_evidence_from_moment(
                supabase=supabase,
                user_id=user_id,
                quest_id=resolved_quest_id,
                task_id=task['id'],
                moment_description=moment.get('description'),
                evidence_blocks=evidence_blocks,
            )
            logger.info(f"Seeded {seeded} evidence blocks on task {task['id']} from moment {moment_id}")

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
