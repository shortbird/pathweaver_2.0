"""
Observer Module - Learning Moments

Read-only access to a linked student's learning moments for the observer
overview view (learning journal section). Mirrors the parent endpoint at
/api/parent/children/<id>/learning-moments but gated by observer_student_links
and filters out items the student has marked confidential.
"""

from flask import request, jsonify
import logging

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, validate_uuid_param
from services.learning_events_service import LearningEventsService
from services.observer_audit_service import ObserverAuditService

logger = logging.getLogger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""

    @bp.route('/api/observers/student/<student_id>/learning-moments', methods=['GET'])
    @require_auth
    @validate_uuid_param('student_id')
    def get_student_learning_moments_for_observer(user_id, student_id):
        """
        Observer views a linked student's learning moments (read-only).

        Query params:
            limit: Maximum number of moments (default 20, max 100)
            offset: Pagination offset (default 0)

        Returns:
            200: { success, moments, count }
            403: Observer doesn't have access to this student
        """
        observer_id = user_id

        try:
            supabase = get_supabase_admin_client()

            link = supabase.table('observer_student_links') \
                .select('id') \
                .eq('observer_id', observer_id) \
                .eq('student_id', student_id) \
                .limit(1) \
                .execute()

            if not link.data:
                return jsonify({'error': 'Access denied'}), 403

            limit = request.args.get('limit', 20, type=int)
            offset = request.args.get('offset', 0, type=int)
            if limit < 1 or limit > 100:
                return jsonify({'error': 'Limit must be between 1 and 100'}), 400

            moments_response = supabase.table('learning_events') \
                .select('*') \
                .eq('user_id', student_id) \
                .eq('is_confidential', False) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()

            moments = moments_response.data or []

            captured_by_ids = {
                m['captured_by_user_id']
                for m in moments
                if m.get('captured_by_user_id')
            }
            captured_by_names = {}
            if captured_by_ids:
                users_response = supabase.table('users') \
                    .select('id, first_name, display_name') \
                    .in_('id', list(captured_by_ids)) \
                    .execute()
                for u in (users_response.data or []):
                    captured_by_names[u['id']] = (
                        u.get('first_name') or u.get('display_name') or 'Parent'
                    )

            for moment in moments:
                blocks_response = supabase.table('learning_event_evidence_blocks') \
                    .select('*') \
                    .eq('learning_event_id', moment['id']) \
                    .order('order_index') \
                    .execute()
                moment['evidence_blocks'] = blocks_response.data or []

                captured_by_id = moment.get('captured_by_user_id')
                if captured_by_id:
                    moment['captured_by_name'] = captured_by_names.get(
                        captured_by_id, 'Parent'
                    )

            moments = LearningEventsService._enrich_events_with_topics(supabase, moments)
            moments = LearningEventsService._enrich_events_with_promoted_task(supabase, moments)

            try:
                ObserverAuditService(user_id=observer_id).log_observer_access(
                    observer_id=observer_id,
                    student_id=student_id,
                    action_type='view_learning_moments',
                    resource_type='learning_journal',
                    metadata={'count': len(moments)}
                )
            except Exception as audit_error:
                logger.error(f"Failed to log observer access: {audit_error}")

            return jsonify({
                'success': True,
                'moments': moments,
                'count': len(moments)
            }), 200

        except Exception as e:
            logger.error(
                f"Failed to fetch learning moments for observer: {str(e)}",
                exc_info=True
            )
            return jsonify({'error': 'Failed to fetch learning moments'}), 500
