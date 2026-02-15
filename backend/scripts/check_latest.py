#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Get most recent completion with task info
comp = client.table('quest_task_completions').select(
    '*, user_quest_tasks!inner(title, pillar, xp_value)'
).eq('user_id', user_id).order('completed_at', desc=True).limit(1).execute()

if comp.data:
    c = comp.data[0]
    task = c.get('user_quest_tasks', {})
    print("=== Most Recent Task Completion ===")
    print(f"Task: {task.get('title')}")
    print(f"Pillar: {task.get('pillar')}")
    print(f"XP Value: {task.get('xp_value')}")
    print(f"Completed: {c.get('completed_at')}")

    # Get current XP for that pillar
    pillar = task.get('pillar')
    xp = client.table('user_skill_xp').select('xp_amount').eq('user_id', user_id).eq('pillar', pillar).execute()
    if xp.data:
        print(f"\nCurrent {pillar} XP total: {xp.data[0]['xp_amount']}")
else:
    print("No completions found")
