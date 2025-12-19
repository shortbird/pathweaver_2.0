"""
Reset test user data for E2E testing.

This script resets the test@optioeducation.com account to a clean state:
- Deletes all quest enrollments
- Deletes all task completions
- Deletes all evidence
- Resets XP to 0
- Ensures quests exist for testing

Run from project root:
    python backend/scripts/reset_test_user_data.py

Use --preserve-enrollments to keep 1 enrolled quest:
    python backend/scripts/reset_test_user_data.py --preserve-enrollments
"""

import os
import argparse
from supabase import create_client


def reset_test_user_data(preserve_enrollments=False):
    """Reset test user data to clean state."""
    # Create Supabase admin client directly
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_service_key = os.environ.get('SUPABASE_SERVICE_KEY')

    if not supabase_url or not supabase_service_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required")

    supabase = create_client(supabase_url, supabase_service_key)

    email = 'test@optioeducation.com'

    print(f"Resetting test user data: {email}")
    print("=" * 60)

    try:
        # Get test user
        user_response = supabase.table('users').select('id').eq('email', email).execute()

        if not user_response.data:
            print(f"✗ Test user not found: {email}")
            print("\nRun: python backend/scripts/create_test_account.py")
            return False

        user_id = user_response.data[0]['id']
        print(f"✓ Found test user: {user_id}")

        # 1. Delete task completions
        print("\n1. Deleting task completions...")
        completions = supabase.table('quest_task_completions').delete().eq('user_id', user_id).execute()
        print(f"   ✓ Deleted task completions")

        # 2. Delete evidence
        print("\n2. Deleting evidence...")
        evidence = supabase.table('task_evidence').delete().eq('user_id', user_id).execute()
        print(f"   ✓ Deleted evidence")

        # 3. Delete user quest tasks
        print("\n3. Deleting user quest tasks...")
        tasks = supabase.table('user_quest_tasks').delete().eq('user_id', user_id).execute()
        print(f"   ✓ Deleted user quest tasks")

        # 4. Handle quest enrollments
        if preserve_enrollments:
            print("\n4. Preserving 1 quest enrollment...")
            enrollments = supabase.table('quest_enrollments').select('id').eq('user_id', user_id).limit(10).execute()

            if enrollments.data and len(enrollments.data) > 1:
                # Keep the first, delete the rest
                ids_to_delete = [e['id'] for e in enrollments.data[1:]]
                for enrollment_id in ids_to_delete:
                    supabase.table('quest_enrollments').delete().eq('id', enrollment_id).execute()
                print(f"   ✓ Kept 1 enrollment, deleted {len(ids_to_delete)} others")
            elif enrollments.data:
                print(f"   ✓ Already has only 1 enrollment")
            else:
                print(f"   ℹ No enrollments to preserve")
        else:
            print("\n4. Deleting all quest enrollments...")
            enrollments = supabase.table('quest_enrollments').delete().eq('user_id', user_id).execute()
            print(f"   ✓ Deleted all quest enrollments")

        # 5. Reset XP
        print("\n5. Resetting XP...")
        supabase.table('users').update({'total_xp': 0}).eq('id', user_id).execute()
        print(f"   ✓ Reset total_xp to 0")

        # Delete skill XP
        supabase.table('user_skill_xp').delete().eq('user_id', user_id).execute()
        print(f"   ✓ Deleted skill XP")

        # 6. Verify quests exist
        print("\n6. Verifying quests exist...")
        quests = supabase.table('quests').select('id, title').eq('is_active', True).limit(5).execute()

        if quests.data and len(quests.data) >= 3:
            print(f"   ✓ Found {len(quests.data)} active quests")
            print(f"\n   Available quests:")
            for quest in quests.data[:3]:
                print(f"   - {quest['title'][:50]}")
        else:
            print(f"   ⚠ Warning: Only {len(quests.data) if quests.data else 0} active quests found")
            print(f"   E2E tests need at least 3 quests to work properly")

        print("\n" + "=" * 60)
        print("✓ Test user data reset complete!")
        print("\nTest user is now in clean state:")
        print(f"  - Email: {email}")
        print(f"  - User ID: {user_id}")
        print(f"  - Quest enrollments: {'1 (preserved)' if preserve_enrollments else '0'}")
        print(f"  - Task completions: 0")
        print(f"  - Total XP: 0")
        print(f"  - Available quests: {len(quests.data) if quests.data else 0}")

        return True

    except Exception as e:
        print(f"\n✗ Error resetting test user data: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Reset test user data for E2E testing')
    parser.add_argument(
        '--preserve-enrollments',
        action='store_true',
        help='Keep 1 quest enrollment for testing enrolled quest flows'
    )

    args = parser.parse_args()

    success = reset_test_user_data(preserve_enrollments=args.preserve_enrollments)
    sys.exit(0 if success else 1)
