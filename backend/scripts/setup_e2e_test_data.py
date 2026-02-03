"""
Setup E2E test data.

This script prepares the test user account for E2E testing:
1. Resets test user data (cleans enrollments, tasks, XP)
2. Enrolls user in one quest (for "enrolled quest" tests)
3. Verifies quest has tasks
4. Leaves other quests unenrolled (for "pick up quest" tests)

Run from project root:
    python backend/scripts/setup_e2e_test_data.py
"""

import os
import sys
from supabase import create_client


def setup_e2e_test_data():
    """Setup test data for E2E tests."""
    # Create Supabase admin client directly
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_service_key = os.environ.get('SUPABASE_SERVICE_KEY')

    if not supabase_url or not supabase_service_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required")

    supabase = create_client(supabase_url, supabase_service_key)

    email = 'test@optioeducation.com'

    print("Setting up E2E test data...")
    print("=" * 60)

    try:
        # 1. Get test user
        user_response = supabase.table('users').select('id').eq('email', email).execute()

        if not user_response.data:
            print(f"✗ Test user not found: {email}")
            print("\nRun: python backend/scripts/create_test_account.py")
            return False

        user_id = user_response.data[0]['id']
        print(f"✓ Found test user: {user_id}")

        # 2. Reset existing data
        print("\n1. Resetting existing data...")

        # Delete task completions
        supabase.table('quest_task_completions').delete().eq('user_id', user_id).execute()

        # Delete evidence
        supabase.table('user_task_evidence_documents').delete().eq('user_id', user_id).execute()

        # Delete user quest tasks
        supabase.table('user_quest_tasks').delete().eq('user_id', user_id).execute()

        # Delete all enrollments (we'll create fresh ones)
        supabase.table('user_quests').delete().eq('user_id', user_id).execute()

        # Reset XP
        supabase.table('users').update({'total_xp': 0}).eq('id', user_id).execute()
        supabase.table('user_skill_xp').delete().eq('user_id', user_id).execute()

        print("   ✓ Cleaned existing data")

        # 3. Get available quests
        print("\n2. Finding available quests...")
        quests = supabase.table('quests')\
            .select('id, title, quest_type')\
            .eq('is_active', True)\
            .limit(10)\
            .execute()

        if not quests.data or len(quests.data) < 2:
            print(f"   ✗ Need at least 2 active quests, found {len(quests.data) if quests.data else 0}")
            return False

        print(f"   ✓ Found {len(quests.data)} active quests")

        # Find a course quest with preset tasks (preferred for E2E testing)
        quest_for_enrollment = None
        preset_tasks = None

        for quest in quests.data:
            if quest.get('quest_type') == 'course':
                # Check if course quest has preset tasks
                tasks_check = supabase.table('course_quest_tasks')\
                    .select('*')\
                    .eq('quest_id', quest['id'])\
                    .execute()

                if tasks_check.data:
                    quest_for_enrollment = quest
                    preset_tasks = tasks_check.data
                    print(f"   ✓ Selected course quest with {len(preset_tasks)} tasks: {quest['title'][:50]}")
                    break

        if not quest_for_enrollment:
            # Fallback: use first quest (optio quests use personalization, no preset tasks)
            quest_for_enrollment = quests.data[0]
            print(f"   ✓ Selected quest: {quest_for_enrollment['title'][:50]} (personalization required)")

        # 4. Enroll user in one quest
        print(f"\n3. Enrolling in quest...")
        enrollment_data = {
            'user_id': user_id,
            'quest_id': quest_for_enrollment['id'],
            'is_active': True
        }

        enrollment = supabase.table('user_quests').insert(enrollment_data).execute()

        if not enrollment.data:
            print("   ✗ Failed to create enrollment")
            return False

        user_quest_id = enrollment.data[0]['id']
        print(f"   ✓ Enrolled in: {quest_for_enrollment['title'][:50]}")

        # 5. Copy preset tasks to user_quest_tasks (if course quest with tasks)
        print(f"\n4. Setting up tasks for enrolled quest...")
        tasks_created = 0

        if preset_tasks:
            # Create user_quest_tasks from preset course tasks
            user_tasks_data = []
            for task in preset_tasks:
                user_tasks_data.append({
                    'user_id': user_id,
                    'quest_id': quest_for_enrollment['id'],
                    'user_quest_id': user_quest_id,
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'pillar': task['pillar'],
                    'xp_value': task.get('xp_value', 100),
                    'order_index': task.get('order_index', 0),
                    'is_required': task.get('is_required', True),
                    'approval_status': 'approved'
                })

            if user_tasks_data:
                supabase.table('user_quest_tasks').insert(user_tasks_data).execute()
                tasks_created = len(user_tasks_data)
                print(f"   ✓ Created {tasks_created} user tasks from preset tasks")
        else:
            print(f"   ℹ Optio quest - tasks created via personalization")

        # 6. Summary
        print("\n" + "=" * 60)
        print("✓ E2E test data setup complete!")
        print("\nTest environment ready:")
        print(f"  - Test user: {email}")
        print(f"  - User ID: {user_id}")
        print(f"  - Enrolled quests: 1 ({quest_for_enrollment['title'][:40]}...)")
        print(f"  - Quest type: {quest_for_enrollment.get('quest_type', 'optio')}")
        print(f"  - Tasks created: {tasks_created}")
        print(f"  - Unenrolled quests: {len(quests.data) - 1}")
        print(f"  - Total XP: 0")
        print(f"\nTests can now:")
        print(f"  ✓ Display quest hub (unenrolled quests visible)")
        print(f"  ✓ Navigate to quest details")
        print(f"  ✓ Pick up new quests (unenrolled quests available)")

        return True

    except Exception as e:
        print(f"\n✗ Error setting up test data: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    success = setup_e2e_test_data()
    sys.exit(0 if success else 1)
