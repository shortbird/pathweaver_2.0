"""
Apply AI Quest Review System Migration
Executes the SQL migration for AI quest review tables
"""

import os
import sys
from pathlib import Path

# Add parent directory to path to import database module
sys.path.insert(0, str(Path(__file__).parent.parent))

from database import get_supabase_admin_client

def apply_migration():
    """Apply the AI quest review system migration"""
    try:
        # Read migration file
        migration_path = Path(__file__).parent.parent / 'migrations' / '009_ai_quest_review_system.sql'

        with open(migration_path, 'r', encoding='utf-8') as f:
            migration_sql = f.read()

        print("[OK] Migration file loaded successfully")
        print(f"Path: {migration_path}")
        print(f"Size: {len(migration_sql)} characters\n")

        # Get Supabase admin client
        supabase = get_supabase_admin_client()

        print("[OK] Connected to Supabase")

        # Note: The Python Supabase client doesn't support raw SQL execution
        # We need to use the Supabase RPC or REST API

        # Split migration into individual statements for execution
        statements = [stmt.strip() for stmt in migration_sql.split(';') if stmt.strip() and not stmt.strip().startswith('--')]

        print(f"\nFound {len(statements)} SQL statements to execute\n")

        # Try to execute via RPC (this might not work for DDL)
        # Alternative: Use psycopg2 or asyncpg with connection string

        # For now, we'll provide the migration SQL for manual execution
        print("[NOTE] Supabase Python client does not support direct SQL execution.")
        print("Please execute this migration in one of the following ways:\n")
        print("   1. Supabase Dashboard -> SQL Editor")
        print("   2. psql command line with connection string")
        print("   3. Any PostgreSQL client (DBeaver, pgAdmin, etc.)\n")
        print(f"Migration file location: {migration_path}\n")

        # Try to get database connection info for psql command
        supabase_url = os.getenv('SUPABASE_URL', '')
        if supabase_url:
            # Extract project ref from URL
            import re
            match = re.search(r'https://([a-z]+)\.supabase\.co', supabase_url)
            if match:
                project_ref = match.group(1)
                print(f"[INFO] Your Supabase project: {project_ref}")
                print(f"   Dashboard: https://supabase.com/dashboard/project/{project_ref}/editor\n")

        return True

    except FileNotFoundError:
        print(f"[ERROR] Migration file not found at {migration_path}")
        return False
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("=" * 70)
    print("  AI Quest Review System Migration")
    print("=" * 70)
    print()

    success = apply_migration()

    if success:
        print("[SUCCESS] Migration preparation complete")
        print("\nNext Steps:")
        print("   1. Go to Supabase SQL Editor")
        print("   2. Copy and paste the migration SQL")
        print("   3. Execute the migration")
        print("   4. Verify tables were created successfully")
        sys.exit(0)
    else:
        print("\n[FAILED] Migration preparation failed")
        sys.exit(1)
