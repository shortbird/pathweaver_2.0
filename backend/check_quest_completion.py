"""Check quest completion status and fix if needed"""

from database import get_supabase_admin_client
from datetime import datetime

def check_and_fix_quest_completion():
    supabase = get_supabase_admin_client()
    
    print("=== CHECKING QUEST COMPLETION STATUS ===\n")
    
    # Get all active user quests
    active_quests = supabase.table('user_quests')\
        .select('*, quests(title)')\
        .eq('is_active', True)\
        .execute()
    
    if not active_quests.data:
        print("No active quests found")
        return
    
    for enrollment in active_quests.data:
        user_id = enrollment['user_id']
        quest_id = enrollment['quest_id']
        user_quest_id = enrollment['id']
        quest_title = enrollment['quests']['title']
        
        print(f"User ID: {user_id[:8]}...")
        print(f"Quest: {quest_title}")
        
        # Get all tasks for this quest
        all_tasks = supabase.table('quest_tasks')\
            .select('id, title, is_required')\
            .eq('quest_id', quest_id)\
            .execute()
        
        if not all_tasks.data:
            print("  No tasks found for this quest\n")
            continue
            
        total_tasks = len(all_tasks.data)
        required_tasks = [t for t in all_tasks.data if t.get('is_required', False)]
        required_count = len(required_tasks)
        
        print(f"  Total tasks: {total_tasks}")
        print(f"  Required tasks: {required_count}")
        
        # Get completed tasks for this user and quest
        completed_tasks = supabase.table('user_quest_tasks')\
            .select('quest_task_id')\
            .eq('user_id', user_id)\
            .eq('user_quest_id', user_quest_id)\
            .execute()
        
        completed_task_ids = {t['quest_task_id'] for t in completed_tasks.data}
        completed_count = len(completed_task_ids)
        
        print(f"  Completed tasks: {completed_count}/{total_tasks}")
        
        # Check if quest should be marked complete
        all_task_ids = {t['id'] for t in all_tasks.data}
        required_task_ids = {t['id'] for t in required_tasks}
        
        # If no required tasks are specified, treat all tasks as required
        if not required_task_ids:
            print("  No required tasks specified - treating all tasks as required")
            required_task_ids = all_task_ids
        
        should_be_complete = required_task_ids.issubset(completed_task_ids)
        
        if should_be_complete:
            print(f"  [COMPLETE] Quest SHOULD be marked complete!")
            
            # Mark quest as complete
            print(f"  Marking quest as complete...")
            result = supabase.table('user_quests')\
                .update({
                    'completed_at': datetime.utcnow().isoformat(),
                    'is_active': False
                })\
                .eq('id', user_quest_id)\
                .execute()
            
            if result.data:
                print(f"  [SUCCESS] Successfully marked quest as complete")
            else:
                print(f"  [FAILED] Failed to mark quest as complete")
        else:
            incomplete_required = required_task_ids - completed_task_ids
            print(f"  Quest is not complete - {len(incomplete_required)} required tasks remaining")
            for task_id in incomplete_required:
                task = next((t for t in all_tasks.data if t['id'] == task_id), None)
                if task:
                    print(f"    - {task['title']}")
        
        print()

if __name__ == "__main__":
    check_and_fix_quest_completion()