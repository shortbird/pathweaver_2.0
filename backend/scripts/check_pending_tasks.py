#!/usr/bin/env python3
"""Check pending/recent tasks for a user."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

# Get tanner's user ID
tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Get recent tasks with approval status
tasks = client.table('user_quest_tasks').select(
    'id, title, pillar, xp_value, approval_status, created_at, updated_at'
).eq('user_id', user_id).order('created_at', desc=True).limit(15).execute()

print(f"=== Recent tasks for tannerbowman ===\n")

by_status = {'approved': 0, 'pending': 0, 'rejected': 0, 'other': 0}

for t in (tasks.data or []):
    status = t.get('approval_status', 'unknown')
    title = t.get('title', 'Unknown')[:50]
    xp = t.get('xp_value', 0)
    created = t.get('created_at', '')[:10]

    if status in by_status:
        by_status[status] += 1
    else:
        by_status['other'] += 1

    status_icon = 'OK' if status == 'approved' else 'PENDING' if status == 'pending' else 'X'
    print(f"  [{status_icon}] {title}")
    print(f"      Status: {status}, XP: {xp}, Created: {created}")
    print()

print(f"Summary: {by_status}")

# Check quest_task_completions for this user
completions = client.table('quest_task_completions').select('id').eq('user_id', user_id).execute()
print(f"\nTotal task completions in quest_task_completions: {len(completions.data or [])}")

# Check if there are approved tasks without completions
approved_tasks = client.table('user_quest_tasks').select('id').eq('user_id', user_id).eq('approval_status', 'approved').execute()
print(f"Total approved tasks in user_quest_tasks: {len(approved_tasks.data or [])}")
