"""
Observer Module - Social Features

Likes and completion comments.
"""

from flask import request, jsonify
from datetime import datetime, timedelta
import logging

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit

logger = logging.getLogger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/api/observers/completions/<completion_id>/like', methods=['POST'])
    @require_auth
    @validate_uuid_param('completion_id')
    def toggle_like(user_id, completion_id):
        """
        Observer toggles like on a task completion

        Args:
            user_id: UUID of authenticated user (from @require_auth)
            completion_id: UUID of task completion

        Returns:
            200: Like status toggled
            403: No access to this completion
        """
        observer_id = user_id

        try:
            supabase = get_supabase_admin_client()

            # Get the completion and verify access
            completion = supabase.table('quest_task_completions') \
                .select('user_id, is_confidential') \
                .eq('id', completion_id) \
                .single() \
                .execute()

            if not completion.data:
                return jsonify({'error': 'Completion not found'}), 404

            if completion.data['is_confidential']:
                return jsonify({'error': 'Cannot like confidential content'}), 403

            # Verify observer has access to this student
            student_id = completion.data['user_id']
            has_access = False

            # Check if superadmin (superadmins have full access)
            user_result = supabase.table('users').select('role').eq('id', observer_id).single().execute()
            user_role = user_result.data.get('role') if user_result.data else None
            if user_role == 'superadmin':
                has_access = True

            # Check observer_student_links
            if not has_access:
                link = supabase.table('observer_student_links') \
                    .select('id') \
                    .eq('observer_id', observer_id) \
                    .eq('student_id', student_id) \
                    .execute()
                has_access = bool(link.data)

            # Check advisor_student_assignments for advisors
            if not has_access and user_role == 'advisor':
                advisor_link = supabase.table('advisor_student_assignments') \
                    .select('id') \
                    .eq('advisor_id', observer_id) \
                    .eq('student_id', student_id) \
                    .eq('is_active', True) \
                    .execute()
                has_access = bool(advisor_link.data)

            if not has_access:
                return jsonify({'error': 'Access denied'}), 403

            # Check if already liked
            try:
                existing = supabase.table('observer_likes') \
                    .select('id') \
                    .eq('observer_id', observer_id) \
                    .eq('completion_id', completion_id) \
                    .execute()
            except Exception as table_error:
                logger.error(f"observer_likes table may not exist: {table_error}")
                return jsonify({'error': 'Likes feature is not available. Please run the database migration.'}), 503

            if existing.data:
                # Unlike
                supabase.table('observer_likes') \
                    .delete() \
                    .eq('id', existing.data[0]['id']) \
                    .execute()

                logger.info(f"Observer unliked completion: observer={observer_id}, completion={completion_id}")
                return jsonify({'liked': False, 'status': 'unliked'}), 200
            else:
                # Like
                supabase.table('observer_likes').insert({
                    'observer_id': observer_id,
                    'completion_id': completion_id
                }).execute()

                logger.info(f"Observer liked completion: observer={observer_id}, completion={completion_id}")
                return jsonify({'liked': True, 'status': 'liked'}), 200

        except Exception as e:
            logger.error(f"Failed to toggle like: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to toggle like'}), 500


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
                logger.info(f"get_completion_comments: user_id={user_id}, student_id={student_id}, user_role={user_role}")
                if user_role == 'superadmin':
                    has_access = True
                    logger.info(f"get_completion_comments: superadmin access granted")

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
