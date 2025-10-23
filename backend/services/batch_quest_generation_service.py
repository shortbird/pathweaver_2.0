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
from database import get_supabase_admin_client
from services.quest_ai_service import QuestAIService
from services.ai_quest_review_service import AIQuestReviewService
from services.quest_concept_matcher import QuestConceptMatcher

from utils.logger import get_logger

logger = get_logger(__name__)


class BatchQuestGenerationService:
    """Service for batch quest generation with progress tracking."""

    def __init__(self):
        """Initialize the batch generation service."""
        self.supabase = get_supabase_admin_client()
        self.quest_ai_service = QuestAIService()
        self.review_service = AIQuestReviewService()
        self.concept_matcher = QuestConceptMatcher()

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
        if count < 1 or count > 20:
            return {
                "success": False,
                "error": "Batch size must be between 1 and 20"
            }

        batch_id = batch_id or str(uuid.uuid4())  # Used only for response tracking

        results = {
            "batch_id": batch_id,
            "total_requested": count,
            "generated": [],
            "failed": [],
            "submitted_to_review": 0,
            "similarity_metrics": [],
            "started_at": datetime.utcnow().isoformat()
        }

        # Get existing quests for duplicate prevention
        recent_titles = self._get_recent_quest_titles(limit=50)
        all_active_quests = self._get_all_active_quests()

        # Get badge context if targeting a badge
        badge_context = None
        if target_badge_id:
            badge_context = self._get_badge_context(target_badge_id)

        for i in range(count):
            try:
                # Generate quest based on parameters
                quest_data = self._generate_single_quest(
                    target_pillar=target_pillar,
                    badge_context=badge_context,
                    difficulty_level=difficulty_level,
                    avoid_titles=recent_titles,
                    existing_quests=all_active_quests
                )

                if quest_data.get('success'):
                    # Submit to review queue
                    review_result = self.review_service.submit_for_review(
                        quest_data=quest_data['quest'],
                        quality_score=quest_data.get('quality_score', 7.0),
                        ai_feedback=quest_data.get('ai_feedback', {}),
                        generation_source='batch',
                        badge_id=target_badge_id,
                        generation_metrics=quest_data.get('generation_metrics')
                    )

                    if review_result.get('success'):
                        results['generated'].append({
                            "quest_title": quest_data['quest']['title'],
                            "review_queue_id": review_result['review_queue_id'],
                            "quality_score": quest_data.get('quality_score', 0)
                        })
                        results['submitted_to_review'] += 1

                        # Track similarity metrics if available
                        if quest_data.get('similarity_check'):
                            results['similarity_metrics'].append({
                                "quest_title": quest_data['quest']['title'],
                                "similarity_score": quest_data['similarity_check'].get('score', 0),
                                "most_similar_to": quest_data['similarity_check'].get('most_similar', {}).get('title')
                            })

                        # Add generated quest title to avoid list for next iterations
                        recent_titles.append(quest_data['quest']['title'])
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
