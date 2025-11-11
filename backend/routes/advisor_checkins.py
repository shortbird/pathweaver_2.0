"""
Advisor Check-in Routes
API endpoints for advisor check-in functionality.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
from utils.auth.decorators import require_role, require_admin
from services.checkin_service import CheckinService

checkins_bp = Blueprint('advisor_checkins', __name__)


@checkins_bp.route('/api/advisor/checkins', methods=['POST', 'OPTIONS'])
@require_role('advisor', 'admin')
def create_checkin(user_id):
    """
    Create a new advisor check-in.

    Expected JSON body:
    {
        "student_id": "uuid",
        "checkin_date": "2025-01-11T10:00:00Z",
        "growth_moments": "text",
        "student_voice": "text",
        "obstacles": "text",
        "solutions": "text",
        "advisor_notes": "text",
        "active_quests_snapshot": [...]
    }
    """
    try:
        checkin_service = CheckinService()
        data = request.get_json()

        # Validate required fields
        required_fields = ['student_id', 'checkin_date']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Parse checkin_date
        try:
            checkin_date = datetime.fromisoformat(data['checkin_date'].replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'error': 'Invalid checkin_date format. Use ISO 8601.'}), 400

        # Create check-in
        checkin = checkin_service.create_checkin(
            advisor_id=user_id,
            student_id=data['student_id'],
            checkin_date=checkin_date,
            growth_moments=data.get('growth_moments', ''),
            student_voice=data.get('student_voice', ''),
            obstacles=data.get('obstacles', ''),
            solutions=data.get('solutions', ''),
            advisor_notes=data.get('advisor_notes', ''),
            active_quests_snapshot=data.get('active_quests_snapshot', [])
        )

        return jsonify({
            'success': True,
            'checkin': checkin
        }), 201

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': f'Failed to create check-in: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/checkins', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'admin')
def get_advisor_checkins(user_id):
    """
    Get all check-ins created by the current advisor.
    """
    try:
        from repositories.checkin_repository import CheckinRepository
        repository = CheckinRepository()

        limit = request.args.get('limit', 100, type=int)
        checkins = repository.get_advisor_checkins(user_id, limit)

        return jsonify({
            'success': True,
            'checkins': checkins
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch check-ins: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/students/<student_id>/checkins', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'admin')
def get_student_checkins(user_id, student_id):
    """
    Get all check-ins for a specific student.
    """
    try:
        checkin_service = CheckinService()
        checkins = checkin_service.get_checkin_history(student_id, user_id)

        return jsonify({
            'success': True,
            'checkins': checkins
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch student check-ins: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/students/<student_id>/checkin-data', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'admin')
def get_checkin_data(user_id, student_id):
    """
    Get pre-populated data for check-in form (active quests, etc.).
    """
    try:
        checkin_service = CheckinService()
        # Get active quests data
        quests_data = checkin_service.get_student_active_quests_data(student_id)

        # Get last check-in info
        last_checkin_info = checkin_service.get_last_checkin_info(student_id, user_id)

        return jsonify({
            'success': True,
            'active_quests': quests_data,
            'last_checkin': last_checkin_info
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch check-in data: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/checkins/<checkin_id>', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'admin')
def get_checkin_by_id(user_id, checkin_id):
    """
    Get a specific check-in by ID.
    """
    try:
        checkin_service = CheckinService()
        checkin = checkin_service.get_checkin_by_id(checkin_id, user_id)

        if not checkin:
            return jsonify({'error': 'Check-in not found'}), 404

        return jsonify({
            'success': True,
            'checkin': checkin
        }), 200

    except PermissionError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        return jsonify({'error': f'Failed to fetch check-in: {str(e)}'}), 500


@checkins_bp.route('/api/advisor/checkins/analytics', methods=['GET', 'OPTIONS'])
@require_role('advisor', 'admin')
def get_checkin_analytics(user_id):
    """
    Get analytics for advisor's check-ins.
    """
    try:
        checkin_service = CheckinService()
        analytics = checkin_service.get_checkin_analytics(user_id)

        return jsonify({
            'success': True,
            'analytics': analytics
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch analytics: {str(e)}'}), 500


@checkins_bp.route('/api/admin/checkins', methods=['GET', 'OPTIONS'])
@require_admin
def get_all_checkins_admin(user_id):
    """
    Get all check-ins with pagination (admin only).
    """
    try:
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 50, type=int)

        from repositories.checkin_repository import CheckinRepository
        repository = CheckinRepository()
        result = repository.get_all_checkins(page, limit)

        return jsonify({
            'success': True,
            **result
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch check-ins: {str(e)}'}), 500


@checkins_bp.route('/api/admin/checkins/analytics', methods=['GET', 'OPTIONS'])
@require_admin
def get_admin_analytics(user_id):
    """
    Get system-wide check-in analytics (admin only).
    """
    try:
        from repositories.checkin_repository import CheckinRepository
        repository = CheckinRepository()
        analytics = repository.get_checkin_analytics(advisor_id=None)

        return jsonify({
            'success': True,
            'analytics': analytics
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch analytics: {str(e)}'}), 500
