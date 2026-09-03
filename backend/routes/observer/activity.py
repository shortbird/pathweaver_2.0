"""
Observer Module - Activity Feed

Student activity feed for observers.
"""

from flask import request, jsonify
import logging

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit
from services.activity_feed_service import build_activity_feed
from utils.access_logger import AccessLogger

logger = logging.getLogger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/api/observers/student/<student_id>/activity', methods=['GET'])
    @require_auth
    @validate_uuid_param('student_id')
    def get_student_activity_feed(user_id, student_id):
        """
        Student views their own activity feed (same format as observer feed)

        Shows completed tasks with evidence and comments.
        Only accessible by the student themselves.

        Args:
            user_id: UUID of authenticated user (from @require_auth)
            student_id: UUID of student

        Query params:
            limit: (optional) Number of items, default 20
            cursor: (optional) Pagination cursor

        Returns:
            200: Paginated feed of student's activities
            403: Access denied (not viewing own feed)
        """
        # Allow viewing own activity, or parent/observer viewing linked student
        if user_id != student_id:
            # Check if user has parent/observer access to this student
            try:
                # admin client justified: cross-user access check (superadmin / dependent / parent_student_links / observer_student_links) before granting student-activity feed access
                supabase_check = get_supabase_admin_client()
                # Check superadmin
                user_resp = supabase_check.table('users').select('role').eq('id', user_id).single().execute()
                if not user_resp.data or user_resp.data.get('role') != 'superadmin':
                    # Check dependent relationship
                    student_resp = supabase_check.table('users').select('is_dependent, managed_by_parent_id').eq('id', student_id).single().execute()
                    is_dependent = student_resp.data and student_resp.data.get('is_dependent') and student_resp.data.get('managed_by_parent_id') == user_id
                    if not is_dependent:
                        # Check parent_student_links
                        link_resp = supabase_check.table('parent_student_links').select('id').eq('parent_user_id', user_id).eq('student_user_id', student_id).eq('status', 'approved').limit(1).execute()
                        if not link_resp.data:
                            # Check observer_student_links
                            obs_resp = supabase_check.table('observer_student_links').select('id').eq('observer_id', user_id).eq('student_id', student_id).limit(1).execute()
                            if not obs_resp.data:
                                return jsonify({'error': 'Access denied'}), 403
            except Exception as e:
                logger.error(f"Error checking parent/observer access: {e}")
                return jsonify({'error': 'Access denied'}), 403

        limit = min(int(request.args.get('limit', 20)), 50)
        cursor = request.args.get('cursor')

        try:
            # admin client justified: relationship gate above grants access; reads
            # cross-user activity (quest_task_completions + learning_events +
            # evidence blocks) that the caller cannot see under their own RLS scope.
            supabase = get_supabase_admin_client()

            # The assembly moved to services/activity_feed_service so peer
            # connections could reuse it for several students at once. Passing
            # {student_id} as the confidentiality scope preserves this route's
            # long-standing behaviour exactly: whoever may read this feed --
            # the student, a parent, an observer, a superadmin -- sees the
            # student's hidden items too, greyed out and unhide-able.
            result = build_activity_feed(
                supabase,
                [student_id],
                limit=limit,
                cursor=cursor,
                confidential_ok_for={student_id},
            )

            # FERPA disclosure. Only somebody else's read is a disclosure --
            # a student opening their own feed is not, and logging it would
            # bury the rows that matter under the ones that don't.
            # AccessLogger swallows its own failures; the feed still returns.
            if user_id != student_id:
                AccessLogger.log_student_data_access(
                    student_id=student_id,
                    accessor_id=user_id,
                    data_type='activity',
                    purpose='legitimate_educational_interest',
                    fields=['task_completions', 'learning_events', 'evidence'],
                )

            return jsonify(result), 200

        except Exception as e:
            logger.error(f"Failed to fetch student activity feed: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch activity feed'}), 500

    @bp.route('/api/observers/feed-item/toggle-visibility', methods=['POST'])
    @require_auth
    @rate_limit(limit=120, per=3600)
    def toggle_feed_item_visibility(user_id):
        """
        Toggle visibility of a feed item by setting `is_confidential` on the
        underlying completion or learning event. When `is_confidential=true`,
        the item is hidden from the observer feed.

        Allowed callers (any one of):
          - The item's owner (the student themselves).
          - A parent linked to the owner (via managed_by_parent_id or an
            approved parent_student_links row).
          - A superadmin.

        Parents need this so they can hide moments their kid posted but
        shouldn't be public (the kid keeps their own per-item control too).

        Body (exactly one of these id fields):
            completion_id: UUID (task completions — toggles is_confidential)
            learning_event_id: UUID (learning moments — toggles is_confidential)
            block_id: UUID (draft evidence blocks not yet backed by a
                       completion — toggles evidence_document_blocks.is_private
                       so only that specific block is hidden, leaving any
                       sibling blocks on the same task untouched).
        Plus:
            hidden: boolean (true = hide from observers)

        Returns:
            200: { status: success, hidden: bool }
        """
        data = request.json or {}
        completion_id = data.get('completion_id')
        learning_event_id = data.get('learning_event_id')
        block_id = data.get('block_id')
        hidden = data.get('hidden', True)

        if not completion_id and not learning_event_id and not block_id:
            return jsonify({'error': 'completion_id, learning_event_id, or block_id is required'}), 400

        try:
            # admin client justified: cross-user visibility toggle; authorization
            # is enforced explicitly below (owner / parent-of-owner / superadmin)
            supabase = get_supabase_admin_client()

            # Look up the owner of the target record so we can authorize the
            # caller against THAT owner, not the caller's own id. For block_id
            # the owner lives one hop away on the parent evidence document.
            if completion_id:
                record = supabase.table('quest_task_completions') \
                    .select('id, user_id') \
                    .eq('id', completion_id) \
                    .execute()
                if not record.data:
                    return jsonify({'error': 'Completion not found'}), 404
                owner_id = record.data[0]['user_id']
            elif learning_event_id:
                record = supabase.table('learning_events') \
                    .select('id, user_id') \
                    .eq('id', learning_event_id) \
                    .execute()
                if not record.data:
                    return jsonify({'error': 'Learning event not found'}), 404
                owner_id = record.data[0]['user_id']
            else:
                block_record = supabase.table('evidence_document_blocks') \
                    .select('id, document_id') \
                    .eq('id', block_id) \
                    .execute()
                if not block_record.data:
                    return jsonify({'error': 'Evidence block not found'}), 404
                doc_record = supabase.table('user_task_evidence_documents') \
                    .select('id, user_id') \
                    .eq('id', block_record.data[0]['document_id']) \
                    .execute()
                if not doc_record.data:
                    return jsonify({'error': 'Evidence document not found'}), 404
                owner_id = doc_record.data[0]['user_id']

            # Authorize: owner, parent-of-owner, or superadmin.
            authorized = False
            if owner_id == user_id:
                authorized = True
            else:
                # Reuse the read-side parent-access helper so both directions
                # of the privacy flow share one source of truth. It also grants
                # superadmin universal access.
                from routes.parent.dashboard_overview import verify_parent_access
                from middleware.error_handler import AuthorizationError
                try:
                    # IDOR-H5: toggling confidentiality is a WRITE; view-only
                    # observers must not change a child's item visibility.
                    verify_parent_access(supabase, user_id, owner_id, allow_observer=False)
                    authorized = True
                except AuthorizationError:
                    authorized = False

            if not authorized:
                return jsonify({'error': 'Not authorized to change this item\'s visibility'}), 403

            if completion_id:
                supabase.table('quest_task_completions') \
                    .update({'is_confidential': hidden}) \
                    .eq('id', completion_id) \
                    .execute()
            elif learning_event_id:
                supabase.table('learning_events') \
                    .update({'is_confidential': hidden}) \
                    .eq('id', learning_event_id) \
                    .execute()
            else:
                # Block-scoped privacy. The feed query filters on is_private,
                # so this removes the single block from observer feeds while
                # leaving the task and any other blocks intact.
                supabase.table('evidence_document_blocks') \
                    .update({'is_private': hidden}) \
                    .eq('id', block_id) \
                    .execute()

            logger.info(f"Feed item visibility toggled: caller={user_id}, owner={owner_id}, hidden={hidden}, scope={'completion' if completion_id else 'learning_event' if learning_event_id else 'block'}")

            return jsonify({'status': 'success', 'hidden': hidden}), 200

        except Exception as e:
            logger.error(f"Failed to toggle feed item visibility: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to update visibility'}), 500
