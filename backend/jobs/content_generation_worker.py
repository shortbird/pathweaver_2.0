"""
Content Generation Worker
Automated generation of quests and badges using AI.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
from database import get_supabase_admin_client
from services.quest_ai_service import QuestAIService
import json


class ContentGenerationWorker:
    """Worker for automated AI content generation"""

    @staticmethod
    def execute(job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute content generation job.

        Args:
            job_data: Job configuration

        Returns:
            Dict containing generation results
        """
        generation_type = job_data.get('generation_type')

        if generation_type == 'balance_pillars':
            return ContentGenerationWorker._generate_pillar_balance_content(job_data)
        elif generation_type == 'badge_quests':
            return ContentGenerationWorker._generate_badge_quests(job_data)
        elif generation_type == 'trending_topics':
            return ContentGenerationWorker._generate_trending_content(job_data)
        else:
            raise ValueError(f"Unknown generation type: {generation_type}")

    @staticmethod
    def _generate_pillar_balance_content(job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate quests to balance underrepresented pillars.

        Args:
            job_data: Configuration including target_count

        Returns:
            Dict containing generated quest IDs
        """
        supabase = get_supabase_admin_client()
        ai_service = QuestAIService()

        # Analyze pillar distribution across all quests
        all_tasks = supabase.table('quest_tasks').select('pillar').execute()

        if not all_tasks.data:
            return {'error': 'No tasks found', 'generated_quests': []}

        pillar_counts = {}
        for task in all_tasks.data:
            pillar = task.get('pillar')
            if pillar:
                pillar_counts[pillar] = pillar_counts.get(pillar, 0) + 1

        # Find underrepresented pillars
        avg_count = sum(pillar_counts.values()) / len(pillar_counts) if pillar_counts else 0
        underrepresented = sorted(
            [(pillar, count) for pillar, count in pillar_counts.items() if count < avg_count],
            key=lambda x: x[1]
        )

        target_count = job_data.get('target_count', 5)
        generated_quests = []

        # Generate quests for underrepresented pillars
        for pillar, count in underrepresented[:target_count]:
            try:
                # Create quest prompt focused on this pillar
                quest_context = {
                    'primary_pillar': pillar,
                    'difficulty': 'intermediate',
                    'focus': 'pillar_balance'
                }

                quest_data = ai_service._generate_custom_quest(quest_context)

                # Validate quality
                quality_score = ai_service.validate_quest_quality(quest_data)

                if quality_score['overall_score'] >= 0.60:
                    # Create quest
                    created_quest = ContentGenerationWorker._create_quest_from_data(
                        quest_data=quest_data,
                        source='ai_pillar_balance',
                        auto_publish=(quality_score['overall_score'] >= 0.85)
                    )

                    generated_quests.append({
                        'quest_id': created_quest['quest_id'],
                        'pillar': pillar,
                        'quality_score': quality_score['overall_score'],
                        'status': created_quest['status']
                    })

            except Exception as e:
                print(f"Error generating quest for {pillar}: {e}")
                continue

        return {
            'generation_type': 'pillar_balance',
            'underrepresented_pillars': [p[0] for p in underrepresented],
            'generated_quests': generated_quests,
            'total_generated': len(generated_quests),
            'completed_at': datetime.utcnow().isoformat()
        }

    @staticmethod
    def _generate_badge_quests(job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate quests for badges that lack sufficient content.

        Args:
            job_data: Configuration including badge_id or auto-detect

        Returns:
            Dict containing generated quest IDs
        """
        supabase = get_supabase_admin_client()
        ai_service = QuestAIService()

        target_badge_id = job_data.get('badge_id')

        if target_badge_id:
            # Generate for specific badge
            badges = [supabase.table('badges').select('*').eq('id', target_badge_id).single().execute().data]
        else:
            # Find badges with insufficient quest coverage
            all_badges = supabase.table('badges').select('*').eq('is_active', True).execute()
            badges = all_badges.data if all_badges.data else []

        generated_quests = []

        for badge in badges:
            if not badge:
                continue

            badge_id = badge['id']

            # Count existing applicable quests
            applicable_quests = supabase.table('badge_applicable_quests')\
                .select('quest_id')\
                .eq('badge_id', badge_id)\
                .execute()

            existing_count = len(applicable_quests.data) if applicable_quests.data else 0
            target_count = badge.get('min_quests', 5)

            # Generate quests if under target
            needed = max(0, target_count - existing_count)

            if needed > 0:
                for i in range(min(needed, 3)):  # Generate max 3 per badge per run
                    try:
                        quest_data = ai_service.generate_quest_for_badge(
                            badge_id=badge_id,
                            badge_context=badge
                        )

                        # Validate quality
                        quality_score = ai_service.validate_quest_quality(quest_data)

                        if quality_score['overall_score'] >= 0.60:
                            created_quest = ContentGenerationWorker._create_quest_from_data(
                                quest_data=quest_data,
                                source='ai_badge_aligned',
                                auto_publish=(quality_score['overall_score'] >= 0.85)
                            )

                            # Link to badge
                            supabase.table('badge_applicable_quests').insert({
                                'badge_id': badge_id,
                                'quest_id': created_quest['quest_id']
                            }).execute()

                            generated_quests.append({
                                'quest_id': created_quest['quest_id'],
                                'badge_id': badge_id,
                                'badge_name': badge['name'],
                                'quality_score': quality_score['overall_score'],
                                'status': created_quest['status']
                            })

                    except Exception as e:
                        print(f"Error generating quest for badge {badge_id}: {e}")
                        continue

        return {
            'generation_type': 'badge_quests',
            'badges_processed': len(badges),
            'generated_quests': generated_quests,
            'total_generated': len(generated_quests),
            'completed_at': datetime.utcnow().isoformat()
        }

    @staticmethod
    def _generate_trending_content(job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate quests based on trending topics or student interests.

        Args:
            job_data: Configuration including topics list

        Returns:
            Dict containing generated quest IDs
        """
        ai_service = QuestAIService()

        topics = job_data.get('topics', [])
        if not topics:
            # Default trending topics
            topics = [
                'artificial intelligence',
                'climate change',
                'digital citizenship',
                'mental wellness',
                'creative coding'
            ]

        generated_quests = []

        for topic in topics:
            try:
                # Generate quest focused on trending topic
                quest_context = {
                    'topic': topic,
                    'difficulty': 'intermediate',
                    'contemporary_focus': True
                }

                quest_data = ai_service._generate_custom_quest(quest_context)

                # Validate quality
                quality_score = ai_service.validate_quest_quality(quest_data)

                if quality_score['overall_score'] >= 0.60:
                    created_quest = ContentGenerationWorker._create_quest_from_data(
                        quest_data=quest_data,
                        source='ai_trending',
                        auto_publish=(quality_score['overall_score'] >= 0.85)
                    )

                    generated_quests.append({
                        'quest_id': created_quest['quest_id'],
                        'topic': topic,
                        'quality_score': quality_score['overall_score'],
                        'status': created_quest['status']
                    })

            except Exception as e:
                print(f"Error generating quest for topic '{topic}': {e}")
                continue

        return {
            'generation_type': 'trending_topics',
            'topics_processed': topics,
            'generated_quests': generated_quests,
            'total_generated': len(generated_quests),
            'completed_at': datetime.utcnow().isoformat()
        }

    @staticmethod
    def _create_quest_from_data(
        quest_data: Dict[str, Any],
        source: str,
        auto_publish: bool = False
    ) -> Dict[str, Any]:
        """
        Create a quest in the database from AI-generated data.

        Args:
            quest_data: Quest data from AI service
            source: Source identifier (e.g., 'ai_pillar_balance')
            auto_publish: Whether to publish immediately or require review

        Returns:
            Dict containing quest_id and status
        """
        supabase = get_supabase_admin_client()

        # Create quest record
        quest_insert = {
            'title': quest_data['title'],
            'description': quest_data['description'],
            'source': source,
            'is_active': auto_publish,
            'requires_review': not auto_publish,
            'created_at': datetime.utcnow().isoformat()
        }

        created_quest = supabase.table('quests').insert(quest_insert).execute()

        if not created_quest.data:
            raise Exception("Failed to create quest")

        quest_id = created_quest.data[0]['id']

        # Create tasks
        for idx, task in enumerate(quest_data.get('tasks', [])):
            task_insert = {
                'quest_id': quest_id,
                'title': task['title'],
                'description': task.get('description', ''),
                'pillar': task['pillar'],
                'xp_value': task['xp_value'],
                'order_index': idx,
                'is_required': task.get('is_required', True)
            }
            supabase.table('quest_tasks').insert(task_insert).execute()

        # Create AI content metric record
        total_xp = sum(task.get('xp_value', 0) for task in quest_data.get('tasks', []))

        metric_insert = {
            'content_type': 'quest',
            'content_id': quest_id,
            'engagement_score': 0,
            'completion_rate': 0,
            'usage_count': 0,
            'last_updated': datetime.utcnow().isoformat()
        }
        supabase.table('ai_content_metrics').insert(metric_insert).execute()

        return {
            'quest_id': quest_id,
            'status': 'published' if auto_publish else 'pending_review',
            'total_xp': total_xp,
            'task_count': len(quest_data.get('tasks', []))
        }

    @staticmethod
    def generate_badge_sequence(
        badge_count: int = 5,
        pillars: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Generate a sequence of related badges for a learning pathway.

        Args:
            badge_count: Number of badges to generate
            pillars: Target pillars (defaults to balanced selection)

        Returns:
            Dict containing generated badge IDs
        """
        supabase = get_supabase_admin_client()

        if pillars is None:
            pillars = [
                'STEM & Logic',
                'Life & Wellness',
                'Language & Communication',
                'Society & Culture',
                'Arts & Creativity'
            ]

        generated_badges = []

        for i in range(badge_count):
            pillar = pillars[i % len(pillars)]

            # Generate badge using AI
            # Note: This would require badge generation prompts in QuestAIService
            # For now, create placeholder for future implementation

            generated_badges.append({
                'pillar': pillar,
                'status': 'not_implemented'
            })

        return {
            'generation_type': 'badge_sequence',
            'generated_badges': generated_badges,
            'total_generated': len(generated_badges),
            'completed_at': datetime.utcnow().isoformat()
        }
