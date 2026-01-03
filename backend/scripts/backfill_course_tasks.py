"""
Backfill script for existing course enrollments.

This script finds all users who enrolled in courses before the task-copying fix
and copies the lesson-linked tasks to their user_quest_tasks.

Run with: python backend/scripts/backfill_course_tasks.py
"""

import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))


def get_admin_client():
    """Get Supabase admin client."""
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_KEY')
    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def backfill_course_tasks():
    """Backfill lesson-linked tasks for existing course enrollments."""
    client = get_admin_client()

    print("Starting backfill of course tasks...")

    # Step 1: Get all active course enrollments
    enrollments_result = client.table('course_enrollments')\
        .select('id, user_id, course_id, status')\
        .eq('status', 'active')\
        .execute()

    if not enrollments_result.data:
        print("No active course enrollments found.")
        return

    print(f"Found {len(enrollments_result.data)} active course enrollments")

    total_tasks_created = 0
    users_updated = 0

    for enrollment in enrollments_result.data:
        user_id = enrollment['user_id']
        course_id = enrollment['course_id']

        print(f"\nProcessing enrollment for user {user_id[:8]}... in course {course_id[:8]}...")

        # Step 2: Get all quests in this course
        course_quests_result = client.table('course_quests')\
            .select('quest_id')\
            .eq('course_id', course_id)\
            .execute()

        if not course_quests_result.data:
            print(f"  No quests found in course {course_id[:8]}")
            continue

        quest_ids = [cq['quest_id'] for cq in course_quests_result.data]
        print(f"  Found {len(quest_ids)} quests in course")

        user_tasks_created = 0

        for quest_id in quest_ids:
            # Step 3: Get user's enrollment in this quest
            user_quest_result = client.table('user_quests')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .eq('is_active', True)\
                .execute()

            if not user_quest_result.data:
                print(f"    User not enrolled in quest {quest_id[:8]} - skipping")
                continue

            user_quest_id = user_quest_result.data[0]['id']

            # Step 4: Check if user already has tasks for this quest
            existing_tasks_result = client.table('user_quest_tasks')\
                .select('id, source_task_id')\
                .eq('user_quest_id', user_quest_id)\
                .execute()

            existing_source_ids = set()
            if existing_tasks_result.data:
                existing_source_ids = {t['source_task_id'] for t in existing_tasks_result.data if t.get('source_task_id')}
                print(f"    User already has {len(existing_tasks_result.data)} tasks for quest {quest_id[:8]}")

            # Step 5: Get lesson-linked task IDs for this quest
            linked_tasks_result = client.table('curriculum_lesson_tasks')\
                .select('task_id')\
                .eq('quest_id', quest_id)\
                .execute()

            if not linked_tasks_result.data:
                print(f"    No lesson-linked tasks for quest {quest_id[:8]}")
                continue

            # Get unique task IDs that haven't already been copied
            task_ids = list(set([lt['task_id'] for lt in linked_tasks_result.data]))
            new_task_ids = [tid for tid in task_ids if tid not in existing_source_ids]

            if not new_task_ids:
                print(f"    All {len(task_ids)} lesson-linked tasks already exist for quest {quest_id[:8]}")
                continue

            print(f"    Found {len(new_task_ids)} new tasks to copy (out of {len(task_ids)} total)")

            # Step 6: Fetch the source task data
            source_tasks_result = client.table('user_quest_tasks')\
                .select('id, title, description, pillar, xp_value, order_index, is_required, diploma_subjects, subject_xp_distribution')\
                .in_('id', new_task_ids)\
                .execute()

            if not source_tasks_result.data:
                print(f"    Could not fetch source tasks for quest {quest_id[:8]}")
                continue

            # Step 7: Create copies for the user
            tasks_to_insert = []
            for task in source_tasks_result.data:
                tasks_to_insert.append({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'user_quest_id': user_quest_id,
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'pillar': task['pillar'],
                    'xp_value': task.get('xp_value', 100),
                    'order_index': task.get('order_index', 0),
                    'is_required': task.get('is_required', True),
                    'is_manual': False,
                    'approval_status': 'approved',
                    'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                    'subject_xp_distribution': task.get('subject_xp_distribution'),
                    'source_task_id': task['id']  # Track original task
                })

            if tasks_to_insert:
                try:
                    client.table('user_quest_tasks').insert(tasks_to_insert).execute()
                    print(f"    Created {len(tasks_to_insert)} tasks for quest {quest_id[:8]}")
                    user_tasks_created += len(tasks_to_insert)
                    total_tasks_created += len(tasks_to_insert)
                except Exception as e:
                    print(f"    ERROR creating tasks for quest {quest_id[:8]}: {e}")

        if user_tasks_created > 0:
            users_updated += 1
            print(f"  Total: Created {user_tasks_created} tasks for user {user_id[:8]}")

    print(f"\n{'='*50}")
    print(f"BACKFILL COMPLETE")
    print(f"  Users updated: {users_updated}")
    print(f"  Tasks created: {total_tasks_created}")
    print(f"{'='*50}")


if __name__ == '__main__':
    backfill_course_tasks()
