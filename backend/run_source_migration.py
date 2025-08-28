"""
Direct SQL migration to add source column and update Khan Academy quest
Run this script to add the source field to quests table
"""

from database import get_supabase_admin_client

def run_migration():
    # Use existing database connection
    supabase = get_supabase_admin_client()
    
    print("Connected to Supabase")
    print("=" * 50)
    
    try:
        # First, let's check what quests we have
        print("\n1. Checking existing quests...")
        quests = supabase.table('quests').select('id, title').execute()
        
        print(f"Found {len(quests.data)} quests:")
        khan_quest_id = None
        for quest in quests.data:
            print(f"  - {quest['title']}")
            if 'khan' in quest['title'].lower():
                khan_quest_id = quest['id']
                print(f"    ^ This is the Khan Academy quest (ID: {khan_quest_id})")
        
        print("\n2. Adding source column to quests table...")
        print("Note: This operation needs to be done through Supabase Dashboard SQL Editor")
        print("Please run the following SQL in your Supabase Dashboard:")
        print("-" * 50)
        print("""
-- Add source column to quests table
ALTER TABLE quests 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'optio';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_quests_source ON quests(source);
        """)
        print("-" * 50)
        
        if khan_quest_id:
            print(f"\n3. After adding the column, run this SQL to update the Khan Academy quest:")
            print("-" * 50)
            print(f"""
-- Update Khan Academy quest
UPDATE quests 
SET source = 'khan_academy' 
WHERE id = '{khan_quest_id}';

-- Set all other quests to 'optio' if they don't have a source
UPDATE quests 
SET source = 'optio' 
WHERE source IS NULL;
            """)
            print("-" * 50)
        
        print("\nMigration SQL has been generated. Please run it in your Supabase Dashboard.")
        print("Go to: Your Supabase Project > SQL Editor > New Query")
        
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_migration()