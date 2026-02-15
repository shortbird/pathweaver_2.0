#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Check xp_award_failures table
try:
    failures = client.table('xp_award_failures').select('*').eq('user_id', user_id).order('created_at', desc=True).limit(10).execute()
    print("=== XP Award Failures ===")
    if failures.data:
        for f in failures.data:
            print(f"  Task: {f.get('task_id', 'N/A')[:8]}...")
            print(f"  Pillar: {f.get('pillar')}, XP: {f.get('xp_amount')}")
            print(f"  Reason: {f.get('reason')}")
            print(f"  Created: {f.get('created_at', '')[:16]}")
            print()
    else:
        print("  No failures logged")
except Exception as e:
    print(f"  Table may not exist or error: {e}")

# Find the specific task "Explore nature's interconnected systems"
print("\n=== Looking for the specific task ===")
task = client.table('user_quest_tasks').select(
    'id, title, pillar, xp_value, approval_status'
).eq('user_id', user_id).ilike('title', '%interconnected%').execute()

if task.data:
    t = task.data[0]
    task_id = t['id']
    print(f"Task: {t['title']}")
    print(f"ID: {task_id}")
    print(f"Pillar: {t['pillar']}")
    print(f"XP: {t['xp_value']}")
    print(f"Approval: {t['approval_status']}")

    # Check if completion exists
    completion = client.table('quest_task_completions').select('*').eq('user_quest_task_id', task_id).execute()
    print(f"\nCompletion record exists: {bool(completion.data)}")
    if completion.data:
        print(f"  Completed at: {completion.data[0].get('completed_at')}")
else:
    print("Task not found")
