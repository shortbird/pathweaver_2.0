"""
Script to backfill subject XP distributions for all existing tasks.

This script uses the SubjectClassificationService to automatically classify
all tasks in the user_quest_tasks table that don't have subject_xp_distribution set.

Usage:
    python backend/scripts/backfill_subject_classifications.py [--batch-size N] [--dry-run]

Options:
    --batch-size N    Process N tasks at a time (default: 50)
    --dry-run        Preview what would be done without making changes
"""

import sys
import os
import argparse
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.database import get_supabase_admin_client
from backend.services.subject_classification_service import SubjectClassificationService
from utils.logger import get_logger

logger = get_logger(__name__)


def backfill_subjects(batch_size=50, dry_run=False):
    """
    Backfill subject classifications for all tasks.

    Args:
        batch_size: Number of tasks to process per batch
        dry_run: If True, preview changes without saving
    """
    print(f"\n{'DRY RUN - ' if dry_run else ''}Subject XP Backfill Script")
    print("=" * 70)
    print(f"Batch size: {batch_size}")
    print(f"Started at: {datetime.utcnow().isoformat()}\n")

    supabase = get_supabase_admin_client()
    service = SubjectClassificationService(client=supabase)

    # Get stats before starting
    print("Fetching statistics...")
    total_result = supabase.table('user_quest_tasks')\
        .select('id', count='exact')\
        .execute()

    without_result = supabase.table('user_quest_tasks')\
        .select('id', count='exact')\
        .is_('subject_xp_distribution', 'null')\
        .execute()

    total_count = total_result.count
    without_count = without_result.count
    with_count = total_count - without_count

    print(f"\nCurrent Status:")
    print(f"  Total tasks: {total_count}")
    print(f"  With subject distribution: {with_count} ({(with_count/total_count*100):.1f}%)")
    print(f"  Without subject distribution: {without_count} ({(without_count/total_count*100):.1f}%)")
    print()

    if without_count == 0:
        print("All tasks already have subject distributions!")
        return

    if dry_run:
        print("DRY RUN: Previewing first 10 tasks that would be classified...\n")

        # Get sample tasks
        sample_tasks = supabase.table('user_quest_tasks')\
            .select('id, title, description, pillar, xp_value')\
            .is_('subject_xp_distribution', 'null')\
            .limit(10)\
            .execute()

        for i, task in enumerate(sample_tasks.data, 1):
            print(f"{i}. Task: {task['title'][:60]}")
            print(f"   Pillar: {task['pillar']}, XP: {task.get('xp_value', 100)}")

            try:
                subject_dist = service.classify_task_subjects(
                    task['title'],
                    task.get('description', ''),
                    task['pillar'],
                    task.get('xp_value', 100)
                )
                print(f"   Would classify as: {subject_dist}")
            except Exception as e:
                print(f"   ERROR: {str(e)}")
            print()

        print(f"\nDRY RUN complete. Would process {without_count} tasks total.")
        return

    # Confirm before proceeding
    response = input(f"\nReady to backfill {without_count} tasks. Continue? (yes/no): ")
    if response.lower() != 'yes':
        print("Cancelled.")
        return

    print("\nStarting backfill...\n")

    # Process in batches
    stats = {
        'total': 0,
        'success': 0,
        'failed': 0,
        'skipped': 0
    }

    offset = 0
    batch_num = 1

    while True:
        # Get batch of tasks without subject distribution
        tasks = supabase.table('user_quest_tasks')\
            .select('id, title, description, pillar, xp_value')\
            .is_('subject_xp_distribution', 'null')\
            .range(offset, offset + batch_size - 1)\
            .execute()

        if not tasks.data:
            break

        print(f"Processing batch {batch_num} ({len(tasks.data)} tasks)...")
        stats['total'] += len(tasks.data)

        for i, task in enumerate(tasks.data, 1):
            try:
                # Classify the task
                subject_distribution = service.classify_task_subjects(
                    task['title'],
                    task.get('description', ''),
                    task['pillar'],
                    task.get('xp_value', 100)
                )

                # Update task with subject distribution
                supabase.table('user_quest_tasks')\
                    .update({'subject_xp_distribution': subject_distribution})\
                    .eq('id', task['id'])\
                    .execute()

                stats['success'] += 1

                if i % 10 == 0:
                    print(f"  {i}/{len(tasks.data)} tasks in batch...")

            except Exception as e:
                stats['failed'] += 1
                logger.error(f"Failed to backfill task {task['id']}: {str(e)}")
                print(f"  ERROR on task '{task['title'][:40]}': {str(e)}")

        # Move to next batch
        offset += batch_size
        batch_num += 1

        # Stop if we got fewer than batch_size results
        if len(tasks.data) < batch_size:
            break

    print("\n" + "=" * 70)
    print("Backfill Complete!")
    print(f"  Total processed: {stats['total']}")
    print(f"  Successful: {stats['success']}")
    print(f"  Failed: {stats['failed']}")
    print(f"  Success rate: {(stats['success']/stats['total']*100):.1f}%")
    print(f"\nCompleted at: {datetime.utcnow().isoformat()}")

    # Get final stats
    final_result = supabase.table('user_quest_tasks')\
        .select('id', count='exact')\
        .not_.is_('subject_xp_distribution', 'null')\
        .execute()

    final_with_count = final_result.count
    print(f"\nFinal Status:")
    print(f"  Total tasks: {total_count}")
    print(f"  With subject distribution: {final_with_count} ({(final_with_count/total_count*100):.1f}%)")


def main():
    parser = argparse.ArgumentParser(
        description="Backfill subject XP distributions for all existing tasks"
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=50,
        help='Number of tasks to process per batch (default: 50)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview what would be done without making changes'
    )

    args = parser.parse_args()

    try:
        backfill_subjects(batch_size=args.batch_size, dry_run=args.dry_run)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user. Exiting...")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nFATAL ERROR: {str(e)}")
        logger.error(f"Fatal error in backfill script: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
