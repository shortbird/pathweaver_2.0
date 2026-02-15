#!/usr/bin/env python3
"""Check if recent completions added XP."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
from datetime import datetime, timedelta

client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Get completions from the last 30 days
thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()

recent_completions = client.table('quest_task_completions').select(
    '*, user_quest_tasks!inner(title, pillar, xp_value)'
).eq('user_id', user_id).gte('completed_at', thirty_days_ago).order('completed_at', desc=True).execute()

print(f"=== Completions in last 30 days ===\n")

recent_xp_by_pillar = {}
for c in (recent_completions.data or []):
    t = c.get('user_quest_tasks', {})
    pillar = t.get('pillar')
    xp = t.get('xp_value', 0)
    title = t.get('title', 'N/A')[:40]
    completed = c['completed_at'][:10]

    if pillar:
        recent_xp_by_pillar[pillar] = recent_xp_by_pillar.get(pillar, 0) + xp

    print(f"  {completed}: {title}")
    print(f"      {pillar}: {xp} XP")

print(f"\n=== XP that should have been added in last 30 days ===")
print(f"  {recent_xp_by_pillar}")
print(f"  Total: {sum(recent_xp_by_pillar.values())} XP")

# Check when user_skill_xp records were last updated
print(f"\n=== user_skill_xp last updated ===")
xp_records = client.table('user_skill_xp').select('pillar, xp_amount, updated_at').eq('user_id', user_id).in_('pillar', ['art', 'stem', 'wellness', 'communication', 'civics']).execute()

for r in (xp_records.data or []):
    updated = r['updated_at'][:10] if r.get('updated_at') else 'never'
    print(f"  {r['pillar']}: {r['xp_amount']} XP (last updated: {updated})")
