"""
REPOSITORY MIGRATION: COMPLETE
- Uses DashboardService for all data operations
- Service orchestrates multiple tables for dashboard aggregation
- Routes are thin controllers handling HTTP concerns only

User dashboard routes
"""

from flask import Blueprint, g, jsonify
from services.dashboard_service import DashboardService
from utils.auth.decorators import require_auth
from utils.auth.relationships import student_scope
from middleware.error_handler import NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/subject-xp', methods=['GET'])
@require_auth
@student_scope('credits')
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


def _attach_unread_feedback(client, user_id, dashboard_data):
    """Put `unread_feedback_count` on each active quest, for the card marker.

    Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or
    the inbox with a small badge, and students miss it." The count is the
    student's own unread bell rows, so a parent looking at the child's
    dashboard in family scope sees 0 -- their visit is not the student
    reading it.
    """
    scope = getattr(g, 'student_scope', None)
    delegated = bool(scope and getattr(scope, 'delegated', False))
    active = dashboard_data.get('active_quests') or []
    counts = {}
    if active and not delegated:
        from services.task_feedback_service import unread_counts_by_quest
        counts = unread_counts_by_quest(client, user_id)
    for enrollment in active:
        quest_id = enrollment.get('quest_id') or (enrollment.get('quests') or {}).get('id')
        enrollment['unread_feedback_count'] = counts.get(quest_id, 0)


@dashboard_bp.route('/dashboard', methods=['GET'])
@require_auth
@student_scope('progress')
def get_dashboard(user_id):
    """Get user dashboard data including active quests, enrolled courses, and XP stats"""
    try:
        dashboard_service = DashboardService()
        dashboard_data = dashboard_service.get_dashboard_summary(user_id)

        if 'error' in dashboard_data:
            raise NotFoundError('User', user_id)

        _attach_unread_feedback(dashboard_service.client, user_id, dashboard_data)

        return jsonify(dashboard_data), 200

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Dashboard error: {str(e)}")
        return jsonify({'error': 'Failed to load dashboard'}), 500
