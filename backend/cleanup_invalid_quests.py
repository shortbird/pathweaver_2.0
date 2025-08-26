#!/usr/bin/env python3
"""
Script to clean up any invalid user_quest records with missing quest_id
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def cleanup_invalid_user_quests():
    """Remove user_quest records that have no quest_id or invalid quest_id"""
    # Create Supabase client directly for script usage
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    
    if not url or not key:
        raise ValueError("Missing Supabase credentials in environment variables")
    
    supabase: Client = create_client(url, key)
    
    try:
        # First, find all user_quests
        print("Fetching all user_quest records...")
        all_user_quests = supabase.table('user_quests').select('*').execute()
        
        if not all_user_quests.data:
            print("No user_quest records found")
            return
        
        invalid_records = []
        for record in all_user_quests.data:
            # Check if quest_id is missing or null
            if not record.get('quest_id'):
                invalid_records.append(record)
                print(f"Found invalid record with no quest_id: {record}")
        
        if invalid_records:
            print(f"\nFound {len(invalid_records)} invalid records")
            
            # Delete invalid records
            for record in invalid_records:
                print(f"Deleting record ID: {record['id']}")
                supabase.table('user_quests').delete().eq('id', record['id']).execute()
            
            print(f"\nDeleted {len(invalid_records)} invalid records")
        else:
            print("No invalid records found - all user_quests have valid quest_ids")
        
        # Now verify remaining records have valid quest references
        print("\nVerifying remaining records reference valid quests...")
        remaining = supabase.table('user_quests').select('*, quests(id, title)').execute()
        
        orphaned = []
        for record in remaining.data:
            if not record.get('quests'):
                orphaned.append(record)
                print(f"Found orphaned record (quest doesn't exist): {record}")
        
        if orphaned:
            print(f"\nFound {len(orphaned)} orphaned records")
            for record in orphaned:
                print(f"Deleting orphaned record ID: {record['id']}")
                supabase.table('user_quests').delete().eq('id', record['id']).execute()
            print(f"Deleted {len(orphaned)} orphaned records")
        else:
            print("All remaining user_quests reference valid quests")
        
        print("\nCleanup complete!")
        
    except Exception as e:
        print(f"Error during cleanup: {str(e)}")

if __name__ == "__main__":
    cleanup_invalid_user_quests()