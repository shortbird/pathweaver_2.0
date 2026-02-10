"""
Script to re-classify tasks that were incorrectly labeled with only 'electives'.

This script finds all tasks where subject_xp_distribution contains only 'electives'
and re-runs the improved AI classification to assign proper subjects.

Usage:
    cd backend && python scripts/reclassify_electives_tasks.py [--batch-size N] [--dry-run]

Options:
    --batch-size N    Process N tasks at a time (default: 50)
    --dry-run        Preview what would be done without making changes
"""

import sys
import os
import argparse
import json
import logging
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

# Add backend directory to path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, backend_dir)

# Load environment variables
load_dotenv(os.path.join(backend_dir, '.env'))

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Supabase client directly to avoid circular imports
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set")


def is_electives_only(distribution: dict) -> bool:
    """Check if a distribution contains only electives."""
    if not distribution:
        return False

    # Get all keys, excluding None/empty values
    subjects = [k for k, v in distribution.items() if v and v > 0]

    # Check if only 'electives' is present
    return subjects == ['electives']


def reclassify_electives_tasks(batch_size=50, dry_run=False):
    """
    Re-classify tasks that were incorrectly labeled with only electives.

    Args:
        batch_size: Number of tasks to process per batch
        dry_run: If True, preview changes without saving
    """
    # Import Flask app to get application context
    from app import app

    with app.app_context():
        _run_reclassification(batch_size, dry_run)


def _run_reclassification(batch_size, dry_run):
    """Internal function that runs within Flask app context."""
    print(f"\n{'DRY RUN - ' if dry_run else ''}Electives Re-Classification Script")
    print("=" * 70)
    print(f"Batch size: {batch_size}")
    print(f"Started at: {datetime.utcnow().isoformat()}\n")

    # Initialize Supabase client directly
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Import within app context to avoid issues
    from services.subject_classification_service import SubjectClassificationService
    service = SubjectClassificationService()

    # Get stats before starting
    print("Fetching statistics...")

    # Get all tasks with subject_xp_distribution
    all_tasks = supabase.table('user_quest_tasks')\
        .select('id, subject_xp_distribution', count='exact')\
        .not_.is_('subject_xp_distribution', 'null')\
        .execute()

    total_with_distribution = all_tasks.count

    # Count electives-only tasks (need to fetch and check in Python)
    electives_only_tasks = []
    offset = 0
    page_size = 500

    print("Scanning for electives-only tasks...")
    while True:
        page = supabase.table('user_quest_tasks')\
            .select('id, title, description, pillar, xp_value, subject_xp_distribution')\
            .not_.is_('subject_xp_distribution', 'null')\
            .range(offset, offset + page_size - 1)\
            .execute()

        if not page.data:
            break

        for task in page.data:
            if is_electives_only(task.get('subject_xp_distribution', {})):
                electives_only_tasks.append(task)

        offset += page_size
        if len(page.data) < page_size:
            break

    electives_count = len(electives_only_tasks)

    print(f"\nCurrent Status:")
    print(f"  Total tasks with subject distribution: {total_with_distribution}")
    print(f"  Tasks with electives-only: {electives_count} ({(electives_count/total_with_distribution*100):.1f}%)")
    print()

    if electives_count == 0:
        print("No electives-only tasks found! Nothing to re-classify.")
        return

    if dry_run:
        print("DRY RUN: Previewing first 10 tasks that would be re-classified...\n")

        sample_tasks = electives_only_tasks[:10]
        changed_count = 0

        for i, task in enumerate(sample_tasks, 1):
            print(f"{i}. Task: {task['title'][:60]}")
            print(f"   Pillar: {task['pillar']}, XP: {task.get('xp_value', 100)}")
            print(f"   Current: {task['subject_xp_distribution']}")

            try:
                new_distribution = service.classify_task_subjects(
                    task['title'],
                    task.get('description', ''),
                    task['pillar'],
                    task.get('xp_value', 100)
                )
                print(f"   Would change to: {new_distribution}")

                if not is_electives_only(new_distribution):
                    changed_count += 1
                    print(f"   -> IMPROVED (no longer electives-only)")
                else:
                    print(f"   -> Still electives (may be correct)")

            except Exception as e:
                print(f"   ERROR: {str(e)}")
            print()

        print(f"\nDRY RUN complete.")
        print(f"  Would process {electives_count} tasks total")
        print(f"  Sample shows {changed_count}/{len(sample_tasks)} would be improved")
        return

    # Confirm before proceeding
    response = input(f"\nReady to re-classify {electives_count} electives-only tasks. Continue? (yes/no): ")
    if response.lower() != 'yes':
        print("Cancelled.")
        return

    print("\nStarting re-classification...\n")

    # Process in batches
    stats = {
        'total': 0,
        'improved': 0,
        'unchanged': 0,
        'failed': 0
    }

    # Audit log for changes
    changes_log = []

    batch_num = 1
    for batch_start in range(0, electives_count, batch_size):
        batch = electives_only_tasks[batch_start:batch_start + batch_size]
        print(f"Processing batch {batch_num} ({len(batch)} tasks)...")
        stats['total'] += len(batch)

        for i, task in enumerate(batch, 1):
            old_distribution = task['subject_xp_distribution']

            try:
                # Re-classify the task
                new_distribution = service.classify_task_subjects(
                    task['title'],
                    task.get('description', ''),
                    task['pillar'],
                    task.get('xp_value', 100)
                )

                # Check if classification improved
                if not is_electives_only(new_distribution):
                    # Update task with new distribution
                    supabase.table('user_quest_tasks')\
                        .update({'subject_xp_distribution': new_distribution})\
                        .eq('id', task['id'])\
                        .execute()

                    stats['improved'] += 1

                    # Log the change
                    changes_log.append({
                        'task_id': task['id'],
                        'title': task['title'][:100],
                        'pillar': task['pillar'],
                        'old': old_distribution,
                        'new': new_distribution
                    })

                    if i % 10 == 0:
                        print(f"  {i}/{len(batch)} tasks in batch...")
                else:
                    stats['unchanged'] += 1

            except Exception as e:
                stats['failed'] += 1
                logger.error(f"Failed to re-classify task {task['id']}: {str(e)}")
                print(f"  ERROR on task '{task['title'][:40]}': {str(e)}")

        batch_num += 1

    print("\n" + "=" * 70)
    print("Re-Classification Complete!")
    print(f"  Total processed: {stats['total']}")
    print(f"  Improved (no longer electives): {stats['improved']}")
    print(f"  Unchanged (still electives): {stats['unchanged']}")
    print(f"  Failed: {stats['failed']}")
    if stats['total'] > 0:
        print(f"  Improvement rate: {(stats['improved']/stats['total']*100):.1f}%")
    print(f"\nCompleted at: {datetime.utcnow().isoformat()}")

    # Save changes log
    if changes_log:
        log_file = f"electives_reclassification_log_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        log_path = os.path.join(os.path.dirname(__file__), '..', 'logs', log_file)

        # Ensure logs directory exists
        os.makedirs(os.path.dirname(log_path), exist_ok=True)

        with open(log_path, 'w') as f:
            json.dump({
                'timestamp': datetime.utcnow().isoformat(),
                'stats': stats,
                'changes': changes_log
            }, f, indent=2)

        print(f"\nChanges logged to: {log_path}")
        print(f"  {len(changes_log)} tasks were re-classified")


def main():
    parser = argparse.ArgumentParser(
        description="Re-classify tasks that were incorrectly labeled with only electives"
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
        reclassify_electives_tasks(batch_size=args.batch_size, dry_run=args.dry_run)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user. Exiting...")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nFATAL ERROR: {str(e)}")
        logger.error(f"Fatal error in reclassify script: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
