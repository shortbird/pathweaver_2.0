"""Shared helper functions for user routes"""

from typing import Tuple, Dict, List
from cache import cached as cache_decorator

from utils.logger import get_logger

logger = get_logger(__name__)

SKILL_CATEGORIES = [
    'art',
    'stem',
    'wellness',
    'communication',
    'civics'
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
    Calculate user's total XP and breakdown by skill category from V3 system

    Returns:
        Tuple of (total_xp, skill_breakdown_dict)
    """
    total_xp = 0
    skill_breakdown = {cat: 0 for cat in SKILL_CATEGORIES}

    try:
        # V3 System: Get XP directly from user_skill_xp table (the source of truth)
        # Note: user_quest_tasks doesn't have completed_at or xp_awarded columns
        # XP is awarded when tasks complete and stored in user_skill_xp table
        skill_xp = supabase.table('user_skill_xp')\
            .select('pillar, xp_amount')\
            .eq('user_id', user_id)\
            .execute()

        logger.debug(f"=== XP CALCULATION DEBUG for user {user_id} ===")
        logger.info(f"Found {len(skill_xp.data) if skill_xp.data else 0} skill XP records")

        if skill_xp.data:
            logger.debug(f"Processing {len(skill_xp.data)} skill XP records...")
            for i, record in enumerate(skill_xp.data):
                pillar = record.get('pillar')
                xp_amount = record.get('xp_amount', 0)

                print(f"Record {i+1}: Pillar='{pillar}', XP={xp_amount}")

                if pillar in skill_breakdown:
                    total_xp += xp_amount
                    skill_breakdown[pillar] += xp_amount
                    logger.info(f"  ✓ Added {xp_amount} XP to {pillar} (total now: {skill_breakdown[pillar]})")
                else:
                    # Handle old pillar keys - map them to new single-word format
                    from utils.pillar_mapping import normalize_pillar_name
                    try:
                        normalized_pillar = normalize_pillar_name(pillar)
                        if normalized_pillar in skill_breakdown:
                            total_xp += xp_amount
                            skill_breakdown[normalized_pillar] += xp_amount
                            print(f"  ✓ Mapped '{pillar}' -> '{normalized_pillar}', added {xp_amount} XP")
                        else:
                            print(f"  ❌ WARNING: Normalized pillar '{normalized_pillar}' not in {list(skill_breakdown.keys())}")
                    except ValueError:
                        print(f"  ❌ WARNING: Unknown pillar '{pillar}' could not be normalized")

            logger.debug(f"After processing all records - skill breakdown: {skill_breakdown}")
        else:
            logger.info("No skill XP records found")

        logger.info(f"Final total XP: {total_xp}")
        logger.info(f"Final skill_breakdown: {skill_breakdown}")
        logger.info("=======================================")

    except Exception as e:
        logger.error(f"Error calculating XP from V3 tasks: {str(e)}")
        # Fallback to old method if V3 fails
        return calculate_xp_from_legacy_tables(supabase, user_id)

    return total_xp, skill_breakdown

def calculate_xp_from_legacy_tables(supabase, user_id: str) -> Tuple[int, Dict[str, int]]:
    """
    Legacy XP calculation from user_skill_xp table (fallback)
    """
    total_xp = 0
    skill_breakdown = {cat: 0 for cat in SKILL_CATEGORIES}

    try:
        # Get skill-based XP from user_skill_xp table - uses 'pillar' and 'xp_amount' columns
        skill_xp = supabase.table('user_skill_xp')\
            .select('pillar, xp_amount')\
            .eq('user_id', user_id)\
            .execute()

        logger.info(f"=== LEGACY XP CALCULATION for user {user_id} ===")
        logger.info(f"Raw skill_xp query response count: {len(skill_xp.data) if skill_xp.data else 0}")

        if skill_xp.data:
            from utils.pillar_mapping import normalize_pillar_name
            for record in skill_xp.data:
                xp_amount = record.get('xp_amount', 0)
                skill_cat = record.get('pillar')

                # Normalize pillar to new single-word format
                try:
                    normalized_pillar = normalize_pillar_name(skill_cat)
                except ValueError:
                    # If normalization fails, try direct match
                    normalized_pillar = skill_cat

                if normalized_pillar in skill_breakdown:
                    total_xp += xp_amount
                    skill_breakdown[normalized_pillar] += xp_amount

        logger.info(f"Legacy total XP: {total_xp}")
        logger.info("======================================")
    except Exception as e:
        logger.error(f"Error getting legacy skill XP: {str(e)}")

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
        
        logger.info(f"User {user_id} has {len(completed_quests.data)} completed quests")
        
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
                logger.info(f"Found {len(skill_awards.data)} skill XP awards")
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
                        
                logger.info(f"Total XP from skill awards: {total_xp}")
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
        logger.error(f"Error calculating XP from quests: {str(e)}")
    
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
        logger.error(f"Error fetching user skills: {str(e)}")
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
        'art': 'Art',
        'stem': 'STEM',
        'wellness': 'Wellness',
        'communication': 'Communication',
        'civics': 'Civics'
    }

    for category, xp in skill_breakdown.items():
        formatted.append({
            'category': category,
            'display_name': skill_display_names.get(category, category),
            'xp': xp,
            'percentage': 0  # Will be calculated on frontend based on total
        })

    return formatted