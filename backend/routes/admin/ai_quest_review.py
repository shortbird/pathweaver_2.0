"""
Admin AI Quest Review Routes
API endpoints for managing AI-generated quest review workflow.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_admin
from services.ai_quest_review_service import AIQuestReviewService

bp = Blueprint('admin_ai_quest_review', __name__, url_prefix='/api/v3/admin/ai-quest-review')


@bp.route('/pending', methods=['GET'])
@require_admin
def get_pending_reviews(user_id):
    """
    Get quests awaiting review.

    Query params:
        - limit: Max items to return (default: 20)
        - offset: Pagination offset (default: 0)
        - status: Filter by status (pending_review, approved, rejected, edited)
        - quality_score_min: Minimum quality score filter
        - generation_source: Filter by source (manual, batch, student_idea, badge_aligned)
        - badge_id: Filter by badge
    """
    try:
        limit = min(int(request.args.get('limit', 20)), 100)
        offset = int(request.args.get('offset', 0))

        filters = {}
        if request.args.get('status'):
            filters['status'] = request.args.get('status')
        if request.args.get('quality_score_min'):
            filters['quality_score_min'] = float(request.args.get('quality_score_min'))
        if request.args.get('generation_source'):
            filters['generation_source'] = request.args.get('generation_source')
        if request.args.get('badge_id'):
            filters['badge_id'] = request.args.get('badge_id')

        result = AIQuestReviewService.get_pending_reviews(
            limit=limit,
            offset=offset,
            filters=filters if filters else None
        )

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch reviews: {str(e)}'
        }), 500


@bp.route('/<review_id>', methods=['GET'])
@require_admin
def get_review(user_id, review_id):
    """
    Get specific review item by ID.

    Path params:
        review_id: Review queue item UUID
    """
    try:
        result = AIQuestReviewService.get_review_by_id(review_id)

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 404

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch review: {str(e)}'
        }), 500


@bp.route('/<review_id>/approve', methods=['POST'])
@require_admin
def approve_quest(user_id, review_id):
    """
    Approve an AI-generated quest and create it in database.

    Path params:
        review_id: Review queue item UUID

    Request body:
        - notes: Optional review notes
        - create_quest: Whether to create quest (default: true)
    """
    try:
        data = request.get_json() or {}

        notes = data.get('notes')
        create_quest = data.get('create_quest', True)

        result = AIQuestReviewService.approve_quest(
            review_id=review_id,
            reviewer_id=user_id,
            notes=notes,
            create_quest=create_quest
        )

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to approve quest: {str(e)}'
        }), 500


@bp.route('/<review_id>/reject', methods=['POST'])
@require_admin
def reject_quest(user_id, review_id):
    """
    Reject an AI-generated quest.

    Path params:
        review_id: Review queue item UUID

    Request body:
        - reason: Reason for rejection (required)
    """
    try:
        data = request.get_json()

        if not data or 'reason' not in data:
            return jsonify({
                'success': False,
                'error': 'Rejection reason is required'
            }), 400

        reason = data['reason']

        result = AIQuestReviewService.reject_quest(
            review_id=review_id,
            reviewer_id=user_id,
            reason=reason
        )

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to reject quest: {str(e)}'
        }), 500


@bp.route('/<review_id>/edit', methods=['PUT'])
@require_admin
def update_quest_data(user_id, review_id):
    """
    Update quest data in review queue (for editing before approval).

    Path params:
        review_id: Review queue item UUID

    Request body:
        - quest_data: Updated quest data structure
    """
    try:
        data = request.get_json()

        if not data or 'quest_data' not in data:
            return jsonify({
                'success': False,
                'error': 'Updated quest_data is required'
            }), 400

        quest_data = data['quest_data']

        result = AIQuestReviewService.update_quest_data(
            review_id=review_id,
            updated_quest_data=quest_data
        )

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to update quest data: {str(e)}'
        }), 500


@bp.route('/stats', methods=['GET'])
@require_admin
def get_stats(user_id):
    """
    Get review queue statistics.

    Returns:
        - pending_count: Number of quests awaiting review
        - approved_count: Number of approved quests
        - rejected_count: Number of rejected quests
        - avg_quality_score: Average AI quality score
        - total_submissions: Total number of submissions
    """
    try:
        result = AIQuestReviewService.get_review_stats()

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to get stats: {str(e)}'
        }), 500


@bp.route('/history/<quest_id>', methods=['GET'])
@require_admin
def get_review_history(user_id, quest_id):
    """
    Get review history for a specific quest.

    Path params:
        quest_id: Quest UUID
    """
    try:
        result = AIQuestReviewService.get_review_history(quest_id)

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to get review history: {str(e)}'
        }), 500


@bp.route('/batch/approve', methods=['POST'])
@require_admin
def batch_approve(user_id):
    """
    Approve multiple quests at once.

    Request body:
        - review_ids: Array of review queue item UUIDs
    """
    try:
        data = request.get_json()

        if not data or 'review_ids' not in data:
            return jsonify({
                'success': False,
                'error': 'review_ids array is required'
            }), 400

        review_ids = data['review_ids']

        if not isinstance(review_ids, list) or len(review_ids) == 0:
            return jsonify({
                'success': False,
                'error': 'review_ids must be a non-empty array'
            }), 400

        result = AIQuestReviewService.batch_approve(review_ids, user_id)

        return jsonify(result), 200 if result['success'] else 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to batch approve: {str(e)}'
        }), 500


@bp.route('/batch/reject', methods=['POST'])
@require_admin
def batch_reject(user_id):
    """
    Reject multiple quests at once.

    Request body:
        - review_ids: Array of review queue item UUIDs
        - reason: Rejection reason (required)
    """
    try:
        data = request.get_json()

        if not data or 'review_ids' not in data or 'reason' not in data:
            return jsonify({
                'success': False,
                'error': 'review_ids array and reason are required'
            }), 400

        review_ids = data['review_ids']
        reason = data['reason']

        if not isinstance(review_ids, list) or len(review_ids) == 0:
            return jsonify({
                'success': False,
                'error': 'review_ids must be a non-empty array'
            }), 400

        result = AIQuestReviewService.batch_reject(review_ids, user_id, reason)

        return jsonify(result), 200 if result['success'] else 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to batch reject: {str(e)}'
        }), 500
