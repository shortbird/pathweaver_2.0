"""Shared helper functions for user routes"""

from typing import Tuple, Dict, List
from cache import cached as cache_decorator

SKILL_CATEGORIES = [
    'creativity',
    'critical_thinking', 
    'practical_skills',
    'communication',
    'cultural_literacy'
]

# Mapping for legacy subject system to skill categories
SUBJECT_TO_SKILL_MAP = {
    'math': 'thinking_skills',
    'science': 'world_understanding', 
    'language_arts': 'reading_writing',
    'social_studies': 'world_understanding',
    'arts': 'making_creating',
    'physical_education': 'life_skills',
    'technology': 'making_creating',
    'health': 'life_skills'
}

def calculate_user_xp(supabase, user_id: str) -> Tuple[int, Dict[str, int]]:
    """
    Calculate user's total XP and breakdown by skill category
    
    Returns:
        Tuple of (total_xp, skill_breakdown_dict)
    """
    total_xp = 0
    skill_breakdown = {cat: 0 for cat in SKILL_CATEGORIES}
    has_skill_xp_records = False
    
    try:
        # Get skill-based XP from user_skill_xp table - uses 'pillar' and 'xp_amount' columns
        skill_xp = supabase.table('user_skill_xp')\
            .select('pillar, xp_amount')\
            .eq('user_id', user_id)\
            .execute()
        
        print(f"=== XP CALCULATION DEBUG for user {user_id} ===")
        print(f"Raw skill_xp data: {skill_xp.data}")
        
        if skill_xp.data:
            has_skill_xp_records = True
            for record in skill_xp.data:
                print(f"Processing record: {record}")
                xp_amount = record.get('xp_amount', 0)
                skill_cat = record.get('pillar')  # Column is named 'pillar' not 'skill_category'
                print(f"  Category: {skill_cat}, XP: {xp_amount}")
                if skill_cat in skill_breakdown:
                    total_xp += xp_amount
                    skill_breakdown[skill_cat] = xp_amount
                else:
                    print(f"  WARNING: Category '{skill_cat}' not in SKILL_CATEGORIES")
        print(f"Final skill_breakdown: {skill_breakdown}")
        print("=======================================")
    except Exception as e:
        print(f"Error getting skill XP: {str(e)}")
    
    # Check if user has completed quests
    try:
        completed_count = supabase.table('user_quests')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .execute()
        has_completed_quests = completed_count.count > 0 if hasattr(completed_count, 'count') else False
    except:
        has_completed_quests = False
        
    # If user has completed quests but no XP, recalculate and save
    if has_completed_quests and total_xp == 0:
        print(f"User {user_id} has completed quests but no XP - recalculating...")
        total_xp, skill_breakdown = calculate_xp_from_quests(supabase, user_id)
        
        # Save the calculated XP to the database
        if total_xp > 0:
            for category, xp in skill_breakdown.items():
                if xp > 0:
                    try:
                        # Check if record exists - use 'pillar' column
                        existing = supabase.table('user_skill_xp')\
                            .select('id')\
                            .eq('user_id', user_id)\
                            .eq('pillar', category)\
                            .execute()
                        
                        if existing.data:
                            # Update existing record - use 'xp_amount' column
                            supabase.table('user_skill_xp').update({
                                'xp_amount': xp
                            }).eq('user_id', user_id).eq('pillar', category).execute()
                        else:
                            # Create new record - use 'pillar' and 'xp_amount' columns
                            supabase.table('user_skill_xp').insert({
                                'user_id': user_id,
                                'pillar': category,
                                'xp_amount': xp
                            }).execute()
                        print(f"Saved XP for {category}: {xp}")
                    except Exception as e:
                        print(f"Error saving XP for {category}: {str(e)}")
    
    return total_xp, skill_breakdown

def calculate_xp_from_quests(supabase, user_id: str) -> Tuple[int, Dict[str, int]]:
    """
    Calculate XP from completed quests (fallback method)
    """
    total_xp = 0
    skill_breakdown = {cat: 0 for cat in SKILL_CATEGORIES}
    
    try:
        completed_quests = supabase.table('user_quests')\
            .select('*, quests(id, title)')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .execute()
        
        if not completed_quests.data:
            return total_xp, skill_breakdown
        
        print(f"User {user_id} has {len(completed_quests.data)} completed quests")
        
        # Extract quest IDs for batch querying
        quest_ids = [q['quests']['id'] for q in completed_quests.data if q.get('quests', {}).get('id')]
        
        if not quest_ids:
            return total_xp, skill_breakdown
        
        # Try to get skill-based XP awards
        try:
            skill_awards = supabase.table('quest_skill_xp')\
                .select('*')\
                .in_('quest_id', quest_ids)\
                .execute()
            
            if skill_awards.data:
                print(f"Found {len(skill_awards.data)} skill XP awards")
                quest_xp_map = {}
                for award in skill_awards.data:
                    quest_id = award['quest_id']
                    category = award['skill_category']
                    amount = award['xp_amount']
                    
                    # Track XP per quest to prevent duplication
                    if quest_id not in quest_xp_map:
                        quest_xp_map[quest_id] = []
                    quest_xp_map[quest_id].append((category, amount))
                    
                # Now add XP only once per quest completion
                for quest_record in completed_quests.data:
                    quest_id = quest_record['quests']['id']
                    quest_title = quest_record['quests'].get('title', 'Unknown')
                    if quest_id in quest_xp_map:
                        for category, amount in quest_xp_map[quest_id]:
                            skill_breakdown[category] += amount
                            total_xp += amount
                            print(f"Quest '{quest_title}': {category} +{amount} XP")
                        
                print(f"Total XP from skill awards: {total_xp}")
        except:
            pass
        
        # If no skill XP, try legacy subject-based XP
        if total_xp == 0:
            try:
                subject_awards = supabase.table('quest_xp_awards')\
                    .select('*')\
                    .in_('quest_id', quest_ids)\
                    .execute()
                
                if subject_awards.data:
                    for award in subject_awards.data:
                        subject = award['subject']
                        amount = award['xp_amount']
                        skill_cat = SUBJECT_TO_SKILL_MAP.get(subject, 'thinking_skills')
                        skill_breakdown[skill_cat] += amount
                        total_xp += amount
            except:
                pass
    except Exception as e:
        print(f"Error calculating XP from quests: {str(e)}")
    
    return total_xp, skill_breakdown

def get_user_skills(supabase, user_id: str) -> List[Dict]:
    """Get user's skill data"""
    try:
        skills = supabase.table('user_skill_xp')\
            .select('*')\
            .eq('user_id', user_id)\
            .execute()
        
        return skills.data if skills.data else []
    except Exception as e:
        print(f"Error fetching user skills: {str(e)}")
        return []

@cache_decorator(ttl=300)  # Cache for 5 minutes
def get_user_level(total_xp: int) -> Dict[str, any]:
    """
    Calculate user level based on total XP
    
    Returns dict with level, title, and progress to next level
    """
    levels = [
        (0, 'Novice'),
        (100, 'Apprentice'),
        (250, 'Journeyman'),
        (500, 'Adept'),
        (1000, 'Expert'),
        (2000, 'Master'),
        (5000, 'Grandmaster'),
        (10000, 'Legend')
    ]
    
    current_level = 1
    current_title = 'Novice'
    next_threshold = 100
    
    for i, (threshold, title) in enumerate(levels):
        if total_xp >= threshold:
            current_level = i + 1
            current_title = title
            next_threshold = levels[i + 1][0] if i + 1 < len(levels) else None
        else:
            break
    
    progress = 0
    if next_threshold:
        prev_threshold = levels[current_level - 2][0] if current_level > 1 else 0
        progress = ((total_xp - prev_threshold) / (next_threshold - prev_threshold)) * 100
    
    return {
        'level': current_level,
        'title': current_title,
        'next_threshold': next_threshold,
        'progress': round(progress, 1)
    }

def format_skill_data(skill_breakdown: Dict[str, int]) -> List[Dict]:
    """Format skill breakdown for frontend consumption"""
    formatted = []
    skill_display_names = {
        'reading_writing': 'Reading & Writing',
        'thinking_skills': 'Thinking Skills',
        'personal_growth': 'Personal Growth',
        'life_skills': 'Life Skills',
        'making_creating': 'Making & Creating',
        'world_understanding': 'World Understanding'
    }
    
    for category, xp in skill_breakdown.items():
        formatted.append({
            'category': category,
            'display_name': skill_display_names.get(category, category),
            'xp': xp,
            'percentage': 0  # Will be calculated on frontend based on total
        })
    
    return formatted