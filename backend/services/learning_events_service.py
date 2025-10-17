"""
Learning Events Service
Handles business logic for spontaneous learning moment capture
"""
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from database import get_supabase_admin_client, get_user_client

logger = logging.getLogger(__name__)


class LearningEventsService:
    """Service for managing learning events and their evidence"""

    @staticmethod
    def create_learning_event(
        user_id: str,
        description: str,
        title: Optional[str] = None,
        pillars: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create a new learning event

        Args:
            user_id: The user creating the event
            description: What the user learned/discovered
            title: Optional short title
            pillars: Optional list of pillar tags

        Returns:
            Dictionary with success status and event data
        """
        try:
            supabase = get_user_client(user_id)

            event_data = {
                'user_id': user_id,
                'description': description,
                'title': title,
                'pillars': pillars or []
            }

            response = supabase.table('learning_events').insert(event_data).execute()

            if response.data and len(response.data) > 0:
                return {
                    'success': True,
                    'event': response.data[0]
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
            supabase = get_user_client(user_id)

            response = supabase.table('learning_events') \
                .select('*') \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()

            return {
                'success': True,
                'events': response.data or []
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
            supabase = get_user_client(user_id)

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
        pillars: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Update a learning event

        Args:
            user_id: The user making the request
            event_id: The event ID to update
            description: Updated description
            title: Updated title
            pillars: Updated pillar tags

        Returns:
            Dictionary with success status and updated event data
        """
        try:
            supabase = get_user_client(user_id)

            update_data = {}
            if description is not None:
                update_data['description'] = description
            if title is not None:
                update_data['title'] = title
            if pillars is not None:
                update_data['pillars'] = pillars

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
            supabase = get_user_client(user_id)

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
            supabase = get_user_client(user_id)

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
