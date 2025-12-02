"""
AI Quest Review Queue Routes
Allows admins to review and approve/reject AI-generated quests
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_admin
from database import get_supabase_admin_client
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

ai_quest_review_bp = Blueprint('ai_quest_review', __name__)


@ai_quest_review_bp.route('', methods=['GET'])
@require_admin
def get_review_queue(user_id):
    """
    Get quests from AI review queue.

    Query params:
    - status: Filter by status (pending_review, approved, rejected, all)
    - generation_source: Filter by source (batch, manual, badge_aligned, etc.)
    - page: Page number (default: 1)
    - per_page: Items per page (default: 20)

    Returns:
        List of quests awaiting review with metadata
    """
    try:
        supabase = get_supabase_admin_client()

        # Get query parameters
        status = request.args.get('status', 'pending_review')
        generation_source = request.args.get('generation_source', None)
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))

        # Build query
        query = supabase.table('ai_quest_review_queue').select('*', count='exact')

        # Apply filters
        if status and status != 'all':
            query = query.eq('status', status)

        if generation_source:
            query = query.eq('generation_source', generation_source)

        # Order by most recent first
        query = query.order('submitted_at', desc=True)

        # Pagination
        start = (page - 1) * per_page
        end = start + per_page - 1
        query = query.range(start, end)

        # Execute query
        response = query.execute()

        total_count = response.count if hasattr(response, 'count') else len(response.data)
        total_pages = (total_count + per_page - 1) // per_page

        return jsonify({
            'success': True,
            'quests': response.data,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_count': total_count,
                'total_pages': total_pages
            }
        }), 200

    except Exception as e:
        logger.error(f"Error fetching review queue: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch review queue',
            'details': str(e)
        }), 500


@ai_quest_review_bp.route('/<quest_review_id>/approve', methods=['POST'])
@require_admin
def approve_quest(user_id, quest_review_id):
    """
    Approve a quest from review queue and create it as an active quest.

    Args:
        quest_review_id: ID of the quest in review queue

    Request body (optional):
        {
            "admin_notes": "Optional notes from admin",
            "modifications": {
                "title": "Modified title",
                "big_idea": "Modified description"
            }
        }

    Returns:
        Created quest data
    """
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json() or {}

        # Get quest from review queue
        review_response = supabase.table('ai_quest_review_queue')\
            .select('*')\
            .eq('id', quest_review_id)\
            .single()\
            .execute()

        if not review_response.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found in review queue'
            }), 404

        review_item = review_response.data
        quest_data = review_item['quest_data']

        # Apply modifications if provided
        modifications = data.get('modifications', {})
        if modifications.get('title'):
            quest_data['title'] = modifications['title']
        if modifications.get('big_idea'):
            quest_data['big_idea'] = modifications['big_idea']

        # Create the quest in quests table
        new_quest = {
            'title': quest_data['title'],
            'description': quest_data.get('big_idea') or quest_data.get('description'),
            'quest_type': 'optio',  # AI-generated quests are Optio type
            'is_active': True
        }

        quest_response = supabase.table('quests')\
            .insert(new_quest)\
            .execute()

        if not quest_response.data:
            raise Exception("Failed to create quest")

        created_quest = quest_response.data[0]

        # Update review queue status
        supabase.table('ai_quest_review_queue')\
            .update({
                'status': 'approved',
                'reviewer_id': user_id,
                'reviewed_at': 'now()',
                'review_notes': data.get('admin_notes'),
                'was_edited': bool(modifications),
                'created_quest_id': created_quest['id']
            })\
            .eq('id', quest_review_id)\
            .execute()

        logger.info(f"Quest '{created_quest['title']}' approved by admin {user_id}")

        return jsonify({
            'success': True,
            'quest': created_quest,
            'message': 'Quest approved and created successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error approving quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to approve quest',
            'details': str(e)
        }), 500


@ai_quest_review_bp.route('/<quest_review_id>/reject', methods=['POST'])
@require_admin
def reject_quest(user_id, quest_review_id):
    """
    Reject a quest from review queue.

    Args:
        quest_review_id: ID of the quest in review queue

    Request body (optional):
        {
            "reason": "Reason for rejection"
        }

    Returns:
        Success message
    """
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json() or {}

        # Update review queue status
        response = supabase.table('ai_quest_review_queue')\
            .update({
                'status': 'rejected',
                'reviewer_id': user_id,
                'reviewed_at': 'now()',
                'review_notes': data.get('reason', 'Rejected by admin')
            })\
            .eq('id', quest_review_id)\
            .execute()

        if not response.data:
            return jsonify({
                'success': False,
                'error': 'Quest not found in review queue'
            }), 404

        logger.info(f"Quest review {quest_review_id} rejected by admin {user_id}")

        return jsonify({
            'success': True,
            'message': 'Quest rejected successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error rejecting quest: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to reject quest',
            'details': str(e)
        }), 500


@ai_quest_review_bp.route('/bulk-approve', methods=['POST'])
@require_admin
def bulk_approve_quests(user_id):
    """
    Approve multiple quests at once.

    Request body:
        {
            "quest_review_ids": ["id1", "id2", "id3"]
        }

    Returns:
        Summary of bulk approval
    """
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json()

        if not data or 'quest_review_ids' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: quest_review_ids'
            }), 400

        quest_review_ids = data['quest_review_ids']

        if not isinstance(quest_review_ids, list) or len(quest_review_ids) == 0:
            return jsonify({
                'success': False,
                'error': 'quest_review_ids must be a non-empty array'
            }), 400

        approved = []
        failed = []

        for quest_review_id in quest_review_ids:
            try:
                # Get quest from review queue
                review_response = supabase.table('ai_quest_review_queue')\
                    .select('*')\
                    .eq('id', quest_review_id)\
                    .single()\
                    .execute()

                if not review_response.data:
                    failed.append({'id': quest_review_id, 'error': 'Not found'})
                    continue

                review_item = review_response.data
                quest_data = review_item['quest_data']

                # Create the quest
                new_quest = {
                    'title': quest_data['title'],
                    'description': quest_data.get('big_idea') or quest_data.get('description'),
                    'quest_type': 'optio',
                    'is_active': True
                }

                quest_response = supabase.table('quests')\
                    .insert(new_quest)\
                    .execute()

                if not quest_response.data:
                    failed.append({'id': quest_review_id, 'error': 'Failed to create quest'})
                    continue

                created_quest = quest_response.data[0]

                # Update review queue status
                supabase.table('ai_quest_review_queue')\
                    .update({
                        'status': 'approved',
                        'reviewer_id': user_id,
                        'reviewed_at': 'now()',
                        'created_quest_id': created_quest['id']
                    })\
                    .eq('id', quest_review_id)\
                    .execute()

                approved.append({
                    'id': quest_review_id,
                    'quest_id': created_quest['id'],
                    'title': created_quest['title']
                })

            except Exception as e:
                failed.append({'id': quest_review_id, 'error': str(e)})

        logger.info(f"Bulk approval: {len(approved)} approved, {len(failed)} failed")

        return jsonify({
            'success': True,
            'approved': approved,
            'failed': failed,
            'summary': {
                'total_requested': len(quest_review_ids),
                'approved_count': len(approved),
                'failed_count': len(failed)
            }
        }), 200

    except Exception as e:
        logger.error(f"Error in bulk approval: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to perform bulk approval',
            'details': str(e)
        }), 500
