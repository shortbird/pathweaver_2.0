"""
Migration script to add role indexes and ensure data consistency
Run this script to prepare the database for role-based access control
"""

import os
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database import get_authenticated_supabase_client
from dotenv import load_dotenv

load_dotenv()

def run_migration():
    """Add role indexes and ensure all users have valid roles"""
    
    print("Starting role migration...")
    
    # Get service role client for admin access
    supabase = get_authenticated_supabase_client()
    
    try:
        # Step 1: Ensure all users have a role set (default to 'student')
        print("Ensuring all users have a role...")
        users_without_role = supabase.table('users').select('id').is_('role', 'null').execute()
        
        if users_without_role.data:
            print(f"Found {len(users_without_role.data)} users without roles. Setting to 'student'...")
            for user in users_without_role.data:
                supabase.table('users').update({'role': 'student'}).eq('id', user['id']).execute()
            print("Updated users with default role.")
        else:
            print("All users already have roles assigned.")
        
        # Step 2: Get role distribution
        print("\nCurrent role distribution:")
        all_users = supabase.table('users').select('role').execute()
        role_counts = {}
        for user in all_users.data:
            role = user.get('role', 'unknown')
            role_counts[role] = role_counts.get(role, 0) + 1
        
        for role, count in role_counts.items():
            print(f"  {role}: {count} users")
        
        # Step 3: Create index for role field (must be done via SQL)
        print("\nCreating role index...")
        # Note: This SQL command would need to be run directly in Supabase SQL editor
        # as the Python client doesn't support DDL operations
        index_sql = """
        -- Run this in Supabase SQL editor:
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        
        -- Also ensure the role field has proper constraints
        ALTER TABLE users 
        ADD CONSTRAINT valid_role CHECK (
            role IN ('student', 'parent', 'advisor', 'admin')
        );
        """
        
        print("Please run the following SQL in your Supabase SQL editor:")
        print(index_sql)
        
        # Step 4: Log migration completion
        print("\nMigration preparation complete!")
        print("Next steps:")
        print("1. Run the SQL commands above in Supabase SQL editor")
        print("2. Verify the index was created successfully")
        print("3. Test role-based access with the new system")
        
        return True
        
    except Exception as e:
        print(f"Error during migration: {str(e)}")
        return False

if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)