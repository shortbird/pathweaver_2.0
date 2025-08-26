#!/usr/bin/env python3
"""
Script to fix a specific user_quest record that has missing quest_id
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def fix_user_quest():
    """Fix the user_quest record with missing quest_id"""
    # Create Supabase client directly for script usage
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    
    if not url or not key:
        raise ValueError("Missing Supabase credentials in environment variables")
    
    supabase: Client = create_client(url, key)
    
    # The problematic user_quest ID from the error
    user_quest_id = "4dc5656f-f438-4bb3-bbb0-a47ac38b5436"
    
    try:
        # First, fetch the user_quest record
        print(f"Fetching user_quest record: {user_quest_id}")
        user_quest = supabase.table('user_quests').select('*').eq('id', user_quest_id).single().execute()
        
        if user_quest.data:
            print(f"Found user_quest: {user_quest.data}")
            
            # Check if quest_id is missing
            if not user_quest.data.get('quest_id'):
                print("quest_id is missing!")
                
                # Try to find a quest that the user might have been trying to start
                # Get the user's ID
                user_id = user_quest.data.get('user_id')
                print(f"User ID: {user_id}")
                
                # Get all quests to see what's available
                print("\nFetching available quests...")
                all_quests = supabase.table('quests').select('id, title').limit(10).execute()
                
                if all_quests.data:
                    print("Available quests:")
                    for quest in all_quests.data:
                        print(f"  - {quest['id']}: {quest['title']}")
                    
                    # Since we can't know which quest was intended, we should delete this invalid record
                    print(f"\nDeleting invalid user_quest record: {user_quest_id}")
                    supabase.table('user_quests').delete().eq('id', user_quest_id).execute()
                    print("Invalid record deleted successfully!")
                    print("\nUser can now start a new quest properly from the Quest Library.")
                else:
                    print("No quests found in the database")
            else:
                quest_id = user_quest.data.get('quest_id')
                print(f"quest_id exists: {quest_id}")
                
                # Check if the quest actually exists
                quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
                if quest.data:
                    print(f"Quest exists: {quest.data['title']}")
                else:
                    print(f"Quest with ID {quest_id} does not exist!")
                    print(f"Deleting orphaned user_quest record: {user_quest_id}")
                    supabase.table('user_quests').delete().eq('id', user_quest_id).execute()
                    print("Orphaned record deleted successfully!")
        else:
            print(f"User quest record {user_quest_id} not found")
        
        # Also check for any other user_quests with missing quest_id for this user
        if user_quest.data and user_quest.data.get('user_id'):
            user_id = user_quest.data.get('user_id')
            print(f"\nChecking for other invalid records for user {user_id}...")
            
            all_user_quests = supabase.table('user_quests')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('status', 'in_progress')\
                .execute()
            
            if all_user_quests.data:
                for uq in all_user_quests.data:
                    if not uq.get('quest_id'):
                        print(f"Found another invalid record: {uq['id']}")
                        supabase.table('user_quests').delete().eq('id', uq['id']).execute()
                        print(f"Deleted invalid record: {uq['id']}")
                    else:
                        print(f"Valid record: {uq['id']} -> quest_id: {uq['quest_id']}")
            
            print("\nCleanup complete!")
            
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    fix_user_quest()