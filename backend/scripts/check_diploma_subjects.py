#!/usr/bin/env python3
"""Check if tasks have diploma_subjects set."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

# Get tanner's user ID
tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Get completed tasks with diploma_subjects
completions = client.table('quest_task_completions').select(
    'id, task_id, user_quest_tasks(id, title, pillar, xp_value, diploma_subjects)'
).eq('user_id', user_id).limit(10).execute()

print(f"=== Completed tasks for tannerbowman ===\n")

tasks_with_subjects = 0
tasks_without_subjects = 0

for c in (completions.data or []):
    task = c.get('user_quest_tasks', {})
    title = task.get('title', 'Unknown')[:40]
    pillar = task.get('pillar', 'N/A')
    xp = task.get('xp_value', 0)
    diploma_subjects = task.get('diploma_subjects')

    if diploma_subjects:
        tasks_with_subjects += 1
        print(f"  {title}")
        print(f"    Pillar: {pillar}, XP: {xp}")
        print(f"    Diploma subjects: {diploma_subjects}")
    else:
        tasks_without_subjects += 1
        print(f"  {title}")
        print(f"    Pillar: {pillar}, XP: {xp}")
        print(f"    Diploma subjects: NONE")
    print()

print(f"Summary: {tasks_with_subjects} with diploma_subjects, {tasks_without_subjects} without")
