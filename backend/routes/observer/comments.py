"""
Observer Module - Comment Endpoints

Observer comment functionality on student work.
"""

from flask import request, jsonify
from datetime import datetime, timedelta
import logging

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit
from services.observer_audit_service import ObserverAuditService
from services.notification_service import NotificationService

logger = logging.getLogger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/api/observers/comments', methods=['POST'])
    @require_auth
    @rate_limit(limit=20, per=3600)  # 20 comments per hour
    def post_observer_comment(user_id):
        """
        Observer leaves encouraging comment on completed work

        Args:
            user_id: UUID of authenticated user (from @require_auth)

        Body:
            student_id: UUID of student
            task_completion_id: UUID of task completion (optional)
            learning_event_id: UUID of learning event (optional)
            quest_id: UUID of quest (optional)
            comment_text: Comment text (max 2000 characters)

        Returns:
            200: Comment posted
            400: Invalid request
            403: Observer doesn't have comment permission
        """
        observer_id = user_id
        data = request.json

        # Validate required fields
        if not data.get('student_id') or not data.get('comment_text'):
            return jsonify({'error': 'student_id and comment_text are required'}), 400

        if len(data['comment_text']) > 2000:
            return jsonify({'error': 'Comment text exceeds maximum length of 2000 characters'}), 400

        try:
            supabase = get_supabase_admin_client()
            student_id = data['student_id']
            # Debug: log student_id for comparison
            with open('C:/Users/tanne/Desktop/pw_v2/debug_comparison.log', 'a') as f:
                f.write(f"[{datetime.now()}] COMMENT: student_id={student_id}, observer_id={observer_id}\n")
            can_comment = False

            # Check if superadmin (superadmins have full access)
            user_result = supabase.table('users').select('role').eq('id', observer_id).single().execute()
            user_role = user_result.data.get('role') if user_result.data else None
            if user_role == 'superadmin':
                can_comment = True

            # Verify observer has access and comment permission
            if not can_comment:
                link = supabase.table('observer_student_links') \
                    .select('can_comment') \
                    .eq('observer_id', observer_id) \
                    .eq('student_id', student_id) \
                    .execute()
                can_comment = link.data and link.data[0]['can_comment']

            # Check advisor_student_assignments for advisors
            if not can_comment and user_role == 'advisor':
                advisor_link = supabase.table('advisor_student_assignments') \
                    .select('id') \
                    .eq('advisor_id', observer_id) \
                    .eq('student_id', student_id) \
                    .eq('is_active', True) \
                    .execute()
                can_comment = bool(advisor_link.data)

            if not can_comment:
                return jsonify({'error': 'Access denied or comment permission disabled'}), 403

            # Create comment
            comment = supabase.table('observer_comments').insert({
                'observer_id': observer_id,
                'student_id': data['student_id'],
                'quest_id': data.get('quest_id'),
                'task_completion_id': data.get('task_completion_id'),
                'learning_event_id': data.get('learning_event_id'),
                'comment_text': data['comment_text']
            }).execute()

            logger.info(f"Observer comment posted: observer={observer_id}, student={data['student_id']}")

            # Log observer access for COPPA/FERPA compliance
            try:
                audit_service = ObserverAuditService(user_id=observer_id)
                audit_service.log_observer_access(
                    observer_id=observer_id,
                    student_id=data['student_id'],
                    action_type='post_comment',
                    resource_type='comment',
                    resource_id=comment.data[0]['id'],
                    metadata={
                        'quest_id': data.get('quest_id'),
                        'task_completion_id': data.get('task_completion_id'),
                        'comment_length': len(data['comment_text'])
                    }
                )
            except Exception as audit_error:
                # Don't fail the request if audit logging fails
                logger.error(f"Failed to log observer access: {audit_error}")

            # Notify parents of the student about the comment
            try:
                notification_service = NotificationService(supabase=supabase)
                parents = notification_service.get_parents_for_student(student_id)
                with open('C:/Users/tanne/Desktop/pw_v2/debug_comparison.log', 'a') as f:
                    f.write(f"[{datetime.now()}] COMMENT NOTIFY: student_id={student_id}, found {len(parents)} parents: {[p.get('id') for p in parents]}\n")
                logger.info(f"[post_observer_comment] Found {len(parents)} parents for student {student_id[:8]}, observer={observer_id[:8]}")

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

                    for parent in parents:
                        # Don't notify if the parent is the one who commented
                        if parent['id'] != observer_id:
                            logger.info(f"[post_observer_comment] Sending notification to parent {parent['id'][:8]}")
                            notification_service.notify_parent_observer_comment(
                                parent_user_id=parent['id'],
                                observer_name=observer_name,
                                student_name=student_name,
                                comment_preview=data['comment_text'],
                                student_id=student_id,
                                organization_id=parent.get('organization_id')
                            )
                        else:
                            logger.info(f"[post_observer_comment] Skipping self-notification for parent {parent['id'][:8]}")

                    # Also notify the student (unless they commented on their own work)
                    if student_id != observer_id:
                        student_user = supabase.table('users').select('organization_id').eq('id', student_id).single().execute()
                        notification_service.notify_student_comment(
                            student_id=student_id,
                            observer_name=observer_name,
                            comment_preview=data['comment_text'],
                            organization_id=student_user.data.get('organization_id') if student_user.data else None
                        )
                        logger.info(f"[post_observer_comment] Sent notification to student {student_id[:8]}")
                else:
                    logger.info(f"[post_observer_comment] No parents found to notify")
            except Exception as notify_error:
                # Don't fail the comment if notification fails
                logger.error(f"Failed to send comment notification: {notify_error}", exc_info=True)

            return jsonify({
                'status': 'success',
                'comment': comment.data[0]
            }), 200

        except Exception as e:
            logger.error(f"Failed to post observer comment: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to post comment'}), 500


    @bp.route('/api/observers/comments/<comment_id>', methods=['DELETE'])
    @require_auth
    @validate_uuid_param('comment_id')
    def delete_observer_comment(user_id, comment_id):
        """
        Delete an observer comment

        Authorized users:
        - The comment author (observer who posted the comment)
        - Parents of the student the comment is about
        - Superadmins

        Args:
            user_id: UUID of authenticated user (from @require_auth)
            comment_id: UUID of the comment to delete

        Returns:
            200: Comment deleted
            403: Not authorized to delete this comment
            404: Comment not found
        """
        try:
            supabase = get_supabase_admin_client()

            # Get the comment with student_id for parent check
            comment = supabase.table('observer_comments') \
                .select('id, observer_id, student_id') \
                .eq('id', comment_id) \
                .single() \
                .execute()

            if not comment.data:
                return jsonify({'error': 'Comment not found'}), 404

            # Check if user is the comment author
            is_author = comment.data['observer_id'] == user_id

            # Check user role
            user_result = supabase.table('users').select('role').eq('id', user_id).single().execute()
            user_role = user_result.data.get('role') if user_result.data else None
            is_superadmin = user_role == 'superadmin'

            # Check if user is a parent of the student
            is_parent_of_student = False
            if not is_author and not is_superadmin:
                student_id = comment.data['student_id']
                # Check parent_student_links table
                parent_link = supabase.table('parent_student_links') \
                    .select('id') \
                    .eq('parent_id', user_id) \
                    .eq('student_id', student_id) \
                    .execute()
                is_parent_of_student = bool(parent_link.data)

            if not is_author and not is_superadmin and not is_parent_of_student:
                return jsonify({'error': 'Not authorized to delete this comment'}), 403

            # Delete the comment
            supabase.table('observer_comments') \
                .delete() \
                .eq('id', comment_id) \
                .execute()

            logger.info(f"Observer comment deleted: comment_id={comment_id}, deleted_by={user_id}")

            return jsonify({'status': 'success'}), 200

        except Exception as e:
            logger.error(f"Failed to delete observer comment: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to delete comment'}), 500


    @bp.route('/api/observers/student/<student_id>/comments', methods=['GET'])
    @require_auth
    @validate_uuid_param('student_id')
    def get_student_comments(user_id, student_id):
        """
        Get all observer comments for a student

        Accessible by:
        - The student themselves
        - Observers linked to the student

        Args:
            user_id: UUID of authenticated user (from @require_auth)
            student_id: UUID of student

        Returns:
            200: List of comments
            403: Access denied
        """

        try:
            supabase = get_supabase_admin_client()

            # Check if user is the student or an observer
            if user_id != student_id:
                # Check if user is observer for this student
                link = supabase.table('observer_student_links') \
                    .select('id') \
                    .eq('observer_id', user_id) \
                    .eq('student_id', student_id) \
                    .execute()

                if not link.data:
                    return jsonify({'error': 'Access denied'}), 403

            # Fetch comments
            comments = supabase.table('observer_comments') \
                .select('*') \
                .eq('student_id', student_id) \
                .order('created_at', desc=True) \
                .execute()

            # Fetch observer details separately
            observer_ids = list(set([comment['observer_id'] for comment in comments.data]))

            comments_data = comments.data
            if observer_ids:
                observers = supabase.table('users') \
                    .select('id, first_name, last_name, display_name') \
                    .in_('id', observer_ids) \
                    .execute()

                # Create lookup map
                observer_map = {obs['id']: obs for obs in observers.data}

                # Add observer details to each comment
                for comment in comments_data:
                    comment['observer'] = observer_map.get(comment['observer_id'], {})

            # Log observer access for COPPA/FERPA compliance (only if viewer is an observer, not the student)
            if user_id != student_id:
                try:
                    audit_service = ObserverAuditService(user_id=user_id)
                    audit_service.log_observer_access(
                        observer_id=user_id,
                        student_id=student_id,
                        action_type='view_comments',
                        resource_type='comments',
                        metadata={
                            'comment_count': len(comments_data)
                        }
                    )
                except Exception as audit_error:
                    # Don't fail the request if audit logging fails
                    logger.error(f"Failed to log observer access: {audit_error}")

            return jsonify({'comments': comments_data}), 200

        except Exception as e:
            logger.error(f"Failed to fetch comments: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch comments'}), 500
