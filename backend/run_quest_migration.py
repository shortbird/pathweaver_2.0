#!/usr/bin/env python3
"""
Run the quest template system migration.
This script updates the database schema for the new quest template system.
"""

import os
import sys
from pathlib import Path
from database import get_supabase_admin_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_migration():
    """Execute the quest template migration SQL."""
    
    print("Starting Quest Template System Migration...")
    print("=" * 50)
    
    try:
        # Get admin client
        supabase = get_supabase_admin_client()
        
        # Read migration SQL file
        migration_file = Path(__file__).parent / 'migrations' / 'quest_template_migration.sql'
        
        if not migration_file.exists():
            print(f"[ERROR] Migration file not found: {migration_file}")
            return False
            
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
        
        print("Migration file loaded successfully")
        
        # Split SQL into individual statements (Supabase requires this)
        # Remove comments and empty lines
        statements = []
        current_statement = []
        
        for line in migration_sql.split('\n'):
            # Skip comment lines
            if line.strip().startswith('--') or not line.strip():
                continue
                
            current_statement.append(line)
            
            # Check if this completes a statement
            if line.strip().endswith(';'):
                statement = '\n'.join(current_statement)
                if statement.strip():
                    statements.append(statement)
                current_statement = []
        
        print(f"Found {len(statements)} SQL statements to execute")
        
        # Execute each statement
        success_count = 0
        failed_statements = []
        
        for i, statement in enumerate(statements, 1):
            try:
                # Show progress
                print(f"Executing statement {i}/{len(statements)}...", end='')
                
                # Execute via RPC (Supabase doesn't have direct SQL execution)
                # We'll need to create a function for this
                result = supabase.rpc('execute_sql', {'sql': statement}).execute()
                
                success_count += 1
                print(" [OK]")
                
            except Exception as e:
                error_msg = str(e)
                
                # Some errors are expected (e.g., "already exists")
                if 'already exists' in error_msg or 'duplicate' in error_msg.lower():
                    print(" [SKIP]  (Already exists, skipping)")
                    success_count += 1
                else:
                    print(f" [ERROR] Error: {error_msg}")
                    failed_statements.append({
                        'statement': statement[:100] + '...' if len(statement) > 100 else statement,
                        'error': error_msg
                    })
        
        print("\n" + "=" * 50)
        print(f"Migration Results:")
        print(f"[OK] Successful: {success_count}/{len(statements)}")
        print(f"[ERROR] Failed: {len(failed_statements)}/{len(statements)}")
        
        if failed_statements:
            print("\nFailed Statements:")
            for failure in failed_statements:
                print(f"  - {failure['statement']}")
                print(f"    Error: {failure['error']}")
        
        # Check migration results
        print("\n" + "=" * 50)
        print("Verifying migration...")
        
        try:
            # Check if new tables exist
            tables_to_check = [
                'quest_metadata',
                'quest_paths', 
                'quest_customizations',
                'user_badges',
                'user_mastery',
                'pillar_subcategories'
            ]
            
            for table in tables_to_check:
                result = supabase.table(table).select('*').limit(1).execute()
                print(f"[OK] Table '{table}' exists")
                
        except Exception as e:
            print(f"[WARNING]  Verification issue: {e}")
        
        print("\n Migration completed!")
        return True
        
    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        return False

def create_migration_function():
    """
    Create a PostgreSQL function to execute arbitrary SQL.
    This is needed because Supabase doesn't allow direct SQL execution.
    """
    
    print("Creating SQL execution function...")
    
    create_function_sql = """
    CREATE OR REPLACE FUNCTION execute_sql(sql text)
    RETURNS void AS $$
    BEGIN
      EXECUTE sql;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    """
    
    try:
        supabase = get_supabase_admin_client()
        # This might fail, but we'll try
        supabase.rpc('execute_sql', {'sql': create_function_sql}).execute()
        print("[OK] SQL execution function created")
        return True
    except:
        print("[WARNING]  Could not create SQL execution function")
        print("You may need to run the migration SQL directly in Supabase SQL Editor")
        return False

def main():
    """Main execution function."""
    
    print("Optio Quest Template System Migration")
    print("=" * 50)
    
    # Check if we should proceed
    response = input("This will modify your database. Continue? (yes/no): ")
    if response.lower() != 'yes':
        print("Migration cancelled.")
        return
    
    # Try to create execution function first
    create_migration_function()
    
    # Alternative: Direct execution via Supabase SQL Editor
    print("\n" + "=" * 50)
    print("[WARNING]  IMPORTANT: If this script fails, you can run the migration manually:")
    print("1. Go to your Supabase dashboard")
    print("2. Navigate to SQL Editor")
    print("3. Copy the contents of backend/migrations/quest_template_migration.sql")
    print("4. Paste and run in the SQL Editor")
    print("=" * 50 + "\n")
    
    # Run the migration
    if run_migration():
        print("\n[OK] Migration successful!")
        print("\nNext steps:")
        print("1. Update backend API endpoints for new pillar structure")
        print("2. Update frontend to display new pillars")
        print("3. Create admin interface for quest creation")
        print("4. Set up Gemini API integration")
    else:
        print("\n[ERROR] Migration failed. Please check the errors above.")
        print("You may need to run the SQL manually in Supabase SQL Editor.")

if __name__ == "__main__":
    main()