"""
Learning Events Service
Handles business logic for spontaneous learning moment capture.

Topic assignment is exclusively through the learning_event_topics junction
table. A moment can be assigned to any number of interest tracks (topic_type =
'topic') and active quests (topic_type = 'quest').
"""
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from services.base_service import BaseService
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


class LearningEventsService(BaseService):
    """Service for managing learning events and their evidence"""

    @staticmethod
    def create_learning_event(
        user_id: str,
        description: str,
        title: Optional[str] = None,
        pillars: Optional[List[str]] = None,
        topics: Optional[List[Dict[str, str]]] = None,
        parent_moment_id: Optional[str] = None,
        source_type: str = 'realtime',
        estimated_duration_minutes: Optional[int] = None,
        ai_generated_title: Optional[str] = None,
        ai_suggested_pillars: Optional[List[str]] = None,
        event_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new learning event.

        Args:
            user_id: The user creating the event
            description: What the user learned/discovered
            title: Optional short title
            pillars: Optional list of pillar tags
            topics: Optional list of {type: 'topic'|'quest', id: uuid} for
                multi-topic assignment
            parent_moment_id: Optional parent moment for threading
            source_type: 'realtime' or 'retroactive'
            estimated_duration_minutes: Estimated time spent
            ai_generated_title: AI-suggested title
            ai_suggested_pillars: AI-suggested pillars
            event_date: Optional date when the event occurred (YYYY-MM-DD)
        """
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

            normalized_topics = LearningEventsService._normalize_topics(topics)

            event_data = {
                'user_id': user_id,
                'description': description,
                'title': title,
                'pillars': pillars or []
            }

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

            if not response.data:
                return {
                    'success': False,
                    'error': 'Failed to create learning event'
                }

            event = response.data[0]

            if normalized_topics:
                LearningEventsService._insert_junction_rows(supabase, event['id'], normalized_topics)
                for t in normalized_topics:
                    if t['type'] == 'topic':
                        LearningEventsService._recalculate_track_moment_count(supabase, t['id'])

            event['topics'] = normalized_topics

            return {
                'success': True,
                'event': event
            }

        except Exception as e:
            logger.error(f"Error creating learning event: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def _normalize_topics(topics: Optional[List[Dict[str, str]]]) -> List[Dict[str, str]]:
        """Strip topics down to {type, id} and drop entries missing an id."""
        if not topics:
            return []
        return [
            {'type': t['type'], 'id': t['id']}
            for t in topics
            if t.get('id') and t.get('type') in ('topic', 'quest')
        ]

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
        """Attach topics array with names from junction table to each event.

        Per-event errors are isolated so one bad row does not blank topics for
        every event in the batch.
        """
        if not events:
            return events
        for event in events:
            event.setdefault('topics', [])

        event_ids = [e['id'] for e in events]
        try:
            response = supabase.table('learning_event_topics') \
                .select('learning_event_id, topic_type, topic_id') \
                .in_('learning_event_id', event_ids) \
                .execute()
        except Exception as e:
            logger.warning(f"Failed to fetch junction rows for events: {e}")
            return events

        rows = response.data or []
        if not rows:
            return events

        track_ids = list({r['topic_id'] for r in rows if r['topic_type'] == 'topic'})
        quest_ids = list({r['topic_id'] for r in rows if r['topic_type'] == 'quest'})

        track_lookup = {}
        if track_ids:
            try:
                tracks_resp = supabase.table('interest_tracks') \
                    .select('id, name, color') \
                    .in_('id', track_ids) \
                    .execute()
                for t in (tracks_resp.data or []):
                    track_lookup[t['id']] = {'name': t['name'], 'color': t.get('color')}
            except Exception as e:
                logger.warning(f"Failed to fetch track names for enrichment: {e}")

        quest_lookup = {}
        if quest_ids:
            try:
                quests_resp = supabase.table('quests') \
                    .select('id, title') \
                    .in_('id', quest_ids) \
                    .execute()
                for q in (quests_resp.data or []):
                    quest_lookup[q['id']] = q['title']
            except Exception as e:
                logger.warning(f"Failed to fetch quest names for enrichment: {e}")

        topic_map: Dict[str, List[Dict]] = {}
        for row in rows:
            try:
                eid = row['learning_event_id']
                entry = {'type': row['topic_type'], 'id': row['topic_id']}
                if row['topic_type'] == 'topic' and row['topic_id'] in track_lookup:
                    entry['name'] = track_lookup[row['topic_id']]['name']
                    entry['color'] = track_lookup[row['topic_id']].get('color')
                elif row['topic_type'] == 'quest' and row['topic_id'] in quest_lookup:
                    entry['name'] = quest_lookup[row['topic_id']]
                topic_map.setdefault(eid, []).append(entry)
            except Exception as e:
                logger.warning(f"Skipping malformed junction row {row!r}: {e}")
                continue

        for event in events:
            event['topics'] = topic_map.get(event['id'], [])
        return events

    @staticmethod
    def _enrich_events_with_promoted_task(supabase, events: List[Dict]) -> List[Dict]:
        """Attach ``promoted_task`` = {id, quest_id, quest_title, title} to
        each event for which a quest task was promoted from this moment
        (``user_quest_tasks.source_moment_id``). When no such task exists,
        ``promoted_task`` is set to ``None``.
        """
        if not events:
            return events
        for event in events:
            event.setdefault('promoted_task', None)

        event_ids = [e['id'] for e in events]
        try:
            tasks_resp = supabase.table('user_quest_tasks') \
                .select('id, title, quest_id, source_moment_id') \
                .in_('source_moment_id', event_ids) \
                .execute()
        except Exception as e:
            logger.warning(f"Failed to fetch promoted tasks for events: {e}")
            return events

        rows = tasks_resp.data or []
        if not rows:
            return events

        quest_ids = list({r['quest_id'] for r in rows if r.get('quest_id')})
        quest_titles: Dict[str, str] = {}
        if quest_ids:
            try:
                quests_resp = supabase.table('quests') \
                    .select('id, title') \
                    .in_('id', quest_ids) \
                    .execute()
                quest_titles = {q['id']: q['title'] for q in (quests_resp.data or [])}
            except Exception as e:
                logger.warning(f"Failed to fetch quest titles for promoted tasks: {e}")

        # If multiple tasks were ever promoted from the same moment, surface
        # the most recently created one.
        promoted_by_moment: Dict[str, Dict] = {}
        for row in rows:
            mid = row.get('source_moment_id')
            if not mid:
                continue
            promoted_by_moment[mid] = {
                'id': row['id'],
                'title': row.get('title'),
                'quest_id': row.get('quest_id'),
                'quest_title': quest_titles.get(row.get('quest_id')),
            }

        for event in events:
            if event['id'] in promoted_by_moment:
                event['promoted_task'] = promoted_by_moment[event['id']]
        return events

    @staticmethod
    def _enrich_events_with_attached_task(supabase, events: List[Dict]) -> List[Dict]:
        """Attach `attached_task` = {id, title, pillar, xp_value, quest_id, quest_title}
        to each event that has attached_task_id set."""
        if not events:
            return events
        task_ids = list({e['attached_task_id'] for e in events if e.get('attached_task_id')})
        if not task_ids:
            for event in events:
                event['attached_task'] = None
            return events
        try:
            tasks_resp = supabase.table('user_quest_tasks') \
                .select('id, title, pillar, xp_value, quest_id') \
                .in_('id', task_ids) \
                .execute()
            tasks_by_id = {t['id']: t for t in (tasks_resp.data or [])}

            quest_ids = list({t['quest_id'] for t in tasks_by_id.values() if t.get('quest_id')})
            quest_titles = {}
            if quest_ids:
                quests_resp = supabase.table('quests') \
                    .select('id, title') \
                    .in_('id', quest_ids) \
                    .execute()
                quest_titles = {q['id']: q['title'] for q in (quests_resp.data or [])}

            for event in events:
                tid = event.get('attached_task_id')
                task = tasks_by_id.get(tid) if tid else None
                if task:
                    event['attached_task'] = {
                        'id': task['id'],
                        'title': task['title'],
                        'pillar': task['pillar'],
                        'xp_value': task.get('xp_value') or 0,
                        'quest_id': task.get('quest_id'),
                        'quest_title': quest_titles.get(task.get('quest_id')),
                    }
                else:
                    event['attached_task'] = None
        except Exception as e:
            logger.warning(f"Failed to enrich events with attached task: {e}")
            for event in events:
                event.setdefault('attached_task', None)
        return events

    @staticmethod
    def create_quick_moment(
        user_id: str,
        description: str,
        topics: Optional[List[Dict[str, str]]] = None,
        parent_moment_id: Optional[str] = None,
        event_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a quick learning moment with minimal fields. Designed for
        frictionless capture."""
        return LearningEventsService.create_learning_event(
            user_id=user_id,
            description=description,
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
        """Get all learning events for a user."""
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

            response = supabase.table('learning_events') \
                .select('*') \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()

            events = response.data or []

            for event in events:
                blocks_response = supabase.table('learning_event_evidence_blocks') \
                    .select('*') \
                    .eq('learning_event_id', event['id']) \
                    .order('order_index') \
                    .execute()
                event['evidence_blocks'] = blocks_response.data or []

            events = LearningEventsService._enrich_events_with_topics(supabase, events)
            events = LearningEventsService._enrich_events_with_attached_task(supabase, events)
            events = LearningEventsService._enrich_events_with_promoted_task(supabase, events)

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
        """Get a specific learning event with its evidence blocks."""
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

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

            blocks_response = supabase.table('learning_event_evidence_blocks') \
                .select('*') \
                .eq('learning_event_id', event_id) \
                .order('order_index') \
                .execute()

            event_data = event_response.data
            event_data['evidence_blocks'] = blocks_response.data or []

            LearningEventsService._enrich_events_with_topics(supabase, [event_data])
            LearningEventsService._enrich_events_with_attached_task(supabase, [event_data])
            LearningEventsService._enrich_events_with_promoted_task(supabase, [event_data])

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
        topics: Optional[List[Dict[str, str]]] = None,
        event_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update a learning event.

        If `topics` is provided (even as []), it is treated as a full
        replacement of the moment's topic assignments. If omitted, topic
        assignments are left untouched.
        """
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
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

            topics_changed = topics is not None
            new_topics = LearningEventsService._normalize_topics(topics) if topics_changed else None

            if not update_data and not topics_changed:
                return {
                    'success': False,
                    'error': 'No fields to update'
                }

            old_topic_track_ids: set = set()
            if topics_changed:
                old_junction = supabase.table('learning_event_topics') \
                    .select('topic_type, topic_id') \
                    .eq('learning_event_id', event_id) \
                    .execute()
                old_topic_track_ids = {
                    row['topic_id'] for row in (old_junction.data or [])
                    if row['topic_type'] == 'topic'
                }

            if not update_data:
                update_data['updated_at'] = datetime.utcnow().isoformat()

            response = supabase.table('learning_events') \
                .update(update_data) \
                .eq('id', event_id) \
                .eq('user_id', user_id) \
                .execute()

            if not response.data:
                # Zero rows updated means the event doesn't exist OR isn't owned by
                # this caller (the update is scoped to .eq('user_id', user_id)). That
                # is a not-found/permission case, not a server fault — the route maps
                # "not found" to 404. A parent/superadmin editing a CHILD's moment must
                # use PUT /children/<child_id>/learning-moments/<moment_id>, which is
                # scoped to the child; hitting this self endpoint for a child's row is
                # what surfaced as a spurious 500 (Sentry NODE-9).
                return {
                    'success': False,
                    'error': 'Learning event not found or access denied'
                }

            if topics_changed:
                supabase.table('learning_event_topics') \
                    .delete() \
                    .eq('learning_event_id', event_id) \
                    .execute()

                if new_topics:
                    LearningEventsService._insert_junction_rows(supabase, event_id, new_topics)

                new_topic_track_ids = {t['id'] for t in (new_topics or []) if t['type'] == 'topic'}
                for tid in (old_topic_track_ids | new_topic_track_ids):
                    LearningEventsService._recalculate_track_moment_count(supabase, tid)

            event = response.data[0]
            if topics_changed:
                event['topics'] = new_topics or []
            else:
                LearningEventsService._enrich_events_with_topics(supabase, [event])

            return {
                'success': True,
                'event': event
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
        """Delete a learning event and its evidence blocks."""
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

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

            try:
                blocks_response = supabase.table('learning_event_evidence_blocks') \
                    .select('content, file_url') \
                    .eq('learning_event_id', event_id) \
                    .execute()

                for block in (blocks_response.data or []):
                    file_url = block.get('file_url') or (block.get('content') or {}).get('url')
                    if file_url and 'supabase.co' in file_url:
                        try:
                            for bucket in ['user-uploads', 'quest-evidence']:
                                marker = f'/{bucket}/'
                                if marker in file_url:
                                    file_path = file_url.split(marker, 1)[1].split('?')[0]
                                    supabase.storage.from_(bucket).remove([file_path])
                                    break
                        except Exception as e:
                            logger.warning(f"Failed to delete storage file during event deletion: {e}")
            except Exception as e:
                logger.warning(f"Failed to fetch evidence blocks for storage cleanup: {e}")

            supabase.table('learning_events') \
                .delete() \
                .eq('id', event_id) \
                .eq('user_id', user_id) \
                .execute()

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
        """Save/update evidence blocks for a learning event."""
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

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

            supabase.table('learning_event_evidence_blocks') \
                .delete() \
                .eq('learning_event_id', event_id) \
                .execute()

            saved_blocks = []
            for block in blocks:
                block_data = {
                    'learning_event_id': event_id,
                    'block_type': block.get('block_type') or block.get('type'),
                    'content': block.get('content', {}),
                    'order_index': block.get('order_index', block.get('order', 0))
                }

                if block.get('file_url'):
                    block_data['file_url'] = block['file_url']
                if block.get('file_name'):
                    block_data['file_name'] = block['file_name']

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
        """Get learning events for public diploma view."""
        try:
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()

            events_response = supabase.table('learning_events') \
                .select('*') \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .execute()

            events = events_response.data or []

            for event in events:
                blocks_response = supabase.table('learning_event_evidence_blocks') \
                    .select('*') \
                    .eq('learning_event_id', event['id']) \
                    .order('order_index') \
                    .execute()
                event['evidence_blocks'] = blocks_response.data or []

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
