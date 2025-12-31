"""
Journey Aggregation Service

Aggregates user activity events into journey flows for visualization.
A journey is a sequence of events within a session that tells the story
of how a user navigated through the platform.

Features:
- Session-based event grouping
- Journey flow data for visualization (nodes/edges)
- Summary statistics (most visited pages, patterns)
- Date range filtering
"""

from database import get_supabase_admin_client
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from collections import defaultdict
from utils.logger import get_logger

logger = get_logger(__name__)


class JourneyAggregationService:
    """Aggregates user activity into journey flows."""

    def __init__(self):
        self.supabase = get_supabase_admin_client()

    def get_user_journey(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get aggregated journey data for a user.

        Args:
            user_id: User UUID
            start_date: Start of date range (default: 7 days ago)
            end_date: End of date range (default: now)
            session_id: Filter to specific session

        Returns:
            {
                "sessions": [
                    {
                        "session_id": "uuid",
                        "start_time": "2025-12-30T...",
                        "end_time": "2025-12-30T...",
                        "duration_ms": 45000,
                        "events_count": 15,
                        "journey_steps": [
                            {
                                "step": 1,
                                "event_type": "login_success",
                                "event_category": "auth",
                                "page": "/login",
                                "page_label": "Login",
                                "timestamp": "...",
                                "duration_ms": 1200,
                                "details": {...}
                            }
                        ]
                    }
                ],
                "summary": {
                    "total_sessions": 5,
                    "avg_session_duration_ms": 30000,
                    "most_visited_pages": [{"page": "/dashboard", "visits": 10}],
                    "common_journey_patterns": [{"pattern": "login -> dashboard", "count": 3}]
                }
            }
        """
        try:
            # Default date range: last 7 days
            if not end_date:
                end_date = datetime.utcnow()
            if not start_date:
                start_date = end_date - timedelta(days=7)

            # Query events
            query = self.supabase.table('user_activity_events').select(
                'id, session_id, event_type, event_category, event_data, page_url, duration_ms, created_at'
            ).eq('user_id', user_id).gte(
                'created_at', start_date.isoformat()
            ).lte(
                'created_at', end_date.isoformat()
            ).order('created_at', desc=False)

            if session_id:
                query = query.eq('session_id', session_id)

            response = query.limit(1000).execute()
            events = response.data or []

            # Extract entity IDs for enrichment
            entity_names = self._fetch_entity_names(events)

            # Group by session
            sessions_map = defaultdict(list)
            for event in events:
                sid = event.get('session_id')
                if sid:
                    sessions_map[sid].append(event)

            # Build journey for each session
            sessions = []
            for sid, session_events in sessions_map.items():
                if not session_events:
                    continue

                journey_steps = []
                for i, event in enumerate(session_events):
                    page_url = event.get('page_url', '')
                    page_label = self._get_page_label(page_url, event.get('event_data', {}), entity_names)

                    step = {
                        'step': i + 1,
                        'event_type': event.get('event_type'),
                        'event_category': event.get('event_category'),
                        'page': page_url,
                        'page_label': page_label,
                        'timestamp': event.get('created_at'),
                        'duration_ms': event.get('duration_ms'),
                        'details': event.get('event_data', {})
                    }
                    journey_steps.append(step)

                # Calculate session metrics
                first_event = session_events[0]
                last_event = session_events[-1]

                session_data = {
                    'session_id': sid,
                    'start_time': first_event.get('created_at'),
                    'end_time': last_event.get('created_at'),
                    'events_count': len(session_events),
                    'journey_steps': journey_steps
                }

                # Calculate duration from timestamps
                try:
                    start = datetime.fromisoformat(first_event.get('created_at').replace('Z', '+00:00'))
                    end = datetime.fromisoformat(last_event.get('created_at').replace('Z', '+00:00'))
                    session_data['duration_ms'] = int((end - start).total_seconds() * 1000)
                except Exception:
                    session_data['duration_ms'] = 0

                sessions.append(session_data)

            # Sort sessions by start time (most recent first)
            sessions.sort(key=lambda x: x['start_time'] or '', reverse=True)

            # Calculate summary
            summary = self._calculate_journey_summary(sessions, events)

            return {
                'sessions': sessions[:20],  # Limit to 20 most recent
                'summary': summary
            }

        except Exception as e:
            logger.error(f"Error getting user journey: {str(e)}")
            raise

    def get_journey_flow_data(
        self,
        user_id: str,
        session_id: str
    ) -> Dict[str, Any]:
        """
        Get flow diagram data for a specific session.
        Returns nodes and edges for visualization.

        Returns:
            {
                "nodes": [
                    {"id": "/dashboard", "label": "Dashboard", "event_type": "page_view", "count": 1}
                ],
                "edges": [
                    {"source": "/login", "target": "/dashboard", "duration_ms": 1200}
                ]
            }
        """
        journey = self.get_user_journey(user_id, session_id=session_id)

        if not journey['sessions']:
            return {'nodes': [], 'edges': []}

        session = journey['sessions'][0]
        steps = session.get('journey_steps', [])

        nodes_map = {}
        edges = []

        for i, step in enumerate(steps):
            # Create node ID from page or event type
            node_id = step.get('page') or step.get('event_type')
            if not node_id:
                continue

            # Track node
            if node_id not in nodes_map:
                nodes_map[node_id] = {
                    'id': node_id,
                    'label': self._format_node_label(node_id),
                    'event_type': step.get('event_type'),
                    'event_category': step.get('event_category'),
                    'count': 0
                }
            nodes_map[node_id]['count'] += 1

            # Create edge to next step
            if i < len(steps) - 1:
                next_step = steps[i + 1]
                next_node_id = next_step.get('page') or next_step.get('event_type')
                if next_node_id:
                    edges.append({
                        'source': node_id,
                        'target': next_node_id,
                        'duration_ms': step.get('duration_ms', 0)
                    })

        return {
            'nodes': list(nodes_map.values()),
            'edges': edges
        }

    def _calculate_journey_summary(
        self,
        sessions: List[Dict],
        events: List[Dict]
    ) -> Dict[str, Any]:
        """Calculate summary statistics for journey data."""
        if not sessions:
            return {
                'total_sessions': 0,
                'avg_session_duration_ms': 0,
                'most_visited_pages': [],
                'common_journey_patterns': []
            }

        # Calculate averages
        total_duration = sum(s.get('duration_ms', 0) for s in sessions)
        avg_duration = total_duration // len(sessions) if sessions else 0

        # Count page visits
        page_counts = defaultdict(int)
        for event in events:
            page = event.get('page_url')
            if page:
                page_counts[page] += 1

        # Sort by visit count
        most_visited = sorted(
            page_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )[:10]

        # Identify common patterns (first 3 event types per session)
        patterns = defaultdict(int)
        for session in sessions:
            steps = session.get('journey_steps', [])[:3]
            pattern = ' -> '.join(
                self._format_node_label(s.get('page') or s.get('event_type', ''))
                for s in steps
                if s.get('page') or s.get('event_type')
            )
            if pattern:
                patterns[pattern] += 1

        common_patterns = sorted(
            [{'pattern': k, 'count': v} for k, v in patterns.items()],
            key=lambda x: x['count'],
            reverse=True
        )[:5]

        return {
            'total_sessions': len(sessions),
            'avg_session_duration_ms': avg_duration,
            'most_visited_pages': [{'page': p, 'visits': c} for p, c in most_visited],
            'common_journey_patterns': common_patterns
        }

    def _format_node_label(self, node_id: str) -> str:
        """Format node ID into human-readable label."""
        if not node_id:
            return 'Unknown'

        if node_id.startswith('/'):
            # URL path - extract meaningful part
            parts = node_id.strip('/').split('/')
            if not parts or parts[0] == '':
                return 'Home'
            # Take last meaningful part
            last_part = parts[-1] if parts[-1] else parts[-2] if len(parts) > 1 else 'Home'
            # Remove UUIDs (36 chars with dashes)
            if len(last_part) == 36 and '-' in last_part:
                last_part = parts[-2] if len(parts) > 1 else 'Detail'
            return last_part.replace('-', ' ').title()

        # Event type - convert snake_case to Title Case
        return node_id.replace('_', ' ').title()

    def _fetch_entity_names(self, events: List[Dict]) -> Dict[str, Dict[str, str]]:
        """
        Fetch quest, course, and badge names for URL enrichment.
        Returns dict with entity_type -> {id: name} mappings.
        """
        import re

        quest_ids = set()
        course_ids = set()
        badge_ids = set()

        # UUID pattern
        uuid_pattern = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.I)

        for event in events:
            page_url = event.get('page_url', '')
            event_data = event.get('event_data', {})

            # Extract from URL path
            if '/quests/' in page_url:
                match = uuid_pattern.search(page_url.split('/quests/')[1] if '/quests/' in page_url else '')
                if match:
                    quest_ids.add(match.group())

            if '/courses/' in page_url:
                match = uuid_pattern.search(page_url.split('/courses/')[1] if '/courses/' in page_url else '')
                if match:
                    course_ids.add(match.group())

            if '/badges/' in page_url:
                match = uuid_pattern.search(page_url.split('/badges/')[1] if '/badges/' in page_url else '')
                if match:
                    badge_ids.add(match.group())

            # Extract from event_data
            if event_data.get('quest_id'):
                quest_ids.add(event_data['quest_id'])
            if event_data.get('course_id'):
                course_ids.add(event_data['course_id'])
            if event_data.get('badge_id'):
                badge_ids.add(event_data['badge_id'])

        result = {'quests': {}, 'courses': {}, 'badges': {}}

        # Fetch quest names
        if quest_ids:
            try:
                quests = self.supabase.table('quests').select('id, title').in_('id', list(quest_ids)).execute()
                result['quests'] = {q['id']: q['title'] for q in (quests.data or [])}
            except Exception as e:
                logger.warning(f"Failed to fetch quest names: {e}")

        # Fetch course names
        if course_ids:
            try:
                courses = self.supabase.table('courses').select('id, title').in_('id', list(course_ids)).execute()
                result['courses'] = {c['id']: c['title'] for c in (courses.data or [])}
            except Exception as e:
                logger.warning(f"Failed to fetch course names: {e}")

        # Fetch badge names
        if badge_ids:
            try:
                badges = self.supabase.table('badges').select('id, name').in_('id', list(badge_ids)).execute()
                result['badges'] = {b['id']: b['name'] for b in (badges.data or [])}
            except Exception as e:
                logger.warning(f"Failed to fetch badge names: {e}")

        return result

    def _get_page_label(
        self,
        page_url: str,
        event_data: Dict,
        entity_names: Dict[str, Dict[str, str]]
    ) -> str:
        """
        Generate a human-readable label for a page URL.
        Uses entity names where available.
        """
        import re

        if not page_url:
            return 'Unknown'

        # UUID pattern for extraction
        uuid_pattern = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.I)

        # Check for quest pages
        if '/quests/' in page_url:
            match = uuid_pattern.search(page_url.split('/quests/')[1])
            if match:
                quest_id = match.group()
                quest_name = entity_names.get('quests', {}).get(quest_id)
                if quest_name:
                    # Determine sub-section
                    if '/curriculum' in page_url:
                        return f"{quest_name} (Curriculum)"
                    elif '/progress' in page_url:
                        return f"{quest_name} (Progress)"
                    elif '/tasks' in page_url:
                        return f"{quest_name} (Tasks)"
                    return quest_name

        # Check for course pages
        if '/courses/' in page_url:
            match = uuid_pattern.search(page_url.split('/courses/')[1])
            if match:
                course_id = match.group()
                course_name = entity_names.get('courses', {}).get(course_id)
                if course_name:
                    return course_name

        # Check for badge pages
        if '/badges/' in page_url:
            match = uuid_pattern.search(page_url.split('/badges/')[1])
            if match:
                badge_id = match.group()
                badge_name = entity_names.get('badges', {}).get(badge_id)
                if badge_name:
                    return badge_name

        # Fallback to simple path-based label
        return self._format_node_label(page_url)
