"""
Analytics service for querying and analyzing user activity data.

Features:
- User engagement metrics for dropout prediction
- Page view analytics aggregation
- Learning journey tracking
- Risk scoring for at-risk student identification
- Session analytics
"""

from services.base_service import BaseService
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from utils.logger import get_logger

logger = get_logger(__name__)


class AnalyticsService(BaseService):
    """Provides analytics and insights from activity tracking data."""

    def get_user_engagement_metrics(self, user_id: str, days: int = 30) -> Dict[str, Any]:
        """
        Calculate engagement metrics for dropout prediction.

        Args:
            user_id: The user ID to analyze
            days: Number of days to analyze (default: 30)

        Returns:
            Dictionary containing:
            - login_frequency: Average logins per week
            - session_duration_avg: Average session length (minutes)
            - days_since_last_activity: Days since last action
            - quest_completion_rate: % of started quests completed
            - streak_status: Current daily streak
            - risk_score: 0.0 to 1.0 (0 = engaged, 1 = high risk)
            - engagement_level: high, medium, low, at_risk
        """
        try:
            start_date = datetime.utcnow() - timedelta(days=days)

            # Query recent activity
            events_response = self.supabase.table('user_activity_events').select('*').eq(
                'user_id', user_id
            ).gte('created_at', start_date.isoformat()).execute()

            events = events_response.data or []

            # Calculate login frequency
            login_count = len([e for e in events if e['event_type'] == 'login_success'])
            login_frequency = login_count / (days / 7) if days >= 7 else login_count

            # Session duration
            sessions_response = self.supabase.table('user_sessions').select('duration_minutes').eq(
                'user_id', user_id
            ).gte('started_at', start_date.isoformat()).execute()

            sessions = sessions_response.data or []
            avg_session_duration = (
                sum(s.get('duration_minutes') or 0 for s in sessions) / len(sessions)
                if sessions else 0
            )

            # Days since last activity
            last_event_response = self.supabase.table('user_activity_events').select('created_at').eq(
                'user_id', user_id
            ).order('created_at', desc=True).limit(1).execute()

            days_inactive = days
            if last_event_response.data:
                last_activity = datetime.fromisoformat(
                    last_event_response.data[0]['created_at'].replace('Z', '+00:00')
                )
                days_inactive = (datetime.utcnow().replace(tzinfo=last_activity.tzinfo) - last_activity).days

            # Quest completion rate
            quest_starts = len([e for e in events if e['event_type'] == 'quest_started'])
            quest_completions = len([e for e in events if e['event_type'] == 'quest_completed'])
            completion_rate = (quest_completions / quest_starts * 100) if quest_starts > 0 else 0

            # Get user's current streak
            user_response = self.supabase.table('users').select('streak_days').eq('id', user_id).single().execute()
            streak_days = user_response.data.get('streak_days', 0) if user_response.data else 0

            # Calculate risk score (simple heuristic, can be replaced with ML model)
            risk_score = self._calculate_risk_score(
                days_inactive=days_inactive,
                login_frequency=login_frequency,
                completion_rate=completion_rate,
                streak_days=streak_days,
                avg_session_duration=avg_session_duration
            )

            return {
                'login_frequency': round(login_frequency, 2),
                'session_duration_avg': round(avg_session_duration, 2),
                'days_since_last_activity': days_inactive,
                'quest_completion_rate': round(completion_rate, 2),
                'streak_days': streak_days,
                'risk_score': round(risk_score, 2),
                'engagement_level': self._classify_engagement(risk_score)
            }

        except Exception as e:
            logger.error(f"Error calculating engagement metrics for user {user_id}: {str(e)}")
            raise

    def _calculate_risk_score(
        self,
        days_inactive: int,
        login_frequency: float,
        completion_rate: float,
        streak_days: int,
        avg_session_duration: float
    ) -> float:
        """
        Calculate dropout risk score using weighted heuristics.

        Risk factors:
        - Days inactive (40% weight)
        - Login frequency (25% weight)
        - Quest completion rate (20% weight)
        - Session duration (10% weight)
        - Streak status (5% weight)
        """
        risk_score = 0.0

        # Days inactive scoring (40% weight)
        if days_inactive > 14:
            risk_score += 0.40
        elif days_inactive > 7:
            risk_score += 0.30
        elif days_inactive > 3:
            risk_score += 0.15

        # Login frequency scoring (25% weight)
        # Less than 1 login per week = high risk
        if login_frequency < 0.5:
            risk_score += 0.25
        elif login_frequency < 1.0:
            risk_score += 0.15
        elif login_frequency < 2.0:
            risk_score += 0.05

        # Quest completion rate scoring (20% weight)
        if completion_rate < 25:
            risk_score += 0.20
        elif completion_rate < 50:
            risk_score += 0.10
        elif completion_rate < 75:
            risk_score += 0.05

        # Session duration scoring (10% weight)
        # Average session < 5 minutes = disengaged
        if avg_session_duration < 5:
            risk_score += 0.10
        elif avg_session_duration < 10:
            risk_score += 0.05

        # Streak scoring (5% weight)
        if streak_days == 0:
            risk_score += 0.05

        return min(risk_score, 1.0)

    def _classify_engagement(self, risk_score: float) -> str:
        """Classify user engagement based on risk score."""
        if risk_score < 0.3:
            return 'high'
        elif risk_score < 0.6:
            return 'medium'
        elif risk_score < 0.8:
            return 'low'
        else:
            return 'at_risk'

    def get_at_risk_students(self, days: int = 30, threshold: float = 0.7) -> List[Dict[str, Any]]:
        """
        Identify students at risk of dropping out.

        Args:
            days: Number of days to analyze
            threshold: Risk score threshold (default: 0.7 = high risk)

        Returns:
            List of at-risk students with their engagement metrics
        """
        try:
            # Get all students
            students_response = self.supabase.table('users').select('id, display_name, email').eq(
                'role', 'student'
            ).execute()

            students = students_response.data or []

            at_risk_students = []

            for student in students:
                metrics = self.get_user_engagement_metrics(student['id'], days)

                if metrics['risk_score'] >= threshold:
                    at_risk_students.append({
                        'user_id': student['id'],
                        'display_name': student['display_name'],
                        'email': student['email'],
                        'risk_score': metrics['risk_score'],
                        'engagement_level': metrics['engagement_level'],
                        'days_inactive': metrics['days_since_last_activity'],
                        'metrics': metrics
                    })

            # Sort by risk score (highest first)
            at_risk_students.sort(key=lambda x: x['risk_score'], reverse=True)

            return at_risk_students

        except Exception as e:
            logger.error(f"Error identifying at-risk students: {str(e)}")
            raise

    def get_page_analytics(
        self,
        start_date: datetime,
        end_date: datetime,
        page_path: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get aggregated page view analytics.

        Args:
            start_date: Start date for analytics
            end_date: End date for analytics
            page_path: Optional filter for specific page path

        Returns:
            List of daily page analytics
        """
        try:
            query = self.supabase.table('page_view_analytics').select('*').gte(
                'view_date', start_date.date().isoformat()
            ).lte('view_date', end_date.date().isoformat())

            if page_path:
                query = query.eq('page_path', page_path)

            response = query.order('view_date', desc=True).execute()

            return response.data or []

        except Exception as e:
            logger.error(f"Error fetching page analytics: {str(e)}")
            raise

    def get_learning_journey_summary(self, user_id: str) -> Dict[str, Any]:
        """
        Get learning journey milestones for parent dashboard.

        Returns:
            Dictionary containing:
            - first_quest_date: When user started first quest
            - total_quests_completed: Total completed quests
            - current_streak_days: Current daily streak
            - badges_earned: Number of badges earned
            - time_on_platform_hours: Total time spent
            - favorite_pillar: Most active skill pillar
            - recent_milestones: Last 10 significant events
        """
        try:
            # Get user's journey events
            journey_response = self.supabase.table('learning_journey_events').select('*').eq(
                'user_id', user_id
            ).order('created_at', desc=False).execute()

            journey_events = journey_response.data or []

            # Get user data
            user_response = self.supabase.table('users').select(
                'streak_days, total_xp, achievements_count, created_at'
            ).eq('id', user_id).single().execute()

            user_data = user_response.data if user_response.data else {}

            # Get quest completions
            quest_completions_response = self.supabase.table('user_activity_events').select('*').eq(
                'user_id', user_id
            ).eq('event_type', 'quest_completed').execute()

            quest_completions = quest_completions_response.data or []

            # Get first quest date
            first_quest = None
            if journey_events:
                first_quest_events = [e for e in journey_events if e['event_type'] == 'first_quest']
                if first_quest_events:
                    first_quest = datetime.fromisoformat(
                        first_quest_events[0]['created_at'].replace('Z', '+00:00')
                    )

            # Calculate total time on platform
            sessions_response = self.supabase.table('user_sessions').select('duration_minutes').eq(
                'user_id', user_id
            ).execute()

            sessions = sessions_response.data or []
            total_minutes = sum(s.get('duration_minutes') or 0 for s in sessions)
            time_on_platform_hours = round(total_minutes / 60, 2)

            # Get favorite pillar from user_skill_xp
            skill_xp_response = self.supabase.table('user_skill_xp').select('pillar, xp_amount').eq(
                'user_id', user_id
            ).order('xp_amount', desc=True).limit(1).execute()

            favorite_pillar = None
            if skill_xp_response.data:
                favorite_pillar = skill_xp_response.data[0]['pillar']

            # Get recent milestones (last 10 events)
            recent_milestones = journey_events[-10:] if len(journey_events) > 10 else journey_events

            return {
                'first_quest_date': first_quest.isoformat() if first_quest else None,
                'total_quests_completed': len(quest_completions),
                'current_streak_days': user_data.get('streak_days', 0),
                'badges_earned': user_data.get('achievements_count', 0),
                'time_on_platform_hours': time_on_platform_hours,
                'favorite_pillar': favorite_pillar,
                'recent_milestones': recent_milestones
            }

        except Exception as e:
            logger.error(f"Error fetching learning journey summary for user {user_id}: {str(e)}")
            raise

    def get_event_counts_by_category(
        self,
        start_date: datetime,
        end_date: datetime,
        user_id: Optional[str] = None
    ) -> Dict[str, int]:
        """
        Get event counts grouped by category.

        Args:
            start_date: Start date for analysis
            end_date: End date for analysis
            user_id: Optional filter for specific user

        Returns:
            Dictionary with category names as keys and counts as values
        """
        try:
            query = self.supabase.table('user_activity_events').select('event_category').gte(
                'created_at', start_date.isoformat()
            ).lte('created_at', end_date.isoformat())

            if user_id:
                query = query.eq('user_id', user_id)

            response = query.execute()
            events = response.data or []

            # Count events by category
            category_counts = {}
            for event in events:
                category = event.get('event_category', 'other')
                category_counts[category] = category_counts.get(category, 0) + 1

            return category_counts

        except Exception as e:
            logger.error(f"Error fetching event counts by category: {str(e)}")
            raise

    def get_popular_quests(self, days: int = 30, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get most popular quests based on starts and completions.

        Args:
            days: Number of days to analyze
            limit: Maximum number of quests to return

        Returns:
            List of quest data with popularity metrics
        """
        try:
            start_date = datetime.utcnow() - timedelta(days=days)

            # Get quest events
            quest_events_response = self.supabase.table('user_activity_events').select(
                'event_type, event_data'
            ).in_(
                'event_type', ['quest_started', 'quest_completed', 'quest_viewed']
            ).gte('created_at', start_date.isoformat()).execute()

            quest_events = quest_events_response.data or []

            # Count events per quest
            quest_stats = {}
            for event in quest_events:
                quest_id = event.get('event_data', {}).get('quest_id')
                if not quest_id:
                    continue

                if quest_id not in quest_stats:
                    quest_stats[quest_id] = {
                        'quest_id': quest_id,
                        'views': 0,
                        'starts': 0,
                        'completions': 0
                    }

                event_type = event['event_type']
                if event_type == 'quest_viewed':
                    quest_stats[quest_id]['views'] += 1
                elif event_type == 'quest_started':
                    quest_stats[quest_id]['starts'] += 1
                elif event_type == 'quest_completed':
                    quest_stats[quest_id]['completions'] += 1

            # Calculate popularity score (weighted)
            for quest_id in quest_stats:
                stats = quest_stats[quest_id]
                stats['completion_rate'] = (
                    (stats['completions'] / stats['starts'] * 100)
                    if stats['starts'] > 0 else 0
                )
                # Popularity score: views + (starts * 2) + (completions * 5)
                stats['popularity_score'] = (
                    stats['views'] +
                    (stats['starts'] * 2) +
                    (stats['completions'] * 5)
                )

            # Get quest details
            quest_ids = list(quest_stats.keys())
            if quest_ids:
                quests_response = self.supabase.table('quests').select(
                    'id, title, description, image_url'
                ).in_('id', quest_ids).execute()

                quests = quests_response.data or []

                # Merge quest data with stats
                for quest in quests:
                    if quest['id'] in quest_stats:
                        quest_stats[quest['id']].update({
                            'title': quest['title'],
                            'description': quest['description'],
                            'image_url': quest['image_url']
                        })

            # Sort by popularity score and return top N
            popular_quests = sorted(
                quest_stats.values(),
                key=lambda x: x['popularity_score'],
                reverse=True
            )[:limit]

            return popular_quests

        except Exception as e:
            logger.error(f"Error fetching popular quests: {str(e)}")
            raise

    def get_error_summary(self, days: int = 7) -> Dict[str, Any]:
        """
        Get summary of errors for debugging.

        Args:
            days: Number of days to analyze

        Returns:
            Dictionary with error statistics
        """
        try:
            start_date = datetime.utcnow() - timedelta(days=days)

            errors_response = self.supabase.table('error_events').select('*').gte(
                'created_at', start_date.isoformat()
            ).execute()

            errors = errors_response.data or []

            # Group by error type
            error_counts = {}
            for error in errors:
                error_type = error.get('error_type', 'unknown')
                error_counts[error_type] = error_counts.get(error_type, 0) + 1

            # Get most recent errors
            recent_errors = sorted(
                errors,
                key=lambda x: x['created_at'],
                reverse=True
            )[:10]

            return {
                'total_errors': len(errors),
                'error_counts_by_type': error_counts,
                'recent_errors': recent_errors
            }

        except Exception as e:
            logger.error(f"Error fetching error summary: {str(e)}")
            raise
