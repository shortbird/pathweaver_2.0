"""
Observer Module - Portfolio Access

Observer access to student portfolios.
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
    @bp.route('/api/observers/student/<student_id>/portfolio', methods=['GET'])
    @require_auth
    @validate_uuid_param('student_id')
    def get_student_portfolio_for_observer(student_id):
        """
        Observer views student portfolio (read-only)

        Args:
            student_id: UUID of student to view

        Returns:
            200: Portfolio data
            403: Observer doesn't have access to this student
            404: Student not found
        """
        observer_id = request.user_id

        try:
            supabase = get_supabase_admin_client()

            # Verify observer has access to this student
            link = supabase.table('observer_student_links') \
                .select('id, can_view_evidence') \
                .eq('observer_id', observer_id) \
                .eq('student_id', student_id) \
                .execute()

            if not link.data:
                return jsonify({'error': 'Access denied'}), 403

            # Fetch student portfolio data (same as public portfolio)
            from routes.portfolio import get_diploma_data
            portfolio_data = get_diploma_data(student_id)

            if not portfolio_data:
                return jsonify({'error': 'Student not found'}), 404

            # Log observer access for COPPA/FERPA compliance
            try:
                audit_service = ObserverAuditService(user_id=observer_id)
                audit_service.log_observer_access(
                    observer_id=observer_id,
                    student_id=student_id,
                    action_type='view_portfolio',
                    resource_type='portfolio',
                    metadata={
                        'student_name': portfolio_data.get('student', {}).get('display_name'),
                        'diploma_slug': portfolio_data.get('student', {}).get('portfolio_slug')
                    }
                )
            except Exception as audit_error:
                # Don't fail the request if audit logging fails
                logger.error(f"Failed to log observer access: {audit_error}")

            return jsonify(portfolio_data), 200

        except Exception as e:
            logger.error(f"Failed to fetch student portfolio: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch portfolio'}), 500

