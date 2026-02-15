#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Check evidence documents
evidence = client.table('user_task_evidence_documents').select(
    'id, task_id, created_at'
).eq('user_id', user_id).order('created_at', desc=True).limit(10).execute()

print('=== Recent evidence document submissions ===')
for e in (evidence.data or []):
    print(f"  {e['created_at'][:16]}: task {e['task_id'][:8]}...")

print(f"\nTotal evidence docs: {len(evidence.data or [])}")

# Check most recent quest_task_completions
completions = client.table('quest_task_completions').select(
    'id, task_id, completed_at'
).eq('user_id', user_id).order('completed_at', desc=True).limit(10).execute()

print('\n=== Recent task completions (XP awarded) ===')
for c in (completions.data or []):
    print(f"  {c['completed_at'][:16]}: task {c['task_id'][:8]}...")

print(f"\nTotal completions: {len(completions.data or [])}")
