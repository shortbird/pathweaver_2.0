"""Shared helper functions for user routes"""

from typing import Tuple, Dict, List
from cache import cached as cache_decorator

SKILL_CATEGORIES = [
    'reading_writing', 
    'thinking_skills', 
    'personal_growth', 
    'life_skills', 
    'making_creating', 
    'world_understanding'
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
    
    try:
        # Get skill-based XP from user_skill_xp table
        skill_xp = supabase.table('user_skill_xp')\
            .select('skill_category, total_xp')\
            .eq('user_id', user_id)\
            .execute()
        
        if skill_xp.data:
            for record in skill_xp.data:
                xp_amount = record.get('total_xp', 0)
                total_xp += xp_amount
                skill_breakdown[record['skill_category']] = xp_amount
    except Exception as e:
        print(f"Error getting skill XP: {str(e)}")
        
    # If no XP in user_skill_xp table, calculate from completed quests
    if total_xp == 0:
        total_xp, skill_breakdown = calculate_xp_from_quests(supabase, user_id)
    
    return total_xp, skill_breakdown

def calculate_xp_from_quests(supabase, user_id: str) -> Tuple[int, Dict[str, int]]:
    """
    Calculate XP from completed quests (fallback method)
    """
    total_xp = 0
    skill_breakdown = {cat: 0 for cat in SKILL_CATEGORIES}
    
    try:
        completed_quests = supabase.table('user_quests')\
            .select('*, quests(id)')\
            .eq('user_id', user_id)\
            .eq('status', 'completed')\
            .execute()
        
        if not completed_quests.data:
            return total_xp, skill_breakdown
        
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
                for award in skill_awards.data:
                    category = award['skill_category']
                    amount = award['xp_amount']
                    skill_breakdown[category] += amount
                    total_xp += amount
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