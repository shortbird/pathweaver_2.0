#!/usr/bin/env python3
"""Check user_subject_xp for diploma credits."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Check user_subject_xp
print("=== user_subject_xp (diploma credits source) ===")
subject_xp = client.table('user_subject_xp').select('*').eq('user_id', user_id).execute()
if subject_xp.data:
    for r in subject_xp.data:
        print(f"  {r.get('school_subject')}: {r.get('xp_amount')} XP")
        print(f"      Last updated: {r.get('updated_at', 'N/A')[:16] if r.get('updated_at') else 'N/A'}")
else:
    print("  No records found!")

# Check what diploma_subjects are on completed tasks
print("\n=== diploma_subjects on recent completions ===")
completions = client.table('quest_task_completions').select(
    'user_quest_tasks!inner(title, xp_value, diploma_subjects)'
).eq('user_id', user_id).order('completed_at', desc=True).limit(5).execute()

for c in (completions.data or []):
    t = c.get('user_quest_tasks', {})
    print(f"  {t.get('title', 'N/A')[:40]}")
    print(f"      XP: {t.get('xp_value')}, diploma_subjects: {t.get('diploma_subjects')}")
