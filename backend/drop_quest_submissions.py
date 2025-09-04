"""
Database migration to drop quest_submissions table
Run this script to remove the quest submissions functionality from the database
"""

from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

def drop_quest_submissions_table():
    """Drop the quest_submissions table from the database"""
    
    # Initialize Supabase client
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not supabase_key:
        print("Error: Missing Supabase credentials in environment variables")
        return False
    
    supabase = create_client(supabase_url, supabase_key)
    
    try:
        # Drop the quest_submissions table if it exists
        print("Dropping quest_submissions table...")
        
        # Use raw SQL to drop the table
        result = supabase.rpc('exec_sql', {
            'sql': 'DROP TABLE IF EXISTS quest_submissions CASCADE;'
        }).execute()
        
        print("Successfully dropped quest_submissions table")
        
        # Also drop any related columns in the quests table if they exist
        print("Cleaning up related columns in quests table...")
        
        # Remove submission-related columns from quests table if they exist
        cleanup_sql = """
        ALTER TABLE quests 
        DROP COLUMN IF EXISTS submitted_by,
        DROP COLUMN IF EXISTS is_custom,
        DROP COLUMN IF EXISTS submission_id;
        """
        
        result = supabase.rpc('exec_sql', {
            'sql': cleanup_sql
        }).execute()
        
        print("Successfully cleaned up quest table columns")
        
        return True
        
    except Exception as e:
        print(f"Error dropping quest_submissions table: {e}")
        
        # Alternative approach using direct PostgreSQL operations
        print("\nAttempting alternative approach...")
        
        try:
            # Try dropping the table directly
            from database import get_supabase_client
            client = get_supabase_client()
            
            # Note: Since we can't directly execute DDL commands through Supabase client,
            # we'll need to do this through the Supabase dashboard or using psql
            print("\nManual steps required:")
            print("1. Go to Supabase Dashboard > SQL Editor")
            print("2. Run the following SQL command:")
            print("   DROP TABLE IF EXISTS quest_submissions CASCADE;")
            print("3. Also run:")
            print("   ALTER TABLE quests DROP COLUMN IF EXISTS submitted_by, DROP COLUMN IF EXISTS is_custom, DROP COLUMN IF EXISTS submission_id;")
            
            return False
            
        except Exception as e2:
            print(f"Alternative approach also failed: {e2}")
            return False

if __name__ == "__main__":
    print("Quest Submissions Table Removal Script")
    print("=" * 40)
    
    confirm = input("\nThis will permanently delete the quest_submissions table. Continue? (yes/no): ")
    
    if confirm.lower() == 'yes':
        success = drop_quest_submissions_table()
        if success:
            print("\n✓ Migration completed successfully")
        else:
            print("\n✗ Migration requires manual intervention - see instructions above")
    else:
        print("\nMigration cancelled")