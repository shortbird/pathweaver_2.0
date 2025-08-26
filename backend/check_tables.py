#!/usr/bin/env python3
"""
Check if AI generation tables exist
"""
from database import get_supabase_admin_client

def check_tables():
    """Check if the AI generation tables exist"""
    
    print("Checking for AI generation tables...")
    
    supabase = get_supabase_admin_client()
    
    tables_to_check = [
        'ai_generation_jobs',
        'ai_generated_quests',
        'ai_quest_review_history',
        'ai_generation_analytics'
    ]
    
    for table in tables_to_check:
        try:
            # Try to query the table
            response = supabase.table(table).select('id').limit(1).execute()
            print(f"✅ Table '{table}' exists")
        except Exception as e:
            error_msg = str(e)
            if 'relation' in error_msg and 'does not exist' in error_msg:
                print(f"❌ Table '{table}' does NOT exist")
            else:
                print(f"⚠️  Table '{table}' - Error: {error_msg}")
    
    print("\nIf tables are missing, run the migration:")
    print("  1. Go to your Supabase dashboard")
    print("  2. Navigate to SQL Editor")
    print("  3. Copy and run the SQL from: backend/migrations/add_ai_generation_tables.sql")

if __name__ == "__main__":
    check_tables()