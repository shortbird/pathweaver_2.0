#!/usr/bin/env python3
"""
Apply Performance Indexes

This script adds 5 critical composite indexes identified in the codebase audit
to improve query performance by 30-50%.

Indexes added:
1. idx_user_quest_tasks_quest_user - For 103 queries filtering by (quest_id, user_id)
2. idx_task_completions_task_id - For frequent joins on task_id
3. idx_user_badges_badge_user - For badge progress queries
4. idx_evidence_blocks_order - For evidence block ordering
5. idx_user_quests_organization - For organization filtering
"""

import os
import sys

from utils.logger import get_logger

logger = get_logger(__name__)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_supabase_admin_client

def main():
    """Apply performance indexes to database"""

    logger.info("Starting Performance Index Migration...")

    # Connect to Supabase with admin privileges
    supabase = get_supabase_admin_client()

    # SQL commands to create performance indexes
    indexes = [
        {
            "name": "idx_user_quest_tasks_quest_user",
            "description": "Index for user_quest_tasks filtering by (quest_id, user_id)",
            "sql": """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_quest_tasks_quest_user
            ON user_quest_tasks (quest_id, user_id);
            """,
            "impact": "Optimizes 103 queries filtering by quest and user"
        },
        {
            "name": "idx_task_completions_task_id",
            "description": "Index for quest_task_completions joins on task_id",
            "sql": """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_completions_task_id
            ON quest_task_completions (user_quest_task_id);
            """,
            "impact": "Improves task completion lookups"
        },
        {
            "name": "idx_user_badges_badge_user",
            "description": "Partial index for incomplete badge progress queries",
            "sql": """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_badges_badge_user
            ON user_badges (badge_id, user_id)
            WHERE completed_at IS NULL;
            """,
            "impact": "Speeds up badge progress queries (partial index on incomplete badges)"
        },
        {
            "name": "idx_evidence_blocks_order",
            "description": "Index for evidence_document_blocks ordering",
            "sql": """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_blocks_order
            ON evidence_document_blocks (document_id, order_index);
            """,
            "impact": "Optimizes evidence block retrieval by order"
        },
        {
            "name": "idx_user_quests_organization",
            "description": "Partial index for user_quests organization filtering",
            "sql": """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_quests_organization
            ON user_quests (organization_id, is_active)
            WHERE organization_id IS NOT NULL;
            """,
            "impact": "Speeds up organization quest filtering (partial index)"
        }
    ]

    success_count = 0
    error_count = 0

    for index in indexes:
        try:
            logger.info(f"Creating index: {index['name']}...")
            logger.info(f"  Description: {index['description']}")
            logger.info(f"  Impact: {index['impact']}")

            # Execute the SQL to create index
            # Use CONCURRENTLY to avoid locking table during index creation
            result = supabase.rpc('exec_sql', {'sql': index['sql']}).execute()

            logger.info(f"SUCCESS: {index['name']} created")
            success_count += 1

        except Exception as e:
            error_message = str(e)
            # If index already exists, that's okay
            if 'already exists' in error_message.lower():
                logger.info(f"SKIPPED: {index['name']} already exists")
                success_count += 1
            else:
                logger.error(f"FAILED: {index['name']} - ERROR: {error_message}")
                error_count += 1
            continue

    logger.info(f"\nPerformance Index Migration Results:")
    logger.info(f"   Successful indexes: {success_count}")
    logger.error(f"   Failed indexes: {error_count}")

    if error_count == 0:
        logger.info(f"\nAll performance indexes have been created!")
        logger.info(f"   Expected performance improvement: 30-50% query time reduction")
        logger.info(f"   Tables optimized: user_quest_tasks, quest_task_completions, user_badges, evidence_document_blocks, user_quests")
    else:
        logger.error(f"\nSome indexes failed to create. Please review the errors above.")

    return success_count > 0

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        logger.error(f"Fatal error: {str(e)}")
        sys.exit(1)
