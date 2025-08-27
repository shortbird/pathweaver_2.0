"""Fix user XP by properly calculating and storing it"""

from database import get_supabase_admin_client
import sys

# The 5 diploma pillars (as defined in the database)
SKILL_CATEGORIES = [
    'creativity',
    'critical_thinking', 
    'practical_skills',
    'communication',
    'cultural_literacy'
]

# No mapping needed - the quest_skill_xp table already uses these names
SKILL_MAPPING = {}

def fix_user_xp(user_id):
    supabase = get_supabase_admin_client()
    
    print(f"\nFixing XP for user {user_id}...")
    
    # 1. Clear existing user_skill_xp records
    print("1. Clearing existing user_skill_xp records...")
    supabase.table('user_skill_xp').delete().eq('user_id', user_id).execute()
    
    # 2. Get completed quests
    completed = supabase.table('user_quests')\
        .select('*, quests(id, title)')\
        .eq('user_id', user_id)\
        .eq('status', 'completed')\
        .execute()
    
    if not completed.data:
        print("No completed quests found")
        return
    
    print(f"2. Found {len(completed.data)} completed quests")
    
    # 3. Calculate XP from quest awards
    quest_ids = [q['quests']['id'] for q in completed.data]
    skill_awards = supabase.table('quest_skill_xp')\
        .select('*')\
        .in_('quest_id', quest_ids)\
        .execute()
    
    xp_by_category = {cat: 0 for cat in SKILL_CATEGORIES}
    total_xp = 0
    
    if skill_awards.data:
        for award in skill_awards.data:
            # Check if this quest was actually completed by this user
            quest_completed = any(q['quests']['id'] == award['quest_id'] for q in completed.data)
            if not quest_completed:
                continue
                
            category = award['skill_category']
            
            # Map old category names to new ones if needed
            if category not in SKILL_CATEGORIES:
                category = SKILL_MAPPING.get(category, 'thinking_skills')  # Default to thinking_skills
                print(f"  Mapping {award['skill_category']} -> {category}")
            
            amount = award['xp_amount']
            xp_by_category[category] += amount
            total_xp += amount
            
            # Find quest title for logging
            quest_title = next((q['quests']['title'] for q in completed.data if q['quests']['id'] == award['quest_id']), 'Unknown')
            print(f"  Quest '{quest_title}': {category} +{amount} XP")
    
    print(f"\n3. Total XP calculated: {total_xp}")
    
    # 4. Store in user_skill_xp table
    print("4. Storing in user_skill_xp table...")
    for category, xp in xp_by_category.items():
        if xp > 0:
            result = supabase.table('user_skill_xp').insert({
                'user_id': user_id,
                'skill_category': category,
                'total_xp': xp
            }).execute()
            print(f"  Stored {category}: {xp} XP")
    
    print(f"\nDone! Total XP: {total_xp}")
    print("XP breakdown:")
    for category, xp in xp_by_category.items():
        if xp > 0:
            print(f"  - {category}: {xp} XP")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        fix_user_xp(sys.argv[1])
    else:
        fix_user_xp('ad8e119c-0685-4431-8381-527273832ca9')  # Your user ID