"""
Analytics User Journey Endpoint

Provides user journey flow data for visualization.
"""

from flask import jsonify, request
from datetime import datetime
from utils.auth.decorators import require_admin
from utils.logger import get_logger

from . import bp

logger = get_logger(__name__)


@bp.route('/user/<user_id>/journey', methods=['GET'])
@require_admin
def get_user_journey(admin_id, user_id):
    """
    Get user journey flow data for visualization.

    Shows how users navigate through the platform during sessions,
    with flow diagrams and summary statistics.

    Query params:
    - start_date: Start date (ISO format, default: 7 days ago)
    - end_date: End date (ISO format, default: now)
    - session_id: Specific session to analyze (optional)
    """
    from services.journey_aggregation_service import JourneyAggregationService
    import uuid

    # Validate UUID
    try:
        uuid.UUID(user_id)
    except (ValueError, AttributeError):
        return jsonify({
            'success': False,
            'error': f'Invalid user_id format: "{user_id}" is not a valid UUID'
        }), 400

    try:
        service = JourneyAggregationService()

        # Parse query params
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        session_id = request.args.get('session_id')

        start_date = None
        end_date = None

        if start_date_str:
            try:
                start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
            except ValueError:
                pass

        if end_date_str:
            try:
                end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
            except ValueError:
                pass

        # Get journey data
        journey_data = service.get_user_journey(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            session_id=session_id
        )

        # If specific session requested, include flow data
        if session_id:
            flow_data = service.get_journey_flow_data(user_id, session_id)
            journey_data['flow'] = flow_data

        return jsonify({
            'success': True,
            'data': journey_data
        })

    except Exception as e:
        logger.error(f"Error fetching user journey for {user_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch journey data'
        }), 500
