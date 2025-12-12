"""
Fix Course Quest Enrollments Migration Script
==============================================

Backfills preset tasks for existing course quest enrollments that don't have tasks.

Problem:
- Students who enrolled in course quests before the fix don't have preset tasks
- The enrollment code now correctly loads tasks, but existing enrollments are broken

Solution:
- Find all active course quest enrollments
- Check if they have tasks in user_quest_tasks
- If not, copy preset tasks from course_quest_tasks to user_quest_tasks

Usage:
    python backend/scripts/fix_course_quest_enrollments.py [--dry-run]
"""

import sys
import os
from datetime import datetime

# Add parent directory to path to import from backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Supabase client
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables")

supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_course_quest_enrollments_without_tasks():
    """Find all active course quest enrollments that have no tasks."""
    supabase = supabase_client

    # Get all active enrollments for course quests
    enrollments = supabase.table('user_quests')\
        .select('id, user_id, quest_id, quests!inner(quest_type, title)')\
        .eq('is_active', True)\
        .eq('quests.quest_type', 'course')\
        .execute()

    print(f"Found {len(enrollments.data)} active course quest enrollments")

    # Check which ones have no tasks
    enrollments_without_tasks = []

    for enrollment in enrollments.data:
        user_quest_id = enrollment['id']
        quest_title = enrollment['quests']['title']

        # Check if user has tasks for this enrollment
        tasks = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('user_quest_id', user_quest_id)\
            .limit(1)\
            .execute()

        if not tasks.data or len(tasks.data) == 0:
            enrollments_without_tasks.append(enrollment)
            print(f"  [X] Enrollment {user_quest_id[:8]} for '{quest_title}' has NO tasks")
        else:
            print(f"  [OK] Enrollment {user_quest_id[:8]} for '{quest_title}' already has tasks")

    return enrollments_without_tasks


def get_preset_tasks_for_course(quest_id):
    """Get preset tasks from course_quest_tasks table."""
    supabase = supabase_client

    tasks = supabase.table('course_quest_tasks')\
        .select('*')\
        .eq('quest_id', quest_id)\
        .order('order_index')\
        .execute()

    return tasks.data or []


def copy_preset_tasks_to_enrollment(enrollment, preset_tasks, dry_run=True):
    """Copy preset tasks to a user's enrollment."""
    supabase = supabase_client

    user_quest_id = enrollment['id']
    user_id = enrollment['user_id']
    quest_id = enrollment['quest_id']
    quest_title = enrollment['quests']['title']

    if not preset_tasks:
        print(f"  [!] No preset tasks found for quest '{quest_title}'")
        return 0

    print(f"\n  [+] Copying {len(preset_tasks)} preset tasks to enrollment {user_quest_id[:8]}...")

    if dry_run:
        print(f"     [DRY RUN] Would copy {len(preset_tasks)} tasks")
        return len(preset_tasks)

    # Prepare user task data
    user_tasks = []
    for task in preset_tasks:
        user_task = {
            'user_id': user_id,
            'quest_id': quest_id,
            'user_quest_id': user_quest_id,
            'title': task['title'],
            'description': task.get('description', ''),
            'pillar': task['pillar'],
            'xp_value': task.get('xp_value', 100),
            'order_index': task.get('order_index', 0),
            'is_required': task.get('is_required', True),
            'approval_status': 'approved',  # Auto-approve preset tasks
            'diploma_subjects': task.get('diploma_subjects', ['Electives']),
            'subject_xp_distribution': task.get('subject_xp_distribution', {}),
            'created_at': datetime.utcnow().isoformat()
        }
        user_tasks.append(user_task)

    # Insert tasks
    try:
        result = supabase.table('user_quest_tasks').insert(user_tasks).execute()

        if result.data:
            print(f"     [OK] Successfully copied {len(result.data)} tasks")
            return len(result.data)
        else:
            print(f"     [FAIL] Failed to copy tasks")
            return 0

    except Exception as e:
        print(f"     [ERROR] Error copying tasks: {str(e)}")
        return 0


def main():
    """Main migration function."""
    import argparse

    parser = argparse.ArgumentParser(description='Fix course quest enrollments without preset tasks')
    parser.add_argument('--dry-run', action='store_true', help='Run without making changes')
    args = parser.parse_args()

    print("=" * 80)
    print("Course Quest Enrollment Fix Migration")
    print("=" * 80)
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print()

    # Step 1: Find enrollments without tasks
    print("Step 1: Finding course quest enrollments without tasks...")
    enrollments_without_tasks = get_course_quest_enrollments_without_tasks()

    if not enrollments_without_tasks:
        print("\n[OK] All course quest enrollments have tasks! No migration needed.")
        return

    print(f"\nFound {len(enrollments_without_tasks)} enrollments that need tasks")

    # Step 2: Process each enrollment
    print("\nStep 2: Copying preset tasks to enrollments...")

    total_tasks_copied = 0
    successful_enrollments = 0

    for enrollment in enrollments_without_tasks:
        quest_id = enrollment['quest_id']
        quest_title = enrollment['quests']['title']

        print(f"\nProcessing: {quest_title}")

        # Get preset tasks
        preset_tasks = get_preset_tasks_for_course(quest_id)

        if not preset_tasks:
            print(f"  [!] Quest has no preset tasks in course_quest_tasks table - skipping")
            continue

        # Copy tasks
        tasks_copied = copy_preset_tasks_to_enrollment(enrollment, preset_tasks, dry_run=args.dry_run)

        if tasks_copied > 0:
            total_tasks_copied += tasks_copied
            successful_enrollments += 1

    # Summary
    print("\n" + "=" * 80)
    print("Migration Summary")
    print("=" * 80)
    print(f"Total enrollments processed: {len(enrollments_without_tasks)}")
    print(f"Successful enrollments: {successful_enrollments}")
    print(f"Total tasks copied: {total_tasks_copied}")

    if args.dry_run:
        print("\n[!] This was a DRY RUN. No changes were made.")
        print("Run without --dry-run to apply changes.")
    else:
        print("\n[OK] Migration complete!")


if __name__ == '__main__':
    main()
