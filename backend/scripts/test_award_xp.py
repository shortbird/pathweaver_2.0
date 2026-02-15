#!/usr/bin/env python3
"""Test the award_xp function directly."""
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from dotenv import load_dotenv
load_dotenv('.env')

# Now test the XP service
from services.xp_service import XPService

xp_service = XPService()

# Get tanner's user ID
from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

# Get current wellness XP
before = client.table('user_skill_xp').select('xp_amount').eq('user_id', user_id).eq('pillar', 'wellness').execute()
print(f"Wellness XP before: {before.data[0]['xp_amount'] if before.data else 'N/A'}")

# Try to award 1 XP
print("\nAttempting to award 1 wellness XP...")
try:
    result = xp_service.award_xp(user_id, 'wellness', 1, 'test')
    print(f"award_xp returned: {result}")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()

# Check after
after = client.table('user_skill_xp').select('xp_amount, updated_at').eq('user_id', user_id).eq('pillar', 'wellness').execute()
print(f"\nWellness XP after: {after.data[0]['xp_amount'] if after.data else 'N/A'}")
print(f"Updated at: {after.data[0]['updated_at'] if after.data else 'N/A'}")
