"""
Fix quest completion status for users who have completed all tasks
but the quest wasn't marked as completed.
"""
import os
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from backend/.env
load_dotenv('backend/.env')

# Initialize Supabase client
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(url, key)

def fix_quest_completion(user_id: str):
    """
    Check all active quests for a user and mark them as completed
    if all required tasks are done.
    """
    print(f"\n=== Checking quest completion for user {user_id} ===")
    
    # Get all user's active quests
    user_quests = supabase.table('user_quests')\
        .select('*, quests(*)')\
        .eq('user_id', user_id)\
        .eq('is_active', True)\
        .execute()
    
    if not user_quests.data:
        print("No active quests found.")
        
        # Check for inactive quests without completion date
        inactive_quests = supabase.table('user_quests')\
            .select('*, quests(*)')\
            .eq('user_id', user_id)\
            .eq('is_active', False)\
            .is_('completed_at', 'null')\
            .execute()
            
        if inactive_quests.data:
            print(f"\nFound {len(inactive_quests.data)} inactive quest(s) without completion date.")
            user_quests.data = inactive_quests.data
        else:
            return
    
    for user_quest in user_quests.data:
        quest_id = user_quest['quest_id']
        user_quest_id = user_quest['id']
        quest_title = user_quest['quests']['title'] if user_quest.get('quests') else 'Unknown'
        
        print(f"\nChecking quest: {quest_title}")
        print(f"  Quest ID: {quest_id}")
        print(f"  User Quest ID: {user_quest_id}")
        print(f"  Is Active: {user_quest['is_active']}")
        print(f"  Completed At: {user_quest['completed_at']}")
        
        # Get all tasks for this quest
        all_tasks = supabase.table('quest_tasks')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .execute()
        
        if not all_tasks.data:
            print("  No tasks found for this quest.")
            continue
            
        print(f"  Total tasks: {len(all_tasks.data)}")
        
        # Get required tasks
        required_tasks = [t for t in all_tasks.data if t.get('is_required', False)]
        
        # If no tasks are marked as required, treat all tasks as required
        if not required_tasks:
            required_tasks = all_tasks.data
            print(f"  No tasks marked as required, treating all {len(required_tasks)} tasks as required")
        else:
            print(f"  Required tasks: {len(required_tasks)}")
        
        # Get completed tasks for this user quest
        completed_tasks = supabase.table('user_quest_tasks')\
            .select('quest_task_id')\
            .eq('user_quest_id', user_quest_id)\
            .execute()
        
        completed_task_ids = {t['quest_task_id'] for t in completed_tasks.data}
        required_task_ids = {t['id'] for t in required_tasks}
        
        print(f"  Completed tasks: {len(completed_task_ids)}")
        print(f"  Required task IDs: {required_task_ids}")
        print(f"  Completed task IDs: {completed_task_ids}")
        
        # Check if all required tasks are completed
        if required_task_ids.issubset(completed_task_ids):
            print(f"  [CHECK] All required tasks completed!")
            
            # Mark quest as completed if it isn't already
            if not user_quest['completed_at']:
                # Get the latest task completion date
                latest_completion = supabase.table('user_quest_tasks')\
                    .select('completed_at')\
                    .eq('user_quest_id', user_quest_id)\
                    .order('completed_at', desc=True)\
                    .limit(1)\
                    .execute()
                
                completion_date = latest_completion.data[0]['completed_at'] if latest_completion.data else datetime.utcnow().isoformat()
                
                try:
                    result = supabase.table('user_quests')\
                        .update({
                            'completed_at': completion_date,
                            'is_active': False
                        })\
                        .eq('id', user_quest_id)\
                        .execute()
                except Exception as e:
                    print(f"  [ERROR] Database error: {e}")
                    print("  Trying alternative update approach...")
                    # Try without triggering any database functions
                    import httpx
                    headers = {
                        "apikey": os.environ.get("SUPABASE_SERVICE_KEY"),
                        "Authorization": f"Bearer {os.environ.get('SUPABASE_SERVICE_KEY')}",
                        "Content-Type": "application/json",
                        "Prefer": "return=representation"
                    }
                    update_url = f"{url}/rest/v1/user_quests?id=eq.{user_quest_id}"
                    response = httpx.patch(update_url, json={
                        'completed_at': completion_date,
                        'is_active': False
                    }, headers=headers)
                    if response.status_code == 200:
                        result = type('obj', (object,), {'data': response.json()})()
                    else:
                        result = type('obj', (object,), {'data': None})()
                        print(f"  [ERROR] Failed to update: {response.status_code} - {response.text}")
                
                if result.data:
                    print(f"  [SUCCESS] Quest marked as completed at {completion_date}")
                else:
                    print(f"  [FAILED] Failed to update quest completion status")
            else:
                print(f"  Quest already marked as completed at {user_quest['completed_at']}")
        else:
            missing_tasks = required_task_ids - completed_task_ids
            print(f"  [MISSING] Missing {len(missing_tasks)} required task(s)")
            
            # Show which tasks are missing
            for task in all_tasks.data:
                if task['id'] in missing_tasks:
                    print(f"    - {task['title']}")

def check_all_user_quests(user_id: str):
    """Show all quests and their completion status for a user."""
    print(f"\n=== All quests for user {user_id} ===")
    
    all_quests = supabase.table('user_quests')\
        .select('*, quests(title)')\
        .eq('user_id', user_id)\
        .order('started_at', desc=True)\
        .execute()
    
    if not all_quests.data:
        print("No quests found.")
        return
        
    for quest in all_quests.data:
        status = "[COMPLETED]" if quest['completed_at'] else ("[ACTIVE]" if quest['is_active'] else "[INACTIVE]")
        title = quest['quests']['title'] if quest.get('quests') else 'Unknown'
        print(f"{status} - {title}")
        print(f"  Started: {quest['started_at']}")
        print(f"  Completed: {quest['completed_at'] or 'Not completed'}")
        print()

if __name__ == "__main__":
    # Your user ID
    user_id = "ad8e119c-0685-4431-8381-527273832ca9"
    
    # Show all quests first
    check_all_user_quests(user_id)
    
    # Fix completion status
    fix_quest_completion(user_id)
    
    # Show updated status
    print("\n=== Updated quest status ===")
    check_all_user_quests(user_id)