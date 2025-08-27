"""Fix XP calculation for users with completed quests but no XP"""

from database import get_supabase_client

def recalculate_user_xp(user_id):
    """Recalculate XP for a user based on their completed quests"""
    supabase = get_supabase_client()
    
    # Get all completed quests for the user
    completed_quests = supabase.table('user_quests')\
        .select('*, quests(id)')\
        .eq('user_id', user_id)\
        .eq('status', 'completed')\
        .execute()
    
    if not completed_quests.data:
        print(f"No completed quests for user {user_id}")
        return 0
    
    total_xp = 0
    skill_breakdown = {}
    
    # For each completed quest, get the XP awards
    for quest_record in completed_quests.data:
        quest_id = quest_record['quests']['id']
        
        # Try skill-based XP first
        skill_awards = supabase.table('quest_skill_xp')\
            .select('*')\
            .eq('quest_id', quest_id)\
            .execute()
        
        if skill_awards.data:
            for award in skill_awards.data:
                category = award['skill_category']
                amount = award['xp_amount']
                
                if category not in skill_breakdown:
                    skill_breakdown[category] = 0
                skill_breakdown[category] += amount
                total_xp += amount
                
                print(f"Quest {quest_id}: {category} +{amount} XP")
    
    # Update user_skill_xp table
    for category, xp in skill_breakdown.items():
        # Check if record exists
        existing = supabase.table('user_skill_xp')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('skill_category', category)\
            .execute()
        
        if existing.data:
            # Update existing record
            supabase.table('user_skill_xp').update({
                'total_xp': xp,
                'last_updated': 'now()'
            }).eq('user_id', user_id).eq('skill_category', category).execute()
            print(f"Updated {category}: {xp} XP")
        else:
            # Create new record
            supabase.table('user_skill_xp').insert({
                'user_id': user_id,
                'skill_category': category,
                'total_xp': xp
            }).execute()
            print(f"Created {category}: {xp} XP")
    
    print(f"Total XP recalculated for user {user_id}: {total_xp}")
    return total_xp

if __name__ == "__main__":
    # You can run this directly to fix a specific user
    import sys
    if len(sys.argv) > 1:
        user_id = sys.argv[1]
        recalculate_user_xp(user_id)
    else:
        print("Usage: python fix_xp.py <user_id>")