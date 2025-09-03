#!/usr/bin/env python3
"""
Script to delete all quests and related data from the Optio database.
WARNING: This will permanently delete all quest data!
"""

import os
import sys
from database import get_supabase_admin_client

def delete_all_quests():
    """Delete all quest-related data from the database."""
    print("WARNING: This will permanently delete ALL quest data!")
    print("This includes:")
    print("- All quests")
    print("- All quest tasks")
    print("- All quest task completions")
    print("- All user quest enrollments")
    print("- All quest submissions")
    print("- All user XP data")
    
    confirm = input("\nType 'DELETE ALL QUESTS' to confirm: ")
    if confirm != "DELETE ALL QUESTS":
        print("Deletion cancelled.")
        return False
        
    print("\nStarting quest data deletion...")
    
    try:
        # Get admin client with full privileges
        supabase = get_supabase_admin_client()
        
        # Delete in reverse order of dependencies to avoid foreign key conflicts
        
        print("1. Deleting quest task completions...")
        result = supabase.table('quest_task_completions').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        print(f"   Deleted {len(result.data) if result.data else 0} quest task completions")
        
        print("2. Deleting user skill XP...")
        result = supabase.table('user_skill_xp').delete().neq('user_id', '00000000-0000-0000-0000-000000000000').execute()
        print(f"   Deleted {len(result.data) if result.data else 0} user skill XP records")
        
        print("3. Deleting user quest enrollments...")
        result = supabase.table('user_quests').delete().neq('user_id', '00000000-0000-0000-0000-000000000000').execute()
        print(f"   Deleted {len(result.data) if result.data else 0} user quest enrollments")
        
        print("4. Deleting quest submissions...")
        result = supabase.table('quest_submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        print(f"   Deleted {len(result.data) if result.data else 0} quest submissions")
        
        print("5. Deleting quest tasks...")
        result = supabase.table('quest_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        print(f"   Deleted {len(result.data) if result.data else 0} quest tasks")
        
        print("6. Deleting quests...")
        result = supabase.table('quests').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        print(f"   Deleted {len(result.data) if result.data else 0} quests")
        
        print("\nQuest data deletion completed successfully!")
        print("Quest library is now empty and ready for new content.")
        
        return True
        
    except Exception as e:
        print(f"\nError during deletion: {str(e)}")
        print("Make sure you have proper admin permissions.")
        return False

def verify_deletion():
    """Verify that all quest data has been deleted."""
    print("\nVerifying deletion...")
    
    try:
        supabase = get_supabase_admin_client()
        
        # Check each table
        tables = [
            'quests',
            'quest_tasks', 
            'quest_task_completions',
            'user_quests',
            'quest_submissions',
            'user_skill_xp'
        ]
        
        all_empty = True
        for table in tables:
            result = supabase.table(table).select('id', count='exact').execute()
            count = result.count if hasattr(result, 'count') else len(result.data)
            print(f"   {table}: {count} records")
            if count > 0:
                all_empty = False
        
        if all_empty:
            print("Verification successful: All quest tables are empty!")
        else:
            print("Some records may still exist. Check the counts above.")
            
        return all_empty
        
    except Exception as e:
        print(f"Error during verification: {str(e)}")
        return False

def main():
    """Main function to execute quest deletion."""
    print("=== Optio Quest Library Reset Tool ===\n")
    
    # Delete all quest data
    if delete_all_quests():
        # Verify deletion
        verify_deletion()
    else:
        print("Deletion failed or was cancelled.")
        sys.exit(1)

if __name__ == "__main__":
    main()