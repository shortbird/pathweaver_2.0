#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
c = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
tanner = c.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Check wellness
r = c.table('user_skill_xp').select('id, xp_amount, updated_at').eq('user_id', user_id).eq('pillar', 'wellness').execute()
print(f"Wellness: {r.data[0]['xp_amount']} XP")
print(f"Updated: {r.data[0]['updated_at']}")

# Check today's completion
comp = c.table('quest_task_completions').select(
    'completed_at, user_quest_tasks!inner(xp_value, pillar)'
).eq('user_id', user_id).order('completed_at', desc=True).limit(1).execute()
print(f"\nLast completion: {comp.data[0]['completed_at']}")
print(f"Pillar: {comp.data[0]['user_quest_tasks']['pillar']}")
print(f"XP value: {comp.data[0]['user_quest_tasks']['xp_value']}")

# The completion time vs updated time
comp_time = comp.data[0]['completed_at']
update_time = r.data[0]['updated_at']

if comp_time > update_time:
    print(f"\nCompletion ({comp_time}) is AFTER last update ({update_time})")
    print("This means the 75 XP wasn't added!")

    # Add it
    current = r.data[0]['xp_amount']
    new = current + 75
    print(f"Adding 75 XP: {current} -> {new}")

    c.table('user_skill_xp').update({'xp_amount': new}).eq('id', r.data[0]['id']).execute()
    print("Done!")
else:
    print(f"\nCompletion was BEFORE last update - XP should be included")
