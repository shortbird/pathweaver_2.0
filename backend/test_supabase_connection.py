#!/usr/bin/env python3
"""Test Supabase connection from Railway environment"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_connection():
    """Test Supabase connection with detailed diagnostics"""
    print("=" * 60)
    print("SUPABASE CONNECTION TEST")
    print("=" * 60)
    
    # Check environment variables
    print("\n1. CHECKING ENVIRONMENT VARIABLES:")
    print("-" * 40)
    
    env_vars = {
        'SUPABASE_URL': os.getenv('SUPABASE_URL'),
        'SUPABASE_KEY': os.getenv('SUPABASE_KEY'),
        'SUPABASE_ANON_KEY': os.getenv('SUPABASE_ANON_KEY'),
        'SUPABASE_SERVICE_KEY': os.getenv('SUPABASE_SERVICE_KEY'),
        'SUPABASE_SERVICE_ROLE_KEY': os.getenv('SUPABASE_SERVICE_ROLE_KEY'),
        'RAILWAY_ENVIRONMENT': os.getenv('RAILWAY_ENVIRONMENT'),
        'PORT': os.getenv('PORT')
    }
    
    for key, value in env_vars.items():
        if value:
            if 'KEY' in key:
                # Mask keys for security
                masked = value[:10] + '...' + value[-10:] if len(value) > 20 else 'TOO_SHORT'
                print(f"✓ {key}: {masked}")
            else:
                print(f"✓ {key}: {value}")
        else:
            print(f"✗ {key}: NOT SET")
    
    # Check which keys are available
    anon_key = os.getenv('SUPABASE_KEY') or os.getenv('SUPABASE_ANON_KEY')
    service_key = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    url = os.getenv('SUPABASE_URL')
    
    if not url:
        print("\n❌ FATAL: SUPABASE_URL is not set!")
        return False
    
    if not anon_key:
        print("\n❌ FATAL: No anon key found (SUPABASE_KEY or SUPABASE_ANON_KEY)!")
        return False
    
    print("\n2. ATTEMPTING CONNECTION:")
    print("-" * 40)
    
    try:
        from supabase import create_client
        
        # Test anon client
        print("Testing anonymous client...")
        client = create_client(url, anon_key)
        
        # Try a simple query to test connection
        result = client.table('site_settings').select('*').limit(1).execute()
        print(f"✓ Anonymous client connected! Got {len(result.data)} records")
        
        # Test service client if available
        if service_key:
            print("\nTesting service role client...")
            admin_client = create_client(url, service_key)
            result = admin_client.table('users').select('count').limit(1).execute()
            print(f"✓ Service client connected!")
        else:
            print("\n⚠ Service role key not set - admin functions won't work")
        
        print("\n3. TESTING RLS POLICIES:")
        print("-" * 40)
        
        # Test public access
        print("Testing public access to quests...")
        result = client.table('quests').select('id').eq('is_active', True).limit(1).execute()
        print(f"✓ Can read public quests: {len(result.data)} records")
        
        return True
        
    except ImportError as e:
        print(f"\n❌ Failed to import supabase library: {e}")
        print("Run: pip install supabase")
        return False
        
    except Exception as e:
        print(f"\n❌ Connection failed: {e}")
        print("\nPossible causes:")
        print("1. Invalid Supabase URL or keys")
        print("2. Network connectivity issues")
        print("3. RLS policies blocking access")
        print("4. Supabase project paused or deleted")
        return False

if __name__ == "__main__":
    success = test_connection()
    print("\n" + "=" * 60)
    if success:
        print("✅ SUPABASE CONNECTION SUCCESSFUL!")
    else:
        print("❌ SUPABASE CONNECTION FAILED!")
        print("\nAction items:")
        print("1. Verify environment variables in Railway dashboard")
        print("2. Check Supabase project is active at https://app.supabase.com")
        print("3. Verify RLS policies allow access")
        print("4. Check Railway logs for more details")
    print("=" * 60)
    
    sys.exit(0 if success else 1)