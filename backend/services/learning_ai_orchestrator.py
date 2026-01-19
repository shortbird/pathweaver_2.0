"""
Learning AI Orchestrator
========================

Central coordinator for all AI features in the Learning Moments system.
Manages user AI settings and delegates to specialized AI services.

Features:
- Centralized AI settings management
- Delegates to specialized services:
  - LearningAIService: Moment metadata suggestions
  - ThreadAIService: Thread connections and narratives
  - QuestGenerationAIService: Quest structure generation
- Generates reflection prompts and weekly digests
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from services.base_ai_service import BaseAIService
from services.learning_ai_service import LearningAIService
from services.thread_ai_service import ThreadAIService
from services.quest_generation_ai_service import QuestGenerationAIService
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


class LearningAIOrchestrator(BaseAIService):
    """Central coordinator for all AI features in Learning Moments."""

    # Valid AI assistance levels
    ASSISTANCE_LEVELS = ['off', 'suggestions', 'auto']

    def __init__(self):
        super().__init__()
        self.learning_ai = LearningAIService()
        self.thread_ai = ThreadAIService()
        self.quest_ai = QuestGenerationAIService()

    def get_user_ai_settings(self, user_id: str) -> Dict[str, Any]:
        """
        Get AI settings for a user.

        Args:
            user_id: The user ID

        Returns:
            Dict with AI settings
        """
        try:
            supabase = get_supabase_admin_client()

            response = supabase.table('users') \
                .select('ai_assistance_level') \
                .eq('id', user_id) \
                .single() \
                .execute()

            if response.data:
                level = response.data.get('ai_assistance_level', 'suggestions')
                return {
                    'success': True,
                    'settings': {
                        'ai_assistance_level': level,
                        'show_suggestions': level in ['suggestions', 'auto'],
                        'auto_apply': level == 'auto'
                    }
                }

            return {
                'success': True,
                'settings': {
                    'ai_assistance_level': 'suggestions',
                    'show_suggestions': True,
                    'auto_apply': False
                }
            }

        except Exception as e:
            logger.error(f"Error getting user AI settings: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'settings': {
                    'ai_assistance_level': 'suggestions',
                    'show_suggestions': True,
                    'auto_apply': False
                }
            }

    def update_user_ai_settings(
        self,
        user_id: str,
        ai_assistance_level: str
    ) -> Dict[str, Any]:
        """
        Update AI settings for a user.

        Args:
            user_id: The user ID
            ai_assistance_level: One of 'off', 'suggestions', 'auto'

        Returns:
            Dict with success status
        """
        try:
            if ai_assistance_level not in self.ASSISTANCE_LEVELS:
                return {
                    'success': False,
                    'error': f'Invalid assistance level. Must be one of: {self.ASSISTANCE_LEVELS}'
                }

            supabase = get_supabase_admin_client()

            response = supabase.table('users') \
                .update({'ai_assistance_level': ai_assistance_level}) \
                .eq('id', user_id) \
                .execute()

            return {
                'success': True,
                'ai_assistance_level': ai_assistance_level
            }

        except Exception as e:
            logger.error(f"Error updating user AI settings: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def should_show_suggestions(self, user_id: str) -> bool:
        """Check if AI suggestions should be shown for a user."""
        settings = self.get_user_ai_settings(user_id)
        return settings.get('settings', {}).get('show_suggestions', True)

    # Delegation methods to specialized services

    def suggest_moment_metadata(
        self,
        description: str,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Suggest title and pillars for a learning moment.
        Delegates to LearningAIService.
        """
        if user_id and not self.should_show_suggestions(user_id):
            return {
                'success': True,
                'suggestions': None,
                'ai_disabled': True
            }

        return self.learning_ai.suggest_title_and_pillars(description)

    def suggest_track_placement(
        self,
        moment: Dict,
        tracks: List[Dict],
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Suggest which track a moment belongs to.
        Delegates to LearningAIService.
        """
        if user_id and not self.should_show_suggestions(user_id):
            return {
                'success': True,
                'suggestion': None,
                'ai_disabled': True
            }

        return self.learning_ai.suggest_track_for_moment(moment, tracks)

    def find_thread_connections(
        self,
        moment: Dict,
        all_moments: List[Dict],
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Find related moments for thread connections.
        Delegates to ThreadAIService.
        """
        if user_id and not self.should_show_suggestions(user_id):
            return {
                'success': True,
                'related_moments': [],
                'ai_disabled': True
            }

        return self.thread_ai.find_related_moments(moment, all_moments)

    def generate_track_summary(
        self,
        track_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Generate an AI summary for a track.

        Args:
            track_id: The track ID
            user_id: The user ID

        Returns:
            Dict with track summary
        """
        try:
            if not self.should_show_suggestions(user_id):
                return {
                    'success': True,
                    'summary': None,
                    'ai_disabled': True
                }

            supabase = get_supabase_admin_client()

            # Get track info
            track_response = supabase.table('interest_tracks') \
                .select('*') \
                .eq('id', track_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if not track_response.data:
                return {
                    'success': False,
                    'error': 'Track not found'
                }

            track = track_response.data

            # Get moments in track
            moments_response = supabase.table('learning_events') \
                .select('*') \
                .eq('track_id', track_id) \
                .eq('user_id', user_id) \
                .order('created_at') \
                .execute()

            moments = moments_response.data or []

            if not moments:
                return {
                    'success': True,
                    'summary': 'No learning moments in this track yet.'
                }

            # Generate summary using AI
            prompt = f"""Analyze this learning track and provide a brief summary.

Track Name: {track.get('name', 'Untitled')}
Track Description: {track.get('description', 'No description')}

Learning Moments ({len(moments)} total):
"""
            for m in moments[:10]:  # Limit to first 10 for context
                prompt += f"- {m.get('title', 'Untitled')}: {m.get('description', '')[:100]}\n"

            prompt += """
Provide a 2-3 sentence summary that captures:
1. The main theme or focus
2. The learning progression
3. Key insights or patterns

Keep the tone encouraging and focused on growth."""

            result = self._call_gemini(
                prompt=prompt,
                system_instruction="You are an educational coach helping summarize learning journeys.",
                max_tokens=200
            )

            if result['success']:
                return {
                    'success': True,
                    'summary': result['text'],
                    'moment_count': len(moments)
                }
            else:
                return {
                    'success': False,
                    'error': result.get('error', 'Failed to generate summary')
                }

        except Exception as e:
            logger.error(f"Error generating track summary: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def generate_reflection_prompt(
        self,
        user_id: str,
        moment: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Generate a reflection prompt after moment capture.

        Args:
            user_id: The user ID
            moment: The recently captured moment (optional)

        Returns:
            Dict with reflection prompt
        """
        try:
            if not self.should_show_suggestions(user_id):
                return {
                    'success': True,
                    'prompt': None,
                    'ai_disabled': True
                }

            # Build context-aware prompt
            if moment:
                context = f"""The user just captured this learning moment:
Title: {moment.get('title', 'Untitled')}
Description: {moment.get('description', '')}
Pillars: {', '.join(moment.get('pillars', []))}"""
            else:
                context = "The user just finished a learning session."

            prompt = f"""{context}

Generate a thoughtful reflection question that:
1. Encourages deeper thinking about what they learned
2. Connects the learning to practical application
3. Is specific to their content (not generic)
4. Can be answered in 1-2 sentences

Return ONLY the reflection question, nothing else."""

            result = self._call_gemini(
                prompt=prompt,
                system_instruction="You are an educational coach helping learners reflect on their growth.",
                max_tokens=100
            )

            if result['success']:
                return {
                    'success': True,
                    'prompt': result['text'].strip(),
                    'moment_id': moment.get('id') if moment else None
                }
            else:
                # Fallback prompts
                fallback_prompts = [
                    "What surprised you most about what you learned?",
                    "How might you use this knowledge in a real situation?",
                    "What question do you still have after this learning?",
                    "What connection did you make to something you already knew?"
                ]
                import random
                return {
                    'success': True,
                    'prompt': random.choice(fallback_prompts),
                    'is_fallback': True
                }

        except Exception as e:
            logger.error(f"Error generating reflection prompt: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def generate_weekly_digest(self, user_id: str) -> Dict[str, Any]:
        """
        Generate a weekly learning digest for a user.

        Args:
            user_id: The user ID

        Returns:
            Dict with weekly digest content
        """
        try:
            if not self.should_show_suggestions(user_id):
                return {
                    'success': True,
                    'digest': None,
                    'ai_disabled': True
                }

            supabase = get_supabase_admin_client()

            # Get moments from the last 7 days
            week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()

            moments_response = supabase.table('learning_events') \
                .select('*') \
                .eq('user_id', user_id) \
                .gte('created_at', week_ago) \
                .order('created_at', desc=True) \
                .execute()

            moments = moments_response.data or []

            if not moments:
                return {
                    'success': True,
                    'digest': {
                        'summary': 'No learning moments captured this week. Ready to start exploring?',
                        'moment_count': 0,
                        'highlights': [],
                        'encouragement': 'Every journey begins with a single step. What are you curious about?'
                    }
                }

            # Get tracks used this week
            track_ids = list(set(m.get('track_id') for m in moments if m.get('track_id')))
            tracks = []
            if track_ids:
                tracks_response = supabase.table('interest_tracks') \
                    .select('id, name') \
                    .in_('id', track_ids) \
                    .execute()
                tracks = tracks_response.data or []

            # Analyze pillars
            pillar_counts = {}
            for m in moments:
                for pillar in (m.get('pillars') or []):
                    pillar_counts[pillar] = pillar_counts.get(pillar, 0) + 1

            top_pillars = sorted(pillar_counts.items(), key=lambda x: x[1], reverse=True)[:3]

            # Generate AI summary
            prompt = f"""Analyze this week's learning activity and create an encouraging summary.

Moments captured: {len(moments)}
Tracks explored: {len(tracks)} ({', '.join(t.get('name', '') for t in tracks[:3])})
Top pillars: {', '.join(f"{p[0]} ({p[1]})" for p in top_pillars)}

Recent moments:
"""
            for m in moments[:5]:
                prompt += f"- {m.get('title', 'Untitled')}\n"

            prompt += """
Create a brief, encouraging weekly digest with:
1. A 1-2 sentence summary of the week's learning
2. One pattern or theme you notice
3. An encouraging word about their progress

Keep it warm, specific, and growth-focused. No generic platitudes."""

            result = self._call_gemini(
                prompt=prompt,
                system_instruction="You are an encouraging educational coach celebrating weekly learning progress.",
                max_tokens=200
            )

            summary_text = result.get('text', 'Great week of learning!') if result['success'] else 'Great week of learning!'

            return {
                'success': True,
                'digest': {
                    'summary': summary_text,
                    'moment_count': len(moments),
                    'track_count': len(tracks),
                    'tracks': [t.get('name') for t in tracks],
                    'top_pillars': [{'pillar': p[0], 'count': p[1]} for p in top_pillars],
                    'highlights': [
                        {
                            'id': m.get('id'),
                            'title': m.get('title'),
                            'created_at': m.get('created_at')
                        }
                        for m in moments[:3]
                    ],
                    'period_start': week_ago,
                    'period_end': datetime.utcnow().isoformat()
                }
            }

        except Exception as e:
            logger.error(f"Error generating weekly digest: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def get_learning_insights(self, user_id: str) -> Dict[str, Any]:
        """
        Get AI-powered insights about a user's learning patterns.

        Args:
            user_id: The user ID

        Returns:
            Dict with learning insights
        """
        try:
            if not self.should_show_suggestions(user_id):
                return {
                    'success': True,
                    'insights': None,
                    'ai_disabled': True
                }

            supabase = get_supabase_admin_client()

            # Get all moments for pattern analysis
            moments_response = supabase.table('learning_events') \
                .select('*') \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(50) \
                .execute()

            moments = moments_response.data or []

            if len(moments) < 5:
                return {
                    'success': True,
                    'insights': {
                        'message': 'Keep capturing moments! Insights will appear after 5+ moments.',
                        'moment_count': len(moments),
                        'patterns': [],
                        'suggestions': []
                    }
                }

            # Get tracks
            tracks_response = supabase.table('interest_tracks') \
                .select('*') \
                .eq('user_id', user_id) \
                .execute()

            tracks = tracks_response.data or []

            # Analyze patterns
            pillar_counts = {}
            for m in moments:
                for pillar in (m.get('pillars') or []):
                    pillar_counts[pillar] = pillar_counts.get(pillar, 0) + 1

            # Find emerging tracks
            emerging_result = self.learning_ai.detect_emerging_tracks(moments)
            emerging_tracks = emerging_result.get('emerging_tracks', []) if emerging_result.get('success') else []

            return {
                'success': True,
                'insights': {
                    'total_moments': len(moments),
                    'total_tracks': len(tracks),
                    'pillar_distribution': pillar_counts,
                    'emerging_tracks': emerging_tracks[:3],
                    'most_active_pillar': max(pillar_counts.items(), key=lambda x: x[1])[0] if pillar_counts else None,
                    'suggestions': [
                        'Consider connecting related moments into threads',
                        'Some moments might be ready to graduate to a Quest'
                    ] if len(moments) >= 5 else []
                }
            }

        except Exception as e:
            logger.error(f"Error getting learning insights: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
