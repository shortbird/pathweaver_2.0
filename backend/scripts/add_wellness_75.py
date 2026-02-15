#!/usr/bin/env python3
import os
from datetime import datetime
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
c = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
tanner = c.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

r = c.table('user_skill_xp').select('id, xp_amount').eq('user_id', user_id).eq('pillar', 'wellness').execute()
current = r.data[0]['xp_amount']
new = current + 75

print(f"Adding 75 wellness XP from today's task")
print(f"Wellness: {current} -> {new}")

c.table('user_skill_xp').update({
    'xp_amount': new,
    'updated_at': datetime.utcnow().isoformat()
}).eq('id', r.data[0]['id']).execute()

# Show new total
all_xp = c.table('user_skill_xp').select('xp_amount').eq('user_id', user_id).in_('pillar', ['art', 'stem', 'wellness', 'communication', 'civics']).execute()
total = sum(x['xp_amount'] for x in all_xp.data)
print(f"\nNew total XP: {total}")
