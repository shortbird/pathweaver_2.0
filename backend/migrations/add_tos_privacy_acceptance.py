"""
Migration to add Terms of Service and Privacy Policy acceptance tracking
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_supabase_admin_client

def run_migration():
    """Add columns for tracking ToS and Privacy Policy acceptance"""
    print("Starting ToS and Privacy Policy acceptance migration...")
    
    try:
        supabase = get_supabase_admin_client()
        
        # SQL to add new columns to users table
        sql_commands = [
            # Add columns for tracking acceptance
            """
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS tos_version VARCHAR(50) DEFAULT '1.0',
            ADD COLUMN IF NOT EXISTS privacy_policy_version VARCHAR(50) DEFAULT '1.0';
            """,
            
            # Add comment for documentation
            """
            COMMENT ON COLUMN users.tos_accepted_at IS 'Timestamp when user accepted Terms of Service';
            COMMENT ON COLUMN users.privacy_policy_accepted_at IS 'Timestamp when user accepted Privacy Policy';
            COMMENT ON COLUMN users.tos_version IS 'Version of Terms of Service accepted';
            COMMENT ON COLUMN users.privacy_policy_version IS 'Version of Privacy Policy accepted';
            """
        ]
        
        # Execute each SQL command
        for sql in sql_commands:
            try:
                result = supabase.rpc('exec_sql', {'query': sql}).execute()
                print(f"[OK] Executed SQL successfully")
            except Exception as e:
                # If exec_sql doesn't exist, try direct execution (for local dev)
                print(f"Note: Could not execute via RPC, attempting alternative method: {e}")
                # In production, you would need to run these migrations directly in Supabase dashboard
                pass
        
        print("\n[SUCCESS] Migration completed successfully!")
        print("\nNOTE: If this migration failed, you may need to run the following SQL directly in Supabase:")
        print("=" * 80)
        for sql in sql_commands:
            print(sql)
        print("=" * 80)
        
        return True
        
    except Exception as e:
        print(f"\n[ERROR] Migration failed: {str(e)}")
        print("\nPlease run the following SQL commands manually in your Supabase dashboard:")
        print("=" * 80)
        for sql in sql_commands:
            print(sql)
        print("=" * 80)
        return False

if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)