#!/usr/bin/env python3
"""Test script to diagnose Supabase connection issues"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_environment_variables():
    """Check if all required Supabase environment variables are set"""
    print("=" * 60)
    print("CHECKING ENVIRONMENT VARIABLES")
    print("=" * 60)
    
    # Check multiple possible env var names (Railway might use different names)
    env_checks = {
        'SUPABASE_URL': [
            'SUPABASE_URL',
            'VITE_SUPABASE_URL', 
            'supabase_url'
        ],
        'SUPABASE_KEY': [
            'SUPABASE_KEY',  # Railway uses this
            'SUPABASE_ANON_KEY',
            'VITE_SUPABASE_ANON_KEY',
            'supabase_anon_key'
        ],
        'SUPABASE_SERVICE_KEY': [
            'SUPABASE_SERVICE_KEY',  # Railway uses this
            'SUPABASE_SERVICE_ROLE_KEY',
            'supabase_service_role_key'
        ]
    }
    
    found_vars = {}
    for var_name, possible_names in env_checks.items():
        for name in possible_names:
            value = os.getenv(name)
            if value:
                found_vars[var_name] = (name, value)
                print(f"[OK] {var_name} found as {name}: {value[:20]}...")
                break
        else:
            print(f"[FAIL] {var_name} NOT FOUND in any of: {', '.join(possible_names)}")
    
    return found_vars

def test_supabase_connection(env_vars):
    """Test actual connection to Supabase"""
    print("\n" + "=" * 60)
    print("TESTING SUPABASE CONNECTION")
    print("=" * 60)
    
    if 'SUPABASE_URL' not in env_vars or 'SUPABASE_KEY' not in env_vars:
        print("[FAIL] Cannot test connection - missing required environment variables")
        return False
    
    try:
        from supabase import create_client, Client
        
        url = env_vars['SUPABASE_URL'][1]
        key = env_vars['SUPABASE_KEY'][1]
        
        print(f"Attempting connection to: {url[:30]}...")
        
        # Test anon client
        client = create_client(url, key)
        print("[OK] Created Supabase client successfully")
        
        # Test basic query
        try:
            result = client.table('site_settings').select('*').limit(1).execute()
            print("[OK] Successfully queried database (site_settings table)")
            return True
        except Exception as e:
            print(f"[FAIL] Failed to query database: {str(e)}")
            
            # Try a simpler auth check
            try:
                # Check if we can at least connect to auth
                auth_response = client.auth.get_session()
                print("[OK] Can connect to Supabase Auth service")
            except Exception as auth_e:
                print(f"[FAIL] Cannot connect to Supabase Auth: {str(auth_e)}")
            
            return False
            
    except ImportError:
        print("[FAIL] supabase-py library not installed")
        return False
    except Exception as e:
        print(f"[FAIL] Failed to create Supabase client: {str(e)}")
        return False

def test_service_key_connection(env_vars):
    """Test service role key connection"""
    print("\n" + "=" * 60)
    print("TESTING SERVICE ROLE KEY CONNECTION")
    print("=" * 60)
    
    if 'SUPABASE_SERVICE_KEY' not in env_vars:
        print("[WARN] Service role key not found - admin functions will not work")
        return False
    
    try:
        from supabase import create_client
        
        url = env_vars['SUPABASE_URL'][1]
        service_key = env_vars['SUPABASE_SERVICE_KEY'][1]
        
        print(f"Testing service role connection...")
        
        # Test service client
        admin_client = create_client(url, service_key)
        print("[OK] Created admin Supabase client successfully")
        
        # Test query with service role
        try:
            result = admin_client.table('users').select('id').limit(1).execute()
            print("[OK] Successfully queried with service role key")
            return True
        except Exception as e:
            print(f"[FAIL] Failed to query with service role: {str(e)}")
            return False
            
    except Exception as e:
        print(f"[FAIL] Failed to create admin client: {str(e)}")
        return False

def check_railway_specific():
    """Check Railway-specific environment settings"""
    print("\n" + "=" * 60)
    print("RAILWAY-SPECIFIC CHECKS")
    print("=" * 60)
    
    # Check if we're running on Railway
    railway_env = os.getenv('RAILWAY_ENVIRONMENT')
    if railway_env:
        print(f"[OK] Running on Railway (environment: {railway_env})")
    else:
        print("[INFO] Not running on Railway (local environment)")
    
    # Check PORT
    port = os.getenv('PORT')
    if port:
        print(f"[OK] PORT is set: {port}")
    else:
        print("[WARN] PORT not set (will default to 5001)")
    
    # Check Flask environment
    flask_env = os.getenv('FLASK_ENV')
    print(f"Flask environment: {flask_env or 'not set (defaults to development)'}")

def main():
    print("\n" + "=" * 60)
    print("SUPABASE CONNECTION DIAGNOSTIC TOOL")
    print("=" * 60)
    
    # Test environment variables
    env_vars = test_environment_variables()
    
    # Check Railway-specific settings
    check_railway_specific()
    
    # Test connections
    anon_success = test_supabase_connection(env_vars)
    service_success = test_service_key_connection(env_vars)
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    if not env_vars.get('SUPABASE_URL') or not env_vars.get('SUPABASE_KEY'):
        print("[ERROR] CRITICAL: Missing required Supabase configuration")
        print("\nFor Railway deployment, ensure these variables are set:")
        print("  1. SUPABASE_URL - Your Supabase project URL")
        print("  2. SUPABASE_KEY - Your Supabase anon/public key")
        print("  3. SUPABASE_SERVICE_KEY - Your Supabase service role key (for admin)")
        sys.exit(1)
    elif not anon_success:
        print("[ERROR] Connection failed - check your Supabase keys and network")
        print("\nPossible issues:")
        print("  1. Invalid SUPABASE_KEY - regenerate in Supabase dashboard")
        print("  2. Network/firewall blocking connection")
        print("  3. Supabase project paused or deleted")
        print("  4. RLS policies blocking access")
        sys.exit(1)
    elif not service_success:
        print("[WARN] Basic connection works but service role key missing/invalid")
        print("   Admin functions will not work properly")
        sys.exit(0)
    else:
        print("[SUCCESS] All connections successful!")
        sys.exit(0)

if __name__ == "__main__":
    main()
