"""Check XP data for debugging"""

from database import get_supabase_client
import sys

def check_user_xp(user_id):
    supabase = get_supabase_client()
    
    print(f"\n=== XP Debug for User {user_id} ===\n")
    
    # 1. Check user_skill_xp table
    print("1. Current user_skill_xp records:")
    skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
    total_stored = 0
    if skill_xp.data:
        for record in skill_xp.data:
            print(f"  - {record['skill_category']}: {record['total_xp']} XP")
            total_stored += record['total_xp']
        print(f"  TOTAL in user_skill_xp: {total_stored} XP")
    else:
        print("  No records found")
    
    # 2. Check completed quests
    print("\n2. Completed quests:")
    completed = supabase.table('user_quests').select('*, quests(id, title)').eq('user_id', user_id).eq('status', 'completed').execute()
    if completed.data:
        print(f"  Found {len(completed.data)} completed quests")
        for quest in completed.data:
            print(f"  - {quest['quests']['title']} (ID: {quest['quests']['id']})")
    
    # 3. Check quest XP awards
    print("\n3. XP that SHOULD be awarded:")
    if completed.data:
        quest_ids = [q['quests']['id'] for q in completed.data]
        skill_awards = supabase.table('quest_skill_xp').select('*').in_('quest_id', quest_ids).execute()
        
        actual_total = 0
        xp_by_quest = {}
        
        if skill_awards.data:
            for award in skill_awards.data:
                quest_id = award['quest_id']
                if quest_id not in xp_by_quest:
                    xp_by_quest[quest_id] = []
                xp_by_quest[quest_id].append((award['skill_category'], award['xp_amount']))
                actual_total += award['xp_amount']
            
            # Show XP per quest
            for quest in completed.data:
                quest_id = quest['quests']['id']
                quest_title = quest['quests']['title']
                if quest_id in xp_by_quest:
                    print(f"\n  Quest: {quest_title}")
                    quest_total = 0
                    for category, amount in xp_by_quest[quest_id]:
                        print(f"    - {category}: {amount} XP")
                        quest_total += amount
                    print(f"    Quest total: {quest_total} XP")
            
            print(f"\n  ACTUAL TOTAL (from quest_skill_xp): {actual_total} XP")
    
    # 4. Compare
    print("\n4. COMPARISON:")
    print(f"  - Stored in user_skill_xp: {total_stored} XP")
    print(f"  - Should be (from quests): {actual_total} XP")
    if total_stored != actual_total:
        print(f"  - MISMATCH: Difference of {total_stored - actual_total} XP")
        print("\n  ACTION NEEDED: Clear user_skill_xp table and recalculate")
    else:
        print("  - ✓ XP values match!")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        check_user_xp(sys.argv[1])
    else:
        # Default to checking a specific user
        check_user_xp('ad8e119c-0685-4431-8381-527273832ca9')  # Your user ID from the logs