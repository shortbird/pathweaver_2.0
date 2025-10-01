"""
Recommendation Service
Smart content discovery for badges and quests using AI and user data.
"""

from typing import List, Dict, Optional
from database import get_supabase_admin_client
from collections import Counter


class RecommendationService:
    """Service for recommending badges and quests to users."""

    @staticmethod
    def recommend_badges(user_id: str, limit: int = 5) -> List[Dict]:
        """
        Suggest next badges to pursue based on user's learning patterns.

        Args:
            user_id: User ID
            limit: Maximum number of recommendations

        Returns:
            List of recommended badges with reasoning
        """
        supabase = get_supabase_admin_client()

        # Get user's learning profile
        profile = RecommendationService._analyze_learning_patterns(user_id)

        # Get badges user hasn't started yet
        user_badges = supabase.table('user_badges')\
            .select('badge_id')\
            .eq('user_id', user_id)\
            .execute()

        started_badge_ids = [ub['badge_id'] for ub in user_badges.data]

        # Get all active badges
        all_badges = supabase.table('badges')\
            .select('*')\
            .eq('status', 'active')\
            .execute()

        # Filter out already started badges
        available_badges = [b for b in all_badges.data if b['id'] not in started_badge_ids]

        # Score and rank badges
        scored_badges = []
        for badge in available_badges:
            score = RecommendationService._score_badge_fit(badge, profile)
            badge['recommendation_score'] = score
            badge['recommendation_reason'] = RecommendationService._generate_reason(badge, profile, score)
            scored_badges.append(badge)

        # Sort by score and return top N
        scored_badges.sort(key=lambda x: x['recommendation_score'], reverse=True)

        return scored_badges[:limit]

    @staticmethod
    def recommend_quests(user_id: str, badge_id: Optional[str] = None, limit: int = 3) -> List[Dict]:
        """
        Suggest quests within badge or general exploration.

        Args:
            user_id: User ID
            badge_id: Optional badge context for recommendations
            limit: Maximum number of recommendations

        Returns:
            List of recommended quests
        """
        supabase = get_supabase_admin_client()

        # Get user's learning profile
        profile = RecommendationService._analyze_learning_patterns(user_id)

        # Get quests user has completed
        completed = supabase.table('user_quests')\
            .select('quest_id')\
            .eq('user_id', user_id)\
            .not_('completed_at', 'is', None)\
            .execute()

        completed_quest_ids = [q['quest_id'] for q in completed.data]

        # Build query for available quests
        query = supabase.table('quests').select('*').eq('is_active', True)

        # If badge_id specified, filter to that badge's quests
        if badge_id:
            badge_quests = supabase.table('badge_quests')\
                .select('quest_id')\
                .eq('badge_id', badge_id)\
                .execute()

            badge_quest_ids = [bq['quest_id'] for bq in badge_quests.data]
            if badge_quest_ids:
                query = query.in_('id', badge_quest_ids)

        all_quests = query.execute()

        # Filter out completed quests
        available_quests = [q for q in all_quests.data if q['id'] not in completed_quest_ids]

        # Score quests
        scored_quests = []
        for quest in available_quests:
            score = RecommendationService._score_quest_fit(quest, profile, badge_id)
            quest['recommendation_score'] = score
            quest['recommendation_reason'] = RecommendationService._generate_quest_reason(quest, profile)
            scored_quests.append(quest)

        # Sort and return top N
        scored_quests.sort(key=lambda x: x['recommendation_score'], reverse=True)

        return scored_quests[:limit]

    @staticmethod
    def analyze_learning_patterns(user_id: str) -> Dict:
        """
        Understand user's learning behavior and preferences.

        Args:
            user_id: User ID

        Returns:
            Dictionary with learning pattern analysis
        """
        return RecommendationService._analyze_learning_patterns(user_id)

    @staticmethod
    def _analyze_learning_patterns(user_id: str) -> Dict:
        """
        Internal method to analyze user's learning patterns.

        Returns:
            Dictionary with:
                - preferred_pillars: Top pillars by XP
                - completion_rate: Percentage of started quests completed
                - average_quest_duration: Average days to complete
                - recent_activity: Last 7 days activity
                - skill_levels: XP by pillar
        """
        supabase = get_supabase_admin_client()

        # Get user's skill XP by pillar
        user = supabase.table('users')\
            .select('level, total_xp, created_at')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user.data:
            return {}

        # Get skill XP distribution
        skill_xp = supabase.table('user_skill_xp')\
            .select('pillar, xp_amount')\
            .eq('user_id', user_id)\
            .execute()

        # Calculate preferred pillars
        pillar_xp = {}
        for skill in skill_xp.data:
            pillar = skill['pillar']
            xp = skill['xp_amount']
            pillar_xp[pillar] = pillar_xp.get(pillar, 0) + xp

        # Sort pillars by XP
        sorted_pillars = sorted(pillar_xp.items(), key=lambda x: x[1], reverse=True)
        preferred_pillars = [p[0] for p in sorted_pillars[:3]] if sorted_pillars else []

        # Get quest completion stats
        user_quests = supabase.table('user_quests')\
            .select('quest_id, started_at, completed_at')\
            .eq('user_id', user_id)\
            .execute()

        total_started = len(user_quests.data)
        total_completed = len([q for q in user_quests.data if q.get('completed_at')])

        completion_rate = (total_completed / total_started) if total_started > 0 else 0

        # Calculate average completion time
        from datetime import datetime
        completion_times = []
        for quest in user_quests.data:
            if quest.get('completed_at') and quest.get('started_at'):
                try:
                    started = datetime.fromisoformat(quest['started_at'].replace('Z', '+00:00'))
                    completed = datetime.fromisoformat(quest['completed_at'].replace('Z', '+00:00'))
                    days = (completed - started).days
                    completion_times.append(days)
                except:
                    pass

        avg_duration = sum(completion_times) / len(completion_times) if completion_times else 0

        # Recent activity (task completions in last 7 days)
        from datetime import timedelta
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()

        recent_completions = supabase.table('quest_task_completions')\
            .select('id')\
            .eq('user_id', user_id)\
            .gte('completed_at', week_ago)\
            .execute()

        return {
            'user_level': user.data.get('level', 0),
            'total_xp': user.data.get('total_xp', 0),
            'preferred_pillars': preferred_pillars,
            'pillar_xp': pillar_xp,
            'completion_rate': round(completion_rate, 2),
            'average_quest_duration_days': round(avg_duration, 1),
            'recent_completions': len(recent_completions.data),
            'total_quests_started': total_started,
            'total_quests_completed': total_completed
        }

    @staticmethod
    def _score_badge_fit(badge: Dict, profile: Dict) -> float:
        """
        Score how well a badge fits the user's learning profile.

        Args:
            badge: Badge data
            profile: User learning profile

        Returns:
            Score between 0 and 1
        """
        score = 0.0
        weights = {
            'pillar_match': 0.35,
            'level_appropriate': 0.25,
            'diversity': 0.20,
            'popularity': 0.10,
            'complexity': 0.10
        }

        # Pillar match (prefer badges in user's strong pillars)
        preferred_pillars = profile.get('preferred_pillars', [])
        if badge['pillar_primary'] in preferred_pillars:
            # Higher score for top preferred pillar
            rank = preferred_pillars.index(badge['pillar_primary'])
            score += weights['pillar_match'] * (1.0 - (rank * 0.2))
        else:
            # Lower score for diversity (exploring new pillars)
            score += weights['diversity']

        # Level appropriateness
        user_level = profile.get('user_level', 1)
        min_xp = badge.get('min_xp', 1500)

        # Score based on XP requirement relative to user level
        # Lower XP for beginners, higher for advanced
        expected_xp_for_level = user_level * 500
        xp_ratio = min_xp / max(expected_xp_for_level, 500)

        if 0.8 <= xp_ratio <= 1.5:
            # Just right
            score += weights['level_appropriate']
        elif 0.5 <= xp_ratio < 0.8:
            # Slightly easy
            score += weights['level_appropriate'] * 0.7
        elif 1.5 < xp_ratio <= 2.5:
            # Challenging
            score += weights['level_appropriate'] * 0.8
        else:
            # Too easy or too hard
            score += weights['level_appropriate'] * 0.3

        # Popularity (how many students have completed this badge)
        # This would require a query - simplified for now
        score += weights['popularity'] * 0.5

        # Complexity preference based on completion rate
        completion_rate = profile.get('completion_rate', 0)
        min_quests = badge.get('min_quests', 5)

        if completion_rate > 0.7 and min_quests > 7:
            # High completer, suggest ambitious badges
            score += weights['complexity']
        elif completion_rate < 0.4 and min_quests < 6:
            # Struggling, suggest manageable badges
            score += weights['complexity']
        else:
            score += weights['complexity'] * 0.7

        return min(score, 1.0)

    @staticmethod
    def _score_quest_fit(quest: Dict, profile: Dict, badge_id: Optional[str] = None) -> float:
        """
        Score how well a quest fits the user's preferences.

        Args:
            quest: Quest data
            profile: User learning profile
            badge_id: Optional badge context

        Returns:
            Score between 0 and 1
        """
        score = 0.5  # Base score

        # If part of active badge, boost score
        if badge_id:
            score += 0.2

        # Prefer quests in strong pillars (would need task pillar data)
        # Simplified for now

        # Prefer appropriate complexity based on completion rate
        completion_rate = profile.get('completion_rate', 0)

        # Give slight boost to recent/popular quests
        score += 0.1

        return min(score, 1.0)

    @staticmethod
    def _generate_reason(badge: Dict, profile: Dict, score: float) -> str:
        """
        Generate human-readable recommendation reason.

        Args:
            badge: Badge data
            profile: User learning profile
            score: Recommendation score

        Returns:
            Reason string
        """
        reasons = []

        preferred_pillars = profile.get('preferred_pillars', [])
        pillar = badge['pillar_primary']

        if pillar in preferred_pillars:
            rank = preferred_pillars.index(pillar) + 1
            if rank == 1:
                reasons.append(f"Matches your strongest pillar ({pillar})")
            else:
                reasons.append(f"Builds on your skills in {pillar}")
        else:
            reasons.append(f"Explore a new area ({pillar})")

        user_level = profile.get('user_level', 1)
        min_xp = badge.get('min_xp', 1500)

        if min_xp <= user_level * 400:
            reasons.append("Achievable at your current level")
        elif min_xp > user_level * 800:
            reasons.append("A challenging growth opportunity")
        else:
            reasons.append("Well-suited to your level")

        completion_rate = profile.get('completion_rate', 0)
        min_quests = badge.get('min_quests', 5)

        if completion_rate > 0.7 and min_quests > 7:
            reasons.append("Ambitious path for high achievers")
        elif min_quests < 6:
            reasons.append("Focused and achievable")

        # Return top 2-3 reasons
        return " • ".join(reasons[:3])

    @staticmethod
    def _generate_quest_reason(quest: Dict, profile: Dict) -> str:
        """
        Generate recommendation reason for quest.

        Args:
            quest: Quest data
            profile: User learning profile

        Returns:
            Reason string
        """
        # Simplified for now
        return "Recommended based on your learning interests"

    @staticmethod
    def get_trending_badges(limit: int = 5) -> List[Dict]:
        """
        Get currently trending badges (most started/completed recently).

        Args:
            limit: Maximum number of badges to return

        Returns:
            List of trending badges
        """
        supabase = get_supabase_admin_client()

        # Get badges started in last 30 days
        from datetime import datetime, timedelta
        month_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()

        # Count badge selections
        recent_badges = supabase.table('user_badges')\
            .select('badge_id')\
            .gte('started_at', month_ago)\
            .execute()

        # Count occurrences
        badge_counts = Counter(ub['badge_id'] for ub in recent_badges.data)
        top_badge_ids = [badge_id for badge_id, _ in badge_counts.most_common(limit)]

        if not top_badge_ids:
            # Fallback to newest badges
            badges = supabase.table('badges')\
                .select('*')\
                .eq('status', 'active')\
                .order('created_at', desc=True)\
                .limit(limit)\
                .execute()
            return badges.data

        # Get badge details
        badges = supabase.table('badges')\
            .select('*')\
            .in_('id', top_badge_ids)\
            .execute()

        # Add trending count
        for badge in badges.data:
            badge['trending_count'] = badge_counts[badge['id']]

        # Sort by trending count
        badges.data.sort(key=lambda x: x.get('trending_count', 0), reverse=True)

        return badges.data

    @staticmethod
    def get_recommended_next_quest(user_id: str, badge_id: str) -> Optional[Dict]:
        """
        Get the single best next quest for a user pursuing a badge.

        Args:
            user_id: User ID
            badge_id: Badge ID

        Returns:
            Recommended quest or None
        """
        recommendations = RecommendationService.recommend_quests(
            user_id,
            badge_id=badge_id,
            limit=1
        )

        return recommendations[0] if recommendations else None
