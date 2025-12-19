"""
Create test account for E2E testing.

This script creates a test user account in both Supabase Auth and the users table.
Credentials: test@optioeducation.com / TestPassword123!

Run from project root:
    python backend/scripts/create_test_account.py
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from database import get_supabase_admin_client


def create_test_account():
    """Create test account for E2E testing."""
    supabase = get_supabase_admin_client()

    email = 'test@optioeducation.com'
    password = 'TestPassword123!'

    print(f"Creating test account: {email}")

    try:
        # Check if user already exists in users table
        existing = supabase.table('users').select('id, email').eq('email', email).execute()

        if existing.data:
            print(f"✓ Test account already exists in users table")
            print(f"  User ID: {existing.data[0]['id']}")
            print(f"  Email: {existing.data[0]['email']}")
            return

        # Create Supabase Auth user
        print("Creating Supabase Auth user...")
        auth_response = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,  # Auto-confirm for testing
            "user_metadata": {
                "display_name": "Test User"
            }
        })

        if not auth_response.user:
            print("✗ Failed to create Supabase Auth user")
            return

        user_id = auth_response.user.id
        print(f"✓ Created Supabase Auth user: {user_id}")

        # Create users table record
        print("Creating users table record...")
        user_data = {
            'id': user_id,
            'email': email,
            'role': 'student',
            'display_name': 'Test User',
            'total_xp': 0,
            'is_dependent': False,
            'managed_by_parent_id': None,
            'organization_id': None
        }

        user_response = supabase.table('users').insert(user_data).execute()

        if user_response.data:
            print(f"✓ Created users table record")
            print(f"\nTest account created successfully!")
            print(f"  Email: {email}")
            print(f"  Password: {password}")
            print(f"  User ID: {user_id}")
            print(f"  Role: student")
            print(f"\nYou can now run E2E tests with these credentials.")
        else:
            print("✗ Failed to create users table record")

    except Exception as e:
        print(f"✗ Error creating test account: {str(e)}")

        # If auth user was created but users table failed, clean up
        if 'user_id' in locals():
            print(f"Cleaning up auth user: {user_id}")
            try:
                supabase.auth.admin.delete_user(user_id)
                print("✓ Cleaned up auth user")
            except:
                print("✗ Failed to clean up auth user - manual deletion required")


if __name__ == '__main__':
    create_test_account()
