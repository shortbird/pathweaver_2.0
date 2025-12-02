"""
Batch Quest Generation Service

Handles batch generation of quests for:
- Content gap filling
- Badge-aligned generation
- Bulk quest creation

Includes content gap analysis to identify missing areas.
"""

import google.generativeai as genai
import os
import json
import uuid
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from services.base_service import BaseService
from database import get_supabase_admin_client
from services.quest_ai_service import QuestAIService
from services.ai_quest_review_service import AIQuestReviewService
from services.quest_concept_matcher import QuestConceptMatcher
from services.cost_tracker import CostTracker

from utils.logger import get_logger

logger = get_logger(__name__)


class BatchQuestGenerationService(BaseService):
    """Service for batch quest generation with progress tracking."""

    def __init__(self, user_id: Optional[str] = None):
        """Initialize the batch generation service."""
        super().__init__(user_id)

        self.quest_ai_service = QuestAIService()
        self.review_service = AIQuestReviewService()
        self.concept_matcher = QuestConceptMatcher()
        self.cost_tracker = CostTracker()

        # Philosophy and pillars for context
        self.philosophy = """
        Optio's Core Philosophy: "The Process Is The Goal"
        - Learning is about who you become through the journey
        - Celebrate growth happening RIGHT NOW, not future potential
        - Focus on how learning FEELS, not how it LOOKS
        - Every step, attempt, and mistake is valuable
        """

        self.pillars = [
            "life_wellness",
            "language_communication",
            "stem_logic",
            "society_culture",
            "arts_creativity"
        ]

        self.pillar_display_names = {
            "life_wellness": "Life & Wellness",
            "language_communication": "Language & Communication",
            "stem_logic": "STEM & Logic",
            "society_culture": "Society & Culture",
            "arts_creativity": "Arts & Creativity"
        }

    # Content gap analysis removed - unnecessary in V3 personalized quest system
    # In V3, tasks are created per-student when they start quests, not as quest templates

    def _get_recent_quest_titles(self, limit: int = 50) -> List[str]:
        """Fetch recent quest titles to avoid duplicates."""
        try:
            response = self.supabase.table('quests')\
                .select('title')\
                .eq('is_active', True)\
                .order('created_at', desc=True)\
                .limit(limit)\
                .execute()

            return [q['title'] for q in response.data] if response.data else []
        except Exception as e:
            logger.error(f"Error fetching recent quest titles: {e}")
            return []

    def _get_diverse_title_sample(self, sample_size: int = 100) -> List[str]:
        """
        Get a diverse sample of quest titles to avoid duplicates.
        Uses stratified sampling to get variety across the entire library.
        """
        try:
            # Get total count
            count_response = self.supabase.table('quests')\
                .select('id', count='exact')\
                .eq('is_active', True)\
                .execute()

            total_quests = count_response.count

            if total_quests <= sample_size:
                # If we have fewer quests than sample size, get all
                response = self.supabase.table('quests')\
                    .select('title')\
                    .eq('is_active', True)\
                    .execute()
                return [q['title'] for q in response.data] if response.data else []

            # Use stratified sampling - get evenly spaced samples
            step = max(1, total_quests // sample_size)
            sampled_titles = []

            for i in range(0, total_quests, step):
                response = self.supabase.table('quests')\
                    .select('title')\
                    .eq('is_active', True)\
                    .order('created_at', desc=False)\
                    .range(i, i)\
                    .execute()

                if response.data:
                    sampled_titles.append(response.data[0]['title'])

                if len(sampled_titles) >= sample_size:
                    break

            logger.info(f"Sampled {len(sampled_titles)} diverse titles from {total_quests} total quests")
            return sampled_titles[:sample_size]

        except Exception as e:
            logger.error(f"Error getting diverse title sample: {e}")
            return []

    def _get_all_active_quests(self) -> List[Dict]:
        """Fetch all active quests for similarity checking."""
        try:
            response = self.supabase.table('quests')\
                .select('id, title, big_idea')\
                .eq('is_active', True)\
                .execute()

            return response.data if response.data else []
        except Exception as e:
            logger.error(f"Error fetching active quests: {e}")
            return []

    def _get_all_quests_including_pending(self) -> List[Dict]:
        """
        Fetch ALL quests that exist: active + review queue.
        This prevents generating duplicates of quests awaiting approval.
        """
        all_quests = []

        try:
            # Get all active quests
            active = self.supabase.table('quests')\
                .select('id, title, big_idea, description')\
                .eq('is_active', True)\
                .execute()

            all_quests.extend(active.data or [])

            # Get quests in review queue (pending or pending_review status)
            review_queue = self.supabase.table('ai_quest_review_queue')\
                .select('id, quest_data')\
                .in_('status', ['pending', 'pending_review'])\
                .execute()

            # Extract quest data from review queue
            for item in (review_queue.data or []):
                quest_data = item.get('quest_data', {})
                if quest_data.get('title'):
                    all_quests.append({
                        'id': f"pending_{item['id']}",  # Temporary ID
                        'title': quest_data.get('title'),
                        'big_idea': quest_data.get('big_idea') or quest_data.get('description', '')
                    })

            logger.info(f"Loaded {len(all_quests)} total quests for duplicate checking "
                       f"({len(active.data or [])} active + {len(review_queue.data or [])} pending)")

            return all_quests

        except Exception as e:
            logger.error(f"Error fetching all quests: {e}")
            return all_quests

    def _check_concept_clustering(self, recent_generated: List[Dict], window_size: int = 10) -> Dict:
        """
        Check if recent generations are clustering around similar concepts.
        Returns warning if we're generating too many similar quests.
        """
        if len(recent_generated) < window_size:
            return {"clustering": False}

        # Get last N quests
        recent = recent_generated[-window_size:]

        # Extract all concepts
        all_concepts = []
        for quest in recent:
            concepts = self.concept_matcher.extract_concepts(quest)
            all_concepts.extend(concepts.get('activities', []))
            all_concepts.extend(concepts.get('topics', []))

        # Check for repeated concepts
        from collections import Counter
        concept_counts = Counter(all_concepts)
        most_common = concept_counts.most_common(5)

        # If any concept appears in >50% of recent quests, we're clustering
        clustering_threshold = window_size * 0.5
        is_clustering = any(count > clustering_threshold for _, count in most_common)

        if is_clustering:
            clustered_concepts = [concept for concept, count in most_common
                                 if count > clustering_threshold]
            return {
                "clustering": True,
                "concepts": clustered_concepts,
                "recommendation": f"Detected concept clustering: {', '.join(clustered_concepts)}"
            }

        return {"clustering": False}

    def generate_batch(
        self,
        count: int,
        target_pillar: Optional[str] = None,
        target_badge_id: Optional[str] = None,
        difficulty_level: Optional[str] = None,
        batch_id: Optional[str] = None
    ) -> Dict:
        """
        Generate multiple quests in a batch.

        Args:
            count: Number of quests to generate
            target_pillar: Optional pillar to focus on
            target_badge_id: Optional badge to align with
            difficulty_level: Optional difficulty (beginner/intermediate/advanced)
            batch_id: Optional ID for tracking this batch (not stored in DB, just for response tracking)

        Returns:
            Dict with batch generation results and progress
        """
        if count < 1 or count > 200:
            return {
                "success": False,
                "error": "Batch size must be between 1 and 200"
            }

        batch_id = batch_id or str(uuid.uuid4())  # Used only for response tracking

        # Estimate cost before starting
        cost_estimate = self.cost_tracker.estimate_batch_cost(count)
        logger.info(f"Starting batch generation of {count} quests. Estimated cost: ${cost_estimate['total_cost_usd']:.4f}")

        results = {
            "batch_id": batch_id,
            "total_requested": count,
            "generated": [],
            "failed": [],
            "submitted_to_review": 0,
            "similarity_metrics": [],
            "clustering_warnings": [],
            "started_at": datetime.utcnow().isoformat(),
            "estimated_cost_usd": cost_estimate['total_cost_usd']
        }

        # ENHANCED DUPLICATE PREVENTION
        # 1. Get ALL quests including review queue
        all_existing_quests = self._get_all_quests_including_pending()

        # 2. Get diverse title sample for AI prompts (100 titles across entire history)
        avoid_titles = self._get_diverse_title_sample(sample_size=100)

        # 3. Track batch-generated quests
        batch_generated_quests = []

        # Get badge context if targeting a badge
        badge_context = None
        if target_badge_id:
            badge_context = self._get_badge_context(target_badge_id)

        for i in range(count):
            try:
                # 4. Check for concept clustering every 10 quests
                if i > 0 and i % 10 == 0:
                    cluster_check = self._check_concept_clustering(batch_generated_quests)
                    if cluster_check['clustering']:
                        # Add clustered concepts to avoid list
                        avoid_titles.extend(cluster_check['concepts'])
                        results['clustering_warnings'].append({
                            "at_quest": i,
                            "clustered_concepts": cluster_check['concepts'],
                            "recommendation": cluster_check['recommendation']
                        })
                        logger.warning(f"Quest {i}: {cluster_check['recommendation']}")

                # Generate quest with full duplicate checking
                quest_data = self._generate_single_quest(
                    target_pillar=target_pillar,
                    badge_context=badge_context,
                    difficulty_level=difficulty_level,
                    avoid_titles=avoid_titles,
                    existing_quests=all_existing_quests + batch_generated_quests  # Check everything!
                )

                if quest_data.get('success'):
                    quest = quest_data['quest']

                    # Track for this batch
                    batch_generated_quests.append(quest)

                    # Add to avoid list (rolling window to keep manageable)
                    avoid_titles.append(quest['title'])
                    if len(avoid_titles) > 150:
                        avoid_titles = avoid_titles[-150:]

                    # Submit to review queue
                    review_result = self.review_service.submit_for_review(
                        quest_data=quest,
                        quality_score=quest_data.get('quality_score', 7.0),
                        ai_feedback=quest_data.get('ai_feedback', {}),
                        generation_source='batch',
                        badge_id=target_badge_id,
                        generation_metrics=quest_data.get('generation_metrics')
                    )

                    if review_result.get('success'):
                        results['generated'].append({
                            "quest_title": quest['title'],
                            "review_queue_id": review_result['review_queue_id'],
                            "quality_score": quest_data.get('quality_score', 0)
                        })
                        results['submitted_to_review'] += 1

                        # Track similarity metrics if available
                        if quest_data.get('similarity_check'):
                            similarity_score = quest_data['similarity_check'].get('score', 0)
                            most_similar = quest_data['similarity_check'].get('most_similar', {})

                            # Only log if not comparing to itself (avoid false positives)
                            if most_similar and most_similar.get('title') != quest['title']:
                                results['similarity_metrics'].append({
                                    "quest_title": quest['title'],
                                    "similarity_score": similarity_score,
                                    "most_similar_to": most_similar.get('title')
                                })

                                # Log warning for high similarity (excluding self-matches)
                                if similarity_score > 0.6:
                                    logger.warning(f"Quest '{quest['title']}' has {similarity_score:.0%} similarity to '{most_similar.get('title')}'")

                    else:
                        results['failed'].append({
                            "error": "Failed to submit to review queue",
                            "details": review_result.get('error')
                        })
                else:
                    results['failed'].append({
                        "error": "Quest generation failed",
                        "details": quest_data.get('error')
                    })

            except Exception as e:
                logger.error(f"Error generating quest {i+1}: {str(e)}")
                results['failed'].append({
                    "error": str(e),
                    "quest_number": i + 1
                })

        results['completed_at'] = datetime.utcnow().isoformat()
        results['success'] = results['submitted_to_review'] > 0

        return results

    def _get_badge_context(self, badge_id: str) -> Optional[Dict]:
        """Get badge details for context-aware generation."""
        try:
            response = self.supabase.table('badges')\
                .select('*')\
                .eq('id', badge_id)\
                .single()\
                .execute()

            return response.data
        except Exception as e:
            logger.error(f"Error getting badge context: {e}")
            return None

    def _generate_single_quest(
        self,
        target_pillar: Optional[str] = None,
        badge_context: Optional[Dict] = None,
        difficulty_level: Optional[str] = None,
        avoid_titles: Optional[List[str]] = None,
        existing_quests: Optional[List[Dict]] = None
    ) -> Dict:
        """
        Generate a single lightweight quest concept with duplicate checking.

        Returns quest with title and big_idea only (no predefined tasks).
        """
        max_attempts = 2  # Try twice if first attempt is too similar
        similarity_threshold = 0.7

        for attempt in range(max_attempts):
            try:
                # Generate quest concept using lightweight method
                result = self.quest_ai_service.generate_quest_concept(
                    avoid_titles=avoid_titles or []
                )

                if not result.get('success'):
                    return result

                quest_concept = result['quest']

                # Check for similarity with existing quests
                if existing_quests:
                    similarity_check = self.concept_matcher.check_quest_similarity(
                        new_quest=quest_concept,
                        existing_quests=existing_quests,
                        threshold=similarity_threshold
                    )

                    # If too similar and we have attempts left, try again
                    if similarity_check['exceeds_threshold'] and attempt < max_attempts - 1:
                        # Add the similar quest title to avoid list
                        if similarity_check.get('most_similar'):
                            avoid_titles = (avoid_titles or []) + [similarity_check['most_similar']['title']]
                        continue

                    # Include similarity check in result
                    result['similarity_check'] = similarity_check

                return result

            except Exception as e:
                if attempt == max_attempts - 1:
                    return {
                        "success": False,
                        "error": str(e)
                    }

        return {
            "success": False,
            "error": "Failed to generate unique quest after multiple attempts"
        }

    def generate_for_badge(self, badge_id: str, count: int = 5) -> Dict:
        """
        Generate quests specifically aligned with a badge.

        Args:
            badge_id: Badge to generate quests for
            count: Number of quests to generate

        Returns:
            Dict with generation results
        """
        return self.generate_batch(
            count=count,
            target_badge_id=badge_id
        )

    def get_batch_status(self, batch_id: str) -> Dict:
        """
        Get the status of batch-generated quests.
        Note: batch_id is not stored in DB, so this returns all recent batch quests.

        Args:
            batch_id: Batch ID (not used for DB query, just returned in response)

        Returns:
            Dict with batch status and generated quests
        """
        try:
            # Query recent batch-generated quests from review queue
            response = self.supabase.table('ai_quest_review_queue')\
                .select('*')\
                .eq('generation_source', 'batch')\
                .order('submitted_at', desc=True)\
                .limit(20)\
                .execute()

            quests = response.data or []

            status = {
                "batch_id": batch_id,
                "total_generated": len(quests),
                "pending_review": len([q for q in quests if q['status'] == 'pending_review']),
                "approved": len([q for q in quests if q['status'] == 'approved']),
                "rejected": len([q for q in quests if q['status'] == 'rejected']),
                "quests": quests
            }

            return {
                "success": True,
                "status": status
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
