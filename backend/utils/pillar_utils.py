"""
Utility functions for handling the new subject-aligned pillar system.
"""

# Old to new pillar mapping
PILLAR_MIGRATION_MAP = {
    'creativity': 'arts_creativity',
    'critical_thinking': 'stem_logic',
    'practical_skills': 'life_wellness',
    'communication': 'language_communication',
    'cultural_literacy': 'society_culture'
}

# Reverse mapping for database storage (database constraint only accepts old names)
NEW_TO_OLD_PILLAR_MAP = {
    'arts_creativity': 'creativity',
    'stem_logic': 'critical_thinking', 
    'life_wellness': 'practical_skills',
    'language_communication': 'communication',
    'society_culture': 'cultural_literacy'
}

# New pillar definitions
PILLARS = {
    'arts_creativity': {
        'name': 'Arts & Creativity',
        'description': 'Original creation, artistic expression, innovation',
        'color': '#ef597b',  # Pink
        'icon': 'palette',
        'subcategories': [
            'Visual Arts',
            'Music',
            'Drama & Theater',
            'Creative Writing',
            'Digital Media',
            'Design'
        ]
    },
    'stem_logic': {
        'name': 'STEM & Logic',
        'description': 'Analysis, problem-solving, technical skills, research',
        'color': '#4A90E2',  # Blue
        'icon': 'flask',
        'subcategories': [
            'Mathematics',
            'Biology',
            'Chemistry',
            'Physics',
            'Computer Science',
            'Engineering',
            'Data Science'
        ]
    },
    'language_communication': {
        'name': 'Language & Communication',
        'description': 'Expression, connection, teaching, sharing ideas',
        'color': '#50C878',  # Green
        'icon': 'message-circle',
        'subcategories': [
            'English',
            'Foreign Languages',
            'Journalism',
            'Public Speaking',
            'Digital Communication',
            'Literature'
        ]
    },
    'society_culture': {
        'name': 'Society & Culture',
        'description': 'Understanding context, community impact, global awareness',
        'color': '#FFB347',  # Orange
        'icon': 'globe',
        'subcategories': [
            'History',
            'Geography',
            'Social Studies',
            'World Cultures',
            'Civics & Government',
            'Psychology',
            'Sociology'
        ]
    },
    'life_wellness': {
        'name': 'Life & Wellness',
        'description': 'Physical activity, practical skills, personal development',
        'color': '#6d469b',  # Purple
        'icon': 'heart',
        'subcategories': [
            'Physical Education',
            'Health & Nutrition',
            'Personal Finance',
            'Life Skills',
            'Mental Wellness',
            'Outdoor Education',
            'Sports & Athletics'
        ]
    }
}

def get_pillar_info(pillar_key):
    """Get full pillar information."""
    return PILLARS.get(pillar_key, {})

def get_pillar_name(pillar_key):
    """Get display name for a pillar."""
    info = get_pillar_info(pillar_key)
    return info.get('name', pillar_key)

def get_pillar_color(pillar_key):
    """Get color for a pillar."""
    info = get_pillar_info(pillar_key)
    return info.get('color', '#999999')

def get_pillar_subcategories(pillar_key):
    """Get subcategories for a pillar."""
    info = get_pillar_info(pillar_key)
    return info.get('subcategories', [])

def migrate_old_pillar(old_pillar):
    """Convert old pillar value to new."""
    return PILLAR_MIGRATION_MAP.get(old_pillar, old_pillar)

def normalize_pillar_key(pillar_input):
    """
    Normalize pillar input to a valid pillar key.
    Handles display names, old keys, and variations.
    """
    if not pillar_input:
        return None
    
    # First check if it's already a valid key
    if pillar_input in PILLARS:
        return pillar_input
    
    # Try migrating old pillar
    migrated = migrate_old_pillar(pillar_input)
    if migrated in PILLARS:
        return migrated
    
    # Create reverse mapping from display names to keys
    name_to_key = {info['name']: key for key, info in PILLARS.items()}
    
    # Check if it's a display name
    if pillar_input in name_to_key:
        return name_to_key[pillar_input]
    
    # Try case-insensitive matching for display names
    pillar_lower = pillar_input.lower()
    for name, key in name_to_key.items():
        if name.lower() == pillar_lower:
            return key
    
    # Return the original input if no match found
    return pillar_input

def get_database_pillar_key(pillar_key):
    """
    Convert new pillar key to old pillar key for database storage.
    The database constraint only accepts old pillar names.
    """
    return NEW_TO_OLD_PILLAR_MAP.get(pillar_key, pillar_key)

def is_valid_pillar(pillar_key):
    """Check if a pillar key is valid."""
    return pillar_key in PILLARS

def is_valid_subcategory(pillar_key, subcategory):
    """Check if a subcategory is valid for a pillar."""
    subcategories = get_pillar_subcategories(pillar_key)
    return subcategory in subcategories

def get_all_pillars():
    """Get all pillar keys and names."""
    return [(key, info['name']) for key, info in PILLARS.items()]

def get_xp_distribution_template():
    """Get a template for XP distribution across pillars."""
    return {key: 0 for key in PILLARS.keys()}

def calculate_mastery_level(total_xp):
    """Calculate mastery level from total XP."""
    if total_xp <= 500:
        return 1
    elif total_xp <= 1500:
        return 2
    elif total_xp <= 3500:
        return 3
    elif total_xp <= 7000:
        return 4
    elif total_xp <= 12500:
        return 5
    elif total_xp <= 20000:
        return 6
    elif total_xp <= 30000:
        return 7
    elif total_xp <= 45000:
        return 8
    elif total_xp <= 65000:
        return 9
    elif total_xp <= 90000:
        return 10
    elif total_xp <= 120000:
        return 11
    elif total_xp <= 160000:
        return 12
    else:
        # Level 13+ - scales by 40,000 XP per level
        return 13 + ((total_xp - 160000) // 40000)

def get_xp_for_next_level(current_xp):
    """Get XP required for next level."""
    level = calculate_mastery_level(current_xp)
    
    # XP thresholds for each level
    thresholds = [
        500, 1500, 3500, 7000, 12500, 20000,
        30000, 45000, 65000, 90000, 120000, 160000
    ]
    
    if level <= 12:
        next_threshold = thresholds[level - 1] if level <= len(thresholds) else None
        if next_threshold:
            return next_threshold - current_xp
    
    # For levels 13+
    next_level = level + 1
    next_threshold = 160000 + ((next_level - 13) * 40000)
    return next_threshold - current_xp

def format_pillar_for_frontend(pillar_key):
    """Format pillar data for frontend consumption."""
    info = get_pillar_info(pillar_key)
    if not info:
        return None
        
    return {
        'key': pillar_key,
        'name': info['name'],
        'description': info['description'],
        'color': info['color'],
        'icon': info['icon'],
        'subcategories': info['subcategories']
    }