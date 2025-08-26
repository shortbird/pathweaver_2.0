#!/usr/bin/env python3
"""
Run the AI generation tables migration
"""
import os
from database import get_supabase_admin_client

def run_migration():
    """Run the AI generation tables migration"""
    
    print("Running AI generation tables migration...")
    
    # Read the migration file
    migration_path = os.path.join(os.path.dirname(__file__), 'migrations', 'add_ai_generation_tables.sql')
    
    with open(migration_path, 'r') as f:
        migration_sql = f.read()
    
    # Get Supabase client
    supabase = get_supabase_admin_client()
    
    try:
        # Execute the migration using raw SQL
        # Note: Supabase Python client doesn't have direct SQL execution,
        # so we'll need to run this through the Supabase dashboard or CLI
        print("\n" + "="*50)
        print("IMPORTANT: The migration SQL needs to be run manually")
        print("="*50)
        print("\nPlease run the following SQL in your Supabase SQL editor:")
        print(f"\n1. Go to your Supabase dashboard")
        print(f"2. Navigate to SQL Editor")
        print(f"3. Copy and paste the contents of:")
        print(f"   {migration_path}")
        print(f"4. Execute the SQL")
        print("\nThe migration creates the following tables:")
        print("  - ai_generation_jobs")
        print("  - ai_generated_quests")
        print("  - ai_quest_review_history")
        print("  - ai_generation_analytics")
        print("\n" + "="*50)
        
        return True
        
    except Exception as e:
        print(f"Error preparing migration: {str(e)}")
        return False

if __name__ == "__main__":
    run_migration()