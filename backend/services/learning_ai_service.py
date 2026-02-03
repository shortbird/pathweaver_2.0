"""
Learning AI Service
===================

AI-powered features for learning moments including:
- Title and pillar suggestions from descriptions
- Related moment discovery
- Track suggestions

Uses BaseAIService for Gemini integration.
"""

from typing import Dict, List, Optional, Any
from services.base_ai_service import BaseAIService
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


class LearningAIService(BaseAIService):
    """AI service for learning moment features."""

    # New simplified pillar names (updated January 2025)
    VALID_PILLARS = [
        'art',
        'stem',
        'wellness',
        'communication',
        'civics'
    ]

    # Legacy pillar names for backward compatibility
    LEGACY_PILLAR_MAP = {
        'arts_creativity': 'art',
        'creativity': 'art',
        'stem_logic': 'stem',
        'critical_thinking': 'stem',
        'language_communication': 'communication',
        'society_culture': 'civics',
        'cultural_literacy': 'civics',
        'life_wellness': 'wellness',
        'practical_skills': 'wellness'
    }

    PILLAR_DESCRIPTIONS = {
        'art': 'Original creation, artistic expression, innovation (art, music, design, crafts, creative writing)',
        'stem': 'Analysis, problem-solving, technical skills (science, math, programming, engineering, research)',
        'wellness': 'Physical activity, practical skills, personal development (health, cooking, organization, self-care)',
        'communication': 'Expression, connection, teaching, sharing ideas (writing, speaking, reading, foreign languages)',
        'civics': 'Understanding context, community impact, global awareness (history, social studies, current events)'
    }

    def suggest_title_and_pillars(self, description: str) -> Dict[str, Any]:
        """
        Generate title and pillar suggestions from a learning moment description.

        Args:
            description: The user's description of what they learned

        Returns:
            Dict with 'title', 'pillars', and 'confidence' fields
        """
        if not description or len(description.strip()) < 10:
            return {
                'success': False,
                'error': 'Description too short for meaningful suggestions'
            }

        pillar_list = '\n'.join([f'- {p}: {d}' for p, d in self.PILLAR_DESCRIPTIONS.items()])

        prompt = f"""Analyze this learning moment description and suggest a title and relevant learning pillars.

Description:
"{description}"

Available pillars:
{pillar_list}

Respond with JSON in this exact format:
{{
  "title": "A concise, engaging title (5-10 words)",
  "pillars": ["pillar_1", "pillar_2"],
  "confidence": 0.85,
  "reasoning": "Brief explanation of why these pillars fit"
}}

Rules:
- Title should capture the essence of the learning, not just repeat the description
- Select 1-3 pillars that best match the learning activity
- Use ONLY pillar names from the list above (exact spelling)
- Confidence is 0.0-1.0 based on how clearly the description matches the pillars
- Keep reasoning under 50 words
"""

        try:
            result = self.generate_json(prompt, strict=False)

            if not result:
                return {
                    'success': False,
                    'error': 'Failed to generate suggestions'
                }

            # Validate and filter pillars to only valid ones (with legacy name support)
            suggested_pillars = result.get('pillars', [])
            valid_pillars = []
            for p in suggested_pillars:
                if p in self.VALID_PILLARS:
                    valid_pillars.append(p)
                elif p in self.LEGACY_PILLAR_MAP:
                    valid_pillars.append(self.LEGACY_PILLAR_MAP[p])

            return {
                'success': True,
                'title': result.get('title', ''),
                'pillars': valid_pillars,
                'confidence': min(1.0, max(0.0, result.get('confidence', 0.5))),
                'reasoning': result.get('reasoning', '')
            }

        except Exception as e:
            logger.error(f"Error generating suggestions: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def find_related_moments(
        self,
        moment_id: str,
        user_id: str,
        limit: int = 5
    ) -> Dict[str, Any]:
        """
        Find learning moments related to a given moment.

        Args:
            moment_id: The source moment ID
            user_id: The user whose moments to search
            limit: Maximum number of related moments to return

        Returns:
            Dict with 'success' and 'related_moments' list
        """
        try:
            supabase = get_supabase_admin_client()

            # Get the source moment
            source_response = supabase.table('learning_events') \
                .select('*') \
                .eq('id', moment_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not source_response.data:
                return {
                    'success': False,
                    'error': 'Source moment not found'
                }

            source = source_response.data

            # Get other moments from this user (excluding source)
            other_response = supabase.table('learning_events') \
                .select('id, title, description, pillars, created_at') \
                .eq('user_id', user_id) \
                .neq('id', moment_id) \
                .order('created_at', desc=True) \
                .limit(50) \
                .execute()

            other_moments = other_response.data or []

            if not other_moments:
                return {
                    'success': True,
                    'related_moments': []
                }

            # Use AI to find semantic relationships
            moments_text = '\n'.join([
                f"ID: {m['id']}\nTitle: {m.get('title', 'Untitled')}\nDescription: {m['description'][:200]}"
                for m in other_moments[:20]  # Limit context size
            ])

            prompt = f"""Find learning moments related to this source moment.

Source moment:
Title: {source.get('title', 'Untitled')}
Description: {source['description']}
Pillars: {', '.join(source.get('pillars', []))}

Other moments to consider:
{moments_text}

Return JSON with the IDs of related moments, ranked by relevance:
{{
  "related_ids": ["id1", "id2", "id3"],
  "relationships": [
    {{"id": "id1", "reason": "Brief reason for relationship"}}
  ]
}}

Select up to {limit} most related moments. Consider:
- Similar topics or subjects
- Same skill areas
- Natural learning progressions
- Complementary knowledge
"""

            result = self.generate_json(prompt, strict=False)

            if not result:
                return {
                    'success': True,
                    'related_moments': []
                }

            related_ids = result.get('related_ids', [])[:limit]
            relationships = {r['id']: r.get('reason', '') for r in result.get('relationships', [])}

            # Fetch full moment data for related IDs
            related_moments = []
            for m in other_moments:
                if m['id'] in related_ids:
                    m['relationship_reason'] = relationships.get(m['id'], '')
                    related_moments.append(m)

            # Sort by the order in related_ids
            related_moments.sort(key=lambda x: related_ids.index(x['id']) if x['id'] in related_ids else 999)

            return {
                'success': True,
                'related_moments': related_moments
            }

        except Exception as e:
            logger.error(f"Error finding related moments: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def suggest_track_for_moment(
        self,
        description: str,
        user_id: str,
        existing_tracks: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Suggest which interest track a moment should belong to.

        Args:
            description: The moment description
            user_id: The user ID
            existing_tracks: Optional list of existing tracks

        Returns:
            Dict with track suggestion or new track recommendation
        """
        try:
            supabase = get_supabase_admin_client()

            # Get existing tracks if not provided
            if existing_tracks is None:
                tracks_response = supabase.table('interest_tracks') \
                    .select('id, name, description') \
                    .eq('user_id', user_id) \
                    .execute()
                existing_tracks = tracks_response.data or []

            if not existing_tracks:
                # No existing tracks, suggest creating one
                return {
                    'success': True,
                    'suggestion_type': 'create_new',
                    'suggested_name': self._generate_track_name(description),
                    'confidence': 0.7
                }

            # Format tracks for prompt
            tracks_text = '\n'.join([
                f"ID: {t['id']}\nName: {t['name']}\nDescription: {t.get('description', 'No description')}"
                for t in existing_tracks
            ])

            prompt = f"""Suggest which interest track this learning moment belongs to.

Moment description:
"{description}"

Existing tracks:
{tracks_text}

Return JSON:
{{
  "suggestion_type": "existing" or "create_new",
  "track_id": "id if existing track",
  "track_name": "name of suggested track",
  "suggested_name": "name for new track if create_new",
  "confidence": 0.8,
  "reasoning": "Why this track fits"
}}

Rules:
- If the moment clearly fits an existing track, suggest it
- If the moment represents a new interest area, suggest creating a new track
- Confidence should be lower if the fit is uncertain
"""

            result = self.generate_json(prompt, strict=False)

            if not result:
                return {
                    'success': False,
                    'error': 'Failed to generate track suggestion'
                }

            return {
                'success': True,
                'suggestion_type': result.get('suggestion_type', 'create_new'),
                'track_id': result.get('track_id'),
                'track_name': result.get('track_name'),
                'suggested_name': result.get('suggested_name'),
                'confidence': min(1.0, max(0.0, result.get('confidence', 0.5))),
                'reasoning': result.get('reasoning', '')
            }

        except Exception as e:
            logger.error(f"Error suggesting track: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def detect_emerging_tracks(self, user_id: str) -> Dict[str, Any]:
        """
        Analyze unassigned moments to detect potential new interest tracks.

        Args:
            user_id: The user ID

        Returns:
            Dict with suggested new tracks based on moment clusters
        """
        try:
            supabase = get_supabase_admin_client()

            # Get unassigned moments (excluding pillars to avoid pillar-based grouping)
            moments_response = supabase.table('learning_events') \
                .select('id, title, description, created_at') \
                .eq('user_id', user_id) \
                .is_('track_id', 'null') \
                .order('created_at', desc=True) \
                .limit(30) \
                .execute()

            moments = moments_response.data or []

            if len(moments) < 3:
                return {
                    'success': True,
                    'suggested_tracks': [],
                    'message': 'Not enough unassigned moments to detect patterns'
                }

            # Format moments with IDs for analysis (content only, no pillars)
            moments_text = '\n---\n'.join([
                f"ID: {m['id']}\nTitle: {m.get('title', 'Untitled')}\nDescription: {m['description'][:300]}"
                for m in moments
            ])

            prompt = f"""Analyze these unassigned learning moments and identify potential interest tracks (clusters of related learning).

Moments:
{moments_text}

Return JSON:
{{
  "suggested_tracks": [
    {{
      "name": "Track name",
      "description": "A brief description of what kind of learning goes in this topic (1-2 sentences)",
      "color": "#hexcolor",
      "moment_ids": ["id1", "id2", "id3"],
      "confidence": 0.8
    }}
  ]
}}

Rules:
- Group moments by SUBJECT MATTER and THEMES in their content, not by skill type or learning style
- Look for common topics, subjects, activities, or areas of interest (e.g., "Music Production", "Cooking Skills", "Web Development")
- Only suggest tracks with 3+ related moments
- Track names should be specific and meaningful (2-4 words)
- Description should explain what kind of learning moments belong in this topic
- moment_ids MUST contain the exact IDs from the moments list above that belong to this track
- Choose colors that feel appropriate (use hex colors like #6366f1, #ec4899, #22c55e, #f97316)
- Maximum 5 track suggestions
- Each moment can only belong to ONE suggested track
"""

            result = self.generate_json(prompt, strict=False)
            logger.info(f"AI returned suggestions: {result}")

            if not result:
                return {
                    'success': True,
                    'suggested_tracks': []
                }

            # Add moment_count based on moment_ids length
            suggested_tracks = result.get('suggested_tracks', [])
            for track in suggested_tracks:
                moment_ids = track.get('moment_ids', [])
                track['moment_count'] = len(moment_ids)
                logger.info(f"Track '{track.get('name')}' has {len(moment_ids)} moment_ids: {moment_ids}")

            return {
                'success': True,
                'suggested_tracks': suggested_tracks
            }

        except Exception as e:
            logger.error(f"Error detecting emerging tracks: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def _generate_track_name(self, description: str) -> str:
        """Generate a track name from a moment description."""
        prompt = f"""Generate a short, memorable name for an interest track based on this learning moment:

"{description[:500]}"

Return JSON:
{{"name": "Track name (2-4 words)"}}
"""
        try:
            result = self.generate_json(prompt, strict=False)
            return result.get('name', 'New Interest')
        except Exception:
            return 'New Interest'
