"""
Utility script to ensure all quests have XP awards assigned.
This can be run to fix quests that are missing XP awards.
"""

from database import get_supabase_admin_client
import random

def ensure_quest_xp_awards():
    """Ensure all quests have XP awards in the new skill-based system"""
    supabase = get_supabase_admin_client()
    
    # Get all quests
    quests = supabase.table('quests').select('*').execute()
    
    if not quests.data:
        print("No quests found")
        return
    
    skill_categories = [
        'reading_writing',
        'thinking_skills', 
        'personal_growth',
        'life_skills',
        'making_creating',
        'world_understanding'
    ]
    
    for quest in quests.data:
        quest_id = quest['id']
        
        # Check if quest already has skill XP awards
        existing_awards = supabase.table('quest_skill_xp').select('*').eq('quest_id', quest_id).execute()
        
        if not existing_awards.data:
            print(f"Quest {quest['title']} has no XP awards, adding them...")
            
            # Determine XP based on difficulty and effort level
            base_xp = 100  # Default base XP
            
            if quest.get('difficulty_level'):
                if quest['difficulty_level'] == 'beginner':
                    base_xp = 50
                elif quest['difficulty_level'] == 'intermediate':
                    base_xp = 100
                elif quest['difficulty_level'] == 'advanced':
                    base_xp = 200
            
            if quest.get('effort_level'):
                if quest['effort_level'] == 'light':
                    base_xp = int(base_xp * 0.8)
                elif quest['effort_level'] == 'moderate':
                    base_xp = int(base_xp * 1.0)
                elif quest['effort_level'] == 'intensive':
                    base_xp = int(base_xp * 1.5)
            
            # Assign XP to 1-3 random skill categories
            num_categories = random.randint(1, 3)
            selected_categories = random.sample(skill_categories, num_categories)
            
            # If core_skills are specified, try to map them to categories
            if quest.get('core_skills'):
                # Override with intelligent mapping based on core skills
                selected_categories = []
                core_skills_lower = [s.lower() for s in quest['core_skills']]
                
                # Map skills to categories
                for skill in core_skills_lower:
                    if any(word in skill for word in ['read', 'write', 'essay', 'story', 'journal']):
                        if 'reading_writing' not in selected_categories:
                            selected_categories.append('reading_writing')
                    elif any(word in skill for word in ['think', 'problem', 'solve', 'analyze', 'critical']):
                        if 'thinking_skills' not in selected_categories:
                            selected_categories.append('thinking_skills')
                    elif any(word in skill for word in ['personal', 'self', 'emotion', 'confidence']):
                        if 'personal_growth' not in selected_categories:
                            selected_categories.append('personal_growth')
                    elif any(word in skill for word in ['life', 'practical', 'everyday', 'cook', 'budget']):
                        if 'life_skills' not in selected_categories:
                            selected_categories.append('life_skills')
                    elif any(word in skill for word in ['make', 'create', 'build', 'design', 'art', 'craft']):
                        if 'making_creating' not in selected_categories:
                            selected_categories.append('making_creating')
                    elif any(word in skill for word in ['world', 'culture', 'history', 'geography', 'science']):
                        if 'world_understanding' not in selected_categories:
                            selected_categories.append('world_understanding')
                
                # If no categories matched, use random
                if not selected_categories:
                    selected_categories = random.sample(skill_categories, min(2, len(skill_categories)))
            
            # Distribute XP among selected categories
            xp_per_category = base_xp // len(selected_categories)
            remainder = base_xp % len(selected_categories)
            
            for i, category in enumerate(selected_categories):
                xp_amount = xp_per_category
                if i == 0:  # Add remainder to first category
                    xp_amount += remainder
                
                try:
                    supabase.table('quest_skill_xp').insert({
                        'quest_id': quest_id,
                        'skill_category': category,
                        'xp_amount': xp_amount
                    }).execute()
                    print(f"  Added {xp_amount} XP for {category}")
                except Exception as e:
                    print(f"  Error adding XP for {category}: {str(e)}")
        else:
            print(f"Quest {quest['title']} already has {len(existing_awards.data)} XP awards")
    
    print("\nDone! All quests now have XP awards.")

def recalculate_user_xp():
    """Recalculate all user XP based on completed quests"""
    supabase = get_supabase_admin_client()
    
    # Get all users
    users = supabase.table('users').select('id').execute()
    
    for user in users.data:
        user_id = user['id']
        print(f"\nRecalculating XP for user {user_id}...")
        
        # Reset user's skill XP
        skill_categories = [
            'reading_writing', 'thinking_skills', 'personal_growth',
            'life_skills', 'making_creating', 'world_understanding'
        ]
        
        for category in skill_categories:
            # Check if record exists
            existing = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).eq('skill_category', category).execute()
            
            if not existing.data:
                # Create new record with 0 XP
                supabase.table('user_skill_xp').insert({
                    'user_id': user_id,
                    'skill_category': category,
                    'total_xp': 0
                }).execute()
            else:
                # Reset to 0
                supabase.table('user_skill_xp').update({
                    'total_xp': 0
                }).eq('user_id', user_id).eq('skill_category', category).execute()
        
        # Get all completed quests for this user
        completed_quests = supabase.table('user_quests').select('quest_id').eq('user_id', user_id).eq('status', 'completed').execute()
        
        if completed_quests.data:
            total_xp = 0
            for quest_record in completed_quests.data:
                quest_id = quest_record['quest_id']
                
                # Get XP awards for this quest
                skill_awards = supabase.table('quest_skill_xp').select('*').eq('quest_id', quest_id).execute()
                
                if skill_awards.data:
                    for award in skill_awards.data:
                        # Update user's skill XP
                        current = supabase.table('user_skill_xp').select('total_xp').eq('user_id', user_id).eq('skill_category', award['skill_category']).execute()
                        
                        new_total = (current.data[0]['total_xp'] if current.data else 0) + award['xp_amount']
                        
                        supabase.table('user_skill_xp').update({
                            'total_xp': new_total
                        }).eq('user_id', user_id).eq('skill_category', award['skill_category']).execute()
                        
                        total_xp += award['xp_amount']
                        print(f"  Added {award['xp_amount']} XP for {award['skill_category']}")
            
            print(f"  Total XP for user: {total_xp}")
    
    print("\nDone recalculating user XP!")

if __name__ == "__main__":
    print("Ensuring all quests have XP awards...")
    ensure_quest_xp_awards()
    
    print("\n" + "="*50)
    print("Recalculating user XP based on completed quests...")
    recalculate_user_xp()