#!/usr/bin/env python3
"""Add missing XP from completions since last user_skill_xp update."""
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client

dry_run = '--live' not in sys.argv
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

print("=" * 60)
print("Add Missing XP from Recent Completions")
print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
print("=" * 60)

# Get user_skill_xp records with their last update timestamps
xp_records = client.table('user_skill_xp').select('id, pillar, xp_amount, updated_at').eq('user_id', user_id).in_('pillar', ['art', 'stem', 'wellness', 'communication', 'civics']).execute()

pillar_data = {}
for r in (xp_records.data or []):
    pillar_data[r['pillar']] = {
        'id': r['id'],
        'current_xp': r['xp_amount'],
        'updated_at': r['updated_at']
    }

# Get all completions
all_completions = client.table('quest_task_completions').select(
    'completed_at, user_quest_tasks!inner(pillar, xp_value)'
).eq('user_id', user_id).execute()

# Calculate XP that should have been added after each pillar's last update
missing_xp = {}
for c in (all_completions.data or []):
    t = c.get('user_quest_tasks', {})
    pillar = t.get('pillar')
    xp = t.get('xp_value', 0)
    completed_at = c['completed_at']

    if not pillar or pillar not in pillar_data:
        continue

    last_updated = pillar_data[pillar]['updated_at']

    # If completion was after last update, XP was missed
    if completed_at > last_updated:
        missing_xp[pillar] = missing_xp.get(pillar, 0) + xp

print(f"\n=== Missing XP by pillar ===")
total_missing = 0
for pillar, xp in missing_xp.items():
    current = pillar_data[pillar]['current_xp']
    print(f"  {pillar}: +{xp} XP (current: {current}, new: {current + xp})")
    total_missing += xp

print(f"\nTotal missing: {total_missing} XP")

if not missing_xp:
    print("\nNo missing XP to add!")
    sys.exit(0)

if dry_run:
    print("\nDRY RUN - no changes made. Run with --live to apply.")
    sys.exit(0)

# Apply fixes
print("\nApplying fixes...")
for pillar, xp_to_add in missing_xp.items():
    record_id = pillar_data[pillar]['id']
    current = pillar_data[pillar]['current_xp']
    new_total = current + xp_to_add

    client.table('user_skill_xp').update({
        'xp_amount': new_total,
        'updated_at': datetime.utcnow().isoformat()
    }).eq('id', record_id).execute()

    print(f"  {pillar}: {current} -> {new_total} (+{xp_to_add})")

# Verify new total
all_xp = client.table('user_skill_xp').select('xp_amount').eq('user_id', user_id).in_('pillar', ['art', 'stem', 'wellness', 'communication', 'civics']).execute()
new_total = sum(r['xp_amount'] for r in (all_xp.data or []))
print(f"\nNew total XP: {new_total}")
