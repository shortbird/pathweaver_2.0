"""
Client-Side Activity Tracking Routes

Receives batched client-side events from the frontend tracking service.
Events include tab switches, button clicks, modal interactions, and
page navigation that cannot be captured by server-side middleware.

Security:
- Requires authentication (uses session cookie)
- Max 50 events per batch to prevent abuse
- Events are validated before insertion
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.logger import get_logger
from datetime import datetime
import uuid

logger = get_logger(__name__)

bp = Blueprint('activity', __name__, url_prefix='/api/activity')

# Valid client event types
VALID_EVENT_TYPES = {
    # Navigation events
    'tab_switched',
    'section_toggled',
    'modal_opened',
    'modal_closed',
    'page_navigation',

    # Interaction events
    'button_clicked',
    'form_started',
    'form_submitted',
    'form_abandoned',
    'search_performed',
    'filter_applied',

    # Engagement events
    'content_viewed',
    'content_scrolled',
    'page_time',

    # Feature usage
    'feature_used'
}

# Valid event categories
VALID_CATEGORIES = {
    'navigation',
    'interaction',
    'engagement',
    'feature',
    'client'  # fallback category
}


@bp.route('/track', methods=['POST'])
@require_auth
def track_client_events(user_id):
    """
    Receive batched client-side events.

    Request body:
    {
        "events": [
            {
                "event_type": "tab_switched",
                "event_category": "navigation",
                "event_data": {
                    "tab_name": "Progress",
                    "previous_tab": "Tasks",
                    "component": "QuestDetail"
                },
                "page_url": "/quests/123",
                "timestamp": "2025-12-30T15:30:00.000Z"
            }
        ]
    }

    Returns:
    {
        "success": true,
        "processed": 5
    }
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400

        events = data.get('events', [])

        if not events:
            return jsonify({'success': True, 'processed': 0})

        # Validate and limit batch size to prevent abuse
        if len(events) > 50:
            events = events[:50]
            logger.warning(f"Event batch exceeded limit, truncated to 50 events for user {user_id}")

        # Get session ID from cookie (set by activity_tracker middleware)
        session_id = request.cookies.get('session_id')
        if not session_id:
            # Generate new session ID if not present
            session_id = str(uuid.uuid4())

        supabase = get_supabase_admin_client()

        # Prepare records for bulk insert
        records = []
        for event in events:
            # Validate event type
            event_type = event.get('event_type', 'unknown')
            if event_type not in VALID_EVENT_TYPES:
                event_type = 'client_event'  # Fallback for unknown types

            # Validate category
            event_category = event.get('event_category', 'client')
            if event_category not in VALID_CATEGORIES:
                event_category = 'client'

            # Parse timestamp or use current time
            timestamp = event.get('timestamp')
            if timestamp:
                try:
                    # Validate ISO format
                    datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                except (ValueError, AttributeError):
                    timestamp = datetime.utcnow().isoformat()
            else:
                timestamp = datetime.utcnow().isoformat()

            # Sanitize event_data (remove any potentially sensitive fields)
            event_data = event.get('event_data', {})
            if isinstance(event_data, dict):
                # Remove any field that might contain passwords or tokens
                event_data = {
                    k: v for k, v in event_data.items()
                    if k.lower() not in ('password', 'token', 'secret', 'key', 'authorization')
                }
            else:
                event_data = {}

            record = {
                'user_id': user_id,
                'session_id': session_id,
                'event_type': event_type,
                'event_category': event_category,
                'event_data': event_data,
                'page_url': event.get('page_url', ''),
                'referrer_url': event.get('referrer_url'),
                'created_at': timestamp
            }
            records.append(record)

        # Bulk insert all events
        if records:
            supabase.table('user_activity_events').insert(records).execute()
            logger.debug(f"Tracked {len(records)} client events for user {user_id}")

        return jsonify({
            'success': True,
            'processed': len(records)
        })

    except Exception as e:
        logger.error(f"Error tracking client events: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to track events'
        }), 500
