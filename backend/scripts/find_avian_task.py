#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Find the avian quest
quest = client.table('quests').select('id, title').ilike('title', '%avian%').execute()
if quest.data:
    quest_id = quest.data[0]['id']
    print(f"Quest: {quest.data[0]['title']}")
    print(f"Quest ID: {quest_id}")

    # Get user's tasks for this quest
    tasks = client.table('user_quest_tasks').select(
        'id, title, pillar, xp_value'
    ).eq('user_id', user_id).eq('quest_id', quest_id).execute()

    print(f"\n=== Tasks in this quest ({len(tasks.data or [])}) ===")
    for t in (tasks.data or []):
        task_id = t['id']
        # Check completion
        comp = client.table('quest_task_completions').select('id, completed_at').eq('user_quest_task_id', task_id).execute()
        has_comp = "COMPLETED" if comp.data else "not completed"
        print(f"  [{has_comp}] {t['title'][:50]}")
        print(f"      Pillar: {t['pillar']}, XP: {t['xp_value']}")
        if comp.data:
            print(f"      Completed: {comp.data[0]['completed_at'][:16]}")
        print()
else:
    print("Quest not found")

# Also check most recent completions
print("\n=== Most recent completions (last 3) ===")
comps = client.table('quest_task_completions').select(
    '*, user_quest_tasks!inner(title, pillar, xp_value)'
).eq('user_id', user_id).order('completed_at', desc=True).limit(3).execute()

for c in (comps.data or []):
    t = c.get('user_quest_tasks', {})
    print(f"  {c['completed_at'][:16]}: {t.get('title', 'N/A')[:40]}")
    print(f"      Pillar: {t.get('pillar')}, XP: {t.get('xp_value')}")
