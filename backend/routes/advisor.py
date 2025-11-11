"""
Advisor Routes - API endpoints for advisor functionality
Handles custom badge creation, student monitoring, and advisor-student management
"""

import sys
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_role
from middleware.error_handler import ValidationError, NotFoundError
from services.advisor_service import AdvisorService

from utils.logger import get_logger

logger = get_logger(__name__)

advisor_bp = Blueprint('advisor', __name__)

# ==================== Student Management ====================

@advisor_bp.route('/students', methods=['GET'])
@require_role('advisor', 'admin')
def get_students(user_id):
    """Get all students assigned to this advisor"""
    try:
        # Create service instance per-request with user context
        advisor_service = AdvisorService(user_id=user_id)
        students = advisor_service.get_advisor_students(user_id)
        return jsonify({
            'success': True,
            'students': students,
            'count': len(students)
        }), 200

    except Exception as e:
        print(f"Error fetching students: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to fetch students'
        }), 500


@advisor_bp.route('/students/<student_id>/assign', methods=['POST'])
@require_role('advisor', 'admin')
def assign_student(user_id, student_id):
    """Assign a student to this advisor"""
    try:
        advisor_service = AdvisorService(user_id=user_id)
        success = advisor_service.assign_student_to_advisor(student_id, user_id)
        return jsonify({
            'success': True,
            'message': 'Student assigned successfully'
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        print(f"Error assigning student: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to assign student'
        }), 500


@advisor_bp.route('/students/<student_id>/progress', methods=['GET'])
@require_role('advisor', 'admin')
def get_student_progress(user_id, student_id):
    """Get comprehensive progress report for a student"""
    try:
        advisor_service = AdvisorService(user_id=user_id)
        report = advisor_service.get_student_progress_report(student_id, user_id)
        return jsonify({
            'success': True,
            'report': report
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403
    except Exception as e:
        print(f"Error fetching student progress: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to fetch student progress'
        }), 500


# ==================== Custom Badge Management ====================

@advisor_bp.route('/badges', methods=['GET'])
@require_role('advisor', 'admin')
def get_custom_badges(user_id):
    """Get all custom badges created by this advisor"""
    try:
        advisor_service = AdvisorService(user_id=user_id)
        badges = advisor_service.get_advisor_custom_badges(user_id)
        return jsonify({
            'success': True,
            'badges': badges,
            'count': len(badges)
        }), 200

    except Exception as e:
        print(f"Error fetching custom badges: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to fetch custom badges'
        }), 500


@advisor_bp.route('/badges', methods=['POST'])
@require_role('advisor', 'admin')
def create_custom_badge(user_id):
    """Create a new custom badge"""
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['name', 'description', 'identity_statement', 'primary_pillar', 'min_quests', 'xp_requirement']
        for field in required_fields:
            if field not in data:
                raise ValidationError(f"Missing required field: {field}")

        # Validate pillar
        valid_pillars = [
            'STEM & Logic',
            'Life & Wellness',
            'Language & Communication',
            'Society & Culture',
            'Arts & Creativity'
        ]
        if data['primary_pillar'] not in valid_pillars:
            raise ValidationError(f"Invalid pillar. Must be one of: {', '.join(valid_pillars)}")

        # Validate numeric fields
        if not isinstance(data['min_quests'], int) or data['min_quests'] < 1:
            raise ValidationError("min_quests must be a positive integer")

        if not isinstance(data['xp_requirement'], int) or data['xp_requirement'] < 0:
            raise ValidationError("xp_requirement must be a non-negative integer")

        # Create badge
        advisor_service = AdvisorService(user_id=user_id)
        badge = advisor_service.create_custom_badge(
            advisor_id=user_id,
            name=data['name'],
            description=data['description'],
            identity_statement=data['identity_statement'],
            primary_pillar=data['primary_pillar'],
            min_quests=data['min_quests'],
            xp_requirement=data['xp_requirement'],
            icon=data.get('icon', '🎯'),
            color=data.get('color', '#6d469b'),
            is_public=data.get('is_public', False)
        )

        return jsonify({
            'success': True,
            'badge': badge,
            'message': 'Custom badge created successfully'
        }), 201

    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        print(f"Error creating custom badge: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to create custom badge'
        }), 500


@advisor_bp.route('/badges/<badge_id>', methods=['PUT'])
@require_role('advisor', 'admin')
def update_custom_badge(user_id, badge_id):
    """Update a custom badge"""
    try:
        data = request.get_json()

        # Validate pillar if provided
        if 'primary_pillar' in data:
            valid_pillars = [
                'STEM & Logic',
                'Life & Wellness',
                'Language & Communication',
                'Society & Culture',
                'Arts & Creativity'
            ]
            if data['primary_pillar'] not in valid_pillars:
                raise ValidationError(f"Invalid pillar. Must be one of: {', '.join(valid_pillars)}")

        # Validate numeric fields if provided
        if 'min_quests' in data:
            if not isinstance(data['min_quests'], int) or data['min_quests'] < 1:
                raise ValidationError("min_quests must be a positive integer")

        if 'xp_requirement' in data:
            if not isinstance(data['xp_requirement'], int) or data['xp_requirement'] < 0:
                raise ValidationError("xp_requirement must be a non-negative integer")

        # Update badge
        advisor_service = AdvisorService(user_id=user_id)
        badge = advisor_service.update_custom_badge(badge_id, user_id, data)

        return jsonify({
            'success': True,
            'badge': badge,
            'message': 'Badge updated successfully'
        }), 200

    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403
    except Exception as e:
        print(f"Error updating custom badge: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to update badge'
        }), 500


@advisor_bp.route('/badges/<badge_id>', methods=['DELETE'])
@require_role('advisor', 'admin')
def delete_custom_badge(user_id, badge_id):
    """Delete a custom badge"""
    try:
        advisor_service = AdvisorService(user_id=user_id)
        success = advisor_service.delete_custom_badge(badge_id, user_id)
        return jsonify({
            'success': True,
            'message': 'Badge deleted successfully'
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403
    except Exception as e:
        print(f"Error deleting custom badge: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to delete badge'
        }), 500


# ==================== Badge Assignment ====================

@advisor_bp.route('/badges/<badge_id>/assign', methods=['POST'])
@require_role('advisor', 'admin')
def assign_badge(user_id, badge_id):
    """Assign a badge to a student"""
    try:
        data = request.get_json()

        if 'student_id' not in data:
            raise ValidationError("Missing required field: student_id")

        advisor_service = AdvisorService(user_id=user_id)
        result = advisor_service.assign_badge_to_student(
            badge_id=badge_id,
            student_id=data['student_id'],
            advisor_id=user_id
        )

        return jsonify({
            'success': True,
            'user_badge': result,
            'message': 'Badge assigned to student successfully'
        }), 201

    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        print(f"Error assigning badge: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to assign badge'
        }), 500


# ==================== Advisor Dashboard Stats ====================

@advisor_bp.route('/dashboard', methods=['GET'])
@require_role('advisor', 'admin')
def get_advisor_dashboard(user_id):
    """Get advisor dashboard summary statistics"""
    try:
        advisor_service = AdvisorService(user_id=user_id)
        students = advisor_service.get_advisor_students(user_id)
        custom_badges = advisor_service.get_advisor_custom_badges(user_id)

        # Calculate stats
        total_students = len(students)
        active_students = len([s for s in students if s.get('last_active')])
        total_custom_badges = len(custom_badges)

        # Get total badges earned by all students
        total_badges_earned = sum(s.get('badge_count', 0) for s in students)

        return jsonify({
            'success': True,
            'stats': {
                'total_students': total_students,
                'active_students': active_students,
                'total_custom_badges': total_custom_badges,
                'total_badges_earned': total_badges_earned
            },
            'recent_students': students[:5],  # Top 5 recent students
            'recent_badges': custom_badges[:5]  # Top 5 recent custom badges
        }), 200

    except Exception as e:
        print(f"Error fetching advisor dashboard: {str(e)}", file=sys.stderr, flush=True)
        return jsonify({
            'success': False,
            'error': 'Failed to fetch dashboard data'
        }), 500
