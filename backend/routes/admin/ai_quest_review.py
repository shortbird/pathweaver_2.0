"""
Admin AI Quest Review Routes
API endpoints for managing AI-generated quest review workflow.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_admin
from services.ai_quest_review_service import AIQuestReviewService

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_ai_quest_review', __name__, url_prefix='/api/admin/ai-quest-review')


@bp.route('/items', methods=['GET'])
@require_admin
def get_review_items(user_id):
    """
    Get quest review items.

    Query params:
        - limit: Max items to return (default: 20)
        - offset: Pagination offset (default: 0)
        - status: Filter by status (pending_review, approved, rejected, edited)
        - generation_source: Filter by source (manual, batch, student_idea, badge_aligned)
        - badge_id: Filter by badge
    """
    try:
        limit = min(int(request.args.get('limit', 20)), 100)
        offset = int(request.args.get('offset', 0))

        filters = {}
        if request.args.get('status'):
            filters['status'] = request.args.get('status')
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


@bp.route('/<review_id>/refresh-image', methods=['POST'])
@require_admin
def refresh_review_quest_image(user_id, review_id):
    """
    Generate a new Pexels image for a quest in review queue.

    Path params:
        review_id: Review queue item UUID

    Returns updated quest_data with new image_url
    """
    try:
        from database import get_supabase_admin_client
        from services.image_service import search_quest_image

        supabase = get_supabase_admin_client()

        # Fetch review item
        review_result = supabase.table('ai_quest_review_queue').select('*').eq('id', review_id).single().execute()

        if not review_result.data:
            return jsonify({
                'success': False,
                'error': 'Review item not found'
            }), 404

        review_item = review_result.data
        quest_data = review_item['quest_data']

        # Get quest title and description for image search
        quest_title = quest_data.get('title', '')
        quest_desc = quest_data.get('big_idea', '') or quest_data.get('description', '')

        if not quest_title:
            return jsonify({
                'success': False,
                'error': 'Quest title is required for image generation'
            }), 400

        # Search for new image
        image_url = search_quest_image(quest_title, quest_desc)

        if not image_url:
            return jsonify({
                'success': False,
                'error': 'Failed to find suitable image'
            }), 500

        # Update quest_data with new image
        quest_data['image_url'] = image_url
        quest_data['header_image_url'] = image_url  # Legacy compatibility

        # Update review queue item
        update_result = supabase.table('ai_quest_review_queue').update({
            'quest_data': quest_data,
            'was_edited': True
        }).eq('id', review_id).execute()

        if not update_result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to update quest data'
            }), 500

        return jsonify({
            'success': True,
            'message': 'Image refreshed successfully',
            'quest_data': quest_data,
            'image_url': image_url
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to refresh image: {str(e)}'
        }), 500


@bp.route('/<review_id>/upload-image', methods=['POST'])
@require_admin
def upload_review_quest_image(user_id, review_id):
    """
    Upload a custom image for a quest in review queue.

    Path params:
        review_id: Review queue item UUID

    Request: multipart/form-data with 'file' field

    Returns updated quest_data with uploaded image_url
    """
    try:
        from database import get_supabase_admin_client
        import uuid
        from datetime import datetime

        supabase = get_supabase_admin_client()

        # Validate file exists
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided'
            }), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400

        # Validate file type
        allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
        file_ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''

        if file_ext not in allowed_extensions:
            return jsonify({
                'success': False,
                'error': f'Invalid file type. Allowed: {", ".join(allowed_extensions)}'
            }), 400

        # Validate file size (5MB max)
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Reset to beginning

        max_size = 5 * 1024 * 1024  # 5MB
        if file_size > max_size:
            return jsonify({
                'success': False,
                'error': 'File size must be less than 5MB'
            }), 400

        # Fetch review item
        review_result = supabase.table('ai_quest_review_queue').select('*').eq('id', review_id).single().execute()

        if not review_result.data:
            return jsonify({
                'success': False,
                'error': 'Review item not found'
            }), 404

        review_item = review_result.data
        quest_data = review_item['quest_data']

        # Generate unique filename
        unique_filename = f"quest-review-{review_id}-{uuid.uuid4()}.{file_ext}"
        storage_path = f"quest_images/{unique_filename}"

        # Upload to Supabase storage
        file_bytes = file.read()
        upload_result = supabase.storage.from_('quest-images').upload(
            storage_path,
            file_bytes,
            {'content-type': file.content_type}
        )

        # Get public URL
        public_url = supabase.storage.from_('quest-images').get_public_url(storage_path)

        # Update quest_data with uploaded image
        quest_data['image_url'] = public_url
        quest_data['header_image_url'] = public_url  # Legacy compatibility

        # Update review queue item
        update_result = supabase.table('ai_quest_review_queue').update({
            'quest_data': quest_data,
            'was_edited': True
        }).eq('id', review_id).execute()

        if not update_result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to update quest data'
            }), 500

        return jsonify({
            'success': True,
            'message': 'Image uploaded successfully',
            'quest_data': quest_data,
            'image_url': public_url
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to upload image: {str(e)}'
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
