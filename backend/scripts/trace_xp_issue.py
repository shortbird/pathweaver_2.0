#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

print("=== XP Issue Trace ===\n")

# Get user_skill_xp record with updated_at
xp_record = client.table('user_skill_xp').select('pillar, xp_amount, updated_at').eq('user_id', user_id).eq('pillar', 'wellness').execute()
if xp_record.data:
    r = xp_record.data[0]
    print(f"Wellness XP record:")
    print(f"  Amount: {r['xp_amount']}")
    print(f"  Last updated: {r['updated_at']}")

# Get the avian task completion
comp = client.table('quest_task_completions').select(
    '*, user_quest_tasks!inner(title, pillar, xp_value)'
).eq('user_id', user_id).order('completed_at', desc=True).limit(1).execute()

if comp.data:
    c = comp.data[0]
    t = c.get('user_quest_tasks', {})
    print(f"\nMost recent completion:")
    print(f"  Task: {t.get('title')}")
    print(f"  Pillar: {t.get('pillar')}, XP: {t.get('xp_value')}")
    print(f"  Completed at: {c['completed_at']}")

# Calculate expected vs actual
print(f"\n=== Expected vs Actual ===")
all_completions = client.table('quest_task_completions').select(
    'user_quest_tasks!inner(pillar, xp_value)'
).eq('user_id', user_id).execute()

expected = {}
for c in (all_completions.data or []):
    t = c.get('user_quest_tasks', {})
    pillar = t.get('pillar')
    xp = t.get('xp_value', 0)
    if pillar:
        expected[pillar] = expected.get(pillar, 0) + xp

print(f"Expected from completions: {expected}")

actual_xp = client.table('user_skill_xp').select('pillar, xp_amount').eq('user_id', user_id).execute()
actual = {r['pillar']: r['xp_amount'] for r in (actual_xp.data or []) if r['pillar'] in ['art', 'stem', 'wellness', 'communication', 'civics']}
print(f"Actual in user_skill_xp: {actual}")

print(f"\nExpected total: {sum(expected.values())}")
print(f"Actual total: {sum(actual.values())}")

# Check for discrepancy in wellness specifically
if 'wellness' in expected and 'wellness' in actual:
    diff = expected['wellness'] - actual['wellness']
    print(f"\nWellness discrepancy: {diff} XP")
