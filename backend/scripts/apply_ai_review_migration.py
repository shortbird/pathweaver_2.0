"""
Apply AI Quest Review System Migration
Executes the SQL migration for AI quest review tables
"""

import os
import sys
from pathlib import Path

from utils.logger import get_logger

logger = get_logger(__name__)

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

        logger.info("[OK] Migration file loaded successfully")
        logger.info(f"Path: {migration_path}")
        logger.info(f"Size: {len(migration_sql)} characters
")

        # Get Supabase admin client
        supabase = get_supabase_admin_client()

        logger.info("[OK] Connected to Supabase")

        # Note: The Python Supabase client doesn't support raw SQL execution
        # We need to use the Supabase RPC or REST API

        # Split migration into individual statements for execution
        statements = [stmt.strip() for stmt in migration_sql.split(';') if stmt.strip() and not stmt.strip().startswith('--')]

        logger.info(f"
Found {len(statements)} SQL statements to execute
")

        # Try to execute via RPC (this might not work for DDL)
        # Alternative: Use psycopg2 or asyncpg with connection string

        # For now, we'll provide the migration SQL for manual execution
        logger.info("[NOTE] Supabase Python client does not support direct SQL execution.")
        logger.info("Please execute this migration in one of the following ways:
")
        logger.info("   1. Supabase Dashboard -> SQL Editor")
        logger.info("   2. psql command line with connection string")
        logger.info("   3. Any PostgreSQL client (DBeaver, pgAdmin, etc.)
")
        logger.info(f"Migration file location: {migration_path}
")

        # Try to get database connection info for psql command
        supabase_url = os.getenv('SUPABASE_URL', '')
        if supabase_url:
            # Extract project ref from URL
            import re
            match = re.search(r'https://([a-z]+)\.supabase\.co', supabase_url)
            if match:
                project_ref = match.group(1)
                logger.info(f"[INFO] Your Supabase project: {project_ref}")
                logger.info(f"   Dashboard: https://supabase.com/dashboard/project/{project_ref}/editor
")

        return True

    except FileNotFoundError:
        logger.error(f"[ERROR] Migration file not found at {migration_path}")
        return False
    except Exception as e:
        logger.error(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("=" * 70)
    logger.info("  AI Quest Review System Migration")
    print("=" * 70)
    print()

    success = apply_migration()

    if success:
        logger.info("[SUCCESS] Migration preparation complete")
        logger.info("
Next Steps:")
        logger.info("   1. Go to Supabase SQL Editor")
        logger.info("   2. Copy and paste the migration SQL")
        logger.info("   3. Execute the migration")
        logger.info("   4. Verify tables were created successfully")
        sys.exit(0)
    else:
        logger.error("
[FAILED] Migration preparation failed")
        sys.exit(1)
