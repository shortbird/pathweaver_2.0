#!/usr/bin/env python3
"""Check recent task completions vs approved tasks."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

# Get tanner's user ID
tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Get recent approved tasks (last 15)
recent_tasks = client.table('user_quest_tasks').select(
    'id, title, xp_value, created_at'
).eq('user_id', user_id).eq('approval_status', 'approved').order('created_at', desc=True).limit(15).execute()

# Get all completions for this user
completions = client.table('quest_task_completions').select(
    'user_quest_task_id, completed_at'
).eq('user_id', user_id).execute()

completion_task_ids = {c['user_quest_task_id'] for c in (completions.data or [])}

print(f"=== Recent approved tasks - completion check ===\n")
print(f"Total completions: {len(completion_task_ids)}")
print()

missing_completions = []
for t in (recent_tasks.data or []):
    task_id = t['id']
    title = t['title'][:50]
    created = t['created_at'][:10]
    has_completion = task_id in completion_task_ids

    status = "HAS COMPLETION" if has_completion else "NO COMPLETION"
    print(f"  [{status}] {title}")
    print(f"      Task ID: {task_id[:8]}..., Created: {created}")

    if not has_completion:
        missing_completions.append(t)
    print()

print(f"\n=== Summary ===")
print(f"Tasks with completions: {len(recent_tasks.data) - len(missing_completions)}")
print(f"Tasks WITHOUT completions: {len(missing_completions)}")

if missing_completions:
    print(f"\nThese approved tasks have NO completion record (no XP awarded):")
    for t in missing_completions:
        print(f"  - {t['title'][:50]} ({t['xp_value']} XP)")
