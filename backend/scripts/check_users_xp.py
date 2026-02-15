#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

# Check if users table has total_xp and if it's being used
result = client.table('users').select('id, email, total_xp').not_.is_('total_xp', 'null').limit(10).execute()
print('=== users with total_xp set ===')
if result.data:
    for r in result.data:
        print(f"  {r['email']}: {r.get('total_xp')} XP")
else:
    print("  No users have total_xp set")

# Check what tannerbowman sees
tanner = client.table('users').select('id, email, total_xp').eq('email', 'tannerbowman@gmail.com').execute()
if tanner.data:
    user_id = tanner.data[0]['id']
    print(f"\n=== tannerbowman@gmail.com ===")
    print(f"  users.total_xp: {tanner.data[0].get('total_xp', 'NULL')}")

    # Get from user_skill_xp
    skill_xp = client.table('user_skill_xp').select('pillar, xp_amount').eq('user_id', user_id).execute()
    total = sum(r['xp_amount'] for r in (skill_xp.data or []))
    print(f"  user_skill_xp total: {total}")
    for r in (skill_xp.data or []):
        print(f"    {r['pillar']}: {r['xp_amount']}")
