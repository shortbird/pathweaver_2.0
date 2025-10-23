"""
AI Prompt Optimizer Service
Automatically improves AI prompts based on performance feedback and quality trends.
Implements continuous improvement loop for quest generation.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

from backend.database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class AIPromptOptimizerService:
    """Service for optimizing AI prompts based on performance data."""

    def __init__(self):
        self.supabase = get_supabase_admin_client()

    def analyze_prompt_performance(self, days: int = 30) -> List[Dict]:
        """
        Analyze performance of all prompt versions over time period.

        Args:
            days: Number of days to analyze (default: 30)

        Returns:
            List of prompt versions with performance metrics and recommendations
        """
        try:
            cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()

            # Get all prompt versions with their metrics
            response = self.supabase.table('ai_prompt_versions')\
                .select('*, ai_generation_metrics(count)')\
                .execute()

            prompt_versions = response.data

            results = []
            for prompt in prompt_versions:
                # Get detailed metrics for this prompt version
                metrics = self._get_prompt_metrics(prompt['version_number'], cutoff_date)

                # Calculate performance score (0-100)
                performance_score = self._calculate_performance_score(metrics)

                # Generate improvement recommendations
                recommendations = self._generate_recommendations(metrics, performance_score)

                results.append({
                    'version_number': prompt['version_number'],
                    'is_active': prompt['is_active'],
                    'created_at': prompt['created_at'],
                    'metrics': metrics,
                    'performance_score': performance_score,
                    'recommendations': recommendations,
                    'needs_optimization': performance_score < 70
                })

            # Sort by performance score (worst first)
            results.sort(key=lambda x: x['performance_score'])

            return results

        except Exception as e:
            logger.error(f"Error analyzing prompt performance: {str(e)}")
            raise

    def _get_prompt_metrics(self, version_number: str, cutoff_date: str) -> Dict:
        """Get aggregated metrics for a specific prompt version."""
        try:
            # Get generation metrics
            response = self.supabase.table('ai_generation_metrics')\
                .select('*')\
                .eq('prompt_version', version_number)\
                .gte('created_at', cutoff_date)\
                .execute()

            metrics_data = response.data

            if not metrics_data:
                return {
                    'total_generations': 0,
                    'avg_quality_score': 0,
                    'avg_approval_rate': 0,
                    'avg_completion_rate': 0,
                    'avg_rating': 0,
                    'avg_engagement': 0,
                    'avg_generation_time': 0,
                    'total_tokens': 0
                }

            # Calculate aggregates
            total = len(metrics_data)
            approved = sum(1 for m in metrics_data if m.get('approved'))

            return {
                'total_generations': total,
                'avg_quality_score': sum(m.get('quality_score', 0) for m in metrics_data) / total if total > 0 else 0,
                'avg_approval_rate': (approved / total * 100) if total > 0 else 0,
                'avg_completion_rate': sum(m.get('completion_rate', 0) for m in metrics_data) / total if total > 0 else 0,
                'avg_rating': sum(m.get('average_rating', 0) for m in metrics_data) / total if total > 0 else 0,
                'avg_engagement': sum(m.get('engagement_score', 0) for m in metrics_data) / total if total > 0 else 0,
                'avg_generation_time': sum(m.get('generation_time_ms', 0) for m in metrics_data) / total if total > 0 else 0,
                'total_tokens': sum(m.get('total_tokens', 0) for m in metrics_data)
            }

        except Exception as e:
            logger.error(f"Error getting prompt metrics: {str(e)}")
            raise

    def _calculate_performance_score(self, metrics: Dict) -> float:
        """
        Calculate overall performance score (0-100) based on multiple metrics.
        Weights different metrics based on importance.
        """
        if metrics['total_generations'] == 0:
            return 0

        # Weight factors (total = 1.0)
        weights = {
            'quality_score': 0.30,      # 30% - AI quality assessment
            'approval_rate': 0.25,      # 25% - Human approval rate
            'completion_rate': 0.20,    # 20% - Student completion
            'rating': 0.15,             # 15% - Student ratings
            'engagement': 0.10          # 10% - Student engagement
        }

        # Normalize metrics to 0-100 scale
        normalized = {
            'quality_score': metrics['avg_quality_score'] * 10,  # 0-10 → 0-100
            'approval_rate': metrics['avg_approval_rate'],       # Already 0-100
            'completion_rate': metrics['avg_completion_rate'] * 100,  # 0-1 → 0-100
            'rating': metrics['avg_rating'] * 20,                # 0-5 → 0-100
            'engagement': metrics['avg_engagement'] * 100        # 0-1 → 0-100
        }

        # Calculate weighted score
        score = sum(normalized[key] * weights[key] for key in weights.keys())

        return round(score, 2)

    def _generate_recommendations(self, metrics: Dict, performance_score: float) -> List[Dict]:
        """Generate specific improvement recommendations based on metrics."""
        recommendations = []

        # Quality score recommendations
        if metrics['avg_quality_score'] < 7:
            recommendations.append({
                'category': 'quality',
                'severity': 'high',
                'issue': f"Low AI quality score ({metrics['avg_quality_score']:.1f}/10)",
                'suggestion': 'Review prompt structure for clarity, engagement, and pedagogical alignment'
            })

        # Approval rate recommendations
        if metrics['avg_approval_rate'] < 70:
            recommendations.append({
                'category': 'approval',
                'severity': 'high',
                'issue': f"Low approval rate ({metrics['avg_approval_rate']:.1f}%)",
                'suggestion': 'Analyze rejected quests for common patterns and adjust prompt accordingly'
            })

        # Completion rate recommendations
        if metrics['avg_completion_rate'] < 0.5:
            recommendations.append({
                'category': 'completion',
                'severity': 'medium',
                'issue': f"Low completion rate ({metrics['avg_completion_rate']:.1%})",
                'suggestion': 'Consider reducing quest complexity or improving task clarity'
            })

        # Rating recommendations
        if metrics['avg_rating'] < 3.5:
            recommendations.append({
                'category': 'rating',
                'severity': 'medium',
                'issue': f"Low student ratings ({metrics['avg_rating']:.1f}/5)",
                'suggestion': 'Review student feedback for common complaints and adjust prompt'
            })

        # Engagement recommendations
        if metrics['avg_engagement'] < 0.6:
            recommendations.append({
                'category': 'engagement',
                'severity': 'low',
                'issue': f"Low engagement score ({metrics['avg_engagement']:.1%})",
                'suggestion': 'Add more interactive or creative elements to generated quests'
            })

        # Generation time recommendations
        if metrics['avg_generation_time'] > 10000:  # >10 seconds
            recommendations.append({
                'category': 'performance',
                'severity': 'low',
                'issue': f"Slow generation time ({metrics['avg_generation_time']/1000:.1f}s)",
                'suggestion': 'Simplify prompt to reduce API processing time'
            })

        return recommendations

    def get_improvement_insights(self, days: int = 30) -> Dict:
        """
        Get actionable insights for prompt improvement.

        Args:
            days: Number of days to analyze

        Returns:
            Insights dictionary with trends, comparisons, and recommendations
        """
        try:
            # Analyze all prompt versions
            prompt_analysis = self.analyze_prompt_performance(days)

            # Get quality trends
            quality_trends = self._get_quality_trends(days)

            # Compare active vs inactive prompts
            active_prompts = [p for p in prompt_analysis if p['is_active']]
            inactive_prompts = [p for p in prompt_analysis if not p['is_active']]

            # Find best performing prompt
            best_prompt = max(prompt_analysis, key=lambda x: x['performance_score']) if prompt_analysis else None

            # Find worst performing prompt
            worst_prompt = min(prompt_analysis, key=lambda x: x['performance_score']) if prompt_analysis else None

            # Aggregate all recommendations
            all_recommendations = []
            for prompt in prompt_analysis:
                for rec in prompt['recommendations']:
                    all_recommendations.append({
                        **rec,
                        'prompt_version': prompt['version_number']
                    })

            # Group recommendations by category
            recommendations_by_category = {}
            for rec in all_recommendations:
                category = rec['category']
                if category not in recommendations_by_category:
                    recommendations_by_category[category] = []
                recommendations_by_category[category].append(rec)

            return {
                'summary': {
                    'total_prompts': len(prompt_analysis),
                    'active_prompts': len(active_prompts),
                    'prompts_needing_optimization': sum(1 for p in prompt_analysis if p['needs_optimization']),
                    'avg_performance_score': sum(p['performance_score'] for p in prompt_analysis) / len(prompt_analysis) if prompt_analysis else 0
                },
                'best_prompt': best_prompt,
                'worst_prompt': worst_prompt,
                'quality_trends': quality_trends,
                'recommendations_by_category': recommendations_by_category,
                'all_prompts': prompt_analysis
            }

        except Exception as e:
            logger.error(f"Error getting improvement insights: {str(e)}")
            raise

    def _get_quality_trends(self, days: int) -> Dict:
        """Get quality trends over time period."""
        try:
            cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()

            # Get all metrics in time period
            response = self.supabase.table('ai_generation_metrics')\
                .select('quality_score, created_at, approved')\
                .gte('created_at', cutoff_date)\
                .order('created_at')\
                .execute()

            metrics = response.data

            if not metrics:
                return {
                    'trend_direction': 'unknown',
                    'quality_change': 0,
                    'approval_change': 0
                }

            # Split into first half and second half
            midpoint = len(metrics) // 2
            first_half = metrics[:midpoint]
            second_half = metrics[midpoint:]

            # Calculate averages for each half
            first_quality = sum(m.get('quality_score', 0) for m in first_half) / len(first_half) if first_half else 0
            second_quality = sum(m.get('quality_score', 0) for m in second_half) / len(second_half) if second_half else 0

            first_approval = sum(1 for m in first_half if m.get('approved')) / len(first_half) if first_half else 0
            second_approval = sum(1 for m in second_half if m.get('approved')) / len(second_half) if second_half else 0

            quality_change = second_quality - first_quality
            approval_change = second_approval - first_approval

            # Determine trend direction
            if quality_change > 0.5:
                trend_direction = 'improving'
            elif quality_change < -0.5:
                trend_direction = 'declining'
            else:
                trend_direction = 'stable'

            return {
                'trend_direction': trend_direction,
                'quality_change': round(quality_change, 2),
                'approval_change': round(approval_change * 100, 2),
                'first_period_quality': round(first_quality, 2),
                'second_period_quality': round(second_quality, 2)
            }

        except Exception as e:
            logger.error(f"Error getting quality trends: {str(e)}")
            raise

    def suggest_prompt_modifications(self, version_number: str) -> Dict:
        """
        Suggest specific modifications to improve a prompt version.

        Args:
            version_number: Version to analyze

        Returns:
            Detailed suggestions for prompt modification
        """
        try:
            # Get metrics for this prompt
            cutoff_date = (datetime.now() - timedelta(days=30)).isoformat()
            metrics = self._get_prompt_metrics(version_number, cutoff_date)

            # Get rejected quests for this prompt to analyze patterns
            rejected_quests = self._get_rejected_quests(version_number)

            # Analyze common issues in rejected quests
            common_issues = self._analyze_rejected_quests(rejected_quests)

            # Generate specific modification suggestions
            suggestions = []

            # Based on common rejection reasons
            if common_issues.get('clarity_issues', 0) > 0.3:
                suggestions.append({
                    'type': 'clarity',
                    'description': 'Add explicit instructions for task clarity and specificity',
                    'example': 'Include: "Each task should have clear, measurable outcomes"'
                })

            if common_issues.get('engagement_issues', 0) > 0.3:
                suggestions.append({
                    'type': 'engagement',
                    'description': 'Emphasize creative and interactive elements',
                    'example': 'Include: "Make tasks hands-on and engaging for students"'
                })

            if common_issues.get('age_appropriateness', 0) > 0.3:
                suggestions.append({
                    'type': 'age_appropriateness',
                    'description': 'Add age-appropriate language and complexity constraints',
                    'example': 'Include: "Ensure language and concepts are appropriate for [age group]"'
                })

            if common_issues.get('philosophy_alignment', 0) > 0.3:
                suggestions.append({
                    'type': 'philosophy',
                    'description': 'Strengthen alignment with Optio philosophy',
                    'example': 'Include: "Focus on process and growth, not just outcomes"'
                })

            return {
                'version_number': version_number,
                'current_performance': metrics,
                'common_issues': common_issues,
                'suggestions': suggestions,
                'priority': 'high' if metrics['avg_approval_rate'] < 70 else 'medium'
            }

        except Exception as e:
            logger.error(f"Error suggesting prompt modifications: {str(e)}")
            raise

    def _get_rejected_quests(self, version_number: str) -> List[Dict]:
        """Get rejected quests for a specific prompt version."""
        try:
            # Get rejected quests from review queue
            response = self.supabase.table('ai_quest_review_queue')\
                .select('quest_data, ai_feedback, review_notes')\
                .eq('status', 'rejected')\
                .execute()

            all_rejected = response.data

            # Filter by version number (from generation metrics)
            metrics_response = self.supabase.table('ai_generation_metrics')\
                .select('review_queue_id')\
                .eq('prompt_version', version_number)\
                .eq('approved', False)\
                .execute()

            rejected_ids = {m['review_queue_id'] for m in metrics_response.data if m.get('review_queue_id')}

            # Return only quests for this version
            return [q for q in all_rejected if q.get('id') in rejected_ids]

        except Exception as e:
            logger.error(f"Error getting rejected quests: {str(e)}")
            return []

    def _analyze_rejected_quests(self, rejected_quests: List[Dict]) -> Dict:
        """Analyze patterns in rejected quests."""
        if not rejected_quests:
            return {}

        total = len(rejected_quests)
        issues = {
            'clarity_issues': 0,
            'engagement_issues': 0,
            'age_appropriateness': 0,
            'philosophy_alignment': 0,
            'other': 0
        }

        # Analyze AI feedback and review notes
        for quest in rejected_quests:
            feedback = quest.get('ai_feedback', {})
            notes = quest.get('review_notes', '').lower()

            # Check for clarity issues
            if 'clarity' in notes or 'vague' in notes or 'unclear' in notes:
                issues['clarity_issues'] += 1

            # Check for engagement issues
            if 'boring' in notes or 'engagement' in notes or 'interesting' in notes:
                issues['engagement_issues'] += 1

            # Check for age appropriateness
            if 'age' in notes or 'too difficult' in notes or 'too easy' in notes:
                issues['age_appropriateness'] += 1

            # Check for philosophy alignment
            if 'philosophy' in notes or 'optio' in notes or 'process' in notes:
                issues['philosophy_alignment'] += 1

            if sum(issues.values()) == 0:
                issues['other'] += 1

        # Convert to percentages
        return {key: value / total for key, value in issues.items()}

    def create_optimized_prompt_version(self, base_version: str, modifications: List[str]) -> Dict:
        """
        Create a new prompt version with suggested optimizations.

        Args:
            base_version: Version to base new prompt on
            modifications: List of modification descriptions to apply

        Returns:
            New prompt version data
        """
        try:
            # Get base prompt
            response = self.supabase.table('ai_prompt_versions')\
                .select('*')\
                .eq('version_number', base_version)\
                .single()\
                .execute()

            base_prompt = response.data

            # Create new version number
            new_version = f"{base_version}_optimized_{datetime.now().strftime('%Y%m%d')}"

            # Create new prompt version (inactive by default for testing)
            new_prompt = self.supabase.table('ai_prompt_versions')\
                .insert({
                    'version_number': new_version,
                    'prompt_template': base_prompt['prompt_template'],  # Will be manually updated
                    'is_active': False,
                    'description': f"Optimized version of {base_version}. Modifications: {', '.join(modifications[:3])}"
                })\
                .execute()

            return {
                'version_number': new_version,
                'base_version': base_version,
                'modifications': modifications,
                'is_active': False,
                'next_steps': [
                    'Manually update prompt_template in database',
                    'Test new version with sample generations',
                    'Activate version when ready for A/B testing'
                ]
            }

        except Exception as e:
            logger.error(f"Error creating optimized prompt version: {str(e)}")
            raise
