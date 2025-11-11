"""
Data anonymization script for activity tracking.

This script should be run daily via cron job or scheduled task to:
1. Anonymize activity events older than 90 days (COPPA/GDPR compliance)
2. Delete events older than 2 years (data retention policy)

Usage:
    python anonymize_activity_data.py

Recommended cron schedule:
    0 2 * * * cd /path/to/backend && python scripts/anonymize_activity_data.py
    (Runs daily at 2:00 AM)
"""

import os
import sys
from datetime import datetime

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_supabase_admin_client
from utils.logger import setup_logging, get_logger

# Initialize logging
setup_logging()
logger = get_logger(__name__)


def anonymize_old_events():
    """
    Anonymize events older than 90 days by calling database function.
    Returns number of rows affected.
    """
    try:
        logger.info("Starting activity data anonymization...")

        supabase = get_supabase_admin_client()

        # Call database function to anonymize old events
        result = supabase.rpc('anonymize_old_activity_events').execute()

        rows_affected = result.data if result.data else 0

        logger.info(f"✅ Anonymized {rows_affected} activity events older than 90 days")

        return rows_affected

    except Exception as e:
        logger.error(f"❌ Error anonymizing activity data: {str(e)}")
        raise


def delete_very_old_events():
    """
    Delete events older than 2 years by calling database function.
    Returns number of rows affected.
    """
    try:
        logger.info("Starting old activity data deletion...")

        supabase = get_supabase_admin_client()

        # Call database function to delete very old events
        result = supabase.rpc('delete_old_activity_events').execute()

        rows_affected = result.data if result.data else 0

        logger.info(f"✅ Deleted {rows_affected} activity events older than 2 years")

        return rows_affected

    except Exception as e:
        logger.error(f"❌ Error deleting old activity data: {str(e)}")
        raise


def get_database_stats():
    """Get statistics about activity tracking tables."""
    try:
        supabase = get_supabase_admin_client()

        # Count total events
        events_response = supabase.table('user_activity_events').select('id', count='exact').execute()
        total_events = events_response.count

        # Count anonymized events
        anon_response = supabase.table('user_activity_events').select('id', count='exact').not_(
            'anonymized_at', 'is', 'null'
        ).execute()
        anonymized_events = anon_response.count

        # Count sessions
        sessions_response = supabase.table('user_sessions').select('id', count='exact').execute()
        total_sessions = sessions_response.count

        # Count errors
        errors_response = supabase.table('error_events').select('id', count='exact').execute()
        total_errors = errors_response.count

        stats = {
            'total_events': total_events,
            'anonymized_events': anonymized_events,
            'total_sessions': total_sessions,
            'total_errors': total_errors,
            'anonymization_rate': (anonymized_events / total_events * 100) if total_events > 0 else 0
        }

        logger.info(f"Database stats: {stats}")

        return stats

    except Exception as e:
        logger.error(f"Error fetching database stats: {str(e)}")
        return {}


def main():
    """Main function to run anonymization tasks."""
    try:
        logger.info("=" * 60)
        logger.info("Activity Data Anonymization Script")
        logger.info(f"Started at: {datetime.utcnow().isoformat()}")
        logger.info("=" * 60)

        # Get initial stats
        logger.info("\n📊 Initial database stats:")
        get_database_stats()

        # Anonymize old events (90+ days)
        logger.info("\n🔒 Step 1: Anonymizing events older than 90 days...")
        anonymized_count = anonymize_old_events()

        # Delete very old events (2+ years)
        logger.info("\n🗑️  Step 2: Deleting events older than 2 years...")
        deleted_count = delete_very_old_events()

        # Get final stats
        logger.info("\n📊 Final database stats:")
        get_database_stats()

        # Summary
        logger.info("\n" + "=" * 60)
        logger.info("✅ Anonymization script completed successfully")
        logger.info(f"   - Anonymized: {anonymized_count} events")
        logger.info(f"   - Deleted: {deleted_count} events")
        logger.info(f"Finished at: {datetime.utcnow().isoformat()}")
        logger.info("=" * 60)

        return 0

    except Exception as e:
        logger.error(f"\n❌ Anonymization script failed: {str(e)}")
        return 1


if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)
