"""Test the completed quests endpoint"""

from database import get_supabase_admin_client
import json

def test_completed_quests():
    supabase = get_supabase_admin_client()
    
    print("Starting test...")
    
    # Get user with first name Tanner
    user = supabase.table('users').select('id, first_name, last_name').eq('first_name', 'Tanner').execute()
    
    print(f"User query result: {len(user.data) if user.data else 0} users found")
    
    if user.data:
        user_id = user.data[0]['id']
        print(f"Testing for user: {user.data[0]['first_name']} {user.data[0]['last_name']} ({user_id[:8]}...)")
        
        # Test the same query as the endpoint
        try:
            completed_quests = supabase.table('user_quests')\
                .select('*, quests(*, quest_tasks(*)), user_quest_tasks(*, quest_tasks(*))')\
                .eq('user_id', user_id)\
                .not_.is_('completed_at', 'null')\
                .execute()
        except Exception as e:
            print(f"Error with complex query: {str(e)}")
            # Try simpler query
            completed_quests = supabase.table('user_quests')\
                .select('*, quests(*)')\
                .eq('user_id', user_id)\
                .not_.is_('completed_at', 'null')\
                .execute()
        
        print(f"\n=== COMPLETED QUESTS FOUND: {len(completed_quests.data) if completed_quests.data else 0} ===")
        
        if completed_quests.data:
            for cq in completed_quests.data:
                quest = cq.get('quests')
                if quest:
                    print(f"\nQuest: {quest.get('title')}")
                    print(f"Completed at: {cq.get('completed_at')}")
                    print(f"Quest tasks: {len(quest.get('quest_tasks', []))}")
                    print(f"User quest tasks: {len(cq.get('user_quest_tasks', []))}")
                    
                    # Check task evidence structure
                    task_evidence = {}
                    for task_completion in cq.get('user_quest_tasks', []):
                        task_data = task_completion.get('quest_tasks')
                        if task_data:
                            task_evidence[task_data['title']] = {
                                'evidence_type': task_completion['evidence_type'],
                                'evidence_content': task_completion['evidence_content'],
                                'xp_awarded': task_completion['xp_awarded'],
                                'completed_at': task_completion['completed_at'],
                                'pillar': task_data['pillar']
                            }
                    
                    print(f"Task evidence entries: {len(task_evidence)}")
                    
                    # Calculate total XP
                    total_xp = sum(t['xp_awarded'] for t in cq.get('user_quest_tasks', []))
                    print(f"Total XP earned: {total_xp}")

if __name__ == "__main__":
    test_completed_quests()