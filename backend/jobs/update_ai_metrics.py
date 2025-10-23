"""
AI Metrics Update Job
Scheduled job to update performance metrics for AI-generated quests.
Runs periodically to refresh completion rates, ratings, and engagement scores.
"""

import sys
import os
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.ai_performance_analytics_service import AIPerformanceAnalyticsService


def update_ai_metrics():
    """
    Update performance metrics for all AI-generated quests.
    This function calls the database stored procedure to calculate:
    - Completion rates
    - Average ratings
    - Engagement scores

    Should be run periodically (e.g., daily or hourly) via cron job.
    """
    logger.info(f"[{datetime.utcnow().isoformat()}] Starting AI metrics update...")

    try:
        result = AIPerformanceAnalyticsService.refresh_performance_metrics()

        if result['success']:
            print(f"[{datetime.utcnow().isoformat()}] Successfully updated {result['updated_count']} quest metrics")
            return result['updated_count']
        else:
            print(f"[{datetime.utcnow().isoformat()}] ERROR: {result.get('error', 'Unknown error')}")
            return 0

    except Exception as e:
        logger.error(f"[{datetime.utcnow().isoformat()}] FATAL ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return 0


if __name__ == '__main__':
    """
    Run this script manually or via cron job:

    Manual: python backend/jobs/update_ai_metrics.py

    Cron (daily at 2am):
    0 2 * * * cd /path/to/project && python backend/jobs/update_ai_metrics.py >> logs/ai_metrics.log 2>&1

    Cron (hourly):
    0 * * * * cd /path/to/project && python backend/jobs/update_ai_metrics.py >> logs/ai_metrics.log 2>&1
    """
    updated_count = update_ai_metrics()
    sys.exit(0 if updated_count >= 0 else 1)
