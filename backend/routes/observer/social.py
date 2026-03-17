"""
Observer Module - Social Features

Likes, reactions, and completion comments.
"""

from flask import request, jsonify
from datetime import datetime, timedelta, timezone
import logging

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit
from services.notification_service import NotificationService

logger = logging.getLogger(__name__)

VALID_REACTION_TYPES = ('proud', 'mind_blown', 'inspired', 'love_it', 'curious')
VALID_TARGET_TYPES = ('completion', 'learning_event', 'bounty_claim')


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

                # Notify parents of the student (don't notify if the liker is the parent)
                try:
                    notification_service = NotificationService(supabase=supabase)
                    parents = notification_service.get_parents_for_student(student_id)
                    logger.info(f"[toggle_like] Found {len(parents)} parents for student {student_id[:8]}, observer={observer_id[:8]}")

                    if parents:
                        # Get observer name
                        observer = supabase.table('users') \
                            .select('display_name, first_name, last_name') \
                            .eq('id', observer_id) \
                            .single() \
                            .execute()
                        observer_name = observer.data.get('display_name') or \
                            f"{observer.data.get('first_name', '')} {observer.data.get('last_name', '')}".strip() or \
                            'Someone'

                        # Get student name
                        student = supabase.table('users') \
                            .select('display_name, first_name') \
                            .eq('id', student_id) \
                            .single() \
                            .execute()
                        student_name = student.data.get('display_name') or \
                            student.data.get('first_name') or 'your child'

                        # Get task title from completion
                        task_completion = supabase.table('quest_task_completions') \
                            .select('task_id, user_quest_tasks(title)') \
                            .eq('id', completion_id) \
                            .single() \
                            .execute()
                        task_data = task_completion.data.get('user_quest_tasks', {}) if task_completion.data else {}
                        item_title = task_data.get('title') or 'a task' if task_data else 'a task'

                        for parent in parents:
                            # Don't notify if the parent is the one who liked
                            if parent['id'] != observer_id:
                                logger.info(f"[toggle_like] Sending notification to parent {parent['id'][:8]}")
                                notification_service.notify_parent_observer_like(
                                    parent_user_id=parent['id'],
                                    observer_name=observer_name,
                                    student_name=student_name,
                                    item_title=item_title,
                                    student_id=student_id,
                                    organization_id=parent.get('organization_id')
                                )
                            else:
                                logger.info(f"[toggle_like] Skipping self-notification for parent {parent['id'][:8]}")
                    else:
                        logger.info(f"[toggle_like] No parents found to notify")

                    # Also notify the student (unless they liked their own work)
                    if student_id != observer_id:
                        student_user = supabase.table('users').select('organization_id').eq('id', student_id).single().execute()
                        notification_service.notify_student_like(
                            student_id=student_id,
                            observer_name=observer_name,
                            item_title=item_title,
                            organization_id=student_user.data.get('organization_id') if student_user.data else None
                        )
                        logger.info(f"[toggle_like] Sent notification to student {student_id[:8]}")
                except Exception as notify_error:
                    # Don't fail the like if notification fails
                    logger.error(f"Failed to send like notification: {notify_error}", exc_info=True)

                return jsonify({'liked': True, 'status': 'liked'}), 200

        except Exception as e:
            logger.error(f"Failed to toggle like: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to toggle like'}), 500


    @bp.route('/api/observers/learning-events/<learning_event_id>/like', methods=['POST'])
    @require_auth
    @validate_uuid_param('learning_event_id')
    def toggle_learning_event_like(user_id, learning_event_id):
        """
        Observer toggles like on a learning event (moment)

        Args:
            user_id: UUID of authenticated user (from @require_auth)
            learning_event_id: UUID of learning event

        Returns:
            200: Like status toggled
            403: No access to this learning event
            404: Learning event not found
        """
        observer_id = user_id

        try:
            supabase = get_supabase_admin_client()

            # Get the learning event and verify access
            learning_event = supabase.table('learning_events') \
                .select('user_id') \
                .eq('id', learning_event_id) \
                .single() \
                .execute()

            if not learning_event.data:
                return jsonify({'error': 'Learning event not found'}), 404

            # Verify observer has access to this student
            student_id = learning_event.data['user_id']
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

            # Check if user is parent of the student (dependents)
            if not has_access:
                dependent = supabase.table('users') \
                    .select('id') \
                    .eq('id', student_id) \
                    .eq('managed_by_parent_id', observer_id) \
                    .execute()
                has_access = bool(dependent.data)

            # Check parent_student_links for linked students
            if not has_access:
                parent_link = supabase.table('parent_student_links') \
                    .select('id') \
                    .eq('parent_user_id', observer_id) \
                    .eq('student_user_id', student_id) \
                    .eq('status', 'approved') \
                    .execute()
                has_access = bool(parent_link.data)

            if not has_access:
                return jsonify({'error': 'Access denied'}), 403

            # Check if already liked
            try:
                existing = supabase.table('observer_likes') \
                    .select('id') \
                    .eq('observer_id', observer_id) \
                    .eq('learning_event_id', learning_event_id) \
                    .execute()
            except Exception as table_error:
                logger.error(f"observer_likes table may not support learning_event_id: {table_error}")
                return jsonify({'error': 'Likes feature for learning moments is not available. Please run the database migration.'}), 503

            if existing.data:
                # Unlike
                supabase.table('observer_likes') \
                    .delete() \
                    .eq('id', existing.data[0]['id']) \
                    .execute()

                logger.info(f"Observer unliked learning event: observer={observer_id}, learning_event={learning_event_id}")
                return jsonify({'liked': False, 'status': 'unliked'}), 200
            else:
                # Like
                supabase.table('observer_likes').insert({
                    'observer_id': observer_id,
                    'learning_event_id': learning_event_id
                }).execute()

                logger.info(f"Observer liked learning event: observer={observer_id}, learning_event={learning_event_id}")

                # Notify parents of the student (don't notify if the liker is the parent)
                try:
                    notification_service = NotificationService(supabase=supabase)
                    parents = notification_service.get_parents_for_student(student_id)

                    if parents:
                        # Get observer name
                        observer = supabase.table('users') \
                            .select('display_name, first_name, last_name') \
                            .eq('id', observer_id) \
                            .single() \
                            .execute()
                        observer_name = observer.data.get('display_name') or \
                            f"{observer.data.get('first_name', '')} {observer.data.get('last_name', '')}".strip() or \
                            'Someone'

                        # Get student name
                        student = supabase.table('users') \
                            .select('display_name, first_name') \
                            .eq('id', student_id) \
                            .single() \
                            .execute()
                        student_name = student.data.get('display_name') or \
                            student.data.get('first_name') or 'your child'

                        # Get learning event title
                        event = supabase.table('learning_events') \
                            .select('title, description') \
                            .eq('id', learning_event_id) \
                            .single() \
                            .execute()
                        item_title = (event.data.get('title') or event.data.get('description', '')[:50] or 'a learning moment') if event.data else 'a learning moment'

                        for parent in parents:
                            # Don't notify if the parent is the one who liked
                            if parent['id'] != observer_id:
                                notification_service.notify_parent_observer_like(
                                    parent_user_id=parent['id'],
                                    observer_name=observer_name,
                                    student_name=student_name,
                                    item_title=item_title,
                                    student_id=student_id,
                                    organization_id=parent.get('organization_id')
                                )

                    # Also notify the student (unless they liked their own work)
                    if student_id != observer_id:
                        student_user = supabase.table('users').select('organization_id').eq('id', student_id).single().execute()
                        notification_service.notify_student_like(
                            student_id=student_id,
                            observer_name=observer_name,
                            item_title=item_title,
                            organization_id=student_user.data.get('organization_id') if student_user.data else None
                        )
                        logger.info(f"[toggle_learning_event_like] Sent notification to student {student_id[:8]}")
                except Exception as notify_error:
                    # Don't fail the like if notification fails
                    logger.error(f"Failed to send like notification: {notify_error}")

                return jsonify({'liked': True, 'status': 'liked'}), 200

        except Exception as e:
            logger.error(f"Failed to toggle learning event like: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to toggle like'}), 500


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


    # ──────────────────────────────────────────
    # Observer Reactions (March 2026 - Mobile app)
    # ──────────────────────────────────────────

    @bp.route('/api/observers/react', methods=['POST'])
    @require_auth
    def add_reaction(user_id):
        """
        Add or change a reaction on a feed item.
        One reaction per observer per target (upsert behavior).

        Request body:
            target_type: 'completion' | 'learning_event' | 'bounty_claim'
            target_id: UUID of the target
            reaction_type: 'proud' | 'mind_blown' | 'inspired' | 'love_it' | 'curious'
        """
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Request body required'}), 400

            target_type = data.get('target_type')
            target_id = data.get('target_id')
            reaction_type = data.get('reaction_type')

            if not all([target_type, target_id, reaction_type]):
                return jsonify({'error': 'Missing required fields: target_type, target_id, reaction_type'}), 400

            if target_type not in VALID_TARGET_TYPES:
                return jsonify({'error': f'Invalid target_type. Must be one of: {VALID_TARGET_TYPES}'}), 400

            if reaction_type not in VALID_REACTION_TYPES:
                return jsonify({'error': f'Invalid reaction_type. Must be one of: {VALID_REACTION_TYPES}'}), 400

            supabase = get_supabase_admin_client()

            # Upsert: update reaction_type if exists, insert if not
            response = supabase.table('observer_reactions').upsert({
                'observer_id': user_id,
                'target_type': target_type,
                'target_id': target_id,
                'reaction_type': reaction_type,
                'created_at': datetime.now(timezone.utc).isoformat(),
            }, on_conflict='observer_id,target_type,target_id').execute()

            # Sync ALL reaction types to observer_likes for web platform compatibility.
            # Mobile shows granular reactions; web sees a single "like".
            try:
                if target_type == 'completion':
                    existing = supabase.table('observer_likes').select('id').eq('observer_id', user_id).eq('completion_id', target_id).execute()
                    if not existing.data:
                        supabase.table('observer_likes').insert({
                            'observer_id': user_id,
                            'completion_id': target_id,
                        }).execute()
                elif target_type == 'learning_event':
                    existing = supabase.table('observer_likes').select('id').eq('observer_id', user_id).eq('learning_event_id', target_id).execute()
                    if not existing.data:
                        supabase.table('observer_likes').insert({
                            'observer_id': user_id,
                            'learning_event_id': target_id,
                        }).execute()
            except Exception as compat_err:
                logger.debug(f"observer_likes sync failed (non-fatal): {compat_err}")

            reaction = response.data[0] if response.data else {}
            logger.info(f"Observer {user_id[:8]} reacted '{reaction_type}' on {target_type}/{target_id[:8]}")

            return jsonify({'success': True, 'reaction': reaction}), 200

        except Exception as e:
            logger.error(f"Failed to add reaction: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to add reaction'}), 500


    @bp.route('/api/observers/react/<reaction_id>', methods=['DELETE'])
    @require_auth
    def remove_reaction(user_id, reaction_id):
        """Remove a reaction and its corresponding observer_like."""
        try:
            supabase = get_supabase_admin_client()

            # Only delete own reactions
            response = supabase.table('observer_reactions') \
                .delete() \
                .eq('id', reaction_id) \
                .eq('observer_id', user_id) \
                .execute()

            if not response.data:
                return jsonify({'error': 'Reaction not found or not yours'}), 404

            # Also remove corresponding observer_like for web platform sync
            removed = response.data[0]
            try:
                target_type = removed.get('target_type')
                target_id = removed.get('target_id')
                if target_type == 'completion':
                    supabase.table('observer_likes').delete() \
                        .eq('observer_id', user_id).eq('completion_id', target_id).execute()
                elif target_type == 'learning_event':
                    supabase.table('observer_likes').delete() \
                        .eq('observer_id', user_id).eq('learning_event_id', target_id).execute()
            except Exception as compat_err:
                logger.debug(f"observer_likes removal sync failed (non-fatal): {compat_err}")

            return jsonify({'success': True}), 200

        except Exception as e:
            logger.error(f"Failed to remove reaction: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to remove reaction'}), 500


    @bp.route('/api/observers/reactions/<target_type>/<target_id>', methods=['GET'])
    @require_auth
    def get_reactions(user_id, target_type, target_id):
        """Get all reactions for a feed item."""
        try:
            if target_type not in VALID_TARGET_TYPES:
                return jsonify({'error': f'Invalid target_type'}), 400

            supabase = get_supabase_admin_client()

            reactions = supabase.table('observer_reactions') \
                .select('*, users:observer_id(id, display_name, first_name, avatar_url)') \
                .eq('target_type', target_type) \
                .eq('target_id', target_id) \
                .order('created_at', desc=True) \
                .execute()

            # Count by type
            counts = {}
            for r in (reactions.data or []):
                rt = r['reaction_type']
                counts[rt] = counts.get(rt, 0) + 1

            return jsonify({
                'success': True,
                'reactions': reactions.data or [],
                'counts': counts,
                'total': len(reactions.data or []),
            }), 200

        except Exception as e:
            logger.error(f"Failed to get reactions: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to get reactions'}), 500
