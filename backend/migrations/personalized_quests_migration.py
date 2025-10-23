"""
Personalized Quest System Migration
====================================

This migration transforms the quest system from predefined global tasks to
user-specific personalized tasks with AI-driven task generation.

Changes:
1. Creates new tables: user_quest_tasks, task_collaborations, quest_personalization_sessions, ai_task_cache
2. Migrates data from quest_tasks to user_quest_tasks for active enrollments
3. Migrates quest_collaborations to task_collaborations
4. Updates quest_task_completions FK references
5. Archives old tables for safety (quest_tasks, quest_collaborations, quest_ratings)

Run this migration during off-peak hours as it involves data restructuring.
"""

import os
import sys
from datetime import datetime
from database import get_supabase_admin_client
import json

from utils.logger import get_logger

logger = get_logger(__name__)

def run_migration():
    """Execute the personalized quest system migration"""
    supabase = get_supabase_admin_client()

    print("=" * 80)
    logger.info("PERSONALIZED QUEST SYSTEM MIGRATION")
    print("=" * 80)
    logger.info(f"Started at: {datetime.utcnow().isoformat()}")
    print()

    # Step 1: Create new tables
    logger.info("Step 1: Creating new tables...")
    create_new_tables(supabase)

    # Step 2: Migrate quest_tasks to user_quest_tasks
    logger.info("
Step 2: Migrating quest_tasks to user_quest_tasks...")
    migrate_quest_tasks(supabase)

    # Step 3: Migrate quest_collaborations to task_collaborations
    logger.info("
Step 3: Migrating quest_collaborations to task_collaborations...")
    migrate_collaborations(supabase)

    # Step 4: Update quest_task_completions
    logger.info("
Step 4: Updating quest_task_completions FK references...")
    update_task_completions(supabase)

    # Step 5: Update user_quests table
    logger.info("
Step 5: Updating user_quests table...")
    update_user_quests(supabase)

    # Step 6: Archive old tables
    logger.info("
Step 6: Archiving old tables...")
    archive_old_tables(supabase)

    print("\n" + "=" * 80)
    logger.info("MIGRATION COMPLETE")
    print("=" * 80)
    logger.info(f"Completed at: {datetime.utcnow().isoformat()}")
    print("\nOld tables have been renamed with '_archived' suffix.")
    logger.info("Monitor the system for 1 week before dropping archived tables.")

def create_new_tables(supabase):
    """Create new tables for personalized quest system"""

    # user_quest_tasks table
    logger.info("  Creating user_quest_tasks table...")
    try:
        supabase.rpc('execute_sql', {
            'sql': """
            CREATE TABLE IF NOT EXISTS user_quest_tasks (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
                user_quest_id UUID NOT NULL REFERENCES user_quests(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                pillar TEXT NOT NULL,
                xp_value INTEGER DEFAULT 100,
                order_index INTEGER DEFAULT 0,
                is_required BOOLEAN DEFAULT true,
                is_manual BOOLEAN DEFAULT false,
                approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_user_quest
                ON user_quest_tasks(user_id, quest_id);
            CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_user_quest_id
                ON user_quest_tasks(user_quest_id);
            CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_approval
                ON user_quest_tasks(approval_status) WHERE approval_status = 'pending';
            """
        }).execute()
        logger.info("    ✓ user_quest_tasks table created")
    except Exception as e:
        logger.info(f"    ⚠ user_quest_tasks may already exist: {e}")

    # task_collaborations table
    logger.info("  Creating task_collaborations table...")
    try:
        supabase.rpc('execute_sql', {
            'sql': """
            CREATE TABLE IF NOT EXISTS task_collaborations (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                task_id UUID NOT NULL REFERENCES user_quest_tasks(id) ON DELETE CASCADE,
                student_1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                student_2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
                double_xp_awarded BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_task_collaborations_students
                ON task_collaborations(student_1_id, student_2_id);
            CREATE INDEX IF NOT EXISTS idx_task_collaborations_task
                ON task_collaborations(task_id);
            """
        }).execute()
        logger.info("    ✓ task_collaborations table created")
    except Exception as e:
        logger.info(f"    ⚠ task_collaborations may already exist: {e}")

    # quest_personalization_sessions table
    logger.info("  Creating quest_personalization_sessions table...")
    try:
        supabase.rpc('execute_sql', {
            'sql': """
            CREATE TABLE IF NOT EXISTS quest_personalization_sessions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
                selected_approach TEXT,
                selected_interests JSONB DEFAULT '[]'::jsonb,
                cross_curricular_subjects JSONB DEFAULT '[]'::jsonb,
                ai_generated_tasks JSONB,
                finalized_tasks JSONB,
                completed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_personalization_user_quest
                ON quest_personalization_sessions(user_id, quest_id);
            """
        }).execute()
        logger.info("    ✓ quest_personalization_sessions table created")
    except Exception as e:
        logger.info(f"    ⚠ quest_personalization_sessions may already exist: {e}")

    # ai_task_cache table
    logger.info("  Creating ai_task_cache table...")
    try:
        supabase.rpc('execute_sql', {
            'sql': """
            CREATE TABLE IF NOT EXISTS ai_task_cache (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
                cache_key TEXT NOT NULL,
                interests_hash TEXT,
                generated_tasks JSONB NOT NULL,
                hit_count INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_task_cache_key
                ON ai_task_cache(quest_id, cache_key);
            CREATE INDEX IF NOT EXISTS idx_task_cache_expiry
                ON ai_task_cache(expires_at);
            """
        }).execute()
        logger.info("    ✓ ai_task_cache table created")
    except Exception as e:
        logger.info(f"    ⚠ ai_task_cache may already exist: {e}")

def migrate_quest_tasks(supabase):
    """Migrate quest_tasks to user_quest_tasks for all active enrollments"""

    # Get all active user quests
    user_quests = supabase.table('user_quests')\
        .select('id, user_id, quest_id')\
        .eq('is_active', True)\
        .execute()

    if not user_quests.data:
        logger.info("    No active user quests to migrate")
        return

    logger.info(f"    Found {len(user_quests.data)} active user quests to process")

    migrated_count = 0
    for user_quest in user_quests.data:
        # Get quest tasks for this quest
        quest_tasks = supabase.table('quest_tasks')\
            .select('*')\
            .eq('quest_id', user_quest['quest_id'])\
            .execute()

        if not quest_tasks.data:
            continue

        # Create user-specific tasks for each quest task
        user_tasks = []
        for task in quest_tasks.data:
            user_task = {
                'user_id': user_quest['user_id'],
                'quest_id': user_quest['quest_id'],
                'user_quest_id': user_quest['id'],
                'title': task['title'],
                'description': task.get('description'),
                'pillar': task['pillar'],
                'xp_value': task.get('xp_amount', 100),
                'order_index': task.get('order_index', 0),
                'is_required': task.get('is_required', True),
                'is_manual': False,
                'approval_status': 'approved',
                'created_at': datetime.utcnow().isoformat()
            }
            user_tasks.append(user_task)

        # Insert user-specific tasks
        if user_tasks:
            try:
                supabase.table('user_quest_tasks').insert(user_tasks).execute()
                migrated_count += len(user_tasks)
            except Exception as e:
                print(f"    ⚠ Error migrating tasks for user_quest {user_quest['id']}: {e}")

    logger.info(f"    ✓ Migrated {migrated_count} tasks to user-specific format")

def migrate_collaborations(supabase):
    """Migrate quest_collaborations to task_collaborations"""

    # Get all accepted quest collaborations
    collabs = supabase.table('quest_collaborations')\
        .select('*')\
        .eq('status', 'accepted')\
        .execute()

    if not collabs.data:
        logger.info("    No collaborations to migrate")
        return

    logger.info(f"    Found {len(collabs.data)} collaborations to migrate")

    migrated_count = 0
    for collab in collabs.data:
        # Get user quest IDs for both collaborators
        requester_quest = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', collab['requester_id'])\
            .eq('quest_id', collab['quest_id'])\
            .execute()

        partner_quest = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', collab['partner_id'])\
            .eq('quest_id', collab['quest_id'])\
            .execute()

        if not requester_quest.data or not partner_quest.data:
            continue

        # Get all user tasks for both users on this quest
        requester_tasks = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('user_quest_id', requester_quest.data[0]['id'])\
            .execute()

        partner_tasks = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('user_quest_id', partner_quest.data[0]['id'])\
            .execute()

        # For migration purposes, mark all tasks as collaborative
        # In the new system, students will explicitly choose which tasks to collaborate on
        if requester_tasks.data and partner_tasks.data:
            # Create task collaborations for matching order indices
            for req_task in requester_tasks.data:
                try:
                    task_collab = {
                        'task_id': req_task['id'],
                        'student_1_id': collab['requester_id'],
                        'student_2_id': collab['partner_id'],
                        'status': 'active',
                        'double_xp_awarded': False,
                        'created_at': datetime.utcnow().isoformat()
                    }
                    supabase.table('task_collaborations').insert(task_collab).execute()
                    migrated_count += 1
                except Exception as e:
                    logger.error(f"    ⚠ Error creating task collaboration: {e}")

    logger.info(f"    ✓ Migrated {migrated_count} task collaborations")

def update_task_completions(supabase):
    """Update quest_task_completions to reference user_quest_tasks"""

    # Note: This requires adding a mapping table or updating the FK
    # For now, we'll create a new column to map old task_id to new user_quest_task_id

    logger.info("    Adding user_quest_task_id column to quest_task_completions...")
    try:
        supabase.rpc('execute_sql', {
            'sql': """
            ALTER TABLE quest_task_completions
            ADD COLUMN IF NOT EXISTS user_quest_task_id UUID REFERENCES user_quest_tasks(id);

            CREATE INDEX IF NOT EXISTS idx_task_completions_user_task
                ON quest_task_completions(user_quest_task_id);
            """
        }).execute()
        logger.info("    ✓ Column added")
    except Exception as e:
        logger.info(f"    ⚠ Column may already exist: {e}")

    # Update completions to reference new user-specific tasks
    logger.info("    Mapping completions to user-specific tasks...")

    completions = supabase.table('quest_task_completions')\
        .select('id, user_id, quest_id, task_id')\
        .execute()

    if not completions.data:
        logger.info("    No completions to update")
        return

    logger.debug(f"    Processing {len(completions.data)} completions...")
    updated_count = 0

    for completion in completions.data:
        # Find the corresponding user_quest_task
        user_task = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('user_id', completion['user_id'])\
            .eq('quest_id', completion['quest_id'])\
            .execute()

        if user_task.data:
            # Find matching task by comparing with original quest_task
            original_task = supabase.table('quest_tasks')\
                .select('title, order_index')\
                .eq('id', completion['task_id'])\
                .execute()

            if original_task.data:
                matching_user_task = None
                for ut in user_task.data:
                    ut_details = supabase.table('user_quest_tasks')\
                        .select('*')\
                        .eq('id', ut['id'])\
                        .execute()

                    if ut_details.data and ut_details.data[0]['title'] == original_task.data[0]['title']:
                        matching_user_task = ut_details.data[0]
                        break

                if matching_user_task:
                    try:
                        supabase.table('quest_task_completions')\
                            .update({'user_quest_task_id': matching_user_task['id']})\
                            .eq('id', completion['id'])\
                            .execute()
                        updated_count += 1
                    except Exception as e:
                        print(f"    ⚠ Error updating completion {completion['id']}: {e}")

    logger.info(f"    ✓ Updated {updated_count} completions")

def update_user_quests(supabase):
    """Add personalization tracking columns to user_quests"""

    logger.info("    Adding personalization columns to user_quests...")
    try:
        supabase.rpc('execute_sql', {
            'sql': """
            ALTER TABLE user_quests
            ADD COLUMN IF NOT EXISTS personalization_completed BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS personalization_session_id UUID REFERENCES quest_personalization_sessions(id);
            """
        }).execute()
        logger.info("    ✓ Columns added to user_quests")
    except Exception as e:
        logger.info(f"    ⚠ Columns may already exist: {e}")

    # Mark all existing enrollments as personalization_completed=true
    # (they were created with the old system, so no personalization was needed)
    logger.info("    Marking existing enrollments as personalization_completed...")
    try:
        supabase.table('user_quests')\
            .update({'personalization_completed': True})\
            .is_('personalization_completed', 'null')\
            .execute()
        logger.info("    ✓ Existing enrollments marked as completed")
    except Exception as e:
        logger.error(f"    ⚠ Error updating user_quests: {e}")

def archive_old_tables(supabase):
    """Rename old tables with _archived suffix for safety"""

    tables_to_archive = ['quest_tasks', 'quest_collaborations', 'quest_ratings']

    for table in tables_to_archive:
        logger.info(f"    Archiving {table}...")
        try:
            supabase.rpc('execute_sql', {
                'sql': f"""
                ALTER TABLE {table} RENAME TO {table}_archived;
                """
            }).execute()
            logger.info(f"    ✓ {table} renamed to {table}_archived")
        except Exception as e:
            logger.error(f"    ⚠ Error archiving {table}: {e}")

    logger.info("
    IMPORTANT: Monitor the system for 1 week.")
    logger.info("    If everything works correctly, you can drop the archived tables:")
    logger.info("      DROP TABLE quest_tasks_archived;")
    logger.info("      DROP TABLE quest_collaborations_archived;")
    logger.info("      DROP TABLE quest_ratings_archived;")

if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        logger.error(f"
❌ MIGRATION FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
