"""
Observer Module - Portfolio Access

Observer access to student portfolios.

This route was dead. It did `from routes.portfolio import get_diploma_data`,
which has never existed as a module-level function -- get_diploma_data is a
method on services.portfolio_service.PortfolioService. The ImportError landed
in the route's own `except Exception`, so every observer portfolio view
returned a flat 500 ("Failed to fetch portfolio") rather than anything a
reader could act on.

The audit call underneath it was dead twice over: `ObserverAuditService` was
referenced without being imported, so it would have raised NameError -- caught
by the inner `except Exception as audit_error` and logged as an audit failure,
except execution never reached it because the import above blew up first. Net
effect: observer portfolio access was un-viewable AND unaudited, while
routes/admin/ferpa_compliance.py reported clean disclosure logs.

Both are fixed here, and the read is now also recorded as a FERPA disclosure
in student_access_logs (utils.access_logger), which is the table the admin
disclosure report actually reads.
"""

from flask import request, jsonify
from datetime import datetime, timedelta
import logging

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit
from services.observer_audit_service import ObserverAuditService
from services.portfolio_service import PortfolioService
from utils.access_logger import AccessLogger

logger = logging.getLogger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/api/observers/student/<student_id>/portfolio', methods=['GET'])
    @require_auth
    @validate_uuid_param('student_id')
    def get_student_portfolio_for_observer(user_id, student_id):
        """
        Observer views student portfolio (read-only)

        Args:
            user_id: UUID of authenticated user (from @require_auth)
            student_id: UUID of student to view

        Returns:
            200: Portfolio data
            403: Observer doesn't have access to this student
            404: Student not found
        """
        observer_id = user_id

        try:
            # admin client justified: observer portfolio view; cross-user student profile + diploma + skills read after observer_student_links / advisor / parent / superadmin gate
            supabase = get_supabase_admin_client()

            # Verify observer has access to this student
            link = supabase.table('observer_student_links') \
                .select('id, can_view_evidence') \
                .eq('observer_id', observer_id) \
                .eq('student_id', student_id) \
                .execute()

            if not link.data:
                return jsonify({'error': 'Access denied'}), 403

            # Fetch student portfolio data. viewer_user_id is passed so the
            # private-portfolio gate in portfolio_access.can_view_portfolio
            # sees the observer link rather than treating this as an anonymous
            # read of a private portfolio.
            portfolio_data = PortfolioService().get_diploma_data(
                student_id, viewer_user_id=observer_id
            )

            if not portfolio_data or 'error' in portfolio_data:
                return jsonify({'error': 'Student not found'}), 404

            _log_portfolio_disclosure(observer_id, student_id, portfolio_data)

            return jsonify(portfolio_data), 200

        except Exception as e:
            logger.error(f"Failed to fetch student portfolio: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch portfolio'}), 500


def _log_portfolio_disclosure(observer_id, student_id, portfolio_data):
    """Record the disclosure. Never let a logging failure break the read.

    Two sinks, deliberately, because two things already read them:
      * observer_access_audit, via ObserverAuditService -- the observer
        activity views and per-observer statistics.
      * student_access_logs, via AccessLogger -- what
        routes/admin/ferpa_compliance.py builds disclosure reports from.

    Only the fact of the disclosure is recorded: who looked, at whose record,
    when, and which surface. The portfolio payload itself is not copied into
    the log -- duplicating a child's evidence into an audit table would make
    the audit trail its own disclosure problem.
    """
    student = (portfolio_data or {}).get('student') or {}

    try:
        ObserverAuditService(user_id=observer_id).log_observer_access(
            observer_id=observer_id,
            student_id=student_id,
            action_type='view_portfolio',
            resource_type='portfolio',
            metadata={'diploma_slug': student.get('portfolio_slug')},
        )
    except Exception as audit_error:
        logger.error(f"Failed to log observer access: {audit_error}")

    # AccessLogger swallows its own failures and returns False.
    AccessLogger.log_student_data_access(
        student_id=student_id,
        accessor_id=observer_id,
        data_type='portfolio',
        purpose='observer_view',
        fields=['achievements', 'evidence', 'skill_xp'],
    )
