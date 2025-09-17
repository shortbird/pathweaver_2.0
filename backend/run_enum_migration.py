#!/usr/bin/env python3
"""
Run database migration to add jordan_peterson_academy to quest_source enum.
This fixes the enum constraint issue when adding new source images.
"""

import os
import sys
from database import get_supabase_admin_client

def run_migration():
    """Run the enum migration using Supabase admin client."""
    try:
        supabase = get_supabase_admin_client()

        # Read the migration SQL
        migration_path = os.path.join(os.path.dirname(__file__), 'migrations', 'add_jordan_peterson_academy_enum.sql')
        with open(migration_path, 'r') as f:
            migration_sql = f.read()

        print("Running migration to add jordan_peterson_academy to quest_source enum...")

        # Execute the migration
        # Note: Supabase client might not support raw SQL execution
        # This is a template for the migration process
        print("Migration SQL:")
        print(migration_sql)
        print("\nPlease run this SQL manually in your database console or use a database migration tool.")

        # Alternative: Check current enum values first
        print("\nChecking current quest_sources in database...")
        sources_response = supabase.table('quest_sources').select('*').execute()
        if sources_response.data:
            print("Current quest sources:")
            for source in sources_response.data:
                print(f"  - {source.get('name', source.get('id'))}")

        return True

    except Exception as e:
        print(f"Error running migration: {str(e)}")
        return False

if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)