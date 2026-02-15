#!/usr/bin/env python3
"""Remove the 1 test XP that was added."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Get current wellness XP
current = client.table('user_skill_xp').select('id, xp_amount').eq('user_id', user_id).eq('pillar', 'wellness').execute()
if current.data:
    record_id = current.data[0]['id']
    current_xp = current.data[0]['xp_amount']

    # Subtract the 1 test XP
    new_xp = current_xp - 1

    print(f"Wellness XP: {current_xp} -> {new_xp}")

    client.table('user_skill_xp').update({'xp_amount': new_xp}).eq('id', record_id).execute()
    print("Fixed!")

    # Verify total
    all_xp = client.table('user_skill_xp').select('xp_amount').eq('user_id', user_id).in_('pillar', ['art', 'stem', 'wellness', 'communication', 'civics']).execute()
    total = sum(r['xp_amount'] for r in (all_xp.data or []))
    print(f"Total XP: {total}")
