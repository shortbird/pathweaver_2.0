#!/usr/bin/env python3
"""
Repair script: Find task completions missing XP and award them.

Run from backend directory:
    python scripts/repair_missing_xp.py [--live]
"""

import sys
import os
from datetime import datetime

# Load environment from backend/.env
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(backend_dir, '.env')

from dotenv import load_dotenv
load_dotenv(env_path)

from supabase import create_client

def get_client():
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_KEY')
    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def repair_missing_xp(dry_run=True):
    """Find and repair missing XP from task completions."""
    supabase = get_client()

    print("=" * 60)
    print("XP Repair Script")
    print(f"Mode: {'DRY RUN (no changes)' if dry_run else 'LIVE (will make changes)'}")
    print("=" * 60)

    # Get all task completions with their task details
    completions = supabase.table('quest_task_completions')\
        .select('id, user_id, task_id, completed_at, user_quest_tasks(pillar, xp_value)')\
        .order('completed_at', desc=True)\
        .execute()

    if not completions.data:
        print("No task completions found.")
        return

    print(f"\nFound {len(completions.data)} task completions to check.\n")

    # Group expected XP by user and pillar
    users_expected = {}

    for completion in completions.data:
        user_id = completion['user_id']
        task = completion.get('user_quest_tasks')

        if not task:
            continue

        pillar = task.get('pillar')
        xp_value = task.get('xp_value', 0)

        if not pillar or not xp_value:
            continue

        if user_id not in users_expected:
            users_expected[user_id] = {}

        if pillar not in users_expected[user_id]:
            users_expected[user_id][pillar] = 0

        users_expected[user_id][pillar] += xp_value

    # Now check actual XP vs expected
    fixes_needed = []

    for user_id, expected_xp in users_expected.items():
        # Get current XP for this user
        current_xp = supabase.table('user_skill_xp')\
            .select('pillar, xp_amount')\
            .eq('user_id', user_id)\
            .execute()

        current_by_pillar = {r['pillar']: r['xp_amount'] for r in (current_xp.data or [])}

        for pillar, expected in expected_xp.items():
            actual = current_by_pillar.get(pillar, 0)

            if actual < expected:
                missing = expected - actual
                fixes_needed.append({
                    'user_id': user_id,
                    'pillar': pillar,
                    'expected': expected,
                    'actual': actual,
                    'missing': missing
                })

    if not fixes_needed:
        print("All XP totals match! No repairs needed.")
        return

    print(f"Found {len(fixes_needed)} XP discrepancies:\n")

    for fix in fixes_needed:
        print(f"  User: {fix['user_id'][:8]}...")
        print(f"    Pillar: {fix['pillar']}")
        print(f"    Expected: {fix['expected']} XP")
        print(f"    Actual: {fix['actual']} XP")
        print(f"    Missing: {fix['missing']} XP")
        print()

    if dry_run:
        print("DRY RUN - No changes made.")
        print("Run with --live to apply fixes.")
        return

    # Apply fixes
    print("Applying fixes...")

    for fix in fixes_needed:
        result = supabase.table('user_skill_xp')\
            .upsert({
                'user_id': fix['user_id'],
                'pillar': fix['pillar'],
                'xp_amount': fix['expected'],
                'updated_at': datetime.utcnow().isoformat()
            }, on_conflict='user_id,pillar')\
            .execute()

        if result.data:
            print(f"  Fixed {fix['pillar']} for user {fix['user_id'][:8]}... (+{fix['missing']} XP)")
        else:
            print(f"  FAILED to fix {fix['pillar']} for user {fix['user_id'][:8]}...")

    print("\nRepair complete!")


if __name__ == '__main__':
    dry_run = '--live' not in sys.argv

    if '--help' in sys.argv or '-h' in sys.argv:
        print(__doc__)
        sys.exit(0)

    repair_missing_xp(dry_run=dry_run)
