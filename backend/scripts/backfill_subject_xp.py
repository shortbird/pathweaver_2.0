"""
Backfill script to populate user_subject_xp table with data from existing task completions.

This script processes all quest_task_completions records and awards subject XP
based on the subject_xp_distribution field in user_quest_tasks.

Run this script to populate diploma subject breakdown data for users who completed
tasks before the subject XP tracking system was fully operational.

Usage:
    python backend/scripts/backfill_subject_xp.py
"""

import sys
import os
from datetime import datetime, timezone
from supabase import create_client, Client

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.logger import get_logger

logger = get_logger(__name__)

# Initialize Supabase client directly (not using Flask app context)
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set")

# Subject name normalization mapping
# Maps various subject name formats to the canonical enum values
SUBJECT_NORMALIZATION = {
    # Capitalized versions
    'Electives': 'electives',
    'Language Arts': 'language_arts',
    'Math': 'math',
    'Mathematics': 'math',
    'Science': 'science',
    'Social Studies': 'social_studies',
    'Financial Literacy': 'financial_literacy',
    'Health': 'health',
    'PE': 'pe',
    'Physical Education': 'pe',
    'Fine Arts': 'fine_arts',
    'Arts': 'fine_arts',
    'CTE': 'cte',
    'Career & Technical Education': 'cte',
    'Digital Literacy': 'digital_literacy',
    'Technology': 'digital_literacy',
    # Mixed formats
    'Business': 'cte',  # Business falls under CTE
    'Music': 'fine_arts',  # Music falls under Fine Arts
    # Already lowercase (pass through)
    'electives': 'electives',
    'language_arts': 'language_arts',
    'math': 'math',
    'science': 'science',
    'social_studies': 'social_studies',
    'financial_literacy': 'financial_literacy',
    'health': 'health',
    'pe': 'pe',
    'fine_arts': 'fine_arts',
    'cte': 'cte',
    'digital_literacy': 'digital_literacy',
}

def normalize_subject_name(subject: str) -> str:
    """Normalize subject name to match enum values."""
    if subject in SUBJECT_NORMALIZATION:
        return SUBJECT_NORMALIZATION[subject]
    # Fallback: lowercase and replace spaces with underscores
    normalized = subject.lower().replace(' ', '_').replace('&', 'and')
    logger.warning(f"Unknown subject '{subject}', normalized to '{normalized}'")
    return normalized


def backfill_subject_xp():
    """
    Backfill subject XP for all existing task completions.
    """
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    try:
        # Get all task completions with their associated task data
        logger.info("Fetching all task completions with subject XP distribution...")

        completions = supabase.table('quest_task_completions').select(
            '''
            id,
            user_id,
            task_id,
            completed_at,
            user_quest_tasks!inner(subject_xp_distribution)
            '''
        ).execute()

        if not completions.data:
            logger.info("No task completions found")
            return

        logger.info(f"Found {len(completions.data)} task completions to process")

        # Track statistics
        total_processed = 0
        total_skipped_no_distribution = 0
        total_xp_records_created = 0
        total_xp_records_updated = 0
        users_affected = set()

        # Process each completion
        for completion in completions.data:
            total_processed += 1
            user_id = completion['user_id']
            task_data = completion.get('user_quest_tasks')

            # Handle both dict and list responses from Supabase
            if isinstance(task_data, list):
                task_data = task_data[0] if task_data else None

            if not task_data:
                logger.warning(f"No task data for completion {completion['id']}")
                total_skipped_no_distribution += 1
                continue

            subject_xp_distribution = task_data.get('subject_xp_distribution')

            if not subject_xp_distribution:
                total_skipped_no_distribution += 1
                continue

            # Award subject XP for each subject in the distribution
            for subject, xp_amount in subject_xp_distribution.items():
                # Normalize subject name to match enum
                normalized_subject = normalize_subject_name(subject)

                try:
                    # Check if user already has XP for this subject
                    existing = supabase.table('user_subject_xp').select('id, xp_amount')\
                        .eq('user_id', user_id)\
                        .eq('school_subject', normalized_subject)\
                        .execute()

                    if existing.data:
                        # Update existing record
                        current_xp = existing.data[0]['xp_amount']
                        new_total = current_xp + xp_amount

                        supabase.table('user_subject_xp').update({
                            'xp_amount': new_total,
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        }).eq('user_id', user_id)\
                          .eq('school_subject', normalized_subject)\
                          .execute()

                        total_xp_records_updated += 1
                        logger.debug(f"Updated {normalized_subject} for user {user_id}: {current_xp} + {xp_amount} = {new_total}")
                    else:
                        # Create new record
                        supabase.table('user_subject_xp').insert({
                            'user_id': user_id,
                            'school_subject': normalized_subject,
                            'xp_amount': xp_amount,
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        }).execute()

                        total_xp_records_created += 1
                        logger.debug(f"Created {normalized_subject} for user {user_id}: {xp_amount} XP")

                    users_affected.add(user_id)

                except Exception as e:
                    logger.error(f"Error awarding subject XP for completion {completion['id']}, subject {subject} (normalized: {normalized_subject}): {e}")

            # Log progress every 50 completions
            if total_processed % 50 == 0:
                logger.info(f"Processed {total_processed}/{len(completions.data)} completions...")

        # Print summary
        logger.info("=" * 60)
        logger.info("BACKFILL COMPLETE")
        logger.info("=" * 60)
        logger.info(f"Total completions processed: {total_processed}")
        logger.info(f"Completions without subject distribution: {total_skipped_no_distribution}")
        logger.info(f"Subject XP records created: {total_xp_records_created}")
        logger.info(f"Subject XP records updated: {total_xp_records_updated}")
        logger.info(f"Users affected: {len(users_affected)}")
        logger.info("=" * 60)

        # Show sample of affected users' subject XP
        if users_affected:
            sample_user = list(users_affected)[0]
            logger.info(f"\nSample user {sample_user} subject XP:")
            sample_xp = supabase.table('user_subject_xp').select('school_subject, xp_amount')\
                .eq('user_id', sample_user)\
                .execute()

            if sample_xp.data:
                for record in sample_xp.data:
                    logger.info(f"  {record['school_subject']}: {record['xp_amount']} XP")

    except Exception as e:
        logger.error(f"Error during backfill: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise


if __name__ == '__main__':
    logger.info("Starting subject XP backfill script...")
    backfill_subject_xp()
    logger.info("Backfill script complete!")
