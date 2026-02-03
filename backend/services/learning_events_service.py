"""
Learning Events Service
Handles business logic for spontaneous learning moment capture
"""
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from services.base_service import BaseService
from database import get_supabase_admin_client, get_user_client

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)


class LearningEventsService(BaseService):
    """Service for managing learning events and their evidence"""

    @staticmethod
    def create_learning_event(
        user_id: str,
        description: str,
        title: Optional[str] = None,
        pillars: Optional[List[str]] = None,
        track_id: Optional[str] = None,
        quest_id: Optional[str] = None,
        parent_moment_id: Optional[str] = None,
        source_type: str = 'realtime',
        estimated_duration_minutes: Optional[int] = None,
        ai_generated_title: Optional[str] = None,
        ai_suggested_pillars: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create a new learning event

        Args:
            user_id: The user creating the event
            description: What the user learned/discovered
            title: Optional short title
            pillars: Optional list of pillar tags
            track_id: Optional interest track ID (mutually exclusive with quest_id)
            quest_id: Optional quest ID to link moment to (mutually exclusive with track_id)
            parent_moment_id: Optional parent moment for threading
            source_type: 'realtime' or 'retroactive'
            estimated_duration_minutes: Estimated time spent
            ai_generated_title: AI-suggested title
            ai_suggested_pillars: AI-suggested pillars

        Returns:
            Dictionary with success status and event data
        """
        try:
            # Admin client: Auth verified by decorator (ADR-002, Rule 3)
            supabase = get_supabase_admin_client()

            event_data = {
                'user_id': user_id,
                'description': description,
                'title': title,
                'pillars': pillars or []
            }

            # Add optional fields if provided
            # Note: track_id and quest_id are mutually exclusive (enforced by DB constraint)
            if track_id:
                event_data['track_id'] = track_id
            if quest_id:
                event_data['quest_id'] = quest_id
            if parent_moment_id:
                event_data['parent_moment_id'] = parent_moment_id
            if source_type in ['realtime', 'retroactive']:
                event_data['source_type'] = source_type
            if estimated_duration_minutes is not None:
                event_data['estimated_duration_minutes'] = estimated_duration_minutes
            if ai_generated_title:
                event_data['ai_generated_title'] = ai_generated_title
            if ai_suggested_pillars:
                event_data['ai_suggested_pillars'] = ai_suggested_pillars

            response = supabase.table('learning_events').insert(event_data).execute()

            if response.data and len(response.data) > 0:
                event = response.data[0]

                # Update track moment count if track assigned
                if track_id:
                    LearningEventsService._increment_track_moment_count(track_id)

                return {
                    'success': True,
                    'event': event
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to create learning event'
                }

        except Exception as e:
            logger.error(f"Error creating learning event: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def _increment_track_moment_count(track_id: str):
        """Increment the moment_count for a track."""
        try:
            supabase = get_supabase_admin_client()
            supabase.rpc('increment_track_moment_count', {'track_id': track_id}).execute()
        except Exception as e:
            logger.warning(f"Failed to increment track moment count: {e}")

    @staticmethod
    def create_quick_moment(
        user_id: str,
        description: str,
        track_id: Optional[str] = None,
        quest_id: Optional[str] = None,
        parent_moment_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a quick learning moment with minimal fields.
        Designed for frictionless capture.

        Args:
            user_id: The user creating the event
            description: What the user learned/discovered
            track_id: Optional interest track ID (mutually exclusive with quest_id)
            quest_id: Optional quest ID (mutually exclusive with track_id)
            parent_moment_id: Optional parent moment for threading

        Returns:
            Dictionary with success status and event data
        """
        return LearningEventsService.create_learning_event(
            user_id=user_id,
            description=description,
            track_id=track_id,
            quest_id=quest_id,
            parent_moment_id=parent_moment_id,
            source_type='realtime'
        )

    @staticmethod
    def get_user_learning_events(
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get all learning events for a user

        Args:
            user_id: The user whose events to fetch
            limit: Maximum number of events to return
            offset: Pagination offset

        Returns:
            Dictionary with success status and events list
        """
        try:
            # Admin client: Auth verified by decorator (ADR-002, Rule 3)
            supabase = get_supabase_admin_client()

            # Fetch events
            response = supabase.table('learning_events') \
                .select('*') \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()

            events = response.data or []

            # Fetch evidence blocks for each event
            for event in events:
                blocks_response = supabase.table('learning_event_evidence_blocks') \
                    .select('*') \
                    .eq('learning_event_id', event['id']) \
                    .order('order_index') \
                    .execute()

                event['evidence_blocks'] = blocks_response.data or []

            return {
                'success': True,
                'events': events
            }

        except Exception as e:
            logger.error(f"Error fetching learning events: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'events': []
            }

    @staticmethod
    def get_learning_event_with_evidence(
        user_id: str,
        event_id: str
    ) -> Dict[str, Any]:
        """
        Get a specific learning event with its evidence blocks

        Args:
            user_id: The user making the request
            event_id: The event ID to fetch

        Returns:
            Dictionary with success status and event data with evidence
        """
        try:
            # Admin client: Auth verified by decorator (ADR-002, Rule 3)
            supabase = get_supabase_admin_client()

            # Fetch event
            event_response = supabase.table('learning_events') \
                .select('*') \
                .eq('id', event_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not event_response.data:
                return {
                    'success': False,
                    'error': 'Learning event not found'
                }

            # Fetch evidence blocks
            blocks_response = supabase.table('learning_event_evidence_blocks') \
                .select('*') \
                .eq('learning_event_id', event_id) \
                .order('order_index') \
                .execute()

            event_data = event_response.data
            event_data['evidence_blocks'] = blocks_response.data or []

            return {
                'success': True,
                'event': event_data
            }

        except Exception as e:
            logger.error(f"Error fetching learning event: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def update_learning_event(
        user_id: str,
        event_id: str,
        description: Optional[str] = None,
        title: Optional[str] = None,
        pillars: Optional[List[str]] = None,
        track_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update a learning event

        Args:
            user_id: The user making the request
            event_id: The event ID to update
            description: Updated description
            title: Updated title
            pillars: Updated pillar tags
            track_id: Updated track assignment (use empty string to unassign)

        Returns:
            Dictionary with success status and updated event data
        """
        try:
            from database import get_supabase_admin_client
            supabase = get_supabase_admin_client()

            update_data = {}
            if description is not None:
                update_data['description'] = description
            if title is not None:
                update_data['title'] = title
            if pillars is not None:
                update_data['pillars'] = pillars

            # Handle track_id assignment
            # track_id can be: None (no change), empty string (unassign), or a UUID (assign)
            track_changed = False
            old_track_id = None
            new_track_id = None

            if track_id is not None:
                # Get current track assignment to update counts
                current_response = supabase.table('learning_events') \
                    .select('track_id') \
                    .eq('id', event_id) \
                    .eq('user_id', user_id) \
                    .single() \
                    .execute()

                if current_response.data:
                    old_track_id = current_response.data.get('track_id')
                    # Empty string or explicit None means unassign
                    new_track_id = track_id if track_id else None
                    if old_track_id != new_track_id:
                        track_changed = True
                        update_data['track_id'] = new_track_id

            if not update_data:
                return {
                    'success': False,
                    'error': 'No fields to update'
                }

            response = supabase.table('learning_events') \
                .update(update_data) \
                .eq('id', event_id) \
                .eq('user_id', user_id) \
                .execute()

            if response.data and len(response.data) > 0:
                # Update track moment counts if track changed
                if track_changed:
                    if old_track_id:
                        try:
                            supabase.rpc('decrement_track_moment_count', {'track_id': old_track_id}).execute()
                        except Exception as e:
                            logger.warning(f"Failed to decrement old track count: {e}")
                    if new_track_id:
                        try:
                            supabase.rpc('increment_track_moment_count', {'track_id': new_track_id}).execute()
                        except Exception as e:
                            logger.warning(f"Failed to increment new track count: {e}")

                return {
                    'success': True,
                    'event': response.data[0]
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to update learning event'
                }

        except Exception as e:
            logger.error(f"Error updating learning event: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def delete_learning_event(
        user_id: str,
        event_id: str
    ) -> Dict[str, Any]:
        """
        Delete a learning event and its evidence blocks

        Args:
            user_id: The user making the request
            event_id: The event ID to delete

        Returns:
            Dictionary with success status
        """
        try:
            from database import get_supabase_admin_client
            supabase = get_supabase_admin_client()

            # Verify ownership first
            check = supabase.table('learning_events') \
                .select('id') \
                .eq('id', event_id) \
                .eq('user_id', user_id) \
                .execute()

            if not check.data:
                return {
                    'success': False,
                    'error': 'Event not found or access denied'
                }

            # Delete event (cascade will handle evidence blocks)
            response = supabase.table('learning_events') \
                .delete() \
                .eq('id', event_id) \
                .eq('user_id', user_id) \
                .execute()

            return {
                'success': True,
                'message': 'Learning event deleted successfully'
            }

        except Exception as e:
            logger.error(f"Error deleting learning event: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def save_evidence_blocks(
        user_id: str,
        event_id: str,
        blocks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Save/update evidence blocks for a learning event

        Args:
            user_id: The user making the request
            event_id: The event ID
            blocks: List of evidence block data

        Returns:
            Dictionary with success status and saved blocks
        """
        try:
            # Admin client: Auth verified by decorator (ADR-002, Rule 3)
            supabase = get_supabase_admin_client()

            # Verify event ownership
            event_response = supabase.table('learning_events') \
                .select('id') \
                .eq('id', event_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not event_response.data:
                return {
                    'success': False,
                    'error': 'Learning event not found or access denied'
                }

            # Delete existing blocks
            supabase.table('learning_event_evidence_blocks') \
                .delete() \
                .eq('learning_event_id', event_id) \
                .execute()

            # Insert new blocks
            saved_blocks = []
            for block in blocks:
                block_data = {
                    'learning_event_id': event_id,
                    'block_type': block.get('block_type') or block.get('type'),
                    'content': block.get('content', {}),
                    'order_index': block.get('order_index', block.get('order', 0))
                }

                response = supabase.table('learning_event_evidence_blocks') \
                    .insert(block_data) \
                    .execute()

                if response.data and len(response.data) > 0:
                    saved_blocks.append(response.data[0])

            return {
                'success': True,
                'blocks': saved_blocks
            }

        except Exception as e:
            logger.error(f"Error saving evidence blocks: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def get_public_learning_events(
        user_id: str,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Get learning events for public diploma view

        Args:
            user_id: The user whose events to display
            limit: Maximum number of events to return

        Returns:
            Dictionary with success status and public events data
        """
        try:
            # Use admin client for public access
            supabase = get_supabase_admin_client()

            # Fetch events with evidence blocks
            events_response = supabase.table('learning_events') \
                .select('*') \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .execute()

            events = events_response.data or []

            # Fetch evidence blocks for each event
            for event in events:
                blocks_response = supabase.table('learning_event_evidence_blocks') \
                    .select('*') \
                    .eq('learning_event_id', event['id']) \
                    .order('order_index') \
                    .execute()

                event['evidence_blocks'] = blocks_response.data or []

            return {
                'success': True,
                'events': events
            }

        except Exception as e:
            logger.error(f"Error fetching public learning events: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'events': []
            }
