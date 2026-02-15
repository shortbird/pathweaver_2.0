#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

# Check the Feb 15 task
task_id = 'd2b71b75'  # From the evidence output

# Get task details
task = client.table('user_quest_tasks').select(
    'id, title, pillar, xp_value'
).ilike('id', f'{task_id}%').execute()

if task.data:
    t = task.data[0]
    print(f"=== Feb 15 Task ===")
    print(f"Title: {t['title']}")
    print(f"Pillar: {t['pillar']}")
    print(f"XP Value: {t['xp_value']}")

    # Check if this XP is in user_skill_xp
    tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
    user_id = tanner.data[0]['id']

    skill_xp = client.table('user_skill_xp').select('pillar, xp_amount').eq('user_id', user_id).eq('pillar', t['pillar']).execute()
    if skill_xp.data:
        print(f"\nCurrent {t['pillar']} XP: {skill_xp.data[0]['xp_amount']}")
else:
    print("Task not found")
