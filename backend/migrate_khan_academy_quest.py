"""
Migration script to update existing Khan Academy quest with proper source field
"""

from database import get_supabase_admin_client
import sys

def migrate_khan_academy_quest():
    """Find and update Khan Academy quest to have proper source"""
    supabase = get_supabase_admin_client()
    
    try:
        # First, apply the schema migration if not already done
        print("Ensuring source column exists...")
        try:
            # This will fail silently if column already exists
            supabase.rpc('exec_sql', {'sql': """
                ALTER TABLE quests 
                ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'optio';
            """}).execute()
            print("Source column added/verified")
        except Exception as e:
            print(f"Note: {e} (likely column already exists, continuing...)")
        
        # Find Khan Academy quest(s) by title or description
        print("\nSearching for Khan Academy quests...")
        
        # Get all quests
        quests_response = supabase.table('quests').select('*').execute()
        
        khan_quests = []
        for quest in quests_response.data:
            # Check if quest title or description mentions Khan Academy
            title = (quest.get('title') or '').lower()
            big_idea = (quest.get('big_idea') or '').lower()
            description = (quest.get('description') or '').lower()
            
            if 'khan' in title or 'khan academy' in big_idea or 'khan academy' in description:
                khan_quests.append(quest)
        
        if not khan_quests:
            print("No Khan Academy quests found to migrate")
            return
        
        # Update each Khan Academy quest
        for quest in khan_quests:
            print(f"\nFound Khan Academy quest: {quest['title']}")
            print(f"  Current source: {quest.get('source', 'not set')}")
            
            if quest.get('source') != 'khan_academy':
                # Update the source
                update_response = supabase.table('quests').update({
                    'source': 'khan_academy'
                }).eq('id', quest['id']).execute()
                
                print(f"  ✓ Updated source to 'khan_academy'")
            else:
                print(f"  ✓ Already has correct source")
        
        # Update any other quests that don't have a source to default to 'optio'
        print("\nUpdating other quests to have default 'optio' source...")
        update_response = supabase.rpc('exec_sql', {'sql': """
            UPDATE quests 
            SET source = 'optio' 
            WHERE source IS NULL OR source = '';
        """}).execute()
        
        print("✅ Migration completed successfully!")
        
        # Show summary
        print("\n=== Migration Summary ===")
        all_quests = supabase.table('quests').select('source').execute()
        source_counts = {}
        for quest in all_quests.data:
            source = quest.get('source', 'unknown')
            source_counts[source] = source_counts.get(source, 0) + 1
        
        print("Quest sources after migration:")
        for source, count in source_counts.items():
            print(f"  {source}: {count} quest(s)")
        
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    migrate_khan_academy_quest()