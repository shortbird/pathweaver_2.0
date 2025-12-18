"""
AI Quest Maintenance Service
Automated quest lifecycle management including quality monitoring, content refresh, and usage tracking.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from services.base_service import BaseService
from database import get_supabase_admin_client
import json

from utils.logger import get_logger

logger = get_logger(__name__)


class AIQuestMaintenanceService(BaseService):
    """Service for automated quest maintenance and quality monitoring"""

    # Performance thresholds
    LOW_ENGAGEMENT_THRESHOLD = 0.3  # 30% engagement score
    LOW_COMPLETION_THRESHOLD = 0.25  # 25% completion rate
    MINIMUM_STARTS_FOR_ANALYSIS = 5  # Need at least 5 starts to analyze
    INACTIVE_THRESHOLD_DAYS = 180  # 6 months

    @staticmethod
    def analyze_quest_performance(quest_id: str) -> Dict[str, Any]:
        """
        Analyze performance metrics for a specific quest.

        Args:
            quest_id: Quest UUID

        Returns:
            Dict containing performance metrics and recommendations
        """
        supabase = get_supabase_admin_client()

        # Get quest details
        quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
        if not quest.data:
            raise ValueError(f"Quest {quest_id} not found")

        quest_data = quest.data

        # Get usage statistics
        quest_starts = supabase.table('user_quests').select('*').eq('quest_id', quest_id).execute()
        starts_count = len(quest_starts.data) if quest_starts.data else 0

        if starts_count == 0:
            return {
                'quest_id': quest_id,
                'status': 'no_data',
                'message': 'No usage data available',
                'starts_count': 0,
                'completion_rate': 0,
                'engagement_score': 0,
                'recommendation': 'insufficient_data'
            }

        # Calculate completion rate
        completions = [q for q in quest_starts.data if q.get('completed_at')]
        completion_rate = len(completions) / starts_count if starts_count > 0 else 0

        # Get task completion data for engagement analysis
        task_completions = supabase.table('quest_task_completions')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .execute()

        # Calculate engagement score (average tasks completed per student)
        total_tasks = supabase.table('user_quest_tasks').select('id').eq('quest_id', quest_id).execute()
        num_tasks = len(total_tasks.data) if total_tasks.data else 1

        if starts_count > 0:
            avg_tasks_completed = len(task_completions.data) / starts_count if task_completions.data else 0
            engagement_score = avg_tasks_completed / num_tasks if num_tasks > 0 else 0
        else:
            engagement_score = 0

        # Calculate average time to complete (for completed quests)
        avg_completion_time = None
        if completions:
            completion_times = []
            for completion in completions:
                if completion.get('started_at') and completion.get('completed_at'):
                    started = datetime.fromisoformat(completion['started_at'].replace('Z', '+00:00'))
                    completed = datetime.fromisoformat(completion['completed_at'].replace('Z', '+00:00'))
                    hours = (completed - started).total_seconds() / 3600
                    completion_times.append(hours)

            if completion_times:
                avg_completion_time = sum(completion_times) / len(completion_times)

        # Get student feedback ratings
        # Note: quest_ratings table was removed in Phase 1 refactoring
        avg_rating = None

        # Determine status and recommendation
        status = 'healthy'
        recommendation = 'maintain'
        issues = []

        if starts_count < AIQuestMaintenanceService.MINIMUM_STARTS_FOR_ANALYSIS:
            status = 'insufficient_data'
            recommendation = 'monitor'
        else:
            if completion_rate < AIQuestMaintenanceService.LOW_COMPLETION_THRESHOLD:
                status = 'needs_attention'
                issues.append(f'Low completion rate: {completion_rate:.1%}')
                recommendation = 'revise_or_archive'

            if engagement_score < AIQuestMaintenanceService.LOW_ENGAGEMENT_THRESHOLD:
                status = 'needs_attention'
                issues.append(f'Low engagement score: {engagement_score:.1%}')
                if recommendation != 'revise_or_archive':
                    recommendation = 'improve_tasks'

            if avg_rating and avg_rating < 3.0:
                status = 'needs_attention'
                issues.append(f'Low average rating: {avg_rating:.1f}/5')
                recommendation = 'revise_or_archive'

        # Check for inactivity
        last_start = max(
            [datetime.fromisoformat(q['started_at'].replace('Z', '+00:00'))
             for q in quest_starts.data if q.get('started_at')],
            default=None
        )

        if last_start:
            days_since_last_start = (datetime.utcnow() - last_start.replace(tzinfo=None)).days
            if days_since_last_start > AIQuestMaintenanceService.INACTIVE_THRESHOLD_DAYS:
                status = 'inactive'
                issues.append(f'No starts in {days_since_last_start} days')
                recommendation = 'archive'

        return {
            'quest_id': quest_id,
            'quest_title': quest_data.get('title'),
            'status': status,
            'metrics': {
                'starts_count': starts_count,
                'completion_rate': round(completion_rate, 3),
                'engagement_score': round(engagement_score, 3),
                'avg_completion_time_hours': round(avg_completion_time, 1) if avg_completion_time else None,
                'avg_rating': round(avg_rating, 2) if avg_rating else None,
                'total_tasks': num_tasks,
                'ai_generated': quest_data.get('source') == 'ai_generated'
            },
            'issues': issues,
            'recommendation': recommendation,
            'last_activity': last_start.isoformat() if last_start else None
        }

    @staticmethod
    def analyze_all_quests() -> Dict[str, Any]:
        """
        Analyze performance of all active quests in the system.

        Returns:
            Dict containing summary statistics and flagged quests
        """
        supabase = get_supabase_admin_client()

        # Get all active quests
        quests = supabase.table('quests').select('id, title').eq('is_active', True).execute()

        if not quests.data:
            return {
                'total_quests': 0,
                'analyzed': 0,
                'summary': {},
                'flagged_quests': []
            }

        total_quests = len(quests.data)
        flagged_quests = []
        status_counts = {
            'healthy': 0,
            'needs_attention': 0,
            'inactive': 0,
            'insufficient_data': 0
        }

        # Analyze each quest
        for quest in quests.data:
            try:
                analysis = AIQuestMaintenanceService.analyze_quest_performance(quest['id'])

                status = analysis.get('status', 'unknown')
                if status in status_counts:
                    status_counts[status] += 1

                # Flag quests that need attention
                if status in ['needs_attention', 'inactive']:
                    flagged_quests.append({
                        'quest_id': analysis['quest_id'],
                        'quest_title': analysis['quest_title'],
                        'status': status,
                        'issues': analysis['issues'],
                        'recommendation': analysis['recommendation'],
                        'metrics': analysis['metrics']
                    })

            except Exception as e:
                logger.error(f"Error analyzing quest {quest['id']}: {e}")
                continue

        # Sort flagged quests by severity
        flagged_quests.sort(key=lambda x: (
            0 if x['recommendation'] == 'revise_or_archive' else
            1 if x['recommendation'] == 'archive' else
            2 if x['recommendation'] == 'improve_tasks' else 3
        ))

        return {
            'total_quests': total_quests,
            'analyzed': sum(status_counts.values()),
            'summary': {
                'healthy': status_counts['healthy'],
                'needs_attention': status_counts['needs_attention'],
                'inactive': status_counts['inactive'],
                'insufficient_data': status_counts['insufficient_data'],
                'health_percentage': round(status_counts['healthy'] / total_quests * 100, 1) if total_quests > 0 else 0
            },
            'flagged_quests': flagged_quests[:20],  # Top 20 most problematic
            'generated_at': datetime.utcnow().isoformat()
        }

    @staticmethod
    def update_ai_content_metrics() -> int:
        """
        Update ai_content_metrics table with latest quest performance data.

        Returns:
            Number of metrics updated
        """
        supabase = get_supabase_admin_client()

        # Get all quests (both AI and human-created)
        quests = supabase.table('quests').select('id, quest_type').eq('is_active', True).execute()

        if not quests.data:
            return 0

        updated_count = 0

        for quest in quests.data:
            try:
                quest_id = quest['id']
                analysis = AIQuestMaintenanceService.analyze_quest_performance(quest_id)

                # Only update if we have sufficient data
                if analysis['status'] == 'insufficient_data':
                    continue

                metrics = analysis['metrics']

                # Check if metric record exists
                existing = supabase.table('ai_content_metrics')\
                    .select('id')\
                    .eq('content_id', quest_id)\
                    .eq('content_type', 'quest')\
                    .execute()

                metric_data = {
                    'content_type': 'quest',
                    'content_id': quest_id,
                    'engagement_score': metrics['engagement_score'],
                    'completion_rate': metrics['completion_rate'],
                    'avg_time_to_complete': int(metrics['avg_completion_time_hours']) if metrics['avg_completion_time_hours'] else None,
                    'student_feedback_avg': metrics['avg_rating'],
                    'usage_count': metrics['starts_count'],
                    'last_updated': datetime.utcnow().isoformat()
                }

                if existing.data:
                    # Update existing record
                    supabase.table('ai_content_metrics')\
                        .update(metric_data)\
                        .eq('id', existing.data[0]['id'])\
                        .execute()
                else:
                    # Insert new record
                    supabase.table('ai_content_metrics').insert(metric_data).execute()

                updated_count += 1

            except Exception as e:
                logger.error(f"Error updating metrics for quest {quest_id}: {e}")
                continue

        return updated_count

    @staticmethod
    def get_content_improvement_suggestions(quest_id: str) -> Dict[str, Any]:
        """
        Generate AI-powered suggestions for improving a quest.

        Args:
            quest_id: Quest UUID

        Returns:
            Dict containing improvement suggestions
        """
        analysis = AIQuestMaintenanceService.analyze_quest_performance(quest_id)

        suggestions = []

        if analysis['status'] == 'insufficient_data':
            return {
                'quest_id': quest_id,
                'suggestions': ['Promote quest to increase visibility and gather performance data'],
                'priority': 'low'
            }

        metrics = analysis['metrics']

        # Low completion rate suggestions
        if metrics['completion_rate'] < AIQuestMaintenanceService.LOW_COMPLETION_THRESHOLD:
            suggestions.append({
                'issue': 'Low completion rate',
                'suggestion': 'Review task difficulty and consider breaking complex tasks into smaller steps',
                'action': 'revise_tasks'
            })
            suggestions.append({
                'issue': 'Low completion rate',
                'suggestion': 'Add more resources and examples to help students understand requirements',
                'action': 'enhance_resources'
            })

        # Low engagement suggestions
        if metrics['engagement_score'] < AIQuestMaintenanceService.LOW_ENGAGEMENT_THRESHOLD:
            suggestions.append({
                'issue': 'Low engagement',
                'suggestion': 'Update quest description to be more compelling and relevant',
                'action': 'revise_description'
            })
            suggestions.append({
                'issue': 'Low engagement',
                'suggestion': 'Consider adding variety to task types (create, analyze, present, etc.)',
                'action': 'diversify_tasks'
            })

        # Low rating suggestions
        if metrics['avg_rating'] and metrics['avg_rating'] < 3.0:
            suggestions.append({
                'issue': 'Low student ratings',
                'suggestion': 'Review student feedback and adjust based on common complaints',
                'action': 'review_feedback'
            })

        # Long completion time
        if metrics['avg_completion_time_hours'] and metrics['avg_completion_time_hours'] > 50:
            suggestions.append({
                'issue': 'Long completion time',
                'suggestion': 'Quest may be too long - consider splitting into multiple quests',
                'action': 'split_quest'
            })

        # Determine priority
        priority = 'high' if analysis['recommendation'] == 'revise_or_archive' else \
                   'medium' if analysis['recommendation'] == 'improve_tasks' else 'low'

        return {
            'quest_id': quest_id,
            'quest_title': analysis['quest_title'],
            'current_status': analysis['status'],
            'metrics': metrics,
            'suggestions': suggestions,
            'priority': priority,
            'recommendation': analysis['recommendation']
        }

    @staticmethod
    def generate_monthly_report() -> Dict[str, Any]:
        """
        Generate comprehensive monthly content quality report.

        Returns:
            Dict containing monthly performance summary and trends
        """
        supabase = get_supabase_admin_client()

        # Analyze all quests
        overall_analysis = AIQuestMaintenanceService.analyze_all_quests()

        # Get AI-specific metrics
        ai_metrics = supabase.table('ai_content_metrics')\
            .select('*')\
            .eq('content_type', 'quest')\
            .execute()

        ai_quest_count = len(ai_metrics.data) if ai_metrics.data else 0

        # Calculate AI content performance
        if ai_metrics.data:
            avg_ai_engagement = sum(m['engagement_score'] for m in ai_metrics.data) / ai_quest_count
            avg_ai_completion = sum(m['completion_rate'] for m in ai_metrics.data) / ai_quest_count
            avg_ai_rating = sum(m.get('student_feedback_avg', 0) for m in ai_metrics.data if m.get('student_feedback_avg')) / \
                           len([m for m in ai_metrics.data if m.get('student_feedback_avg')])
        else:
            avg_ai_engagement = 0
            avg_ai_completion = 0
            avg_ai_rating = 0

        # Get quest creation trends (last 30 days)
        thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
        recent_quests = supabase.table('quests')\
            .select('created_at, quest_type')\
            .gte('created_at', thirty_days_ago)\
            .execute()

        ai_created_count = len([q for q in recent_quests.data if q.get('quest_type') == 'optio']) if recent_quests.data else 0
        total_created_count = len(recent_quests.data) if recent_quests.data else 0

        return {
            'report_date': datetime.utcnow().isoformat(),
            'period': 'Last 30 days',
            'overall_health': overall_analysis['summary'],
            'total_quests': overall_analysis['total_quests'],
            'flagged_quests_count': len(overall_analysis['flagged_quests']),
            'ai_content_performance': {
                'total_ai_quests': ai_quest_count,
                'avg_engagement_score': round(avg_ai_engagement, 3),
                'avg_completion_rate': round(avg_ai_completion, 3),
                'avg_student_rating': round(avg_ai_rating, 2) if avg_ai_rating > 0 else None
            },
            'content_creation_trends': {
                'total_created': total_created_count,
                'ai_created': ai_created_count,
                'human_created': total_created_count - ai_created_count,
                'ai_percentage': round(ai_created_count / total_created_count * 100, 1) if total_created_count > 0 else 0
            },
            'top_issues': overall_analysis['flagged_quests'][:10],
            'recommendations': AIQuestMaintenanceService._generate_strategic_recommendations(overall_analysis)
        }

    @staticmethod
    def _generate_strategic_recommendations(analysis: Dict) -> List[str]:
        """Generate high-level strategic recommendations based on analysis"""
        recommendations = []

        summary = analysis['summary']

        # Health check
        if summary['health_percentage'] < 60:
            recommendations.append('URGENT: Overall quest quality is below acceptable threshold. Conduct comprehensive content review.')

        if summary['needs_attention'] > summary['healthy']:
            recommendations.append('Focus on improving existing quests before creating new content.')

        if summary['inactive'] > 10:
            recommendations.append(f'Archive {summary["inactive"]} inactive quests to streamline content library.')

        # AI content recommendations
        flagged = analysis['flagged_quests']
        ai_flagged = [q for q in flagged if q['metrics'].get('ai_generated')]

        if len(ai_flagged) > 5:
            recommendations.append(f'Review AI generation prompts - {len(ai_flagged)} AI quests need improvement.')

        # Insufficient data
        if summary['insufficient_data'] > 20:
            recommendations.append('Promote under-utilized quests to gather performance data.')

        return recommendations if recommendations else ['Content library is healthy. Continue monitoring.']
