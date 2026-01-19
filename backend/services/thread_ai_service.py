"""
Thread AI Service
=================

AI-powered features for Curiosity Threads including:
- Finding related moments
- Generating thread narratives
- Detecting hidden threads in unlinked moments

Uses BaseAIService for Gemini integration.
"""

from typing import Dict, List, Optional, Any
from services.base_ai_service import BaseAIService
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


class ThreadAIService(BaseAIService):
    """AI service for curiosity thread features."""

    def find_related_moments(
        self,
        moment: Dict,
        all_moments: List[Dict],
        limit: int = 5
    ) -> Dict[str, Any]:
        """
        Find moments that could be related to a given moment.

        Args:
            moment: The source moment
            all_moments: All user moments to search through
            limit: Maximum related moments to return

        Returns:
            Dict with related moments and relationship reasons
        """
        if not all_moments:
            return {
                'success': True,
                'related_moments': []
            }

        # Filter out the source moment
        candidates = [m for m in all_moments if m.get('id') != moment.get('id')]

        if not candidates:
            return {
                'success': True,
                'related_moments': []
            }

        # Format candidates for prompt
        candidates_text = '\n---\n'.join([
            f"ID: {m.get('id')}\n"
            f"Title: {m.get('title', 'Untitled')}\n"
            f"Description: {m.get('description', '')[:300]}\n"
            f"Pillars: {', '.join(m.get('pillars', []))}"
            for m in candidates[:30]  # Limit to prevent context overflow
        ])

        prompt = f"""Find learning moments that are semantically related to this source moment.

SOURCE MOMENT:
Title: {moment.get('title', 'Untitled')}
Description: {moment.get('description', '')}
Pillars: {', '.join(moment.get('pillars', []))}

CANDIDATE MOMENTS:
{candidates_text}

Analyze the candidates and identify up to {limit} moments that are meaningfully related.

Consider:
- Topic similarity (same subject area)
- Skill progression (one builds on another)
- Complementary knowledge (different angles on same concept)
- Thematic connections (related interests)
- Cause and effect (one sparked curiosity leading to another)

Return JSON:
{{
  "related": [
    {{
      "id": "moment_id",
      "relationship_type": "builds_on|complements|same_topic|sparked_by|leads_to",
      "reason": "Brief explanation of the connection"
    }}
  ]
}}

Only include moments with meaningful connections. If no strong connections exist, return empty array.
"""

        try:
            result = self.generate_json(prompt, strict=False)

            if not result:
                return {
                    'success': True,
                    'related_moments': []
                }

            related = result.get('related', [])[:limit]

            # Enrich with full moment data
            related_with_data = []
            for rel in related:
                moment_data = next(
                    (m for m in candidates if m.get('id') == rel.get('id')),
                    None
                )
                if moment_data:
                    related_with_data.append({
                        **moment_data,
                        'relationship_type': rel.get('relationship_type', 'related'),
                        'relationship_reason': rel.get('reason', '')
                    })

            return {
                'success': True,
                'related_moments': related_with_data
            }

        except Exception as e:
            logger.error(f"Error finding related moments: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def generate_thread_narrative(
        self,
        thread_moments: List[Dict]
    ) -> Dict[str, Any]:
        """
        Generate a narrative summary of a thread of connected moments.

        Args:
            thread_moments: List of moments in the thread (in order)

        Returns:
            Dict with narrative text and insights
        """
        if not thread_moments:
            return {
                'success': False,
                'error': 'No moments provided'
            }

        # Format thread for prompt
        thread_text = '\n---\n'.join([
            f"#{i+1}: {m.get('title', 'Untitled')}\n"
            f"Description: {m.get('description', '')[:400]}\n"
            f"Date: {m.get('created_at', 'Unknown')[:10]}"
            for i, m in enumerate(thread_moments)
        ])

        prompt = f"""Analyze this learning thread and generate a narrative summary.

LEARNING THREAD ({len(thread_moments)} moments):
{thread_text}

Generate a brief narrative that:
1. Describes the learning journey represented by this thread
2. Identifies key insights or growth patterns
3. Notes how the learning evolved or deepened
4. Suggests where this thread might lead next

Return JSON:
{{
  "narrative": "2-3 sentence narrative of the learning journey",
  "theme": "The central theme or topic (2-4 words)",
  "growth_pattern": "Type of learning progression (exploration|deepening|application|synthesis)",
  "key_insight": "One key insight from this thread",
  "potential_next_step": "Where this learning might lead next"
}}
"""

        try:
            result = self.generate_json(prompt, strict=False)

            if not result:
                return {
                    'success': False,
                    'error': 'Failed to generate narrative'
                }

            return {
                'success': True,
                'narrative': result.get('narrative', ''),
                'theme': result.get('theme', ''),
                'growth_pattern': result.get('growth_pattern', ''),
                'key_insight': result.get('key_insight', ''),
                'potential_next_step': result.get('potential_next_step', '')
            }

        except Exception as e:
            logger.error(f"Error generating thread narrative: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def detect_hidden_threads(
        self,
        moments: List[Dict],
        min_thread_size: int = 3
    ) -> Dict[str, Any]:
        """
        Detect potential threads in moments that aren't explicitly linked.

        Args:
            moments: List of moments to analyze
            min_thread_size: Minimum moments to form a thread

        Returns:
            Dict with detected thread clusters
        """
        if len(moments) < min_thread_size:
            return {
                'success': True,
                'hidden_threads': [],
                'message': 'Not enough moments to detect threads'
            }

        # Format moments for analysis
        moments_text = '\n---\n'.join([
            f"ID: {m.get('id')}\n"
            f"Title: {m.get('title', 'Untitled')}\n"
            f"Description: {m.get('description', '')[:200]}\n"
            f"Pillars: {', '.join(m.get('pillars', []))}\n"
            f"Date: {m.get('created_at', '')[:10]}"
            for m in moments[:40]  # Limit context size
        ])

        prompt = f"""Analyze these learning moments and identify hidden threads - groups of related moments that form a coherent learning journey but aren't explicitly linked.

MOMENTS:
{moments_text}

Find clusters of {min_thread_size}+ moments that belong together thematically or represent a learning progression.

Return JSON:
{{
  "hidden_threads": [
    {{
      "theme": "Brief theme description",
      "moment_ids": ["id1", "id2", "id3"],
      "connection_type": "topic|progression|interest|skill",
      "confidence": 0.85,
      "narrative": "Brief description of how these connect"
    }}
  ]
}}

Rules:
- Only include threads with strong connections (confidence > 0.6)
- Each moment can appear in at most one thread
- Maximum 5 threads
- Moments should genuinely connect, not just share a pillar
"""

        try:
            result = self.generate_json(prompt, strict=False)

            if not result:
                return {
                    'success': True,
                    'hidden_threads': []
                }

            threads = result.get('hidden_threads', [])

            # Validate and enrich threads
            validated_threads = []
            for thread in threads:
                moment_ids = thread.get('moment_ids', [])
                if len(moment_ids) >= min_thread_size:
                    # Get full moment data for each ID
                    thread_moments = [
                        m for m in moments
                        if m.get('id') in moment_ids
                    ]
                    if len(thread_moments) >= min_thread_size:
                        validated_threads.append({
                            'theme': thread.get('theme', 'Unknown'),
                            'moments': thread_moments,
                            'connection_type': thread.get('connection_type', 'topic'),
                            'confidence': thread.get('confidence', 0.5),
                            'narrative': thread.get('narrative', '')
                        })

            return {
                'success': True,
                'hidden_threads': validated_threads
            }

        except Exception as e:
            logger.error(f"Error detecting hidden threads: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
