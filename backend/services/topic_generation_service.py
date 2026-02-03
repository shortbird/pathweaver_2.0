"""
AI-powered topic generation service for quest discovery.
Uses Google Gemini to extract topics from quest title and big_idea.
"""

import json
import os
import re
from typing import Dict, List, Optional, Any
import google.generativeai as genai

from services.base_service import BaseService
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# Topic taxonomy - parent categories and their subtopics
TOPIC_TAXONOMY = {
    "Creative": ["Music", "Art", "Design", "Animation", "Film", "Writing", "Photography", "Crafts"],
    "Science": ["Biology", "Chemistry", "Physics", "Technology", "Research", "Astronomy", "Environment"],
    "Building": ["3D Printing", "Engineering", "Robotics", "DIY", "Woodworking", "Electronics", "Maker"],
    "Nature": ["Gardening", "Wildlife", "Outdoors", "Sustainability", "Plants", "Animals", "Hiking"],
    "Business": ["Entrepreneurship", "Finance", "Marketing", "Leadership", "Startups", "Economics"],
    "Personal": ["Wellness", "Fitness", "Mindfulness", "Skills", "Philosophy", "Self-Improvement"],
    "Academic": ["Reading", "Math", "History", "Languages", "Literature", "Geography", "Social Studies"],
    "Food": ["Cooking", "Nutrition", "Baking", "Culinary", "Food Science"],
    "Games": ["Board Games", "Video Games", "Puzzles", "Strategy", "Sports"]
}

# Flat list of all valid topics
ALL_TOPICS = []
for category, subtopics in TOPIC_TAXONOMY.items():
    ALL_TOPICS.extend(subtopics)

# Map subtopics to their parent category
TOPIC_TO_CATEGORY = {}
for category, subtopics in TOPIC_TAXONOMY.items():
    for topic in subtopics:
        TOPIC_TO_CATEGORY[topic.lower()] = category


class TopicGenerationService(BaseService):
    """Service for AI-powered topic extraction from quest content."""

    def __init__(self):
        """Initialize the service with Gemini configuration."""
        super().__init__()
        self._supabase = None
        self.api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite')

        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not configured.")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)

    @property
    def supabase(self):
        """Lazy-load Supabase admin client on first access."""
        if self._supabase is None:
            self._supabase = get_supabase_admin_client()
        return self._supabase

    def generate_topics(self, title: str, big_idea: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate topics for a quest based on its title and big_idea.

        Args:
            title: The quest title
            big_idea: Optional big idea/description

        Returns:
            Dict with:
                - primary: The main category (e.g., "Creative", "Science")
                - topics: List of specific topics (e.g., ["Music", "Art"])
                - success: Boolean indicating if generation succeeded
        """
        try:
            content = f"Title: {title}"
            if big_idea:
                content += f"\nDescription: {big_idea}"

            prompt = f"""Analyze this educational quest and identify its topics.

{content}

TOPIC CATEGORIES AND SUBTOPICS:
{self._format_taxonomy()}

INSTRUCTIONS:
1. Identify 1-4 specific subtopics that best match this quest
2. Determine which parent category is the PRIMARY focus
3. Only use topics from the list above - do not invent new ones
4. Choose the most specific matching topics

Return ONLY valid JSON (no markdown):
{{
  "primary": "CategoryName",
  "topics": ["Topic1", "Topic2"]
}}

Example for "Learn to play guitar":
{{"primary": "Creative", "topics": ["Music"]}}

Example for "Build a robot arm":
{{"primary": "Building", "topics": ["Robotics", "Engineering", "Electronics"]}}
"""

            response = self.model.generate_content(prompt)
            if not response or not response.text:
                raise Exception("Empty response from Gemini API")

            result = self._parse_response(response.text)

            # Validate and normalize the result
            validated = self._validate_topics(result)

            return {
                'success': True,
                'primary': validated['primary'],
                'topics': validated['topics']
            }

        except Exception as e:
            logger.error(f"Failed to generate topics for '{title}': {str(e)}")
            # Return a sensible default based on simple keyword matching
            fallback = self._fallback_topic_detection(title, big_idea)
            return {
                'success': False,
                'error': str(e),
                'primary': fallback['primary'],
                'topics': fallback['topics']
            }

    def _format_taxonomy(self) -> str:
        """Format the topic taxonomy for the prompt."""
        lines = []
        for category, subtopics in TOPIC_TAXONOMY.items():
            lines.append(f"- {category}: {', '.join(subtopics)}")
        return "\n".join(lines)

    def _parse_response(self, text: str) -> Dict:
        """Parse the JSON response from Gemini."""
        # Clean up markdown code blocks if present
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r'^```(?:json)?\s*', '', text)
            text = re.sub(r'\s*```$', '', text)

        return json.loads(text)

    def _validate_topics(self, result: Dict) -> Dict:
        """Validate and normalize the topic result."""
        primary = result.get('primary', 'Personal')
        topics = result.get('topics', [])

        # Ensure primary is a valid category
        if primary not in TOPIC_TAXONOMY:
            # Try to find it case-insensitively
            for cat in TOPIC_TAXONOMY.keys():
                if cat.lower() == primary.lower():
                    primary = cat
                    break
            else:
                primary = 'Personal'  # Default fallback

        # Validate each topic
        valid_topics = []
        for topic in topics:
            # Check if it's a valid subtopic (case-insensitive)
            for cat, subtopics in TOPIC_TAXONOMY.items():
                for subtopic in subtopics:
                    if subtopic.lower() == topic.lower():
                        valid_topics.append(subtopic)
                        break

        # Ensure at least one topic
        if not valid_topics:
            # Use first subtopic of the primary category
            valid_topics = [TOPIC_TAXONOMY[primary][0]]

        return {
            'primary': primary,
            'topics': valid_topics[:4]  # Max 4 topics
        }

    def _fallback_topic_detection(self, title: str, big_idea: Optional[str]) -> Dict:
        """Simple keyword-based fallback when AI fails."""
        text = (title + " " + (big_idea or "")).lower()

        # Simple keyword matching
        keywords = {
            'Creative': ['music', 'art', 'draw', 'paint', 'design', 'film', 'photo', 'write', 'animation', 'craft'],
            'Science': ['science', 'biology', 'chemistry', 'physics', 'research', 'experiment', 'lab'],
            'Building': ['build', '3d print', 'robot', 'engineering', 'maker', 'construct', 'diy', 'wood'],
            'Nature': ['garden', 'plant', 'nature', 'outdoor', 'wildlife', 'environment', 'hike', 'animal'],
            'Business': ['business', 'entrepreneur', 'startup', 'finance', 'marketing', 'money', 'company'],
            'Personal': ['wellness', 'fitness', 'health', 'mindful', 'skill', 'habit', 'philosophy'],
            'Academic': ['read', 'book', 'math', 'history', 'language', 'literature', 'study'],
            'Food': ['cook', 'bake', 'food', 'recipe', 'culinary', 'nutrition'],
            'Games': ['game', 'puzzle', 'chess', 'sport', 'play']
        }

        # Count matches per category
        scores = {}
        for category, words in keywords.items():
            scores[category] = sum(1 for word in words if word in text)

        # Get category with highest score
        primary = max(scores, key=scores.get) if max(scores.values()) > 0 else 'Personal'

        return {
            'primary': primary,
            'topics': [TOPIC_TAXONOMY[primary][0]]
        }

    def backfill_all_quests(self, batch_size: int = 10, delay_seconds: float = 0.5) -> Dict[str, Any]:
        """
        Backfill topics for all quests that don't have them.

        Args:
            batch_size: Number of quests to process at a time
            delay_seconds: Delay between batches to avoid rate limiting

        Returns:
            Dict with counts of processed, success, and failed quests
        """
        import time

        try:
            # Get all quests without topics
            result = self.supabase.table('quests').select(
                'id, title, big_idea, topics, topic_primary'
            ).eq('is_active', True).execute()

            quests = result.data or []

            # Filter to only quests needing topics
            quests_to_process = [
                q for q in quests
                if not q.get('topic_primary') or not q.get('topics')
            ]

            logger.info(f"Backfilling topics for {len(quests_to_process)} quests")

            processed = 0
            success_count = 0
            failed_count = 0
            results = []

            for i, quest in enumerate(quests_to_process):
                try:
                    # Generate topics
                    topic_result = self.generate_topics(
                        quest['title'],
                        quest.get('big_idea')
                    )

                    # Update the quest
                    update_data = {
                        'topic_primary': topic_result['primary'],
                        'topics': topic_result['topics']
                    }

                    self.supabase.table('quests').update(update_data).eq(
                        'id', quest['id']
                    ).execute()

                    success_count += 1
                    results.append({
                        'id': quest['id'],
                        'title': quest['title'],
                        'primary': topic_result['primary'],
                        'topics': topic_result['topics'],
                        'success': True
                    })

                    logger.info(f"[{i+1}/{len(quests_to_process)}] {quest['title']} -> {topic_result['primary']}: {topic_result['topics']}")

                except Exception as e:
                    failed_count += 1
                    results.append({
                        'id': quest['id'],
                        'title': quest['title'],
                        'error': str(e),
                        'success': False
                    })
                    logger.error(f"Failed to process quest {quest['id']}: {e}")

                processed += 1

                # Rate limiting delay
                if (i + 1) % batch_size == 0 and i < len(quests_to_process) - 1:
                    time.sleep(delay_seconds)

            return {
                'success': True,
                'total': len(quests_to_process),
                'processed': processed,
                'succeeded': success_count,
                'failed': failed_count,
                'results': results
            }

        except Exception as e:
            logger.error(f"Backfill failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'total': 0,
                'processed': 0,
                'succeeded': 0,
                'failed': 0
            }

    def get_topic_stats(self) -> Dict[str, Any]:
        """Get counts of quests per topic category."""
        try:
            result = self.supabase.table('quests').select(
                'topic_primary'
            ).eq('is_active', True).eq('is_public', True).execute()

            quests = result.data or []

            # Count by category
            counts = {}
            for quest in quests:
                primary = quest.get('topic_primary')
                if primary:
                    counts[primary] = counts.get(primary, 0) + 1

            # Sort by count
            sorted_topics = sorted(
                [{'name': k, 'count': v} for k, v in counts.items()],
                key=lambda x: x['count'],
                reverse=True
            )

            return {
                'success': True,
                'topics': sorted_topics,
                'total': sum(counts.values())
            }

        except Exception as e:
            logger.error(f"Failed to get topic stats: {e}")
            return {
                'success': False,
                'error': str(e),
                'topics': [],
                'total': 0
            }


# Singleton instance
_topic_service = None

def get_topic_generation_service() -> TopicGenerationService:
    """Get or create the singleton topic generation service."""
    global _topic_service
    if _topic_service is None:
        _topic_service = TopicGenerationService()
    return _topic_service
