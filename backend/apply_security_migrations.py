"""
Apply security and performance migrations to Supabase
Generated on 2025-01-08
"""

import os
import sys
from pathlib import Path
from supabase import create_client, Client
from datetime import datetime

# Add parent directory to path to import config
sys.path.append(str(Path(__file__).parent))
from config import Config

def apply_migrations():
    """Apply security and performance migrations to Supabase"""
    
    # Initialize Supabase client with service role key for admin operations
    supabase: Client = create_client(
        Config.SUPABASE_URL,
        Config.SUPABASE_SERVICE_KEY
    )
    
    # Define migration files in order
    migration_files = [
        '../supabase/migrations/20250108_security_fixes.sql',
        '../supabase/migrations/20250108_performance_fixes.sql',
        '../supabase/migrations/20250108_function_security_fixes.sql'
    ]
    
    results = []
    
    for migration_file in migration_files:
        file_path = Path(__file__).parent / migration_file
        
        if not file_path.exists():
            print(f"❌ Migration file not found: {migration_file}")
            results.append({"file": migration_file, "status": "not_found"})
            continue
            
        print(f"\n📄 Applying migration: {migration_file}")
        
        try:
            # Read the SQL file
            with open(file_path, 'r', encoding='utf-8') as f:
                sql_content = f.read()
            
            # Split by semicolons but preserve them for execution
            # This handles multi-statement SQL files
            statements = []
            current_statement = []
            in_function = False
            
            for line in sql_content.split('\n'):
                # Track if we're inside a function definition
                if 'CREATE FUNCTION' in line or 'CREATE OR REPLACE FUNCTION' in line:
                    in_function = True
                elif line.strip().startswith('$$') and in_function:
                    in_function = False
                
                current_statement.append(line)
                
                # Only split on semicolons that are not inside functions
                if line.strip().endswith(';') and not in_function:
                    statement = '\n'.join(current_statement).strip()
                    if statement and not statement.startswith('--'):
                        statements.append(statement)
                    current_statement = []
            
            # Add any remaining statement
            if current_statement:
                statement = '\n'.join(current_statement).strip()
                if statement and not statement.startswith('--'):
                    statements.append(statement)
            
            # Execute each statement
            success_count = 0
            error_count = 0
            errors = []
            
            for i, statement in enumerate(statements, 1):
                # Skip comments
                if statement.strip().startswith('--') or not statement.strip():
                    continue
                
                try:
                    # Execute the SQL statement
                    result = supabase.rpc('exec_sql', {'sql': statement}).execute()
                    success_count += 1
                    print(f"  ✅ Statement {i}/{len(statements)} executed successfully")
                except Exception as e:
                    error_msg = str(e)
                    
                    # Some errors are expected (e.g., dropping policies that don't exist)
                    if 'does not exist' in error_msg.lower() and 'DROP POLICY' in statement:
                        print(f"  ⚠️  Statement {i}/{len(statements)}: Policy doesn't exist (OK)")
                        success_count += 1
                    elif 'already exists' in error_msg.lower():
                        print(f"  ⚠️  Statement {i}/{len(statements)}: Already exists (skipped)")
                        success_count += 1
                    else:
                        error_count += 1
                        errors.append(f"Statement {i}: {error_msg[:200]}")
                        print(f"  ❌ Statement {i}/{len(statements)} failed: {error_msg[:100]}")
            
            if error_count == 0:
                print(f"✅ Migration completed successfully: {success_count} statements executed")
                results.append({
                    "file": migration_file, 
                    "status": "success",
                    "statements": success_count
                })
            else:
                print(f"⚠️  Migration completed with errors: {success_count} succeeded, {error_count} failed")
                results.append({
                    "file": migration_file,
                    "status": "partial",
                    "statements": success_count,
                    "errors": error_count,
                    "error_details": errors[:5]  # First 5 errors
                })
                
        except Exception as e:
            print(f"❌ Failed to apply migration: {str(e)}")
            results.append({
                "file": migration_file,
                "status": "failed",
                "error": str(e)
            })
    
    # Print summary
    print("\n" + "="*60)
    print("MIGRATION SUMMARY")
    print("="*60)
    
    for result in results:
        status_icon = {
            "success": "✅",
            "partial": "⚠️",
            "failed": "❌",
            "not_found": "❓"
        }.get(result["status"], "?")
        
        print(f"{status_icon} {result['file']}: {result['status']}")
        if result.get("statements"):
            print(f"   Statements executed: {result['statements']}")
        if result.get("errors"):
            print(f"   Errors: {result['errors']}")
        if result.get("error_details"):
            for error in result["error_details"][:3]:
                print(f"   - {error[:100]}")
    
    # Check if we need manual intervention
    print("\n" + "="*60)
    print("MANUAL ACTIONS REQUIRED")
    print("="*60)
    print("""
The following actions require superuser privileges and must be done manually
in the Supabase dashboard (SQL Editor):

1. Move extensions from public schema to extensions schema:
   - ALTER EXTENSION pg_net SET SCHEMA extensions;
   - ALTER EXTENSION pg_trgm SET SCHEMA extensions;
   - ALTER EXTENSION vector SET SCHEMA extensions;

2. If you see any "permission denied" errors above, those statements
   need to be run with superuser privileges in the Supabase dashboard.

3. After running migrations, verify in the Supabase dashboard:
   - Go to Authentication > Policies to review RLS policies
   - Check the Security Advisor for any remaining issues
   - Test your application to ensure everything works correctly
""")
    
    return results

def create_exec_sql_function():
    """
    Create a helper function in Supabase to execute SQL statements.
    This needs to be run once before applying migrations.
    """
    print("Creating exec_sql helper function...")
    
    supabase: Client = create_client(
        Config.SUPABASE_URL,
        Config.SUPABASE_SERVICE_KEY
    )
    
    sql = """
    CREATE OR REPLACE FUNCTION exec_sql(sql text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      EXECUTE sql;
    END;
    $$;
    """
    
    try:
        # Try to execute directly
        result = supabase.postgrest.rpc('query', {'query': sql}).execute()
        print("✅ Helper function created successfully")
        return True
    except Exception as e:
        print(f"⚠️  Could not create helper function: {str(e)}")
        print("You may need to run the migrations manually in the Supabase SQL editor")
        return False

if __name__ == "__main__":
    print("🚀 Supabase Security & Performance Migration Tool")
    print("="*60)
    print(f"Target: {Config.SUPABASE_URL}")
    print(f"Time: {datetime.now().isoformat()}")
    print("="*60)
    
    # Note: The exec_sql function approach won't work due to Supabase restrictions
    # We'll need to apply these migrations manually
    print("""
⚠️  IMPORTANT: Due to Supabase security restrictions, these migrations
need to be applied manually through the Supabase dashboard.

Please follow these steps:

1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy and paste each migration file in order:
   - 20250108_security_fixes.sql
   - 20250108_performance_fixes.sql  
   - 20250108_function_security_fixes.sql

4. Execute each file and verify there are no errors

5. After applying migrations:
   - Check the Security Advisor for resolved issues
   - Verify your application still works correctly
   - Monitor performance improvements

The migration files have been created in:
  supabase/migrations/
""")
    
    # Show file paths for easy copying
    print("\nMigration files created:")
    migration_dir = Path(__file__).parent.parent / "supabase" / "migrations"
    for file in sorted(migration_dir.glob("20250108_*.sql")):
        print(f"  - {file.name}")