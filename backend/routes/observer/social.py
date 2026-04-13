"""
Observer Module - Social Features

Views, reactions, and completion comments.
"""

from flask import request, jsonify
from datetime import datetime, timedelta, timezone
import logging

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit
from services.notification_service import NotificationService

logger = logging.getLogger(__name__)

VALID_TARGET_TYPES = ('completion', 'learning_event', 'bounty_claim')


def register_routes(bp):
    """Register routes on the blueprint."""

    @bp.route('/api/observers/feed/record-views', methods=['POST'])
    @require_auth
    def record_feed_views(user_id):
        """
        Record that the current user has viewed feed items.
        Called by the frontend when feed items appear in the viewport.

        Request body:
            items: list of { type: 'task_completed'|'learning_moment', id: string }

        Returns:
            200: Views recorded
        """
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Request body required'}), 400

            items = data.get('items', [])
            if not items:
                return jsonify({'success': True, 'recorded': 0}), 200

            supabase = get_supabase_admin_client()
            recorded = 0

            for item in items:
                item_type = item.get('type')
                item_id = item.get('id', '').replace('le_', '').replace('tc_', '')

                # Strip block suffix (composite IDs like "uuid_uuid")
                if '_' in item_id:
                    item_id = item_id.split('_')[0]

                if not item_id:
                    continue

                try:
                    if item_type == 'task_completed':
                        supabase.table('feed_item_views').upsert({
                            'viewer_id': user_id,
                            'completion_id': item_id,
                        }, on_conflict='viewer_id,completion_id').execute()
                    elif item_type == 'learning_moment':
                        supabase.table('feed_item_views').upsert({
                            'viewer_id': user_id,
                            'learning_event_id': item_id,
                        }, on_conflict='viewer_id,learning_event_id').execute()
                    else:
                        continue
                    recorded += 1
                except Exception as e:
                    logger.debug(f"Failed to record view for {item_type}/{item_id}: {e}")

            return jsonify({'success': True, 'recorded': recorded}), 200

        except Exception as e:
            logger.error(f"Failed to record feed views: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to record views'}), 500


    @bp.route('/api/observers/views/<target_type>/<target_id>', methods=['GET'])
    @require_auth
    def get_feed_item_viewers(user_id, target_type, target_id):
        """
        Get list of users who have viewed a feed item.

        Args:
            target_type: 'completion' or 'learning_event'
            target_id: UUID of the target

        Returns:
            200: { viewers: [...], total: int }
        """
        if target_type not in ('completion', 'learning_event'):
            return jsonify({'error': 'Invalid target_type'}), 400

        try:
            supabase = get_supabase_admin_client()

            col = 'completion_id' if target_type == 'completion' else 'learning_event_id'

            views = supabase.table('feed_item_views') \
                .select('viewer_id, viewed_at, users:viewer_id(id, display_name, first_name, last_name, avatar_url)') \
                .eq(col, target_id) \
                .order('viewed_at', desc=True) \
                .execute()

            viewers = []
            for v in (views.data or []):
                user_info = v.get('users', {})
                viewers.append({
                    'id': v['viewer_id'],
                    'display_name': user_info.get('display_name') or
                        f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip() or 'User',
                    'avatar_url': user_info.get('avatar_url'),
                    'viewed_at': v['viewed_at'],
                })

            return jsonify({
                'success': True,
                'viewers': viewers,
                'total': len(viewers),
            }), 200

        except Exception as e:
            logger.error(f"Failed to get viewers: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to get viewers'}), 500


    @bp.route('/api/observers/learning-events/<learning_event_id>/comments', methods=['GET'])
    @require_auth
    @validate_uuid_param('learning_event_id')
    def get_learning_event_comments(user_id, learning_event_id):
        """
        Get comments on a specific learning event

        Args:
            user_id: UUID of authenticated user (from @require_auth)
            learning_event_id: UUID of learning event

        Returns:
            200: List of comments
            403: Access denied
            404: Learning event not found
        """

        try:
            supabase = get_supabase_admin_client()

            # Get learning event info
            learning_event = supabase.table('learning_events') \
                .select('user_id') \
                .eq('id', learning_event_id) \
                .single() \
                .execute()

            if not learning_event.data:
                return jsonify({'error': 'Learning event not found'}), 404

            student_id = learning_event.data['user_id']

            # Verify access (student themselves, observer, superadmin, advisor, or parent)
            if user_id != student_id:
                has_access = False

                # Check if superadmin
                user_result = supabase.table('users').select('role').eq('id', user_id).single().execute()
                user_role = user_result.data.get('role') if user_result.data else None
                if user_role == 'superadmin':
                    has_access = True

                # Check observer_student_links
                if not has_access:
                    link = supabase.table('observer_student_links') \
                        .select('id') \
                        .eq('observer_id', user_id) \
                        .eq('student_id', student_id) \
                        .execute()
                    has_access = bool(link.data)

                # Check advisor_student_assignments
                if not has_access and user_role == 'advisor':
                    advisor_link = supabase.table('advisor_student_assignments') \
                        .select('id') \
                        .eq('advisor_id', user_id) \
                        .eq('student_id', student_id) \
                        .eq('is_active', True) \
                        .execute()
                    has_access = bool(advisor_link.data)

                # Check if parent (dependents)
                if not has_access:
                    dependent = supabase.table('users') \
                        .select('id') \
                        .eq('id', student_id) \
                        .eq('managed_by_parent_id', user_id) \
                        .execute()
                    has_access = bool(dependent.data)

                # Check parent_student_links
                if not has_access:
                    parent_link = supabase.table('parent_student_links') \
                        .select('id') \
                        .eq('parent_user_id', user_id) \
                        .eq('student_user_id', student_id) \
                        .eq('status', 'approved') \
                        .execute()
                    has_access = bool(parent_link.data)

                if not has_access:
                    return jsonify({'error': 'Access denied'}), 403

            # Get comments for this learning event
            comments = supabase.table('observer_comments') \
                .select('*') \
                .eq('learning_event_id', learning_event_id) \
                .order('created_at', desc=False) \
                .execute()

            # Get observer details
            observer_ids = list(set([c['observer_id'] for c in comments.data]))
            comments_data = comments.data

            if observer_ids:
                observers = supabase.table('users') \
                    .select('id, first_name, last_name, display_name, avatar_url') \
                    .in_('id', observer_ids) \
                    .execute()

                observer_map = {obs['id']: obs for obs in observers.data}

                for comment in comments_data:
                    comment['observer'] = observer_map.get(comment['observer_id'], {})

            return jsonify({'comments': comments_data}), 200

        except Exception as e:
            logger.error(f"Failed to fetch learning event comments: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch comments'}), 500


    @bp.route('/api/observers/completions/<completion_id>/comments', methods=['GET'])
    @require_auth
    @validate_uuid_param('completion_id')
    def get_completion_comments(user_id, completion_id):
        """
        Get comments on a specific task completion

        Args:
            user_id: UUID of authenticated user (from @require_auth)
            completion_id: UUID of task completion

        Returns:
            200: List of comments
            403: Access denied
        """

        try:
            supabase = get_supabase_admin_client()

            # Get completion info
            completion = supabase.table('quest_task_completions') \
                .select('user_id') \
                .eq('id', completion_id) \
                .single() \
                .execute()

            if not completion.data:
                return jsonify({'error': 'Completion not found'}), 404

            student_id = completion.data['user_id']

            # Verify access (student themselves, observer, superadmin, or advisor)
            if user_id != student_id:
                has_access = False

                # Check if superadmin (superadmins have full access)
                user_result = supabase.table('users').select('role').eq('id', user_id).single().execute()
                user_role = user_result.data.get('role') if user_result.data else None
                if user_role == 'superadmin':
                    has_access = True

                # Check observer_student_links
                if not has_access:
                    link = supabase.table('observer_student_links') \
                        .select('id') \
                        .eq('observer_id', user_id) \
                        .eq('student_id', student_id) \
                        .execute()

                    if link.data:
                        has_access = True

                # Check advisor_student_assignments for advisors
                if not has_access and user_role == 'advisor':
                    advisor_link = supabase.table('advisor_student_assignments') \
                        .select('id') \
                        .eq('advisor_id', user_id) \
                        .eq('student_id', student_id) \
                        .eq('is_active', True) \
                        .execute()
                    if advisor_link.data:
                        has_access = True

                if not has_access:
                    return jsonify({'error': 'Access denied'}), 403

            # Get comments
            comments = supabase.table('observer_comments') \
                .select('*') \
                .eq('task_completion_id', completion_id) \
                .order('created_at', desc=False) \
                .execute()

            # Get observer details
            observer_ids = list(set([c['observer_id'] for c in comments.data]))
            comments_data = comments.data

            if observer_ids:
                observers = supabase.table('users') \
                    .select('id, first_name, last_name, display_name, avatar_url') \
                    .in_('id', observer_ids) \
                    .execute()

                observer_map = {obs['id']: obs for obs in observers.data}

                for comment in comments_data:
                    comment['observer'] = observer_map.get(comment['observer_id'], {})

            return jsonify({'comments': comments_data}), 200

        except Exception as e:
            logger.error(f"Failed to fetch completion comments: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch comments'}), 500
