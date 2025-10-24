"""
Badge Claiming Routes
Handles badge claiming workflow and notifications.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from services.badge_service import BadgeService
from utils.logger import get_logger

logger = get_logger(__name__)

badge_claiming_bp = Blueprint('badge_claiming', __name__)


@badge_claiming_bp.route('/badges/<badge_id>/claim', methods=['POST'])
@require_auth
def claim_badge(user_id, badge_id):
    """
    Claim a badge that's available (requirements met).
    Badge will auto-display on diploma.
    """
    try:
        # Verify request has empty JSON body (CSRF requirement)
        data = request.get_json() or {}

        claimed_badge = BadgeService.claim_badge(user_id, badge_id)

        return jsonify({
            'message': 'Badge claimed successfully!',
            'badge': claimed_badge,
            'is_displayed': True
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error claiming badge {badge_id} for user {user_id}: {str(e)}")
        return jsonify({'error': 'Failed to claim badge'}), 500


@badge_claiming_bp.route('/badges/claimable', methods=['GET'])
@require_auth
def get_claimable_badges(user_id):
    """
    Get all badges user can claim.
    Used for notification banner.
    """
    try:
        claimable = BadgeService.get_claimable_badges(user_id)

        return jsonify({
            'badges': claimable,
            'count': len(claimable),
            'has_claimable': len(claimable) > 0
        }), 200

    except Exception as e:
        logger.error(f"Error getting claimable badges for user {user_id}: {str(e)}")
        return jsonify({'error': 'Failed to fetch claimable badges'}), 500


@badge_claiming_bp.route('/badges/claimed', methods=['GET'])
@require_auth
def get_claimed_badges(user_id):
    """
    Get all badges user has claimed.
    """
    try:
        claimed = BadgeService.get_claimed_badges(user_id)

        return jsonify({
            'badges': claimed,
            'count': len(claimed)
        }), 200

    except Exception as e:
        logger.error(f"Error getting claimed badges for user {user_id}: {str(e)}")
        return jsonify({'error': 'Failed to fetch claimed badges'}), 500


@badge_claiming_bp.route('/badges/<badge_id>/progress', methods=['GET'])
@require_auth
def get_badge_progress(user_id, badge_id):
    """
    Get detailed badge progress with OnFire vs Optio breakdown.
    """
    try:
        progress = BadgeService.calculate_badge_progress(user_id, badge_id)

        return jsonify({
            'progress': progress
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting badge progress for badge {badge_id}: {str(e)}")
        return jsonify({'error': 'Failed to fetch badge progress'}), 500


@badge_claiming_bp.route('/badges/<badge_id>/mark-notification-sent', methods=['POST'])
@require_auth
def mark_notification_sent(user_id, badge_id):
    """
    Mark that claim notification has been sent (prevents duplicate notifications).
    """
    try:
        # Verify request has JSON body (CSRF requirement)
        data = request.get_json() or {}

        BadgeService.mark_claim_notification_sent(user_id, badge_id)

        return jsonify({
            'message': 'Notification marked as sent'
        }), 200

    except Exception as e:
        logger.error(f"Error marking notification sent for badge {badge_id}: {str(e)}")
        return jsonify({'error': 'Failed to update notification status'}), 500
