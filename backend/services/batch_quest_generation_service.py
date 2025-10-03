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


class BatchQuestGenerationService:
    """Service for batch quest generation with progress tracking."""

    def __init__(self):
        """Initialize the batch generation service."""
        self.supabase = get_supabase_admin_client()
        self.quest_ai_service = QuestAIService()
        self.review_service = AIQuestReviewService()

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

    def analyze_content_gaps(self) -> Dict:
        """
        Analyze the current quest library to identify content gaps.

        Returns:
            Dict with gap analysis across multiple dimensions
        """
        try:
            # Get all active quests
            quests_response = self.supabase.table('quests')\                .select('id, title, source')\
                .eq('is_active', True)\
                .execute()

            quests = quests_response.data or []
            total_quests = len(quests)

            # Get tasks and XP for pillar distribution
            pillar_distribution = {pillar: 0 for pillar in self.pillars}
            xp_levels = {
                "beginner": 0,      # 0-200 XP
                "intermediate": 0,  # 201-400 XP
                "advanced": 0       # 401+ XP
            }

            for quest in quests:
                # Get quest tasks
                tasks_response = self.supabase.table('quest_tasks')\
                    .select('pillar, xp_amount')\
                    .eq('quest_id', quest['id'])\
                    .execute()

                tasks = tasks_response.data or []
                total_xp = sum(task.get('xp_amount', 0) for task in tasks)

                # Count pillar distribution
                for task in tasks:
                    pillar = task.get('pillar')
                    if pillar in pillar_distribution:
                        pillar_distribution[pillar] += 1

                # Categorize by difficulty level
                if total_xp <= 200:
                    xp_levels["beginner"] += 1
                elif total_xp <= 400:
                    xp_levels["intermediate"] += 1
                else:
                    xp_levels["advanced"] += 1

            # Calculate percentages
            pillar_percentages = {
                pillar: (count / total_quests * 100) if total_quests > 0 else 0
                for pillar, count in pillar_distribution.items()
            }

            # Identify gaps (pillars below 15% representation)
            gaps = {
                pillar: {
                    "current_percentage": pct,
                    "deficit": max(0, 15 - pct),
                    "recommended_quests": max(0, int((15 - pct) / 100 * total_quests))
                }
                for pillar, pct in pillar_percentages.items()
                if pct < 15
            }

            # Badge coverage analysis
            badge_coverage = self._analyze_badge_coverage()

            return {
                "success": True,
                "total_quests": total_quests,
                "pillar_distribution": {
                    pillar: {
                        "count": pillar_distribution[pillar],
                        "percentage": pillar_percentages[pillar]
                    }
                    for pillar in self.pillars
                },
                "xp_level_distribution": xp_levels,
                "gaps": gaps,
                "badge_coverage": badge_coverage,
                "recommendations": self._generate_gap_recommendations(gaps, xp_levels, badge_coverage),
                "analyzed_at": datetime.utcnow().isoformat()
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def _analyze_badge_coverage(self) -> Dict:
        """Analyze how many quests are linked to each badge."""
        try:
            # Get all badges
            badges_response = self.supabase.table('badges')\
                .select('id, name, pillar')\
                .execute()

            badges = badges_response.data or []

            coverage = []
            for badge in badges:
                # Count linked quests
                links_response = self.supabase.table('badge_quests')\
                    .select('quest_id')\
                    .eq('badge_id', badge['id'])\
                    .execute()

                quest_count = len(links_response.data or [])

                coverage.append({
                    "badge_id": badge['id'],
                    "badge_name": badge['name'],
                    "pillar": badge['pillar'],
                    "linked_quests": quest_count,
                    "needs_more": quest_count < 10  # Minimum 10 quests per badge
                })

            return coverage

        except Exception as e:
            print(f"Error analyzing badge coverage: {e}")
            return []

    def _generate_gap_recommendations(
        self,
        gaps: Dict,
        xp_levels: Dict,
        badge_coverage: List[Dict]
    ) -> List[Dict]:
        """Generate specific recommendations for filling content gaps."""
        recommendations = []

        # Pillar gaps
        for pillar, gap_info in gaps.items():
            if gap_info['recommended_quests'] > 0:
                recommendations.append({
                    "type": "pillar_gap",
                    "priority": "high" if gap_info['deficit'] > 10 else "medium",
                    "pillar": pillar,
                    "recommendation": f"Create {gap_info['recommended_quests']} more quests for {self.pillar_display_names[pillar]}",
                    "reason": f"Currently only {gap_info['current_percentage']:.1f}% of quests",
                    "suggested_count": gap_info['recommended_quests']
                })

        # XP level balance
        total_xp_quests = sum(xp_levels.values())
        if total_xp_quests > 0:
            beginner_pct = xp_levels["beginner"] / total_xp_quests * 100
            intermediate_pct = xp_levels["intermediate"] / total_xp_quests * 100
            advanced_pct = xp_levels["advanced"] / total_xp_quests * 100

            if beginner_pct < 40:
                recommendations.append({
                    "type": "difficulty_gap",
                    "priority": "medium",
                    "level": "beginner",
                    "recommendation": f"Create more beginner-friendly quests (0-200 XP)",
                    "reason": f"Only {beginner_pct:.1f}% are beginner level",
                    "suggested_count": 5
                })

            if advanced_pct > 40:
                recommendations.append({
                    "type": "difficulty_gap",
                    "priority": "low",
                    "level": "beginner/intermediate",
                    "recommendation": "Too many advanced quests - balance with easier options",
                    "reason": f"{advanced_pct:.1f}% are advanced level",
                    "suggested_count": 3
                })

        # Badge coverage gaps
        badges_needing_quests = [b for b in badge_coverage if b['needs_more']]
        if badges_needing_quests:
            for badge in badges_needing_quests[:3]:  # Top 3 most urgent
                recommendations.append({
                    "type": "badge_gap",
                    "priority": "high",
                    "badge_id": badge['badge_id'],
                    "badge_name": badge['badge_name'],
                    "pillar": badge['pillar'],
                    "recommendation": f"Create more quests for '{badge['badge_name']}' badge",
                    "reason": f"Only {badge['linked_quests']} quests linked (minimum 10)",
                    "suggested_count": 10 - badge['linked_quests']
                })

        return sorted(recommendations, key=lambda x: {
            'high': 0, 'medium': 1, 'low': 2
        }[x['priority']])

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
            batch_id: Optional ID for tracking this batch

        Returns:
            Dict with batch generation results and progress
        """
        if count < 1 or count > 20:
            return {
                "success": False,
                "error": "Batch size must be between 1 and 20"
            }

        batch_id = batch_id or str(uuid.uuid4())

        results = {
            "batch_id": batch_id,
            "total_requested": count,
            "generated": [],
            "failed": [],
            "submitted_to_review": 0,
            "started_at": datetime.utcnow().isoformat()
        }

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
                    difficulty_level=difficulty_level
                )

                if quest_data.get('success'):
                    # Submit to review queue
                    review_result = self.review_service.submit_for_review(
                        quest_data['quest'],
                        generation_source='batch_generation',
                        batch_id=batch_id
                    )

                    if review_result.get('success'):
                        results['generated'].append({
                            "quest_title": quest_data['quest']['title'],
                            "review_queue_id": review_result['review_queue_id'],
                            "quality_score": quest_data.get('quality_score', 0)
                        })
                        results['submitted_to_review'] += 1
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
            print(f"Error getting badge context: {e}")
            return None

    def _generate_single_quest(
        self,
        target_pillar: Optional[str] = None,
        badge_context: Optional[Dict] = None,
        difficulty_level: Optional[str] = None
    ) -> Dict:
        """Generate a single quest with specified parameters."""
        # Build generation prompt based on parameters
        constraints = []

        if target_pillar:
            constraints.append(f"Primary pillar: {self.pillar_display_names.get(target_pillar, target_pillar)}")

        if badge_context:
            constraints.append(f"Badge alignment: {badge_context['name']}")
            constraints.append(f"Badge description: {badge_context.get('description', '')}")

        if difficulty_level == "beginner":
            constraints.append("Difficulty: Beginner (total XP: 100-200)")
        elif difficulty_level == "intermediate":
            constraints.append("Difficulty: Intermediate (total XP: 201-400)")
        elif difficulty_level == "advanced":
            constraints.append("Difficulty: Advanced (total XP: 401-800)")

        # Use QuestAIService to generate
        try:
            result = self.quest_ai_service.generate_quest(
                description=f"Generate a quest with the following requirements:\n" + "\n".join(constraints),
                source='batch_generation',
                submit_for_review=False  # We'll handle review submission
            )

            return result
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
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
        Get the status of a batch generation job.

        Args:
            batch_id: Batch ID to check

        Returns:
            Dict with batch status and generated quests
        """
        try:
            # Query review queue for this batch
            response = self.supabase.table('ai_quest_review_queue')\
                .select('*')\
                .eq('generation_source', 'batch_generation')\
                .eq('batch_id', batch_id)\
                .execute()

            quests = response.data or []

            status = {
                "batch_id": batch_id,
                "total_generated": len(quests),
                "pending_review": len([q for q in quests if q['review_status'] == 'pending_review']),
                "approved": len([q for q in quests if q['review_status'] == 'approved']),
                "rejected": len([q for q in quests if q['review_status'] == 'rejected']),
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
