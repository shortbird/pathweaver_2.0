"""
Run AI Jobs Tables Migration
Executes the SQL migration to create scheduled_jobs and quality_action_logs tables
"""

import os
import sys
from pathlib import Path

from utils.logger import get_logger

logger = get_logger(__name__)

# Add parent directory to path to import database module
sys.path.insert(0, str(Path(__file__).parent.parent))

from database import get_supabase_admin_client


def run_migration():
    """Execute the AI jobs tables migration"""

    # Read migration SQL
    migration_path = Path(__file__).parent.parent / 'migrations' / 'add_ai_jobs_tables.sql'

    if not migration_path.exists():
        logger.info(f"❌ Migration file not found: {migration_path}")
        return False

    with open(migration_path, 'r') as f:
        sql = f.read()

    logger.info("🚀 Running AI Jobs Tables Migration...")
    logger.info(f"📄 Migration file: {migration_path}")

    try:
        supabase = get_supabase_admin_client()

        # Execute the SQL migration
        # Note: Supabase Python client doesn't have direct SQL execution
        # We need to use the REST API or pgAdmin/SQL Editor in Supabase Dashboard

        logger.info("
⚠️  IMPORTANT:")
        logger.info("The migration SQL needs to be executed in the Supabase SQL Editor.")
        logger.info("
Steps:")
        logger.info("1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT/sql")
        logger.info("2. Copy the SQL from: backend/migrations/add_ai_jobs_tables.sql")
        print("3. Paste into SQL Editor and click 'Run'")
        logger.info("
Or use this SQL directly:
")
        print("=" * 80)
        print(sql)
        print("=" * 80)

        return True

    except Exception as e:
        logger.error(f"❌ Error: {e}")
        return False


if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
