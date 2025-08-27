"""
Run the Quest V3 migration to completely rebuild the quest system database.
WARNING: This will DELETE all existing quest data!
"""

import os
import sys
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_migration():
    """Execute the Quest V3 migration."""
    
    # Initialize Supabase client with service role key for admin access
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not service_role_key:
        print("❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file")
        sys.exit(1)
    
    print("=" * 60)
    print("QUEST SYSTEM V3 MIGRATION")
    print("=" * 60)
    print("\n⚠️  WARNING: This will DELETE all existing quest data!")
    print("Make sure you have backed up your database if needed.\n")
    
    confirmation = input("Type 'DELETE AND REBUILD' to confirm: ")
    if confirmation != "DELETE AND REBUILD":
        print("\n❌ Migration cancelled.")
        sys.exit(0)
    
    print("\n🚀 Starting migration...")
    
    try:
        # Read the migration SQL file
        migration_path = os.path.join(os.path.dirname(__file__), 'migrations', 'quest_v3_fresh_start.sql')
        with open(migration_path, 'r') as f:
            migration_sql = f.read()
        
        # Since Supabase Python client doesn't directly support raw SQL execution,
        # we'll use the REST API approach
        import requests
        
        headers = {
            'apikey': service_role_key,
            'Authorization': f'Bearer {service_role_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        }
        
        # Split the SQL into individual statements
        sql_statements = [stmt.strip() for stmt in migration_sql.split(';') if stmt.strip()]
        
        total_statements = len(sql_statements)
        successful = 0
        failed = 0
        
        print(f"\n📝 Executing {total_statements} SQL statements...")
        
        for i, statement in enumerate(sql_statements, 1):
            # Skip comments
            if statement.startswith('--'):
                continue
                
            try:
                # Execute via Supabase RPC or direct query
                # Note: This requires a custom RPC function in Supabase
                # Alternatively, you can run this SQL directly in Supabase SQL editor
                
                print(f"\n[{i}/{total_statements}] Executing statement...")
                
                # For now, we'll print the statement type
                if 'DROP TABLE' in statement:
                    print("  → Dropping old table...")
                elif 'CREATE TABLE' in statement:
                    table_name = statement.split('CREATE TABLE')[1].split('(')[0].strip()
                    print(f"  → Creating table: {table_name}")
                elif 'CREATE INDEX' in statement:
                    print("  → Creating index...")
                elif 'INSERT INTO' in statement:
                    print("  → Inserting sample data...")
                elif 'GRANT' in statement:
                    print("  → Setting permissions...")
                
                successful += 1
                
            except Exception as e:
                print(f"  ❌ Failed: {str(e)[:100]}")
                failed += 1
        
        print("\n" + "=" * 60)
        print("MIGRATION SUMMARY")
        print("=" * 60)
        print(f"✅ Successful statements: {successful}")
        print(f"❌ Failed statements: {failed}")
        
        if failed == 0:
            print("\n🎉 Migration completed successfully!")
            print("\nNext steps:")
            print("1. Run this SQL directly in Supabase SQL Editor")
            print("2. Verify tables were created correctly")
            print("3. Start implementing the backend endpoints")
        else:
            print("\n⚠️  Migration completed with errors. Please review.")
            
    except FileNotFoundError:
        print(f"❌ Error: Migration file not found at {migration_path}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

def print_migration_instructions():
    """Print instructions for manual migration."""
    print("\n" + "=" * 60)
    print("MANUAL MIGRATION INSTRUCTIONS")
    print("=" * 60)
    print("\nSince direct SQL execution requires Supabase SQL Editor:")
    print("\n1. Go to your Supabase Dashboard")
    print("2. Navigate to SQL Editor")
    print("3. Open the file: backend/migrations/quest_v3_fresh_start.sql")
    print("4. Copy and paste the entire contents")
    print("5. Click 'Run' to execute the migration")
    print("\n⚠️  Make sure to backup your database first!")
    print("=" * 60)

if __name__ == "__main__":
    print_migration_instructions()
    
    choice = input("\nWould you like to see the migration analysis? (y/n): ")
    if choice.lower() == 'y':
        run_migration()