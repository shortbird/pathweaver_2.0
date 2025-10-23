"""
AI Improvement Recommendations Job
Automated job to analyze AI performance and generate improvement recommendations.
Should be run daily to monitor trends and suggest optimizations.
"""

import sys
import os
from datetime import datetime
import json

from utils.logger import get_logger

logger = get_logger(__name__)

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.ai_prompt_optimizer_service import AIPromptOptimizerService
from database import get_supabase_admin_client
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def save_recommendations_to_database(insights):
    """
    Save improvement recommendations to database for historical tracking.
    Creates a log entry in a recommendations table (if exists) or logs to file.
    """
    try:
        supabase = get_supabase_admin_client()

        # Try to save to ai_improvement_logs table (create if needed)
        log_data = {
            'created_at': datetime.now().isoformat(),
            'analysis_period_days': 30,
            'total_prompts': insights['summary']['total_prompts'],
            'prompts_needing_optimization': insights['summary']['prompts_needing_optimization'],
            'avg_performance_score': insights['summary']['avg_performance_score'],
            'trend_direction': insights['quality_trends']['trend_direction'],
            'quality_change': insights['quality_trends']['quality_change'],
            'best_prompt_version': insights['best_prompt']['version_number'] if insights.get('best_prompt') else None,
            'best_prompt_score': insights['best_prompt']['performance_score'] if insights.get('best_prompt') else None,
            'worst_prompt_version': insights['worst_prompt']['version_number'] if insights.get('worst_prompt') else None,
            'worst_prompt_score': insights['worst_prompt']['performance_score'] if insights.get('worst_prompt') else None,
            'recommendations_count': sum(len(recs) for recs in insights['recommendations_by_category'].values()),
            'detailed_insights': json.dumps(insights)
        }

        # Note: This will fail if table doesn't exist - that's OK, we'll log to file instead
        try:
            supabase.table('ai_improvement_logs').insert(log_data).execute()
            logger.info("Recommendations saved to database")
        except Exception as e:
            logger.warning(f"Could not save to database (table may not exist): {e}")
            # Save to file instead
            save_recommendations_to_file(insights)

    except Exception as e:
        logger.error(f"Error saving recommendations: {str(e)}")
        save_recommendations_to_file(insights)


def save_recommendations_to_file(insights):
    """Save recommendations to a JSON file for review."""
    try:
        filename = f"ai_recommendations_{datetime.now().strftime('%Y%m%d')}.json"
        filepath = os.path.join(os.path.dirname(__file__), 'logs', filename)

        # Create logs directory if it doesn't exist
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        with open(filepath, 'w') as f:
            json.dump(insights, f, indent=2, default=str)

        logger.info(f"Recommendations saved to file: {filepath}")
    except Exception as e:
        logger.error(f"Error saving to file: {str(e)}")


def send_alert_if_needed(insights):
    """
    Send alerts if critical issues are detected.
    Currently logs warnings - can be extended to send emails/Slack notifications.
    """
    try:
        # Alert if overall performance is declining
        if insights['quality_trends']['trend_direction'] == 'declining':
            logger.warning(f"ALERT: AI quality trending DOWN. Change: {insights['quality_trends']['quality_change']}")

        # Alert if multiple prompts need optimization
        if insights['summary']['prompts_needing_optimization'] > 2:
            logger.warning(f"ALERT: {insights['summary']['prompts_needing_optimization']} prompts need optimization")

        # Alert if average performance is low
        if insights['summary']['avg_performance_score'] < 60:
            logger.warning(f"ALERT: Low average performance score: {insights['summary']['avg_performance_score']:.1f}%")

        # Alert if worst prompt is very bad
        if insights.get('worst_prompt') and insights['worst_prompt']['performance_score'] < 50:
            logger.warning(f"ALERT: Critical prompt performance: {insights['worst_prompt']['version_number']} at {insights['worst_prompt']['performance_score']:.1f}%")

    except Exception as e:
        logger.error(f"Error sending alerts: {str(e)}")


def generate_improvement_report():
    """
    Generate comprehensive improvement report and recommendations.
    Main function to be run by cron job.
    """
    try:
        logger.info("=== AI Improvement Recommendations Job Started ===")

        # Initialize optimizer service
        optimizer = AIPromptOptimizerService()

        # Get insights for last 30 days
        logger.info("Analyzing AI performance over last 30 days...")
        insights = optimizer.get_improvement_insights(days=30)

        # Log summary statistics
        logger.info(f"Total prompts: {insights['summary']['total_prompts']}")
        logger.info(f"Prompts needing optimization: {insights['summary']['prompts_needing_optimization']}")
        logger.info(f"Average performance score: {insights['summary']['avg_performance_score']:.1f}%")
        logger.info(f"Quality trend: {insights['quality_trends']['trend_direction']}")

        # Log best and worst performers
        if insights.get('best_prompt'):
            logger.info(f"Best prompt: {insights['best_prompt']['version_number']} ({insights['best_prompt']['performance_score']:.1f}%)")
        if insights.get('worst_prompt'):
            logger.info(f"Worst prompt: {insights['worst_prompt']['version_number']} ({insights['worst_prompt']['performance_score']:.1f}%)")

        # Log recommendations by category
        logger.info("\nRecommendations by category:")
        for category, recs in insights['recommendations_by_category'].items():
            logger.info(f"  {category}: {len(recs)} issues")

        # Save results
        save_recommendations_to_database(insights)

        # Send alerts if needed
        send_alert_if_needed(insights)

        logger.info("=== AI Improvement Recommendations Job Completed ===")
        return insights

    except Exception as e:
        logger.error(f"Error in improvement recommendations job: {str(e)}", exc_info=True)
        raise


def generate_prompt_modification_suggestions():
    """
    Generate specific modification suggestions for prompts that need optimization.
    """
    try:
        logger.info("=== Generating Prompt Modification Suggestions ===")

        optimizer = AIPromptOptimizerService()

        # Get all prompts
        insights = optimizer.get_improvement_insights(days=30)

        # Generate suggestions for prompts that need optimization
        for prompt_data in insights['all_prompts']:
            if prompt_data['needs_optimization']:
                version = prompt_data['version_number']
                logger.info(f"\nAnalyzing {version}...")

                suggestions = optimizer.suggest_prompt_modifications(version)

                logger.info(f"Priority: {suggestions['priority']}")
                logger.info(f"Current approval rate: {suggestions['current_performance']['avg_approval_rate']:.1f}%")
                logger.info(f"Number of suggestions: {len(suggestions['suggestions'])}")

                for suggestion in suggestions['suggestions']:
                    logger.info(f"  - {suggestion['type']}: {suggestion['description']}")

        logger.info("=== Prompt Modification Suggestions Complete ===")

    except Exception as e:
        logger.error(f"Error generating prompt suggestions: {str(e)}", exc_info=True)
        raise


if __name__ == '__main__':
    # Run the main improvement recommendations job
    try:
        insights = generate_improvement_report()

        # Optionally generate specific prompt modification suggestions
        # Uncomment to run this part:
        # generate_prompt_modification_suggestions()

        logger.info("
Job completed successfully!")
        logger.info(f"Results saved. Check logs for details.")

    except Exception as e:
        logger.error(f"Job failed: {str(e)}")
        sys.exit(1)
