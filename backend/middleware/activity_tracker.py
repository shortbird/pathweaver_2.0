"""
Activity tracking middleware for automatic request logging.
Lightweight, async-compatible, privacy-focused.

Features:
- Automatic request logging via Flask before/after request hooks
- Async event logging using ThreadPoolExecutor (non-blocking)
- Smart event classification (maps API endpoints to event types)
- Graceful failure handling (never crashes main requests)
- Session tracking with cookie-based session IDs
"""

from flask import request, g, make_response
import uuid
import atexit
from datetime import datetime
from database import get_supabase_admin_singleton
from utils.logger import get_logger
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, Any
import json

logger = get_logger(__name__)

# Thread pool for async event logging (prevents blocking requests)
executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="activity_tracker")


def _shutdown_activity_executor():
    """Shutdown thread pool on application exit."""
    logger.info("Shutting down activity tracker thread pool")
    executor.shutdown(wait=False)


atexit.register(_shutdown_activity_executor)


class ActivityTracker:
    """Tracks user activity events with minimal performance impact."""

    def __init__(self, app=None):
        self.app = app
        if app:
            self.init_app(app)

    def init_app(self, app):
        """Initialize middleware with Flask app."""
        app.before_request(self.before_request)
        app.after_request(self.after_request)

    def before_request(self):
        """Track request start time and session."""
        # Generate or reuse session ID from cookie
        session_id_cookie = request.cookies.get('session_id')
        if session_id_cookie:
            g.session_id = session_id_cookie
        else:
            # Generate new UUID (keep as string for cookie, will cast to UUID for DB)
            g.session_id = str(uuid.uuid4())

        g.request_start_time = datetime.utcnow()

    def after_request(self, response):
        """Log activity event after request completes."""
        # Skip tracking for certain paths
        if self._should_skip_tracking():
            return response

        # CRITICAL: If before_request didn't run (e.g., CSRF error), skip tracking
        # g.session_id is only set in before_request, so check for it first
        if not hasattr(g, 'session_id'):
            return response

        # Set session cookie if not already set
        if not request.cookies.get('session_id'):
            response.set_cookie(
                'session_id',
                g.session_id,
                max_age=30 * 24 * 60 * 60,  # 30 days
                httponly=True,
                secure=True,
                samesite='Lax'
            )

        # Calculate request duration
        duration_ms = self._calculate_duration()

        # Extract user ID from JWT token (if authenticated)
        # Check both g.user_id (old pattern) and request.user_id (new pattern from decorators)
        user_id = getattr(g, 'user_id', None) or getattr(request, 'user_id', None)

        # Determine event type and category
        event_type = self._classify_request(request, response)

        if event_type:
            # Log event asynchronously (non-blocking)
            executor.submit(
                self._log_event,
                user_id=user_id,
                session_id=g.session_id,
                event_type=event_type,
                event_data=self._extract_event_data(request, response),
                page_url=request.path,
                referrer_url=request.referrer,
                user_agent=request.headers.get('User-Agent'),
                duration_ms=duration_ms
            )

        return response

    def _should_skip_tracking(self) -> bool:
        """Determine if current request should be skipped for tracking."""
        # Skip static files
        if request.path.startswith('/static/'):
            return True

        # Skip health check endpoints
        if request.path in ['/api/health', '/health', '/']:
            return True

        # Skip CORS preflight requests
        if request.method == 'OPTIONS':
            return True

        # Skip activity tracking endpoint itself (prevent recursion)
        if request.path == '/api/activity/track':
            return True

        # Skip CSRF token endpoint
        if request.path == '/api/auth/csrf-token':
            return True

        return False

    def _calculate_duration(self) -> Optional[int]:
        """Calculate request duration in milliseconds."""
        if hasattr(g, 'request_start_time'):
            delta = datetime.utcnow() - g.request_start_time
            return int(delta.total_seconds() * 1000)
        return None

    def _classify_request(self, req, response) -> Optional[str]:
        """
        Map request to event type based on endpoint and method.
        Returns None if event should not be tracked.
        """
        path = req.path
        method = req.method
        status_code = response.status_code

        # Only track successful requests (2xx status codes) for most events
        is_success = 200 <= status_code < 300

        # Authentication events (track both success and failure)
        if '/auth/login' in path and method == 'POST':
            return 'login_success' if is_success else 'login_failed'
        elif '/auth/logout' in path and method == 'POST':
            return 'logout'
        elif '/auth/register' in path and method == 'POST':
            return 'registration_success' if is_success else 'registration_failed'

        # Only track successful requests beyond this point
        if not is_success:
            return None

        # Quest events
        if '/quests/' in path:
            if '/start' in path and method == 'POST':
                return 'quest_started'
            elif '/complete' in path and method == 'POST':
                return 'quest_completed'
            elif '/abandon' in path and method == 'POST':
                return 'quest_abandoned'
            elif '/progress' in path and method == 'GET':
                return 'quest_progress_checked'
            elif method == 'GET' and path.count('/') == 3:  # /api/quests/:id
                return 'quest_viewed'

        # Task events
        if '/tasks/' in path:
            if '/complete' in path and method == 'POST':
                return 'task_completed'
            elif method == 'GET':
                return 'task_viewed'

        # Badge events
        if '/badges/' in path:
            if '/select' in path and method == 'POST':
                return 'badge_claimed'
            elif method == 'GET' and path.count('/') == 3:  # /api/badges/:id
                return 'badge_viewed'

        # Evidence uploads
        if '/evidence' in path and method == 'POST':
            return 'evidence_uploaded'

        # AI Tutor events
        if '/tutor/' in path:
            if '/chat' in path and method == 'POST':
                return 'tutor_message_sent'
            elif '/conversations' in path and method == 'POST':
                return 'tutor_conversation_started'
            elif '/conversations' in path and method == 'GET':
                return 'tutor_opened'

        # Community events
        if '/community/' in path or '/friends' in path:
            if '/request' in path and method == 'POST':
                return 'connection_request_sent'
            elif '/accept' in path and method == 'PUT':
                return 'connection_accepted'
            elif '/decline' in path and method == 'DELETE':
                return 'connection_declined'

        # Profile events
        if '/profile' in path:
            if method == 'GET':
                return 'profile_viewed'
            elif method == 'PUT':
                return 'profile_updated'

        # Dashboard events
        if '/dashboard' in path and method == 'GET':
            return 'dashboard_viewed'

        # Portfolio/Diploma events
        if '/portfolio' in path or '/diploma' in path:
            return 'portfolio_viewed'

        # Parent dashboard events
        if '/parent/' in path:
            if '/dashboard' in path and method == 'GET':
                return 'parent_dashboard_opened'
            elif '/evidence' in path and method == 'POST':
                return 'parent_evidence_uploaded'

        # Generic GET requests to frontend routes (page views)
        if method == 'GET' and not path.startswith('/api/'):
            return 'page_view'

        return None

    def _extract_event_data(self, req, response) -> Dict[str, Any]:
        """Extract relevant event data from request and response."""
        event_data = {
            'method': req.method,
            'status_code': response.status_code
        }

        # Add query parameters (if any)
        if req.args:
            event_data['query_params'] = dict(req.args)

        # Extract IDs from path for context
        path_parts = req.path.split('/')
        if 'quests' in path_parts:
            try:
                quest_index = path_parts.index('quests') + 1
                if quest_index < len(path_parts) and path_parts[quest_index]:
                    event_data['quest_id'] = path_parts[quest_index]
            except (ValueError, IndexError):
                pass

        if 'tasks' in path_parts:
            try:
                task_index = path_parts.index('tasks') + 1
                if task_index < len(path_parts) and path_parts[task_index]:
                    event_data['task_id'] = path_parts[task_index]
            except (ValueError, IndexError):
                pass

        if 'badges' in path_parts:
            try:
                badge_index = path_parts.index('badges') + 1
                if badge_index < len(path_parts) and path_parts[badge_index]:
                    event_data['badge_id'] = path_parts[badge_index]
            except (ValueError, IndexError):
                pass

        return event_data

    def _log_event(
        self,
        user_id: Optional[str],
        session_id: str,
        event_type: str,
        event_data: Dict[str, Any],
        page_url: str,
        referrer_url: Optional[str],
        user_agent: Optional[str],
        duration_ms: Optional[int]
    ):
        """
        Insert event into database (runs in background thread).
        Never raises exceptions to prevent disrupting main request.
        """
        try:
            # Use singleton admin client for background thread (thread-safe)
            supabase = get_supabase_admin_singleton()

            event_category = self._categorize_event(event_type)

            # Cast session_id string to UUID for database
            # Database expects UUID type, but we use string for cookies
            insert_data = {
                'session_id': session_id,  # Supabase Python client handles UUID casting
                'event_type': event_type,
                'event_category': event_category,
                'event_data': event_data,
                'page_url': page_url,
                'referrer_url': referrer_url,
                'user_agent': user_agent,
                'duration_ms': duration_ms
            }

            # Only include user_id if present (NULL for anonymous)
            if user_id:
                insert_data['user_id'] = user_id

            supabase.table('user_activity_events').insert(insert_data).execute()

            # Process automation triggers (only for authenticated users)
            if user_id and event_type:
                self._process_automation_triggers(event_type, user_id, event_data)

        except Exception as e:
            # Never crash the main request if logging fails
            # Log error but continue silently
            logger.error(f"Activity tracking error for event {event_type}: {str(e)}", exc_info=True)

    def _categorize_event(self, event_type: str) -> str:
        """Map event type to high-level category."""
        if event_type.startswith('quest_'):
            return 'quest'
        elif event_type.startswith('task_'):
            return 'quest'
        elif event_type.startswith('badge_'):
            return 'badge'
        elif event_type.startswith('tutor_'):
            return 'tutor'
        elif event_type.startswith('connection_') or event_type.startswith('profile_'):
            return 'community'
        elif event_type.startswith('login_') or event_type.startswith('logout') or event_type.startswith('registration_'):
            return 'auth'
        elif event_type.startswith('parent_'):
            return 'parent'
        elif event_type in ['page_view', 'dashboard_viewed', 'portfolio_viewed']:
            return 'navigation'
        elif event_type.startswith('evidence_'):
            return 'quest'
        elif event_type.startswith('spark_') or event_type.startswith('lms_'):
            return 'lms'
        else:
            return 'other'

    def _process_automation_triggers(
        self,
        event_type: str,
        user_id: str,
        event_data: Dict[str, Any]
    ):
        """
        Process campaign automation triggers.

        SAFETY: Only processes ACTIVE campaigns and sequences.
        Runs in background thread, never crashes main request.

        Args:
            event_type: Type of event that occurred
            user_id: UUID of user who triggered event
            event_data: Additional event metadata
        """
        try:
            # Only process triggers if we're in a request context
            from flask import has_request_context
            if not has_request_context():
                logger.debug(f"Skipping automation trigger for '{event_type}' - no request context")
                return

            # Lazy import to avoid circular dependency
            from services.campaign_automation_service import CampaignAutomationService

            # Use lazy initialization - service created within request context
            def get_automation_service():
                return CampaignAutomationService()

            automation_service = get_automation_service()

            # Process trigger (service handles all safety checks)
            automation_service.process_event_trigger(
                event_type=event_type,
                user_id=user_id,
                metadata=event_data
            )

        except Exception as e:
            # Never crash main request if automation fails
            # Log error for debugging but continue silently
            logger.error(
                f"Campaign automation trigger error for event '{event_type}': {str(e)}",
                exc_info=True
            )


# Export singleton instance
activity_tracker = ActivityTracker()


def track_custom_event(
    event_type: str,
    event_data: Optional[Dict[str, Any]] = None,
    user_id: Optional[str] = None
):
    """
    Manually track a custom event (for use in service layer).

    Args:
        event_type: The type of event to track
        event_data: Optional dictionary of event-specific data
        user_id: Optional user ID (defaults to current user from g or request)
    """
    if not user_id:
        # Check both g.user_id (old pattern) and request.user_id (new pattern from decorators)
        user_id = getattr(g, 'user_id', None) or getattr(request, 'user_id', None)

    session_id = getattr(g, 'session_id', str(uuid.uuid4()))

    try:
        # Use singleton admin client (works in request context and background threads)
        supabase = get_supabase_admin_singleton()

        event_category = activity_tracker._categorize_event(event_type)

        insert_data = {
            'session_id': session_id,  # Supabase Python client handles UUID casting
            'event_type': event_type,
            'event_category': event_category,
            'event_data': event_data or {},
            'page_url': request.path if request else None,
            'referrer_url': request.referrer if request else None,
            'user_agent': request.headers.get('User-Agent') if request else None
        }

        # Only include user_id if present (NULL for anonymous)
        if user_id:
            insert_data['user_id'] = user_id

        supabase.table('user_activity_events').insert(insert_data).execute()

    except Exception as e:
        logger.error(f"Failed to track custom event {event_type}: {str(e)}", exc_info=True)
