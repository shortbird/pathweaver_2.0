"""
AI Performance Analytics Service
Provides analytics and comparison metrics for AI-generated quest performance.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from services.base_service import BaseService
from database import get_supabase_admin_client
from decimal import Decimal

from utils.logger import get_logger

logger = get_logger(__name__)


class AIPerformanceAnalyticsService(BaseService):
    """Service for analyzing AI-generated quest performance and A/B testing"""

    @staticmethod
    def get_quest_performance_data(
        limit: int = 50,
        offset: int = 0,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        quality_score_min: Optional[float] = None,
        generation_source: Optional[str] = None,
        sort_by: str = 'created_at',
        sort_direction: str = 'desc'
    ) -> Dict[str, Any]:
        """
        Get performance data for AI-generated quests.

        Args:
            limit: Max items to return
            offset: Pagination offset
            date_from: Filter quests created after this date (ISO format)
            date_to: Filter quests created before this date (ISO format)
            quality_score_min: Minimum quality score filter
            generation_source: Filter by generation source
            sort_by: Field to sort by (created_at, completion_rate, average_rating, engagement_score)
            sort_direction: asc or desc

        Returns:
            Dict with quest performance data and total count
        """
        try:
            supabase = get_supabase_admin_client()

            # Build query
            query = supabase.table('ai_generation_metrics').select(
                '''
                id,
                quest_id,
                generation_source,
                quality_score,
                completion_rate,
                average_rating,
                engagement_score,
                approved,
                model_name,
                time_to_generate_ms,
                total_tokens,
                created_at,
                last_performance_update,
                quests!inner(
                    id,
                    title,
                    source,
                    is_active,
                    created_at
                )
                ''',
                count='exact'
            ).not_.is_('quest_id', 'null').eq('approved', True)

            # Apply filters
            if date_from:
                query = query.gte('created_at', date_from)
            if date_to:
                query = query.lte('created_at', date_to)
            if quality_score_min is not None:
                query = query.gte('quality_score', quality_score_min)
            if generation_source:
                query = query.eq('generation_source', generation_source)

            # Apply sorting
            if sort_by in ['completion_rate', 'average_rating', 'engagement_score']:
                # Sort nulls last for performance metrics
                query = query.order(sort_by, desc=(sort_direction == 'desc'), nullsfirst=False)
            else:
                query = query.order(sort_by, desc=(sort_direction == 'desc'))

            # Apply pagination
            query = query.range(offset, offset + limit - 1)

            # Execute query
            response = query.execute()

            return {
                'success': True,
                'data': response.data,
                'total_count': response.count,
                'limit': limit,
                'offset': offset
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'data': [],
                'total_count': 0
            }

    @staticmethod
    def get_ai_vs_human_comparison(
        days_back: int = 30
    ) -> Dict[str, Any]:
        """
        Compare performance of AI-generated quests vs human-created quests.

        Args:
            days_back: Number of days to look back for comparison

        Returns:
            Dict with comparison metrics
        """
        try:
            supabase = get_supabase_admin_client()
            date_cutoff = (datetime.utcnow() - timedelta(days=days_back)).isoformat()

            # Get AI quest performance
            ai_metrics_response = supabase.table('ai_generation_metrics').select(
                'completion_rate, average_rating, engagement_score'
            ).eq('approved', True).not_.is_('quest_id', 'null').gte('created_at', date_cutoff).execute()

            ai_quests = ai_metrics_response.data

            # Get human quest performance (non-AI sources)
            # We need to calculate this manually since human quests don't have metrics table
            human_quests_response = supabase.rpc('get_human_quest_performance', {
                'days_back_param': days_back
            }).execute()

            human_quests = human_quests_response.data if human_quests_response.data else []

            # Calculate AI averages
            ai_completion_rates = [q['completion_rate'] for q in ai_quests if q.get('completion_rate') is not None]
            ai_ratings = [q['average_rating'] for q in ai_quests if q.get('average_rating') is not None]
            ai_engagement = [q['engagement_score'] for q in ai_quests if q.get('engagement_score') is not None]

            ai_avg_completion = sum(ai_completion_rates) / len(ai_completion_rates) if ai_completion_rates else 0
            ai_avg_rating = sum(ai_ratings) / len(ai_ratings) if ai_ratings else 0
            ai_avg_engagement = sum(ai_engagement) / len(ai_engagement) if ai_engagement else 0

            # Calculate human averages
            human_avg_completion = human_quests[0]['avg_completion_rate'] if human_quests else 0
            human_avg_rating = human_quests[0]['avg_rating'] if human_quests else 0
            human_avg_engagement = human_quests[0]['avg_engagement_score'] if human_quests else 0
            human_total_quests = human_quests[0]['total_quests'] if human_quests else 0

            return {
                'success': True,
                'ai_metrics': {
                    'total_quests': len(ai_quests),
                    'avg_completion_rate': float(ai_avg_completion),
                    'avg_rating': float(ai_avg_rating),
                    'avg_engagement_score': float(ai_avg_engagement)
                },
                'human_metrics': {
                    'total_quests': int(human_total_quests),
                    'avg_completion_rate': float(human_avg_completion),
                    'avg_rating': float(human_avg_rating),
                    'avg_engagement_score': float(human_avg_engagement)
                },
                'comparison': {
                    'completion_rate_diff': float(ai_avg_completion - human_avg_completion),
                    'rating_diff': float(ai_avg_rating - human_avg_rating),
                    'engagement_diff': float(ai_avg_engagement - human_avg_engagement)
                },
                'days_analyzed': days_back,
                'as_of': datetime.utcnow().isoformat()
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'ai_metrics': {},
                'human_metrics': {},
                'comparison': {}
            }

    @staticmethod
    def get_prompt_performance_comparison() -> Dict[str, Any]:
        """
        Get performance comparison across different prompt versions (A/B testing).

        Returns:
            Dict with prompt version performance data
        """
        try:
            supabase = get_supabase_admin_client()

            # Get all prompt versions with their aggregated metrics
            prompt_versions_response = supabase.table('ai_prompt_versions').select(
                '''
                id,
                version_name,
                prompt_type,
                is_active,
                avg_quality_score,
                approval_rate,
                avg_completion_rate,
                avg_student_rating,
                total_generations,
                created_at,
                activated_at,
                deactivated_at,
                last_metrics_update
                '''
            ).execute()

            # Get generation metrics grouped by prompt version
            metrics_response = supabase.table('ai_generation_metrics').select(
                '''
                prompt_version,
                quality_score,
                approved,
                completion_rate,
                average_rating,
                engagement_score,
                time_to_generate_ms,
                total_tokens
                '''
            ).not_.is_('prompt_version', 'null').execute()

            # Group metrics by prompt version
            prompt_stats = {}
            for metric in metrics_response.data:
                version = metric['prompt_version']
                if version not in prompt_stats:
                    prompt_stats[version] = {
                        'quality_scores': [],
                        'approved_count': 0,
                        'total_count': 0,
                        'completion_rates': [],
                        'ratings': [],
                        'engagement_scores': [],
                        'generation_times': [],
                        'token_counts': []
                    }

                stats = prompt_stats[version]
                stats['total_count'] += 1

                if metric.get('quality_score') is not None:
                    stats['quality_scores'].append(float(metric['quality_score']))

                if metric.get('approved'):
                    stats['approved_count'] += 1

                if metric.get('completion_rate') is not None:
                    stats['completion_rates'].append(float(metric['completion_rate']))

                if metric.get('average_rating') is not None:
                    stats['ratings'].append(float(metric['average_rating']))

                if metric.get('engagement_score') is not None:
                    stats['engagement_scores'].append(float(metric['engagement_score']))

                if metric.get('time_to_generate_ms') is not None:
                    stats['generation_times'].append(int(metric['time_to_generate_ms']))

                if metric.get('total_tokens') is not None:
                    stats['token_counts'].append(int(metric['total_tokens']))

            # Calculate averages for each prompt version
            performance_data = []
            for version, stats in prompt_stats.items():
                performance_data.append({
                    'prompt_version': version,
                    'total_generations': stats['total_count'],
                    'approved_count': stats['approved_count'],
                    'approval_rate': stats['approved_count'] / stats['total_count'] if stats['total_count'] > 0 else 0,
                    'avg_quality_score': sum(stats['quality_scores']) / len(stats['quality_scores']) if stats['quality_scores'] else None,
                    'avg_completion_rate': sum(stats['completion_rates']) / len(stats['completion_rates']) if stats['completion_rates'] else None,
                    'avg_rating': sum(stats['ratings']) / len(stats['ratings']) if stats['ratings'] else None,
                    'avg_engagement_score': sum(stats['engagement_scores']) / len(stats['engagement_scores']) if stats['engagement_scores'] else None,
                    'avg_generation_time_ms': sum(stats['generation_times']) / len(stats['generation_times']) if stats['generation_times'] else None,
                    'avg_tokens': sum(stats['token_counts']) / len(stats['token_counts']) if stats['token_counts'] else None
                })

            # Sort by approval rate descending
            performance_data.sort(key=lambda x: x['approval_rate'], reverse=True)

            return {
                'success': True,
                'prompt_versions': prompt_versions_response.data,
                'performance_data': performance_data,
                'total_versions': len(prompt_versions_response.data)
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'prompt_versions': [],
                'performance_data': []
            }

    @staticmethod
    def get_quality_trends(
        days_back: int = 30,
        granularity: str = 'daily'
    ) -> Dict[str, Any]:
        """
        Get quality score trends over time.

        Args:
            days_back: Number of days to analyze
            granularity: 'daily' or 'weekly'

        Returns:
            Dict with trend data
        """
        try:
            supabase = get_supabase_admin_client()
            date_cutoff = (datetime.utcnow() - timedelta(days=days_back)).isoformat()

            # Get all metrics within date range
            metrics_response = supabase.table('ai_generation_metrics').select(
                '''
                quality_score,
                approved,
                time_to_generate_ms,
                created_at
                '''
            ).gte('created_at', date_cutoff).order('created_at', desc=False).execute()

            metrics = metrics_response.data

            # Group by time period
            trends = {}
            for metric in metrics:
                created_date = datetime.fromisoformat(metric['created_at'].replace('Z', '+00:00'))

                if granularity == 'weekly':
                    # Group by week
                    period_key = created_date.strftime('%Y-W%U')
                else:
                    # Group by day
                    period_key = created_date.strftime('%Y-%m-%d')

                if period_key not in trends:
                    trends[period_key] = {
                        'period': period_key,
                        'quality_scores': [],
                        'approved_count': 0,
                        'total_count': 0,
                        'generation_times': []
                    }

                trend_data = trends[period_key]
                trend_data['total_count'] += 1

                if metric.get('quality_score') is not None:
                    trend_data['quality_scores'].append(float(metric['quality_score']))

                if metric.get('approved'):
                    trend_data['approved_count'] += 1

                if metric.get('time_to_generate_ms') is not None:
                    trend_data['generation_times'].append(int(metric['time_to_generate_ms']))

            # Calculate averages
            trend_list = []
            for period, data in sorted(trends.items()):
                trend_list.append({
                    'period': period,
                    'total_generations': data['total_count'],
                    'approved_count': data['approved_count'],
                    'approval_rate': data['approved_count'] / data['total_count'] if data['total_count'] > 0 else 0,
                    'avg_quality_score': sum(data['quality_scores']) / len(data['quality_scores']) if data['quality_scores'] else None,
                    'avg_generation_time_ms': sum(data['generation_times']) / len(data['generation_times']) if data['generation_times'] else None
                })

            return {
                'success': True,
                'trends': trend_list,
                'granularity': granularity,
                'days_analyzed': days_back,
                'as_of': datetime.utcnow().isoformat()
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'trends': []
            }

    @staticmethod
    def refresh_performance_metrics() -> Dict[str, Any]:
        """
        Manually trigger performance metrics refresh for all AI-generated quests.
        Calls the database function to update completion rates, ratings, and engagement scores.

        Returns:
            Dict with number of updated records
        """
        try:
            supabase = get_supabase_admin_client()

            # Call the database function to update metrics
            response = supabase.rpc('update_ai_generation_performance_metrics').execute()

            updated_count = response.data if response.data is not None else 0

            return {
                'success': True,
                'updated_count': updated_count,
                'timestamp': datetime.utcnow().isoformat()
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'updated_count': 0
            }
