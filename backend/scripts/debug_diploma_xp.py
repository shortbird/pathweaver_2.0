#!/usr/bin/env python3
"""Debug: trace exactly what diploma page gets for XP."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client

client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

# Get a user with completions
user_result = client.table('quest_task_completions').select('user_id').limit(1).execute()
if not user_result.data:
    print("No task completions found")
    exit(1)

user_id = user_result.data[0]['user_id']
print(f"Testing user: {user_id}")
print()

# 1. What's in user_skill_xp for this user?
print("=== user_skill_xp table ===")
xp_result = client.table('user_skill_xp').select('pillar, xp_amount').eq('user_id', user_id).execute()
total_from_table = 0
for r in (xp_result.data or []):
    print(f"  {r['pillar']}: {r['xp_amount']} XP")
    total_from_table += r['xp_amount']
print(f"  TABLE TOTAL: {total_from_table} XP")

# 2. Simulate what get_skill_xp does in portfolio_service
print("\n=== Simulating PortfolioService.get_skill_xp() ===")
result = client.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
xp_by_category = {}
for record in (result.data or []):
    category = record.get('pillar', record.get('skill_category'))
    xp = record.get('xp_amount', record.get('total_xp', 0))
    if category:
        xp_by_category[category] = xp_by_category.get(category, 0) + xp
print(f"  Result: {xp_by_category}")
print(f"  Total: {sum(xp_by_category.values())} XP")

# 3. Simulate helpers.calculate_user_xp
print("\n=== Simulating helpers.calculate_user_xp() ===")
SKILL_CATEGORIES = ['art', 'stem', 'wellness', 'communication', 'civics']
skill_breakdown = {cat: 0 for cat in SKILL_CATEGORIES}
total_xp = 0

skill_xp = client.table('user_skill_xp').select('pillar, xp_amount').eq('user_id', user_id).execute()
if skill_xp.data:
    for record in skill_xp.data:
        pillar = record.get('pillar')
        xp_amount = record.get('xp_amount', 0)

        if pillar in skill_breakdown:
            total_xp += xp_amount
            skill_breakdown[pillar] += xp_amount
        else:
            print(f"  WARNING: pillar '{pillar}' not in SKILL_CATEGORIES, XP not counted!")

print(f"  Total XP: {total_xp}")
print(f"  Breakdown: {skill_breakdown}")

# 4. Count task completions for reference
print("\n=== Task completions for this user ===")
completions = client.table('quest_task_completions').select(
    'id, user_quest_tasks(pillar, xp_value)'
).eq('user_id', user_id).execute()
expected_xp = {}
for c in (completions.data or []):
    task = c.get('user_quest_tasks')
    if task:
        pillar = task.get('pillar')
        xp = task.get('xp_value', 0)
        expected_xp[pillar] = expected_xp.get(pillar, 0) + xp

print(f"  Expected from completions: {expected_xp}")
print(f"  Expected total: {sum(expected_xp.values())} XP")

# 5. Check if there's a mismatch
print("\n=== COMPARISON ===")
all_match = True
for pillar in SKILL_CATEGORIES:
    actual = skill_breakdown.get(pillar, 0)
    expected = expected_xp.get(pillar, 0)
    status = "OK" if actual == expected else "MISMATCH"
    if actual != expected:
        all_match = False
    print(f"  {pillar}: actual={actual}, expected={expected} [{status}]")

if all_match:
    print("\nAll XP values match expectations!")
else:
    print("\nMISMATCH DETECTED - run repair_missing_xp.py --live")
