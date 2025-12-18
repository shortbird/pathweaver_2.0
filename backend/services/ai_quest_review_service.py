"""
AI Quest Review Service
Manages the workflow for reviewing, approving, and rejecting AI-generated quests.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
from services.base_service import BaseService
from database import get_supabase_admin_client
import json

from utils.logger import get_logger

logger = get_logger(__name__)


class AIQuestReviewService(BaseService):
    """Service for managing AI-generated quest review workflow"""

    @staticmethod
    def submit_for_review(
        quest_data: Dict[str, Any],
        quality_score: float,
        ai_feedback: Dict[str, Any],
        generation_source: str = 'manual',
        badge_id: Optional[str] = None,
        generation_metrics: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Submit an AI-generated quest for admin review.

        Args:
            quest_data: Complete quest structure (title, big_idea, tasks, etc.)
            quality_score: AI quality score (0-10)
            ai_feedback: AI feedback with strengths, weaknesses, improvements
            generation_source: Source of generation (manual, batch, student_idea, badge_aligned)
            badge_id: Optional badge this quest was generated for
            generation_metrics: Optional metrics (tokens, time, model, etc.)

        Returns:
            Dict with review queue item and metrics record
        """
        try:
            supabase = get_supabase_admin_client()

            # Insert into review queue
            # Note: JSONB columns accept dict/object directly, not JSON strings
            review_queue_data = {
                'quest_data': quest_data,  # JSONB accepts dict directly
                'quality_score': float(quality_score) if quality_score is not None else None,
                'ai_feedback': ai_feedback if ai_feedback else {},  # JSONB accepts dict directly
                'status': 'pending_review',
                'generation_source': generation_source,
                'badge_id': badge_id if badge_id else None
                # submitted_at has default value in DB, don't need to set it
            }

            logger.debug(f"DEBUG: Attempting to insert review queue data: {review_queue_data}")

            review_result = supabase.table('ai_quest_review_queue').insert(review_queue_data).execute()

            if not review_result.data:
                logger.error(f"DEBUG: Insert failed. Review result: {review_result}")
                raise ValueError(f"Failed to insert into review queue. Result: {review_result}")

            review_item = review_result.data[0]
            review_queue_id = review_item['id']

            # Insert generation metrics if provided
            if generation_metrics:
                metrics_data = {
                    'review_queue_id': review_queue_id,
                    'generation_source': generation_source,
                    'prompt_version': generation_metrics.get('prompt_version'),
                    'model_name': generation_metrics.get('model_name'),
                    'time_to_generate_ms': generation_metrics.get('time_to_generate_ms'),
                    'prompt_tokens': generation_metrics.get('prompt_tokens'),
                    'completion_tokens': generation_metrics.get('completion_tokens'),
                    'total_tokens': generation_metrics.get('total_tokens'),
                    'quality_score': quality_score
                }

                supabase.table('ai_generation_metrics').insert(metrics_data).execute()

            return {
                'success': True,
                'review_queue_id': review_queue_id,
                'review_item': review_item,
                'message': 'Quest submitted for review successfully'
            }

        except Exception as e:
            logger.error(f"DEBUG: Exception in submit_for_review: {str(e)}")
            logger.error(f"DEBUG: Exception type: {type(e).__name__}")
            import traceback
            return {
                'success': False,
                'error': f"Failed to submit for review: {str(e)}"
            }

    @staticmethod
    def get_pending_reviews(
        limit: int = 20,
        offset: int = 0,
        filters: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Get quests awaiting review.

        Args:
            limit: Maximum number of items to return
            offset: Pagination offset
            filters: Optional filters (status, generation_source, badge_id)

        Returns:
            Dict with review items and pagination info
        """
        try:
            supabase = get_supabase_admin_client()

            # Build query
            query = supabase.table('ai_quest_review_queue')\
                .select('*', count='exact')\
                .order('submitted_at', desc=True)

            # Apply filters
            if filters:
                if 'status' in filters:
                    query = query.eq('status', filters['status'])
                else:
                    # Default to pending if no status specified
                    query = query.eq('status', 'pending_review')

                if 'generation_source' in filters:
                    query = query.eq('generation_source', filters['generation_source'])

                if 'badge_id' in filters:
                    query = query.eq('badge_id', filters['badge_id'])
            else:
                # Default to pending reviews
                query = query.eq('status', 'pending_review')

            # Apply pagination
            query = query.range(offset, offset + limit - 1)

            result = query.execute()

            # Parse JSONB fields
            items = []
            for item in result.data:
                parsed_item = item.copy()
                if isinstance(item.get('quest_data'), str):
                    parsed_item['quest_data'] = json.loads(item['quest_data'])
                if isinstance(item.get('ai_feedback'), str):
                    parsed_item['ai_feedback'] = json.loads(item['ai_feedback'])
                items.append(parsed_item)

            return {
                'success': True,
                'items': items,
                'total': result.count,
                'limit': limit,
                'offset': offset,
                'has_more': result.count > (offset + limit) if result.count else False
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to fetch pending reviews: {str(e)}",
                'items': [],
                'total': 0
            }

    @staticmethod
    def get_review_by_id(review_id: str) -> Dict[str, Any]:
        """
        Get specific review item by ID.

        Args:
            review_id: Review queue item UUID

        Returns:
            Dict with review item data
        """
        try:
            supabase = get_supabase_admin_client()

            result = supabase.table('ai_quest_review_queue')\
                .select('*')\
                .eq('id', review_id)\
                .single()\
                .execute()

            if not result.data:
                return {
                    'success': False,
                    'error': 'Review item not found'
                }

            item = result.data.copy()

            # Parse JSONB fields
            if isinstance(item.get('quest_data'), str):
                item['quest_data'] = json.loads(item['quest_data'])
            if isinstance(item.get('ai_feedback'), str):
                item['ai_feedback'] = json.loads(item['ai_feedback'])

            return {
                'success': True,
                'item': item
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to fetch review: {str(e)}"
            }

    @staticmethod
    def approve_quest(
        review_id: str,
        reviewer_id: str,
        notes: Optional[str] = None,
        create_quest: bool = True
    ) -> Dict[str, Any]:
        """
        Approve an AI-generated quest and optionally create it in the database.

        Args:
            review_id: Review queue item UUID
            reviewer_id: User ID of reviewer (admin)
            notes: Optional review notes
            create_quest: Whether to create the quest in database (default: True)

        Returns:
            Dict with created quest data and review update
        """
        try:
            supabase = get_supabase_admin_client()

            # Get review item
            review_result = AIQuestReviewService.get_review_by_id(review_id)
            if not review_result['success']:
                return review_result

            review_item = review_result['item']
            quest_data = review_item['quest_data']

            created_quest_id = None

            # Create quest if requested
            if create_quest:
                # Insert quest
                quest_record = {
                    'title': quest_data['title'],
                    'big_idea': quest_data.get('big_idea', ''),
                    'source': quest_data.get('source', 'ai_generated'),
                    'is_active': True
                }

                quest_response = supabase.table('quests').insert(quest_record).execute()

                if not quest_response.data:
                    raise ValueError("Failed to create quest")

                created_quest = quest_response.data[0]
                created_quest_id = created_quest['id']

                # Note: In V3, tasks are NOT created as templates
                # Tasks are generated per-student when they start the quest via personalization system
                # No need to insert into quest_tasks (that table is archived)

                # Link to badge if applicable
                if review_item.get('badge_id'):
                    supabase.table('badge_quests').insert({
                        'badge_id': review_item['badge_id'],
                        'quest_id': created_quest_id
                    }).execute()

            # Update review queue item
            update_data = {
                'status': 'approved',
                'reviewer_id': reviewer_id,
                'review_notes': notes,
                'reviewed_at': datetime.utcnow().isoformat(),
                'created_quest_id': created_quest_id
            }

            supabase.table('ai_quest_review_queue').update(update_data).eq('id', review_id).execute()

            # Update generation metrics
            supabase.table('ai_generation_metrics')\
                .update({'approved': True, 'quest_id': created_quest_id})\
                .eq('review_queue_id', review_id)\
                .execute()

            return {
                'success': True,
                'quest_id': created_quest_id,
                'review_id': review_id,
                'message': 'Quest approved successfully'
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to approve quest: {str(e)}"
            }

    @staticmethod
    def reject_quest(
        review_id: str,
        reviewer_id: str,
        reason: str
    ) -> Dict[str, Any]:
        """
        Reject an AI-generated quest.

        Args:
            review_id: Review queue item UUID
            reviewer_id: User ID of reviewer (admin)
            reason: Reason for rejection

        Returns:
            Dict with success status
        """
        try:
            supabase = get_supabase_admin_client()

            # Update review queue item
            update_data = {
                'status': 'rejected',
                'reviewer_id': reviewer_id,
                'review_notes': reason,
                'reviewed_at': datetime.utcnow().isoformat()
            }

            result = supabase.table('ai_quest_review_queue').update(update_data).eq('id', review_id).execute()

            if not result.data:
                return {
                    'success': False,
                    'error': 'Review item not found'
                }

            # Update generation metrics
            supabase.table('ai_generation_metrics')\
                .update({'approved': False, 'rejection_reason': reason})\
                .eq('review_queue_id', review_id)\
                .execute()

            return {
                'success': True,
                'review_id': review_id,
                'message': 'Quest rejected successfully'
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to reject quest: {str(e)}"
            }

    @staticmethod
    def update_quest_data(
        review_id: str,
        updated_quest_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update quest data in review queue (for editing before approval).

        Args:
            review_id: Review queue item UUID
            updated_quest_data: Modified quest data

        Returns:
            Dict with success status
        """
        try:
            supabase = get_supabase_admin_client()

            update_data = {
                'quest_data': json.dumps(updated_quest_data) if isinstance(updated_quest_data, dict) else updated_quest_data,
                'was_edited': True,
                'status': 'edited'
            }

            result = supabase.table('ai_quest_review_queue').update(update_data).eq('id', review_id).execute()

            if not result.data:
                return {
                    'success': False,
                    'error': 'Review item not found'
                }

            return {
                'success': True,
                'review_id': review_id,
                'message': 'Quest data updated successfully'
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to update quest data: {str(e)}"
            }

    @staticmethod
    def get_review_stats() -> Dict[str, Any]:
        """
        Get statistics about the review queue.

        Returns:
            Dict with queue statistics
        """
        try:
            supabase = get_supabase_admin_client()

            # Use the database function if available, otherwise calculate manually
            try:
                result = supabase.rpc('get_ai_review_queue_stats').execute()
                if result.data and len(result.data) > 0:
                    stats = result.data[0]
                    return {
                        'success': True,
                        'stats': stats
                    }
            except:
                pass

            # Fallback: Manual calculation
            all_items = supabase.table('ai_quest_review_queue').select('status, submitted_at, reviewed_at').execute()

            pending = sum(1 for item in all_items.data if item['status'] == 'pending_review')
            approved = sum(1 for item in all_items.data if item['status'] == 'approved')
            rejected = sum(1 for item in all_items.data if item['status'] == 'rejected')

            return {
                'success': True,
                'stats': {
                    'pending_count': pending,
                    'approved_count': approved,
                    'rejected_count': rejected,
                    'total_submissions': len(all_items.data)
                }
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to get stats: {str(e)}",
                'stats': {}
            }

    @staticmethod
    def get_review_history(quest_id: str) -> Dict[str, Any]:
        """
        Get review history for a specific quest.

        Args:
            quest_id: Quest UUID

        Returns:
            Dict with review history
        """
        try:
            supabase = get_supabase_admin_client()

            result = supabase.table('ai_quest_review_queue')\
                .select('*, users!reviewer_id(first_name, last_name)')\
                .eq('created_quest_id', quest_id)\
                .execute()

            items = []
            for item in result.data:
                parsed_item = item.copy()
                if isinstance(item.get('quest_data'), str):
                    parsed_item['quest_data'] = json.loads(item['quest_data'])
                if isinstance(item.get('ai_feedback'), str):
                    parsed_item['ai_feedback'] = json.loads(item['ai_feedback'])
                items.append(parsed_item)

            return {
                'success': True,
                'history': items
            }

        except Exception as e:
            return {
                'success': False,
                'error': f"Failed to get review history: {str(e)}",
                'history': []
            }

    @staticmethod
    def batch_approve(review_ids: List[str], reviewer_id: str) -> Dict[str, Any]:
        """
        Approve multiple quests at once.

        Args:
            review_ids: List of review queue item UUIDs
            reviewer_id: User ID of reviewer

        Returns:
            Dict with batch operation results
        """
        results = {
            'success': True,
            'approved': [],
            'failed': []
        }

        for review_id in review_ids:
            result = AIQuestReviewService.approve_quest(review_id, reviewer_id)
            if result['success']:
                results['approved'].append(review_id)
            else:
                results['failed'].append({'review_id': review_id, 'error': result.get('error')})

        if results['failed']:
            results['success'] = False

        return results

    @staticmethod
    def batch_reject(review_ids: List[str], reviewer_id: str, reason: str) -> Dict[str, Any]:
        """
        Reject multiple quests at once.

        Args:
            review_ids: List of review queue item UUIDs
            reviewer_id: User ID of reviewer
            reason: Reason for rejection

        Returns:
            Dict with batch operation results
        """
        results = {
            'success': True,
            'rejected': [],
            'failed': []
        }

        for review_id in review_ids:
            result = AIQuestReviewService.reject_quest(review_id, reviewer_id, reason)
            if result['success']:
                results['rejected'].append(review_id)
            else:
                results['failed'].append({'review_id': review_id, 'error': result.get('error')})

        if results['failed']:
            results['success'] = False

        return results
