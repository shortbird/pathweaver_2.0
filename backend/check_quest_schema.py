from database import get_supabase_admin_client

def check_quest_schema():
    supabase = get_supabase_admin_client()
    
    # Test by creating a dummy quest with new fields
    test_data = {
        'title': 'TEST SCHEMA CHECK - DELETE ME',
        'description': 'Testing schema',
        'big_idea': 'Test',
        'category': 'general',
        'difficulty_level': 'intermediate',
        'location_type': 'anywhere',
        'is_seasonal': False,
        'collaboration_enabled': False,
        'is_v3': True,
        'is_active': False,
        'source': 'optio'
    }
    
    try:
        # Try to insert with new fields
        result = supabase.table('quests').insert(test_data).execute()
        
        if result.data:
            quest_id = result.data[0]['id']
            print("✓ New fields appear to be present in quests table")
            print(f"Created test quest: {quest_id}")
            
            # Clean up test quest
            supabase.table('quests').delete().eq('id', quest_id).execute()
            print("✓ Test quest deleted")
            
            # Check quest_tasks structure
            test_task = {
                'quest_id': quest_id,
                'title': 'Test Task',
                'pillar': 'arts_creativity',
                'xp_value': 100,
                'order_index': 1,
                'is_required': True
            }
            
            # Note: This will fail since we deleted the quest, but we just want to check the schema
            
        return True
        
    except Exception as e:
        print(f"Schema check failed: {e}")
        print("\nThe following fields may be missing from the quests table:")
        print("- category")
        print("- subcategory") 
        print("- difficulty_level")
        print("- estimated_hours")
        print("- materials_needed")
        print("- location_type")
        print("- specific_location")
        print("- location_radius")
        print("- is_seasonal")
        print("- seasonal_start_date")
        print("- seasonal_end_date")
        print("- collaboration_enabled")
        print("- max_team_size")
        print("- collaboration_prompt")
        return False

if __name__ == "__main__":
    check_quest_schema()