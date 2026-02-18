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
        topics: Optional[List[Dict[str, str]]] = None,
        parent_moment_id: Optional[str] = None,
        source_type: str = 'realtime',
        estimated_duration_minutes: Optional[int] = None,
        ai_generated_title: Optional[str] = None,
        ai_suggested_pillars: Optional[List[str]] = None,
        event_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new learning event

        Args:
            user_id: The user creating the event
            description: What the user learned/discovered
            title: Optional short title
            pillars: Optional list of pillar tags
            track_id: Optional interest track ID (legacy, use topics instead)
            quest_id: Optional quest ID (legacy, use topics instead)
            topics: Optional list of {type: 'topic'|'quest', id: uuid} for multi-topic assignment
            parent_moment_id: Optional parent moment for threading
            source_type: 'realtime' or 'retroactive'
            estimated_duration_minutes: Estimated time spent
            ai_generated_title: AI-suggested title
            ai_suggested_pillars: AI-suggested pillars

        Returns:
            Dictionary with success status and event data
        """
        try:
            supabase = get_supabase_admin_client()

            # Normalize topics: convert legacy track_id/quest_id to topics array
            resolved_topics = LearningEventsService._resolve_topics(topics, track_id, quest_id)

            event_data = {
                'user_id': user_id,
                'description': description,
                'title': title,
                'pillars': pillars or []
            }

            # Dual-write: set legacy columns from first topic/quest for backward compat
            first_topic = next((t for t in resolved_topics if t['type'] == 'topic'), None)
            first_quest = next((t for t in resolved_topics if t['type'] == 'quest'), None)
            if first_topic:
                event_data['track_id'] = first_topic['id']
            if first_quest:
                event_data['quest_id'] = first_quest['id']

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
            if event_date:
                event_data['event_date'] = event_date

            response = supabase.table('learning_events').insert(event_data).execute()

            if response.data and len(response.data) > 0:
                event = response.data[0]

                # Insert junction table rows
                if resolved_topics:
                    LearningEventsService._insert_junction_rows(supabase, event['id'], resolved_topics)

                # Update moment_count for each topic
                for t in resolved_topics:
                    if t['type'] == 'topic':
                        LearningEventsService._recalculate_track_moment_count(supabase, t['id'])

                # Attach topics to response
                event['topics'] = resolved_topics

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
    def _resolve_topics(
        topics: Optional[List[Dict[str, str]]],
        track_id: Optional[str] = None,
        quest_id: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """Convert legacy track_id/quest_id params to a topics list, or return topics as-is."""
        if topics:
            return [{'type': t['type'], 'id': t['id']} for t in topics if t.get('id')]
        result = []
        if track_id:
            result.append({'type': 'topic', 'id': track_id})
        if quest_id:
            result.append({'type': 'quest', 'id': quest_id})
        return result

    @staticmethod
    def _insert_junction_rows(supabase, event_id: str, topics: List[Dict[str, str]]):
        """Insert rows into learning_event_topics junction table."""
        rows = [
            {
                'learning_event_id': event_id,
                'topic_type': t['type'],
                'topic_id': t['id']
            }
            for t in topics if t.get('id')
        ]
        if rows:
            supabase.table('learning_event_topics').insert(rows).execute()

    @staticmethod
    def _recalculate_track_moment_count(supabase, track_id: str):
        """Recalculate moment_count for a topic track using junction table."""
        try:
            supabase.rpc('recalculate_track_moment_count', {'p_track_id': track_id}).execute()
        except Exception as e:
            logger.warning(f"Failed to recalculate track moment count: {e}")

    @staticmethod
    def _enrich_events_with_topics(supabase, events: List[Dict]) -> List[Dict]:
        """Attach topics array with names from junction table to each event."""
        if not events:
            return events
        event_ids = [e['id'] for e in events]
        try:
            response = supabase.table('learning_event_topics') \
                .select('learning_event_id, topic_type, topic_id') \
                .in_('learning_event_id', event_ids) \
                .execute()

            rows = response.data or []
            if not rows:
                for event in events:
                    event['topics'] = []
                return events

            # Collect unique topic/quest IDs for name lookup
            track_ids = list({r['topic_id'] for r in rows if r['topic_type'] == 'topic'})
            quest_ids = list({r['topic_id'] for r in rows if r['topic_type'] == 'quest'})

            # Batch fetch names
            track_names = {}
            if track_ids:
                tracks_resp = supabase.table('interest_tracks') \
                    .select('id, name, color') \
                    .in_('id', track_ids) \
                    .execute()
                for t in (tracks_resp.data or []):
                    track_names[t['id']] = {'name': t['name'], 'color': t.get('color')}

            quest_names = {}
            if quest_ids:
                quests_resp = supabase.table('quests') \
                    .select('id, title') \
                    .in_('id', quest_ids) \
                    .execute()
                for q in (quests_resp.data or []):
                    quest_names[q['id']] = q['title']

            # Group by event with names
            topic_map = {}
            for row in rows:
                eid = row['learning_event_id']
                if eid not in topic_map:
                    topic_map[eid] = []
                entry = {
                    'type': row['topic_type'],
                    'id': row['topic_id']
                }
                if row['topic_type'] == 'topic' and row['topic_id'] in track_names:
                    entry['name'] = track_names[row['topic_id']]['name']
                    entry['color'] = track_names[row['topic_id']].get('color')
                elif row['topic_type'] == 'quest' and row['topic_id'] in quest_names:
                    entry['name'] = quest_names[row['topic_id']]
                topic_map[eid].append(entry)

            for event in events:
                event['topics'] = topic_map.get(event['id'], [])
        except Exception as e:
            logger.warning(f"Failed to enrich events with topics: {e}")
            for event in events:
                event['topics'] = []
        return events

    @staticmethod
    def create_quick_moment(
        user_id: str,
        description: str,
        track_id: Optional[str] = None,
        quest_id: Optional[str] = None,
        topics: Optional[List[Dict[str, str]]] = None,
        parent_moment_id: Optional[str] = None,
        event_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a quick learning moment with minimal fields.
        Designed for frictionless capture.

        Args:
            user_id: The user creating the event
            description: What the user learned/discovered
            track_id: Optional interest track ID (legacy, use topics instead)
            quest_id: Optional quest ID (legacy, use topics instead)
            topics: Optional list of {type, id} for multi-topic assignment
            parent_moment_id: Optional parent moment for threading
            event_date: Optional date when the event occurred (YYYY-MM-DD)

        Returns:
            Dictionary with success status and event data
        """
        return LearningEventsService.create_learning_event(
            user_id=user_id,
            description=description,
            track_id=track_id,
            quest_id=quest_id,
            topics=topics,
            parent_moment_id=parent_moment_id,
            source_type='realtime',
            event_date=event_date
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

            # Enrich with topics from junction table
            events = LearningEventsService._enrich_events_with_topics(supabase, events)

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

            # Enrich with topics from junction table
            LearningEventsService._enrich_events_with_topics(supabase, [event_data])

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
        track_id: Optional[str] = None,
        topics: Optional[List[Dict[str, str]]] = None,
        event_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update a learning event

        Args:
            user_id: The user making the request
            event_id: The event ID to update
            description: Updated description
            title: Updated title
            pillars: Updated pillar tags
            track_id: Updated track assignment (legacy, use topics instead)
            topics: Full replacement list of {type: 'topic'|'quest', id} or None to leave unchanged

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
            if event_date is not None:
                update_data['event_date'] = event_date

            # Determine if topics are being changed
            topics_changed = False
            new_topics = None

            if topics is not None:
                # New multi-topic API: full replacement
                topics_changed = True
                new_topics = [{'type': t['type'], 'id': t['id']} for t in topics if t.get('id')]
            elif track_id is not None:
                # Legacy single-topic API: convert to topics array
                topics_changed = True
                if track_id:
                    new_topics = [{'type': 'topic', 'id': track_id}]
                else:
                    new_topics = []  # Unassign all

            if topics_changed:
                # Dual-write legacy columns
                first_topic = next((t for t in (new_topics or []) if t['type'] == 'topic'), None)
                first_quest = next((t for t in (new_topics or []) if t['type'] == 'quest'), None)
                update_data['track_id'] = first_topic['id'] if first_topic else None
                update_data['quest_id'] = first_quest['id'] if first_quest else None

            if not update_data and not topics_changed:
                return {
                    'success': False,
                    'error': 'No fields to update'
                }

            # Get old topics for moment_count recalculation
            old_topic_track_ids = set()
            if topics_changed:
                old_junction = supabase.table('learning_event_topics') \
                    .select('topic_type, topic_id') \
                    .eq('learning_event_id', event_id) \
                    .execute()
                old_topic_track_ids = {
                    row['topic_id'] for row in (old_junction.data or [])
                    if row['topic_type'] == 'topic'
                }

            # Update the event row (always update something to confirm ownership)
            if not update_data:
                update_data['updated_at'] = datetime.utcnow().isoformat()

            response = supabase.table('learning_events') \
                .update(update_data) \
                .eq('id', event_id) \
                .eq('user_id', user_id) \
                .execute()

            if response.data and len(response.data) > 0:
                if topics_changed and new_topics is not None:
                    # Replace junction rows: delete old, insert new
                    supabase.table('learning_event_topics') \
                        .delete() \
                        .eq('learning_event_id', event_id) \
                        .execute()

                    if new_topics:
                        LearningEventsService._insert_junction_rows(supabase, event_id, new_topics)

                    # Recalculate moment_count for affected topic tracks
                    new_topic_track_ids = {t['id'] for t in new_topics if t['type'] == 'topic'}
                    all_affected = old_topic_track_ids | new_topic_track_ids
                    for tid in all_affected:
                        LearningEventsService._recalculate_track_moment_count(supabase, tid)

                event = response.data[0]
                event['topics'] = new_topics if topics_changed else []
                # Re-enrich if topics weren't changed (so caller gets current state)
                if not topics_changed:
                    LearningEventsService._enrich_events_with_topics(supabase, [event])

                return {
                    'success': True,
                    'event': event
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

            # Get topic track IDs before delete so we can recalculate counts
            affected_track_ids = []
            try:
                junction_response = supabase.table('learning_event_topics') \
                    .select('topic_type, topic_id') \
                    .eq('learning_event_id', event_id) \
                    .execute()
                affected_track_ids = [
                    row['topic_id'] for row in (junction_response.data or [])
                    if row['topic_type'] == 'topic'
                ]
            except Exception as e:
                logger.warning(f"Failed to fetch junction rows before delete: {e}")

            # Delete event (cascade will handle evidence blocks and junction rows)
            response = supabase.table('learning_events') \
                .delete() \
                .eq('id', event_id) \
                .eq('user_id', user_id) \
                .execute()

            # Recalculate moment_count for affected tracks
            for tid in affected_track_ids:
                LearningEventsService._recalculate_track_moment_count(supabase, tid)

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

            # Enrich with topics from junction table
            events = LearningEventsService._enrich_events_with_topics(supabase, events)

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
