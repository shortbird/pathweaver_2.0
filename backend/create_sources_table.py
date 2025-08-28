"""
Create quest_sources table to store default header images for each source
This allows uploading one image per source that all quests can use
"""

from database import get_supabase_admin_client

def create_sources_table():
    supabase = get_supabase_admin_client()
    
    print("Setting up quest_sources system")
    print("=" * 50)
    
    # SQL to create the sources table
    create_table_sql = """
    -- Create quest_sources table to store default images for each source
    CREATE TABLE IF NOT EXISTS quest_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        header_image_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_quest_sources_id ON quest_sources(id);

    -- Insert default sources
    INSERT INTO quest_sources (id, name) 
    VALUES 
        ('optio', 'Optio'),
        ('khan_academy', 'Khan Academy')
    ON CONFLICT (id) DO NOTHING;
    """
    
    print("\nTo create the quest_sources table, run this SQL in your Supabase Dashboard:")
    print("-" * 50)
    print(create_table_sql)
    print("-" * 50)
    
    try:
        # Try to check if table exists by querying it
        print("\nChecking if quest_sources table exists...")
        result = supabase.table('quest_sources').select('*').execute()
        
        if result.data is not None:
            print(f"[OK] quest_sources table exists with {len(result.data)} sources")
            for source in result.data:
                print(f"  - {source['name']} (id: {source['id']})")
                if source.get('header_image_url'):
                    print(f"    Header: {source['header_image_url'][:50]}...")
            
            # Ensure default sources exist
            sources_to_add = []
            existing_ids = [s['id'] for s in result.data]
            
            if 'optio' not in existing_ids:
                sources_to_add.append({'id': 'optio', 'name': 'Optio'})
            if 'khan_academy' not in existing_ids:
                sources_to_add.append({'id': 'khan_academy', 'name': 'Khan Academy'})
            
            if sources_to_add:
                print(f"\nAdding missing sources: {sources_to_add}")
                supabase.table('quest_sources').insert(sources_to_add).execute()
                print("[OK] Added missing default sources")
            
            return True
    except Exception as e:
        if 'relation "public.quest_sources" does not exist' in str(e):
            print("\n[INFO] quest_sources table doesn't exist yet")
            print("Please create it using the SQL above in your Supabase Dashboard")
        else:
            print(f"\n[ERROR] Unexpected error: {str(e)}")
        return False

if __name__ == "__main__":
    create_sources_table()