"""Debug script to check XP values in database"""

from database import get_supabase_admin_client
import json

def debug_xp():
    supabase = get_supabase_admin_client()
    
    # Get user ID for tannerbowman
    user_result = supabase.table('users').select('id, first_name, last_name').execute()
    
    print("=== ALL USERS ===")
    for user in user_result.data:
        print(f"User: {user['id'][:8]}... - {user.get('first_name', '')} {user.get('last_name', '')}")
    
    # Check first user's XP
    if user_result.data:
        user_id = user_result.data[0]['id']
        print(f"\n=== CHECKING USER {user_id} ===")
        
        # Check user_skill_xp table
        skill_xp = supabase.table('user_skill_xp')\
            .select('*')\
            .eq('user_id', user_id)\
            .execute()
        
        print("\n=== USER_SKILL_XP TABLE ===")
        if skill_xp.data:
            total = 0
            for record in skill_xp.data:
                print(f"Pillar: {record.get('pillar')}, XP: {record.get('xp_amount')}")
                total += record.get('xp_amount', 0)
            print(f"Total XP: {total}")
        else:
            print("No records found")
        
        # Check completed tasks
        completed_tasks = supabase.table('user_quest_tasks')\
            .select('*, quest_tasks(pillar, xp_amount)')\
            .eq('user_id', user_id)\
            .execute()
        
        print("\n=== COMPLETED TASKS ===")
        if completed_tasks.data:
            task_total = 0
            for task in completed_tasks.data:
                xp = task.get('xp_awarded', 0)
                task_total += xp
                task_info = task.get('quest_tasks', {})
                print(f"Task XP: {xp}, Pillar: {task_info.get('pillar')}")
            print(f"Total XP from tasks: {task_total}")
        else:
            print("No completed tasks")
        
        # Check active quests
        active_quests = supabase.table('user_quests')\
            .select('*, quests(title)')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .execute()
        
        print("\n=== ACTIVE QUESTS ===")
        if active_quests.data:
            for quest in active_quests.data:
                quest_title = quest.get('quests', {}).get('title', 'Unknown')
                print(f"Quest: {quest_title}, Started: {quest.get('started_at')}")
        else:
            print("No active quests")
            
        # Check all user_quests
        all_quests = supabase.table('user_quests')\
            .select('*, quests(title)')\
            .eq('user_id', user_id)\
            .execute()
        
        print("\n=== ALL USER QUESTS ===")
        if all_quests.data:
            for quest in all_quests.data:
                quest_title = quest.get('quests', {}).get('title', 'Unknown')
                is_active = quest.get('is_active')
                completed_at = quest.get('completed_at')
                print(f"Quest: {quest_title}, Active: {is_active}, Completed: {completed_at}")
        else:
            print("No quests found")

if __name__ == "__main__":
    debug_xp()