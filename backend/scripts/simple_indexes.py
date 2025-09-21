#!/usr/bin/env python3
"""
Simple script to apply performance indexes directly via Supabase.
"""

import os
import sys
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from database import get_supabase_admin_client
except ImportError as e:
    print(f"Error importing database module: {e}")
    sys.exit(1)


def create_indexes():
    """Create performance indexes"""
    print("Creating performance indexes...")

    indexes = [
        {
            'name': 'idx_user_quests_lookup',
            'sql': '''CREATE INDEX IF NOT EXISTS idx_user_quests_lookup
                     ON user_quests(user_id, is_active, completed_at)
                     WHERE is_active = true;'''
        },
        {
            'name': 'idx_quest_task_completions',
            'sql': '''CREATE INDEX IF NOT EXISTS idx_quest_task_completions
                     ON quest_task_completions(user_id, quest_id, task_id);'''
        },
        {
            'name': 'idx_quest_tasks_by_quest',
            'sql': '''CREATE INDEX IF NOT EXISTS idx_quest_tasks_by_quest
                     ON quest_tasks(quest_id, is_required, order_index);'''
        },
        {
            'name': 'idx_user_skill_xp',
            'sql': '''CREATE INDEX IF NOT EXISTS idx_user_skill_xp
                     ON user_skill_xp(user_id, pillar);'''
        },
        {
            'name': 'idx_quests_active',
            'sql': '''CREATE INDEX IF NOT EXISTS idx_quests_active
                     ON quests(is_active, is_v3, source)
                     WHERE is_active = true AND is_v3 = true;'''
        }
    ]

    try:
        supabase = get_supabase_admin_client()
        print("Connected to Supabase")

        created = 0
        failed = 0

        for index in indexes:
            print(f"Creating {index['name']}...")
            try:
                # Try using direct SQL execution
                result = supabase.rpc('exec_sql', {'query': index['sql']}).execute()
                print(f"  Success: {index['name']}")
                created += 1
            except Exception as e:
                if 'already exists' in str(e).lower():
                    print(f"  Already exists: {index['name']}")
                    created += 1
                else:
                    print(f"  Failed: {index['name']} - {e}")
                    failed += 1

        print(f"\nSummary: {created} created/verified, {failed} failed")
        return failed == 0

    except Exception as e:
        print(f"Error: {e}")
        return False


def main():
    print("Database Performance Index Installer")
    print("====================================")

    if not os.getenv('SUPABASE_URL') or not os.getenv('SUPABASE_SERVICE_KEY'):
        print("Missing required environment variables:")
        print("- SUPABASE_URL")
        print("- SUPABASE_SERVICE_KEY")
        return 1

    success = create_indexes()

    if success:
        print("\nDatabase optimization complete!")
        return 0
    else:
        print("\nSome indexes failed to create.")
        return 1


if __name__ == '__main__':
    sys.exit(main())