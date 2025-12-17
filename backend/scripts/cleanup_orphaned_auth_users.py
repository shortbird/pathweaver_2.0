"""
Script to delete orphaned auth users that don't have corresponding public.users profiles.
This syncs auth.users with public.users to ensure accurate user counts.

Run this script once to clean up test accounts and orphaned auth records.
"""

import sys
import os

# Add parent directory to path to import database module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import get_supabase_admin_singleton
from utils.logger import get_logger

logger = get_logger(__name__)

# List of orphaned user IDs to delete (generated from query on 2025-01-17)
ORPHANED_USER_IDS = [
    'baaf5f97-3ba5-4864-9ee9-ad377d88c946',  # dependent placeholder
    'fca75700-5d5c-4605-ac5d-b8b4b0f34730',  # tannerbowman+0
    '3ae28f8f-076f-4d5f-acf6-681643dcbd4a',  # tannerbowman+1
    '0d066609-a874-42b3-a025-82b57a13fd0f',  # tannerbowman+123
    '8eac9e13-9bac-42aa-b469-4e0243ebc93e',  # tannerbowman+147
    '0638a164-2755-46ce-afc7-72eb64a8e3fd',  # tannerbowman+2
    '33114cf5-4d6f-492b-a1f2-fb2120508ae3',  # tannerbowman+456
    '3d291734-b57f-49d3-a55f-6b18a0bd5c6f',  # tannerbowman+789
    'e0914717-ff78-48d6-acda-932afeaf3ee5',  # tannerbowman+student
    'bacde153-ecf1-42ef-81bf-e51e4a694339',  # tannerbowman+test1
    '6f31f784-7c0a-4160-b177-c06192325b2e',  # tannerbowman+test2
    '5d8f74ac-1da2-4efe-a797-36ecbcfe4c9c',  # tannerbowman+testestset
]

def cleanup_orphaned_users():
    """Delete orphaned auth users that don't have public.users profiles"""
    supabase = get_supabase_admin_singleton()

    logger.info(f"Starting cleanup of {len(ORPHANED_USER_IDS)} orphaned auth users")

    deleted_count = 0
    failed_count = 0

    for user_id in ORPHANED_USER_IDS:
        try:
            # Get user email for logging
            user_query = supabase.table('users').select('email').eq('id', user_id).execute()

            # Check if user now has a profile (safety check)
            if user_query.data and len(user_query.data) > 0:
                logger.warning(f"Skipping {user_id} - now has a public.users profile")
                continue

            # Get email from auth.users for logging
            auth_result = supabase.auth.admin.get_user_by_id(user_id)
            user_email = auth_result.user.email if auth_result and auth_result.user else 'unknown'

            # Delete from auth.users
            supabase.auth.admin.delete_user(user_id)
            logger.info(f"Deleted auth user {user_id} ({user_email})")
            deleted_count += 1

        except Exception as e:
            logger.error(f"Failed to delete user {user_id}: {str(e)}")
            failed_count += 1

    logger.info(f"Cleanup complete: {deleted_count} deleted, {failed_count} failed")
    return deleted_count, failed_count

if __name__ == '__main__':
    print("Orphaned Auth Users Cleanup Script")
    print("=" * 50)
    print(f"This will delete {len(ORPHANED_USER_IDS)} orphaned auth users")
    print("These are auth records without corresponding public.users profiles")
    print()

    response = input("Continue? (yes/no): ").strip().lower()

    if response == 'yes':
        deleted, failed = cleanup_orphaned_users()
        print()
        print(f"Results: {deleted} deleted, {failed} failed")
    else:
        print("Cleanup cancelled")
