"""Debug completed quests for portfolio"""

from database import get_supabase_admin_client

def debug_completed_quests():
    supabase = get_supabase_admin_client()
    
    # Get user with first name Tanner
    user = supabase.table('users').select('id, first_name, last_name').eq('first_name', 'Tanner').execute()
    
    if user.data:
        user_id = user.data[0]['id']
        print(f"Checking user: {user.data[0]['first_name']} {user.data[0]['last_name']} ({user_id[:8]}...)")
        
        # Get all user_quests for this user
        all_quests = supabase.table('user_quests')\
            .select('*, quests(title)')\
            .eq('user_id', user_id)\
            .execute()
        
        print(f"\n=== ALL USER QUESTS ({len(all_quests.data)} total) ===")
        for q in all_quests.data:
            quest_title = q.get('quests', {}).get('title', 'Unknown')
            completed_at = q.get('completed_at')
            is_active = q.get('is_active')
            print(f"- {quest_title}")
            print(f"  completed_at: {completed_at}")
            print(f"  is_active: {is_active}")
        
        # Try the portfolio query
        print("\n=== TESTING PORTFOLIO QUERY ===")
        completed_quests = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .execute()
        
        print(f"Completed quests found: {len(completed_quests.data) if completed_quests.data else 0}")
        
        # Also check what the diploma page would see
        print("\n=== DIPLOMA PAGE QUERY ===")
        diploma_quests = supabase.table('user_quests')\
            .select('*, quests(*, quest_tasks(*)), user_quest_tasks(*, quest_tasks(*))')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .execute()
        
        print(f"Diploma page would see {len(diploma_quests.data) if diploma_quests.data else 0} completed quests")
        
        if diploma_quests.data:
            for cq in diploma_quests.data:
                quest = cq.get('quests', {})
                print(f"\nQuest: {quest.get('title', 'Unknown')}")
                print(f"Completed at: {cq.get('completed_at')}")
                print(f"Tasks completed: {len(cq.get('user_quest_tasks', []))}")

if __name__ == "__main__":
    debug_completed_quests()