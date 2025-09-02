from database import get_supabase_admin_client

def check_task_schema():
    supabase = get_supabase_admin_client()
    
    # Get an existing quest to test with
    quest_result = supabase.table('quests').select('id').limit(1).execute()
    
    if not quest_result.data:
        print("No quests found to test with")
        return
    
    quest_id = quest_result.data[0]['id']
    
    # Test task creation with different fields
    test_fields = {
        'quest_id': quest_id,
        'title': 'Schema Test Task',
        'description': 'Testing fields',
        'pillar': 'arts_creativity',
        'xp_amount': 100,
        'task_order': 1,
        'is_required': True
    }
    
    print("Testing quest_tasks table schema...")
    print("Attempting to insert with basic fields:", list(test_fields.keys()))
    
    try:
        result = supabase.table('quest_tasks').insert(test_fields).execute()
        if result.data:
            task_id = result.data[0]['id']
            print(f"[OK] Basic fields work. Created task: {task_id}")
            
            # Check what fields were returned
            print("\nFields returned from database:")
            for key in result.data[0].keys():
                print(f"  - {key}")
            
            # Clean up
            supabase.table('quest_tasks').delete().eq('id', task_id).execute()
            print("\n[OK] Test task deleted")
            
            # Now test additional fields
            additional_fields = [
                ('subcategory', 'Visual Arts'),
                ('evidence_prompt', 'Test prompt'),
                ('is_collaboration_eligible', True),
                ('collaboration_eligible', True),
                ('location_required', False),
                ('evidence_types', ['text', 'image']),
                ('xp_value', 100),
                ('order_index', 1),
                ('is_optional', False)
            ]
            
            print("\nTesting additional fields:")
            for field_name, field_value in additional_fields:
                test_data = test_fields.copy()
                test_data[field_name] = field_value
                
                try:
                    result = supabase.table('quest_tasks').insert(test_data).execute()
                    if result.data:
                        task_id = result.data[0]['id']
                        print(f"  [OK] Field '{field_name}' exists")
                        supabase.table('quest_tasks').delete().eq('id', task_id).execute()
                except Exception as e:
                    error_msg = str(e)
                    if 'column' in error_msg.lower():
                        print(f"  [X] Field '{field_name}' does not exist")
                    else:
                        print(f"  ? Field '{field_name}' error: {error_msg[:100]}")
            
    except Exception as e:
        print(f"Error with basic fields: {e}")

if __name__ == "__main__":
    check_task_schema()