#!/usr/bin/env python3
"""Quick check of XP data in database."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

# Get XP data
result = client.table('user_skill_xp').select('user_id, pillar, xp_amount').order('xp_amount', desc=True).limit(20).execute()
print('=== user_skill_xp table (top 20 by XP) ===')
for r in result.data:
    print(f"  {r['user_id'][:8]}... {r['pillar']}: {r['xp_amount']} XP")

# Get a specific user's total
if result.data:
    test_user = result.data[0]['user_id']
    user_xp = client.table('user_skill_xp').select('pillar, xp_amount').eq('user_id', test_user).execute()
    print(f"\n=== User {test_user[:8]} XP breakdown ===")
    total = 0
    for r in user_xp.data:
        print(f"  {r['pillar']}: {r['xp_amount']} XP")
        total += r['xp_amount']
    print(f"  TOTAL: {total} XP")
