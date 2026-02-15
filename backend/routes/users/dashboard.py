"""
REPOSITORY MIGRATION: COMPLETE
- Uses DashboardService for all data operations
- Service orchestrates multiple tables for dashboard aggregation
- Routes are thin controllers handling HTTP concerns only

User dashboard routes
"""

from flask import Blueprint, jsonify
from services.dashboard_service import DashboardService
from utils.auth.decorators import require_auth
from middleware.error_handler import NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/subject-xp', methods=['GET'])
@require_auth
def get_user_subject_xp(user_id):
    """Get user's XP by school subject for diploma credits"""
    try:
        dashboard_service = DashboardService()
        subject_xp = dashboard_service.get_user_subject_xp(user_id)

        return jsonify({
            'success': True,
            'subject_xp': subject_xp
        })

    except Exception as e:
        logger.error(f"Error fetching subject XP: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch subject XP',
            'subject_xp': []
        }), 500


@dashboard_bp.route('/dashboard', methods=['GET'])
@require_auth
def get_dashboard(user_id):
    """Get user dashboard data including active quests, enrolled courses, and XP stats"""
    try:
        dashboard_service = DashboardService()
        dashboard_data = dashboard_service.get_dashboard_summary(user_id)

        if 'error' in dashboard_data:
            raise NotFoundError('User', user_id)

        return jsonify(dashboard_data), 200

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Dashboard error: {str(e)}")
        return jsonify({'error': 'Failed to load dashboard'}), 500
