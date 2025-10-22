"""
Utility functions for handling the pillar system.
Updated January 2025: Simplified to single-word pillar names
"""

# New single-word pillar definitions
PILLARS = {
    'art': {
        'name': 'Art',
        'description': 'Original creation, artistic expression, innovation',
        'color': '#AF56E5',  # Purple
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
    'stem': {
        'name': 'STEM',
        'description': 'Analysis, problem-solving, technical skills, research',
        'color': '#2469D1',  # Blue
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
    'communication': {
        'name': 'Communication',
        'description': 'Expression, connection, teaching, sharing ideas',
        'color': '#3DA24A',  # Green
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
    'civics': {
        'name': 'Civics',
        'description': 'Understanding context, community impact, global awareness',
        'color': '#FF9028',  # Orange
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
    'wellness': {
        'name': 'Wellness',
        'description': 'Physical activity, practical skills, personal development',
        'color': '#E65C5C',  # Red
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
