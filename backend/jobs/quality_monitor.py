"""
Quality Monitor
Continuous monitoring and automated quality assurance for AI-generated content.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from database import get_supabase_admin_client
from services.ai_quest_maintenance_service import AIQuestMaintenanceService
from services.quest_ai_service import QuestAIService
import json

from utils.logger import get_logger

logger = get_logger(__name__)


class QualityMonitor:
    """Automated quality monitoring for AI-generated content"""

    # Quality thresholds
    EXCELLENT_THRESHOLD = 0.85
    ACCEPTABLE_THRESHOLD = 0.60
    POOR_THRESHOLD = 0.40

    # Action thresholds
    AUTO_ARCHIVE_THRESHOLD = 0.25  # Completion rate below this gets archived
    AUTO_DEACTIVATE_RATING = 2.0   # Avg rating below this gets deactivated

    @staticmethod
    def execute(job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute quality monitoring job.

        Args:
            job_data: Job configuration

        Returns:
            Dict containing monitoring results
        """
        check_type = job_data.get('check_type', 'daily_audit')

        if check_type == 'daily_audit':
            return QualityMonitor._run_daily_audit(job_data)
        elif check_type == 'flag_poor_content':
            return QualityMonitor._flag_poor_performers(job_data)
        elif check_type == 'validate_new_content':
            return QualityMonitor._validate_new_content(job_data)
        else:
            raise ValueError(f"Unknown check type: {check_type}")

    @staticmethod
    def _run_daily_audit(job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run comprehensive daily quality audit.

        Args:
            job_data: Configuration

        Returns:
            Dict containing audit results
        """
        # Analyze all quests
        overall_analysis = AIQuestMaintenanceService.analyze_all_quests()

        # Update metrics
        metrics_updated = AIQuestMaintenanceService.update_ai_content_metrics()

        # Flag content needing attention
        flagged_content = overall_analysis['flagged_quests']

        # Take automated actions
        actions_taken = []

        for quest in flagged_content:
            quest_id = quest['quest_id']
            recommendation = quest['recommendation']
            metrics = quest['metrics']

            # Auto-archive extremely poor performers
            if recommendation == 'archive' and metrics['completion_rate'] < QualityMonitor.AUTO_ARCHIVE_THRESHOLD:
                action = QualityMonitor._archive_quest(quest_id, reason='Low completion rate')
                actions_taken.append(action)

            # Deactivate quests with very low ratings
            if metrics.get('avg_rating') and metrics['avg_rating'] < QualityMonitor.AUTO_DEACTIVATE_RATING:
                action = QualityMonitor._deactivate_quest(quest_id, reason='Low user ratings')
                actions_taken.append(action)

        return {
            'check_type': 'daily_audit',
            'total_quests_analyzed': overall_analysis['total_quests'],
            'health_summary': overall_analysis['summary'],
            'flagged_count': len(flagged_content),
            'metrics_updated': metrics_updated,
            'automated_actions': len(actions_taken),
            'actions_detail': actions_taken,
            'completed_at': datetime.utcnow().isoformat()
        }

    @staticmethod
    def _flag_poor_performers(job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Identify and flag poorly performing content.

        Args:
            job_data: Configuration

        Returns:
            Dict containing flagged content
        """
        supabase = get_supabase_admin_client()

        # Get all active AI-generated quests
        ai_quests = supabase.table('quests')\
            .select('id, title, source')\
            .eq('is_active', True)\
            .like('source', 'ai_%')\
            .execute()

        poor_performers = []

        if ai_quests.data:
            for quest in ai_quests.data:
                quest_id = quest['id']

                # Analyze performance
                analysis = AIQuestMaintenanceService.analyze_quest_performance(quest_id)

                # Flag if performance is poor
                if analysis['status'] == 'needs_attention' or analysis['status'] == 'inactive':
                    # Get improvement suggestions
                    suggestions = AIQuestMaintenanceService.get_content_improvement_suggestions(quest_id)

                    poor_performers.append({
                        'quest_id': quest_id,
                        'quest_title': quest['title'],
                        'status': analysis['status'],
                        'metrics': analysis['metrics'],
                        'issues': analysis['issues'],
                        'suggestions': suggestions['suggestions'],
                        'priority': suggestions['priority']
                    })

        # Sort by priority
        poor_performers.sort(key=lambda x: (
            0 if x['priority'] == 'high' else
            1 if x['priority'] == 'medium' else 2
        ))

        return {
            'check_type': 'flag_poor_content',
            'total_checked': len(ai_quests.data) if ai_quests.data else 0,
            'poor_performers_count': len(poor_performers),
            'poor_performers': poor_performers[:20],  # Top 20
            'completed_at': datetime.utcnow().isoformat()
        }

    @staticmethod
    def _validate_new_content(job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate recently created AI content that's pending review.

        Args:
            job_data: Configuration including days_back

        Returns:
            Dict containing validation results
        """
        supabase = get_supabase_admin_client()
        ai_service = QuestAIService()

        days_back = job_data.get('days_back', 7)
        cutoff_date = (datetime.utcnow() - timedelta(days=days_back)).isoformat()

        # Get quests pending review
        pending_quests = supabase.table('quests')\
            .select('id, title, description, source')\
            .eq('requires_review', True)\
            .gte('created_at', cutoff_date)\
            .execute()

        validation_results = []

        if pending_quests.data:
            for quest in pending_quests.data:
                quest_id = quest['id']

                # Get quest tasks
                tasks = supabase.table('quest_tasks')\
                    .select('*')\
                    .eq('quest_id', quest_id)\
                    .execute()

                if tasks.data:
                    quest_data = {
                        'title': quest['title'],
                        'description': quest['description'],
                        'tasks': tasks.data
                    }

                    # Validate quality
                    quality_score = ai_service.validate_quest_quality(quest_data)

                    # Determine action
                    overall_score = quality_score['overall_score']
                    if overall_score >= QualityMonitor.EXCELLENT_THRESHOLD:
                        action = 'auto_approve'
                        # Auto-approve high quality content
                        supabase.table('quests')\
                            .update({'is_active': True, 'requires_review': False})\
                            .eq('id', quest_id)\
                            .execute()

                    elif overall_score >= QualityMonitor.ACCEPTABLE_THRESHOLD:
                        action = 'manual_review'

                    else:
                        action = 'reject'
                        # Auto-reject very poor content
                        supabase.table('quests')\
                            .update({'is_active': False, 'requires_review': False})\
                            .eq('id', quest_id)\
                            .execute()

                    validation_results.append({
                        'quest_id': quest_id,
                        'quest_title': quest['title'],
                        'quality_score': overall_score,
                        'validation_details': quality_score,
                        'action': action
                    })

        # Sort by quality score
        validation_results.sort(key=lambda x: x['quality_score'], reverse=True)

        return {
            'check_type': 'validate_new_content',
            'days_back': days_back,
            'total_validated': len(validation_results),
            'auto_approved': len([v for v in validation_results if v['action'] == 'auto_approve']),
            'manual_review_needed': len([v for v in validation_results if v['action'] == 'manual_review']),
            'auto_rejected': len([v for v in validation_results if v['action'] == 'reject']),
            'validation_results': validation_results,
            'completed_at': datetime.utcnow().isoformat()
        }

    @staticmethod
    def _archive_quest(quest_id: str, reason: str) -> Dict[str, Any]:
        """
        Archive a poorly performing quest.

        Args:
            quest_id: Quest UUID
            reason: Reason for archiving

        Returns:
            Dict containing action result
        """
        supabase = get_supabase_admin_client()

        # Deactivate quest
        supabase.table('quests')\
            .update({
                'is_active': False,
                'archived_at': datetime.utcnow().isoformat(),
                'archive_reason': reason
            })\
            .eq('id', quest_id)\
            .execute()

        # Create quality action log
        supabase.table('quality_action_logs').insert({
            'content_type': 'quest',
            'content_id': quest_id,
            'action_type': 'archive',
            'reason': reason,
            'automated': True,
            'created_at': datetime.utcnow().isoformat()
        }).execute()

        return {
            'action': 'archive',
            'quest_id': quest_id,
            'reason': reason,
            'status': 'success'
        }

    @staticmethod
    def _deactivate_quest(quest_id: str, reason: str) -> Dict[str, Any]:
        """
        Deactivate a quest due to quality issues.

        Args:
            quest_id: Quest UUID
            reason: Reason for deactivation

        Returns:
            Dict containing action result
        """
        supabase = get_supabase_admin_client()

        # Deactivate quest
        supabase.table('quests')\
            .update({
                'is_active': False,
                'deactivated_at': datetime.utcnow().isoformat(),
                'deactivation_reason': reason
            })\
            .eq('id', quest_id)\
            .execute()

        # Create quality action log
        supabase.table('quality_action_logs').insert({
            'content_type': 'quest',
            'content_id': quest_id,
            'action_type': 'deactivate',
            'reason': reason,
            'automated': True,
            'created_at': datetime.utcnow().isoformat()
        }).execute()

        return {
            'action': 'deactivate',
            'quest_id': quest_id,
            'reason': reason,
            'status': 'success'
        }

    @staticmethod
    def get_quality_report(days: int = 30) -> Dict[str, Any]:
        """
        Generate comprehensive quality report for time period.

        Args:
            days: Number of days to analyze

        Returns:
            Dict containing quality metrics and trends
        """
        supabase = get_supabase_admin_client()

        cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()

        # Get all quality actions
        actions = supabase.table('quality_action_logs')\
            .select('*')\
            .gte('created_at', cutoff_date)\
            .execute()

        action_counts = {}
        if actions.data:
            for action in actions.data:
                action_type = action.get('action_type')
                action_counts[action_type] = action_counts.get(action_type, 0) + 1

        # Get AI content metrics
        metrics = supabase.table('ai_content_metrics')\
            .select('*')\
            .eq('content_type', 'quest')\
            .execute()

        if metrics.data:
            avg_engagement = sum(m.get('engagement_score', 0) for m in metrics.data) / len(metrics.data)
            avg_completion = sum(m.get('completion_rate', 0) for m in metrics.data) / len(metrics.data)
            avg_rating = sum(m.get('student_feedback_avg', 0) for m in metrics.data if m.get('student_feedback_avg')) / \
                        len([m for m in metrics.data if m.get('student_feedback_avg')])
        else:
            avg_engagement = 0
            avg_completion = 0
            avg_rating = 0

        return {
            'period_days': days,
            'quality_actions': action_counts,
            'total_actions': len(actions.data) if actions.data else 0,
            'ai_content_metrics': {
                'total_quests': len(metrics.data) if metrics.data else 0,
                'avg_engagement_score': round(avg_engagement, 3),
                'avg_completion_rate': round(avg_completion, 3),
                'avg_student_rating': round(avg_rating, 2)
            },
            'generated_at': datetime.utcnow().isoformat()
        }
