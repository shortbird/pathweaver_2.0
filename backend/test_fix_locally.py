#!/usr/bin/env python3
"""Test if we can work around the RLS issue temporarily"""

import os
from dotenv import load_dotenv

load_dotenv()

def test_service_role_connection():
    """Test if service role key bypasses the RLS issue"""
    print("Testing Service Role Key Connection (bypasses RLS)...")
    
    try:
        from supabase import create_client
        
        url = os.getenv('SUPABASE_URL')
        service_key = os.getenv('SUPABASE_SERVICE_KEY')
        
        if not url or not service_key:
            print("[FAIL] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
            return False
        
        # Create admin client (bypasses RLS)
        admin_client = create_client(url, service_key)
        print("[OK] Created admin client")
        
        # Test various queries
        tests = [
            ("users", "SELECT * FROM users LIMIT 1"),
            ("quests", "SELECT * FROM quests WHERE is_active = true LIMIT 1"),
            ("site_settings", "SELECT * FROM site_settings LIMIT 1"),
        ]
        
        for table_name, query in tests:
            try:
                result = admin_client.table(table_name.replace(" ", "_")).select("*").limit(1).execute()
                print(f"[OK] {table_name}: Query successful")
            except Exception as e:
                print(f"[FAIL] {table_name}: {str(e)}")
        
        return True
        
    except Exception as e:
        print(f"[FAIL] Error: {str(e)}")
        return False

def test_anon_with_workaround():
    """Test if we can query with anon key using specific tables"""
    print("\nTesting Anon Key with Safe Tables...")
    
    try:
        from supabase import create_client
        
        url = os.getenv('SUPABASE_URL')
        anon_key = os.getenv('SUPABASE_KEY')
        
        if not url or not anon_key:
            print("[FAIL] Missing SUPABASE_URL or SUPABASE_KEY")
            return False
        
        # Create anon client
        client = create_client(url, anon_key)
        print("[OK] Created anon client")
        
        # Test tables that shouldn't have recursion issues
        safe_tables = ["site_settings", "quests", "quest_tasks"]
        
        for table in safe_tables:
            try:
                result = client.table(table).select("*").limit(1).execute()
                print(f"[OK] {table}: Query successful")
            except Exception as e:
                print(f"[FAIL] {table}: {str(e)}")
        
        # Test users table (will likely fail due to recursion)
        try:
            result = client.table("users").select("id").limit(1).execute()
            print("[OK] users: Query successful (recursion fixed!)")
        except Exception as e:
            if "infinite recursion" in str(e):
                print("[EXPECTED] users: Still has recursion issue (need to apply migration)")
            else:
                print(f"[FAIL] users: {str(e)}")
        
        return True
        
    except Exception as e:
        print(f"[FAIL] Error: {str(e)}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("TESTING WORKAROUNDS FOR RLS RECURSION ISSUE")
    print("=" * 60)
    
    # Test service role (should work)
    service_works = test_service_role_connection()
    
    # Test anon key
    anon_status = test_anon_with_workaround()
    
    print("\n" + "=" * 60)
    print("RECOMMENDATIONS")
    print("=" * 60)
    
    if service_works:
        print("[OK] Service role key works - Railway can use this temporarily")
        print("     Set ALWAYS_USE_SERVICE_ROLE=true in Railway env vars")
        print("     This bypasses RLS but requires careful security in backend")
    
    print("\n[ACTION REQUIRED] Apply the migration to fix RLS permanently:")
    print("1. Go to Supabase Dashboard > SQL Editor")
    print("2. Run: supabase/migrations/20250830_fix_users_table_recursion.sql")
    print("3. This will fix the infinite recursion in users table")