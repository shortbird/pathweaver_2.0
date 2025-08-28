"""
Direct script to add source column to quests table using Supabase client
This will update all existing quests with default source values
"""

from database import get_supabase_admin_client
import time

def add_source_column():
    supabase = get_supabase_admin_client()
    
    print("Connected to Supabase")
    print("=" * 50)
    
    try:
        # First, check if we can read quests
        print("\n1. Checking existing quests...")
        quests = supabase.table('quests').select('id, title, source').execute()
        
        # Check if source field exists by looking at the first quest
        if quests.data and len(quests.data) > 0:
            first_quest = quests.data[0]
            if 'source' in first_quest:
                print(f"[OK] Source column already exists!")
                print(f"  Found {len(quests.data)} quests")
                
                # Check for Khan Academy quest and update if needed
                for quest in quests.data:
                    if 'khan' in quest['title'].lower() and quest.get('source') != 'khan_academy':
                        print(f"\nUpdating Khan Academy quest (ID: {quest['id']})")
                        supabase.table('quests').update({'source': 'khan_academy'}).eq('id', quest['id']).execute()
                        print("[OK] Updated Khan Academy quest source")
                    elif quest.get('source') is None:
                        print(f"\nSetting source to 'optio' for quest: {quest['title']}")
                        supabase.table('quests').update({'source': 'optio'}).eq('id', quest['id']).execute()
                        print("[OK] Updated quest source to 'optio'")
                
                print("\n[OK] All quests have source field set!")
                return True
            else:
                print("Source column doesn't exist yet")
        
        print("\n2. Attempting to add source column...")
        print("Note: If this fails, you'll need to add it manually through Supabase Dashboard")
        
        # Try to update all quests with default source
        # This will fail if column doesn't exist, but worth trying
        for quest in quests.data:
            quest_id = quest['id']
            quest_title = quest['title']
            
            # Determine source based on title
            if 'khan' in quest_title.lower():
                source = 'khan_academy'
            else:
                source = 'optio'
            
            print(f"  Setting source='{source}' for: {quest_title}")
            
            try:
                result = supabase.table('quests').update({'source': source}).eq('id', quest_id).execute()
                if result.data:
                    print(f"    [OK] Success")
                else:
                    print(f"    [FAILED] - may need to add column manually")
            except Exception as e:
                print(f"    [ERROR]: {str(e)}")
                print("\n" + "=" * 50)
                print("MANUAL STEPS REQUIRED:")
                print("1. Go to your Supabase Dashboard")
                print("2. Navigate to SQL Editor")
                print("3. Run this SQL:")
                print("-" * 50)
                print("""
ALTER TABLE quests 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'optio';

UPDATE quests 
SET source = 'khan_academy' 
WHERE title ILIKE '%khan%';

UPDATE quests 
SET source = 'optio' 
WHERE source IS NULL;
                """)
                print("-" * 50)
                return False
        
        print("\n[OK] Successfully updated all quests with source field!")
        return True
        
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = add_source_column()
    if success:
        print("\n[SUCCESS] Migration completed successfully!")
    else:
        print("\n[WARNING] Migration requires manual intervention - see instructions above")