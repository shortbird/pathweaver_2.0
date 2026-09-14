"""
Observer Module - Comment Endpoints

Observer comment functionality on student work.
"""

from flask import request, jsonify
import logging
import threading

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, validate_uuid_param
from utils.auth.relationships import relationship_between, require_relationship_to, validate_allow
from middleware.rate_limiter import rate_limit
from services.observer_audit_service import ObserverAuditService
from services.notification_service import NotificationService

logger = logging.getLogger(__name__)


#: Who may write on a student's work, in the vocabulary every id-bearing route
#: declares (utils.auth.relationships). Read by both this route and the two
#: thread readers in social.py, so seeing a thread and writing on it are one
#: policy: whoever the feed shows a post to can answer under it.
#:
#: This replaced a hand-rolled predicate that was wrong three times in three
#: weeks, once per audience. It read the RAW users.role, so org staff (role=
#: 'org_managed') never matched their advisor branch (Gryffin, 2026-08-27);
#: it required an advisor_student_assignments row that roster-onboarded
#: schools never write; and it had no branch at all for the student on their
#: own work or for a parent linked any way but an observer invitation
#: (2026-09-14: a student saw Optio ask "What are the ingredients?" under
#: their post and got "Access denied" replying). Each was found by a person
#: complaining, months apart, because a refused comment is not an error --
#: it is silence, and silence looks like nobody wanted to comment. In the
#: whole history of the table, sixteen comments: fourteen by superadmin.
#:
#: The decorator could not be used here because the student is named in the
#: JSON body, not the URL, which is also why the guard test that keeps the
#: other 182 routes honest never saw this one.
#:
#: 'observer' is the plain link. observer_student_links.can_comment exists,
#: but nothing has ever written it false (no route, no screen; 28 of 28 rows
#: true), so a relationship for "observer who may comment" would be a
#: predicate for a feature that does not exist.
COMMENT_RELATIONSHIPS = validate_allow(
    ('self', 'parent', 'household_guardian', 'observer', 'advisor', 'teacher', 'org_staff'),
    'COMMENT_RELATIONSHIPS',
)


def observer_link_may_comment(supabase, observer_id, student_id):
    """Whether the plain observer link between these two allows commenting.

    relationship_between() returns the FIRST relationship that holds, in the
    order COMMENT_RELATIONSHIPS lists them, so this is only consulted for
    someone whose sole standing with the student is the observer link: a
    parent who is also an observer is 'parent' and never reaches it. Nothing
    yet writes can_comment false, but the column means view-only and the
    integration suite holds the route to it
    (test_link_without_comment_permission_cannot_comment, marked critical) --
    a view-only link that could comment would be the SEC-01 shape again.
    """
    rows = supabase.table('observer_student_links').select('can_comment') \
        .eq('observer_id', observer_id).eq('student_id', student_id) \
        .limit(1).execute().data or []
    return bool(rows) and rows[0].get('can_comment') is not False


def report_refused_comment(supabase, author_id, student_id):
    """A refused comment goes to Sentry, because nowhere else will show it.

    A 403 is not an exception, the person refused does not file a bug, and an
    empty comments table looks exactly like a feature nobody uses. Sixteen
    comments in the life of the feature, half of them reaching no one, and
    not one signal in any dashboard. This is the signal: it should be near
    zero, and an alert rule on the `comment_refused` tag says when it is not.

    Carries the author's effective role and org and the student's org, which
    is the whole diagnosis every time so far. Best-effort; never breaks the
    response.
    """
    try:
        from utils.roles import get_effective_roles
        author = (supabase.table('users')
                  .select('role, org_role, org_roles, organization_id')
                  .eq('id', author_id).limit(1).execute()).data or [{}]
        student = (supabase.table('users').select('organization_id')
                   .eq('id', student_id).limit(1).execute()).data or [{}]
        context = {
            'author_roles': sorted(get_effective_roles(author[0])),
            'author_org': author[0].get('organization_id'),
            'student_org': student[0].get('organization_id'),
            'same_org': bool(author[0].get('organization_id'))
                        and author[0].get('organization_id') == student[0].get('organization_id'),
            'allowed': list(COMMENT_RELATIONSHIPS),
        }
        logger.warning(f"[comment_refused] author={author_id[:8]} student={student_id[:8]} {context}")
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            scope.set_tag('source', 'comment_refused')
            scope.set_tag('author_roles', ','.join(context['author_roles']) or 'none')
            scope.set_tag('same_org', str(context['same_org']).lower())
            scope.set_context('comment_refused', context)
            sentry_sdk.capture_message(
                f"Comment refused: {'/'.join(context['author_roles']) or 'no role'} on a student's work",
                level='warning',
            )
    except Exception as e:  # noqa: BLE001 -- a report must never break the request
        logger.debug(f'[comment_refused] report skipped: {e}', exc_info=True)


def thread_participants(db, task_completion_id=None, learning_event_id=None):
    """Distinct authors of the comments already on one thread, oldest first.

    A thread hangs off either a task completion or a learning event; a comment
    carrying neither (quest-only) has no thread to speak of and gets nobody.
    """
    if task_completion_id:
        query = db.table('observer_comments').select('observer_id') \
            .eq('task_completion_id', task_completion_id)
    elif learning_event_id:
        query = db.table('observer_comments').select('observer_id') \
            .eq('learning_event_id', learning_event_id)
    else:
        return []
    rows = query.order('created_at', desc=False).execute().data or []
    seen = []
    for row in rows:
        author_id = row.get('observer_id')
        if author_id and author_id not in seen:
            seen.append(author_id)
    return seen


def send_comment_notifications_async(student_id, observer_id, comment_text,
                                     task_completion_id=None, learning_event_id=None):
    """Tell everyone with a stake in the thread about a new comment.

    Three audiences, each decided on its own and never told twice:
      1. the student, unless they wrote it;
      2. their parents, unless they wrote it or the student did -- a student's
         reply to feedback is not feedback a parent needs to hear about;
      3. anyone else already in the thread. Until 2026-09-14 there was no such
         audience, so Optio could ask a student "What are the ingredients?"
         and never learn it was answered.

    (1) used to sit inside `if parents:`, so a student with no linked parent --
    every platform student who signed up alone -- was never told anyone had
    commented on their work. Three of three such comments in production had no
    notification behind them.
    """
    try:
        from utils.platform_staff import is_optio_platform_user

        notification_service = NotificationService()
        db = notification_service.supabase

        author_result = db.table('users') \
            .select('display_name, first_name, last_name, role, email') \
            .eq('id', observer_id) \
            .limit(1) \
            .execute()
        author = author_result.data[0] if author_result.data else {}
        # The thread renders platform staff as "Optio"; the notification that
        # points at the thread must name the same author.
        if is_optio_platform_user(author):
            author_name = 'Optio'
        else:
            author_name = author.get('display_name') or \
                f"{author.get('first_name', '')} {author.get('last_name', '')}".strip() or \
                'Someone'

        student_result = db.table('users') \
            .select('display_name, first_name, organization_id') \
            .eq('id', student_id) \
            .limit(1) \
            .execute()
        student = student_result.data[0] if student_result.data else {}
        student_name = student.get('display_name') or student.get('first_name')
        student_org_id = student.get('organization_id')

        notified = {observer_id}
        author_is_student = observer_id == student_id

        if not author_is_student:
            notification_service.notify_student_comment(
                student_id=student_id,
                observer_name=author_name,
                comment_preview=comment_text,
                organization_id=student_org_id
            )
            notified.add(student_id)

            parents = notification_service.get_parents_for_student(student_id)
            logger.info(f"[async_notify] Found {len(parents)} parents for student {student_id[:8]}")
            for parent in parents:
                if parent['id'] in notified:
                    continue
                notification_service.notify_parent_observer_comment(
                    parent_user_id=parent['id'],
                    observer_name=author_name,
                    student_name=student_name or 'your child',
                    comment_preview=comment_text,
                    student_id=student_id,
                    organization_id=parent.get('organization_id')
                )
                notified.add(parent['id'])

        for participant_id in thread_participants(db, task_completion_id, learning_event_id):
            if participant_id in notified:
                continue
            notification_service.notify_comment_reply(
                recipient_id=participant_id,
                author_name=author_name,
                student_name=student_name or 'a student',
                comment_preview=comment_text,
                student_id=student_id,
                author_is_student=author_is_student,
                organization_id=student_org_id
            )
            notified.add(participant_id)
    except Exception as e:
        logger.error(f"[async_notify] Failed to send comment notifications: {e}", exc_info=True)


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
            # admin client justified: observer-comment flow gated by the relationship check below (COMMENT_RELATIONSHIPS via utils.auth.relationships); writes observer_comments + reads users for the refusal report
            supabase = get_supabase_admin_client()
            student_id = data['student_id']

            relationship = relationship_between(observer_id, student_id, COMMENT_RELATIONSHIPS)
            if not relationship or (
                relationship == 'observer'
                and not observer_link_may_comment(supabase, observer_id, student_id)
            ):
                report_refused_comment(supabase, observer_id, student_id)
                return jsonify({'error': "You don't have access to comment on this student's work"}), 403

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

            # Send notifications in background thread (non-blocking)
            thread = threading.Thread(
                target=send_comment_notifications_async,
                args=(student_id, observer_id, data['comment_text']),
                kwargs={
                    'task_completion_id': data.get('task_completion_id'),
                    'learning_event_id': data.get('learning_event_id'),
                }
            )
            thread.daemon = True
            thread.start()

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
            # admin client justified: observer-comment flow gated by relationship check below (observer_student_links / advisor_student_assignments / superadmin); writes observer_comments + reads users for author/student lookup
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
                # Columns are parent_user_id / student_user_id. They were
                # queried as parent_id / student_id, which do not exist, so
                # PostgREST raised 42703 and this returned 500 instead of
                # authorizing -- on exactly the path where a parent removes an
                # inappropriate comment from their child's work.
                parent_link = supabase.table('parent_student_links') \
                    .select('id') \
                    .eq('parent_user_id', user_id) \
                    .eq('student_user_id', student_id) \
                    .execute()
                is_parent_of_student = bool(parent_link.data)

                # A dependent child has no link row at all -- the guardian is on
                # the child's own record. Without this, the parent of a dependent
                # could not remove a comment from their child's work either.
                if not is_parent_of_student:
                    dependent = supabase.table('users') \
                        .select('managed_by_parent_id') \
                        .eq('id', student_id).single().execute()
                    is_parent_of_student = bool(dependent.data) and \
                        dependent.data.get('managed_by_parent_id') == user_id

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
    @require_relationship_to('student_id', allow=('self', 'observer'))
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
            # admin client justified: observer-comment flow gated by relationship check below (observer_student_links / advisor_student_assignments / superadmin); writes observer_comments + reads users for author/student lookup
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
