"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED - Utility Functions
- Pure utility/helper functions for XP calculations
- Shared constants (SKILL_CATEGORIES, SUBJECT_TO_SKILL_MAP)
- Helper functions don't follow repository pattern (not CRUD operations)
- Utility code should remain in helpers

Shared helper functions for user routes
"""

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

        if skill_xp.data:
            for record in skill_xp.data:
                pillar = record.get('pillar')
                xp_amount = record.get('xp_amount', 0)

                if pillar in skill_breakdown:
                    total_xp += xp_amount
                    skill_breakdown[pillar] += xp_amount
                else:
                    # Handle old pillar keys - map them to new single-word format
                    from utils.pillar_utils import normalize_pillar_name
                    try:
                        normalized_pillar = normalize_pillar_name(pillar)
                        if normalized_pillar in skill_breakdown:
                            total_xp += xp_amount
                            skill_breakdown[normalized_pillar] += xp_amount
                        else:
                            logger.warning(f"Unknown normalized pillar '{normalized_pillar}' for user {user_id}")
                    except ValueError:
                        logger.warning(f"Could not normalize pillar '{pillar}' for user {user_id}")

        # If no XP from user_skill_xp, calculate from COMPLETED tasks
        # This handles org students whose XP isn't synced to user_skill_xp
        if total_xp == 0:
            # Get completed tasks with their XP values
            completed_tasks = supabase.table('quest_task_completions')\
                .select('user_quest_task_id, user_quest_tasks!quest_task_completions_user_quest_task_id_fkey(pillar, xp_value)')\
                .eq('user_id', user_id)\
                .execute()

            if completed_tasks.data:
                logger.info(f"Calculating XP from {len(completed_tasks.data)} completed tasks for user {user_id}")
                for completion in completed_tasks.data:
                    task = completion.get('user_quest_tasks') or {}
                    pillar = task.get('pillar')
                    xp_amount = task.get('xp_value', 0) or 0

                    if pillar in skill_breakdown:
                        total_xp += xp_amount
                        skill_breakdown[pillar] += xp_amount
                    else:
                        # Try to normalize pillar name
                        from utils.pillar_utils import normalize_pillar_name
                        try:
                            normalized_pillar = normalize_pillar_name(pillar)
                            if normalized_pillar in skill_breakdown:
                                total_xp += xp_amount
                                skill_breakdown[normalized_pillar] += xp_amount
                        except ValueError:
                            pass

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
            from utils.pillar_utils import normalize_pillar_name
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
                            logger.info(f"Quest '{quest_title}': {category} +{amount} XP")
                        
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


# Valid diploma subject enum values (must match database enum and frontend CREDIT_REQUIREMENTS)
VALID_DIPLOMA_SUBJECTS = {
    'language_arts', 'math', 'science', 'social_studies', 'financial_literacy',
    'health', 'pe', 'fine_arts', 'cte', 'digital_literacy', 'electives'
}

# Mapping from various subject name formats to canonical enum values
SUBJECT_NAME_MAPPINGS = {
    # Mathematics variations
    'mathematics': 'math',
    'maths': 'math',
    'algebra': 'math',
    'geometry': 'math',
    'calculus': 'math',
    'statistics': 'math',

    # Physical Education variations
    'physical_education': 'pe',
    'physical education': 'pe',
    'phys_ed': 'pe',
    'sports': 'pe',
    'fitness': 'pe',

    # Career & Technical Education variations
    'career_&_technical_education': 'cte',
    'career_and_technical_education': 'cte',
    'career & technical education': 'cte',
    'career and technical education': 'cte',
    'vocational': 'cte',
    'technical_education': 'cte',
    'business': 'cte',
    'technology': 'cte',
    'engineering': 'cte',
    'construction': 'cte',

    # Fine Arts variations
    'art': 'fine_arts',
    'arts': 'fine_arts',
    'visual_arts': 'fine_arts',
    'music': 'fine_arts',
    'theater': 'fine_arts',
    'theatre': 'fine_arts',
    'drama': 'fine_arts',
    'design': 'fine_arts',

    # Language Arts variations
    'english': 'language_arts',
    'reading': 'language_arts',
    'writing': 'language_arts',
    'literature': 'language_arts',
    'composition': 'language_arts',

    # Social Studies variations
    'history': 'social_studies',
    'geography': 'social_studies',
    'government': 'social_studies',
    'civics_education': 'social_studies',
    'economics': 'social_studies',
    'political_science': 'social_studies',

    # Health variations
    'wellness': 'health',
    'nutrition': 'health',
    'life_skills': 'health',

    # Science variations
    'biology': 'science',
    'chemistry': 'science',
    'physics': 'science',
    'earth_science': 'science',
    'environmental_science': 'science',
}


def normalize_diploma_subject(subject_name: str) -> str:
    """
    Normalize a diploma subject name to its canonical enum value.

    This handles various formats that may appear in diploma_subjects JSON:
    - Display names like "Fine Arts", "Social Studies", "Mathematics"
    - Already normalized names like "fine_arts", "social_studies"
    - Variations and aliases like "Art", "History", "PE"

    Args:
        subject_name: The subject name to normalize (e.g., "Mathematics", "Fine Arts")

    Returns:
        Canonical subject enum value (e.g., "math", "fine_arts") or None if not recognized
    """
    if not subject_name:
        return None

    # Convert to lowercase and replace spaces with underscores
    normalized = subject_name.lower().strip().replace(' ', '_').replace('&', 'and')

    # If already a valid enum value, return as-is
    if normalized in VALID_DIPLOMA_SUBJECTS:
        return normalized

    # Check special mappings
    if normalized in SUBJECT_NAME_MAPPINGS:
        return SUBJECT_NAME_MAPPINGS[normalized]

    # Try without underscores (handles cases like "fineart" vs "fine_arts")
    without_underscores = normalized.replace('_', '')
    for valid_subject in VALID_DIPLOMA_SUBJECTS:
        if valid_subject.replace('_', '') == without_underscores:
            return valid_subject

    # Log unrecognized subjects for debugging
    logger.warning(f"Unrecognized diploma subject: '{subject_name}' (normalized: '{normalized}')")

    return None


def calculate_subject_xp_from_tasks(completed_tasks_data: list) -> Dict[str, int]:
    """
    Calculate subject XP from completed tasks.

    Prefers subject_xp_distribution (direct XP values) over diploma_subjects (percentages).
    Falls back to diploma_subjects if subject_xp_distribution is not present.

    Args:
        completed_tasks_data: List of completion records with nested user_quest_tasks data

    Returns:
        Dict mapping normalized subject names to XP amounts
    """
    subject_xp = {}

    logger.info(f"[DIPLOMA DEBUG] Processing {len(completed_tasks_data)} completed tasks")

    for i, completion in enumerate(completed_tasks_data):
        task = completion.get('user_quest_tasks') or {}

        # Prefer subject_xp_distribution (direct XP values)
        subject_xp_distribution = task.get('subject_xp_distribution')
        if subject_xp_distribution and isinstance(subject_xp_distribution, dict):
            logger.info(f"[DIPLOMA DEBUG] Task {i}: Using subject_xp_distribution: {subject_xp_distribution}")
            for subject, xp_amount in subject_xp_distribution.items():
                normalized_subject = normalize_diploma_subject(subject)
                if normalized_subject and isinstance(xp_amount, (int, float)) and xp_amount > 0:
                    subject_xp[normalized_subject] = subject_xp.get(normalized_subject, 0) + int(xp_amount)
            continue

        # Fall back to diploma_subjects (percentage-based)
        diploma_subjects = task.get('diploma_subjects')
        logger.info(f"[DIPLOMA DEBUG] Task {i}: user_quest_tasks={task}, diploma_subjects={diploma_subjects}")

        # Skip if no diploma_subjects or not a dict (some old data has arrays)
        if not diploma_subjects or not isinstance(diploma_subjects, dict):
            logger.info(f"[DIPLOMA DEBUG] Task {i}: Skipping - no valid diploma_subjects or subject_xp_distribution")
            continue

        task_xp = task.get('xp_value', 0) or 0
        if task_xp <= 0:
            logger.info(f"[DIPLOMA DEBUG] Task {i}: Skipping - no XP value")
            continue

        for subject, percentage in diploma_subjects.items():
            normalized_subject = normalize_diploma_subject(subject)
            logger.info(f"[DIPLOMA DEBUG] Task {i}: '{subject}' -> '{normalized_subject}' ({percentage}% of {task_xp} XP)")
            if normalized_subject and isinstance(percentage, (int, float)):
                subject_xp_amount = int(task_xp * percentage / 100)
                if subject_xp_amount > 0:
                    subject_xp[normalized_subject] = subject_xp.get(normalized_subject, 0) + subject_xp_amount

    logger.info(f"[DIPLOMA DEBUG] Final subject_xp: {subject_xp}")
    return subject_xp